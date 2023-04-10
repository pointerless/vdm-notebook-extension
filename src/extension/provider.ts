import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from "util";
import { Backend } from './backend';

import { VDMOutput, VDMOutputItem } from './custom-output';

import {createServer, AddressInfo} from "net";

async function getFreePort() {
    return new Promise<number>( res => {
        const srv = createServer();
        srv.listen(0, () => {
            const port = (srv.address() as AddressInfo).port
            srv.close((err) => res(port))
        });
    })
}

//TODO: 
// * Some system to allow specification of static web content to host
// * Some system to use another cell to open a web content page rather than this being the
//   only method of execution (annotations)
// * Some system to allow python/js in the notebook to call data/functions on the backend.

/**
 * An ultra-minimal sample provider that lets the user type in JSON, and then
 * outputs JSON cells. The outputs are transient and not saved to notebook file on disk.
 */

interface RawNotebookData {
  cells: RawNotebookCell[]
}

interface RawNotebookCell {
  language: string;
  value: string;
  kind: vscode.NotebookCellKind;
  editable?: boolean;
}

export class VDMContentSerializer implements vscode.NotebookSerializer {
  public readonly label: string = 'VDM Notebook Content Serializer';

  public async deserializeNotebook(data: Uint8Array, token: vscode.CancellationToken): Promise<vscode.NotebookData> {
    var contents = new TextDecoder().decode(data);    // convert to String to make JSON object

    // Read file contents
    let raw: RawNotebookData;
    try {
      raw = <RawNotebookData>JSON.parse(contents);
    } catch {
      raw = { cells: [] };
    }

    // Create array of Notebook cells for the VS Code API from file contents
    const cells = raw.cells.map(item => new vscode.NotebookCellData(
      item.kind,
      item.value,
      item.language
    ));

    // Pass read and formatted Notebook Data to VS Code to display Notebook with saved cells
    return new vscode.NotebookData(
      cells
    );
  }

  public async serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Promise<Uint8Array> {
    // Map the Notebook data into the format we want to save the Notebook data as
    let contents: RawNotebookData = { cells: [] };

    for (const cell of data.cells) {
      contents.cells.push({
        kind: cell.kind,
        language: cell.languageId,
        value: cell.value
      });
    }

    // Give a string of all the data to save and VS Code will handle the rest
    return new TextEncoder().encode(JSON.stringify(contents));
  }
}

export class VDMKernel {
  readonly id = 'vdm-notebook-renderer-kernel';
  public readonly label = 'VDM Notebook Kernel';
  readonly supportedLanguages = ['vdmsl','vdmpp', 'vdmrt', 'javascript', 'html', 'python']; //, 'vdm-cli', 'vdm-gui'];

  private _executionOrder = 0;
  private readonly _controller: vscode.NotebookController;

  private vdmslBackend: Backend | undefined;
  private vdmrtBackend: Backend | undefined;
  private vdmppBackend: Backend | undefined;


  constructor() {

    this._controller = vscode.notebooks.createNotebookController(this.id,
      'vdm-notebook-renderer',
      this.label);

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._executeAll.bind(this);
  }

  dispose(): void {
    console.log("Disposing Kernel");
    if(this.vdmslBackend !== undefined){
      (this.vdmslBackend as Backend).dispose();
    }
    if(this.vdmrtBackend !== undefined){
      (this.vdmrtBackend as Backend).dispose();
    }
    if(this.vdmppBackend !== undefined){
      (this.vdmppBackend as Backend).dispose();
    }
    this._controller.dispose();
  }

  private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
    for (let cell of cells) {
      await this._doExecution(cell);
    }
  }

  private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);

    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    if (cell.document.languageId === "vdmsl") {
      await this._execVDMSL(execution, cell)
        .then(() => {
          execution.end(true, Date.now());
        })
        .catch((err) => {
          execution.end(false, Date.now());
          vscode.window.showErrorMessage(err);
          console.error(err);
        });
    } else if (cell.document.languageId === "html"){
      this._execHTML(execution, cell)
        .then(() => {
          execution.end(true, Date.now());
        })
        .catch((err) => {
          execution.end(false, Date.now());
          console.error(err);
        });
    }
  }

  private async _execVDMSL(execution: vscode.NotebookCellExecution, cell: vscode.NotebookCell): Promise<void> {
    if(this.vdmslBackend == undefined){
      try{
        this.vdmslBackend = await Backend.startSession(await getFreePort(), cell);
      }catch(e) {
        throw "Could not start vdmsl backend: "+e;
      }
    }else{
      await this.vdmslBackend.addContent(cell);
    }

    this._renderVDMSession(execution, this.vdmslBackend.address);
  }

  private async _execHTML(execution: vscode.NotebookCellExecution, cell: vscode.NotebookCell) {
    execution.replaceOutput([new vscode.NotebookCellOutput([
      vscode.NotebookCellOutputItem.text(`${cell.document.getText()}`, "text/html")
    ])]);
  }

  private async _renderVDMSession(execution: vscode.NotebookCellExecution,address: string) {
    execution.replaceOutput(VDMOutput.fromAddress(address));
  }

}