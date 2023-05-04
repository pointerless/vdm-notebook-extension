import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from "util";
import { Backend } from './backend';

import { VDMOutput } from './custom-output';

import {createServer, AddressInfo} from "net";
import { randomUUID } from 'crypto';

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


interface RawNotebookData {
  cells: RawNotebookCell[]
}

interface RawNotebookCell {
  language: string;
  value: string;
  kind: vscode.NotebookCellKind;
  editable?: boolean;
}

type BackendSet = {
  vdmsl: Backend | undefined,
  vdmrt: Backend | undefined,
  vdmpp: Backend | undefined
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
    const cells = raw.cells.map(item => {
      let data = new vscode.NotebookCellData(
        item.kind,
        item.value,
        item.language
      )
      if(data.metadata === undefined){
        data.metadata = {vdmKernelId: randomUUID()}
      }
      return data;
    });

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
  readonly supportedLanguages = ['vdmsl','vdmpp', 'vdmrt', 'html'] //'javascript' ??;

  private _executionOrder = 0;
  private readonly _controller: vscode.NotebookController;
  private notebookMap: Map<vscode.NotebookDocument, BackendSet> = new Map();

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

    this.notebookMap.forEach((value, key) => {
      if(value.vdmsl !== undefined){
        (value.vdmsl as Backend).dispose();
      }
      if(value.vdmrt !== undefined){
        (value.vdmrt as Backend).dispose();
      }
      if(value.vdmpp !== undefined){
        (value.vdmpp as Backend).dispose();
      }
    })
    this._controller.dispose();
  }

  private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
    for (let cell of cells) {
      console.log(_notebook.uri);
      let backendSet: BackendSet;
      if(!this.notebookMap.has(_notebook)){
        backendSet = {vdmsl: undefined, vdmrt: undefined, vdmpp: undefined}
        this.notebookMap.set(_notebook, backendSet);
      }else{
        backendSet = this.notebookMap.get(_notebook) as BackendSet;
      }
      await this._doExecution(cell, backendSet);
    }
  }

  private async _doExecution(cell: vscode.NotebookCell, backendSet: BackendSet): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);

    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    if (cell.document.languageId === "vdmsl") {
      await this._execVDM(execution, cell, backendSet.vdmsl)
        .then((vdmslBackend: Backend) => {
          backendSet.vdmsl = vdmslBackend;
          execution.end(true, Date.now());
        })
        .catch((err) => {
          execution.end(false, Date.now());
          vscode.window.showErrorMessage(err);
          console.error(err);
        });
    } else if (cell.document.languageId === "vdmrt") {
      await this._execVDM(execution, cell, backendSet.vdmrt)
        .then((vdmrtBackend: Backend) => {
          backendSet.vdmrt = vdmrtBackend;
          execution.end(true, Date.now());
        })
        .catch((err) => {
          execution.end(false, Date.now());
          vscode.window.showErrorMessage(err);
          console.error(err);
        });
    } else if (cell.document.languageId === "vdmpp") {
      await this._execVDM(execution, cell, backendSet.vdmpp)
        .then((vdmppBackend: Backend) => {
          backendSet.vdmpp = vdmppBackend;
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
    }else{
      vscode.window.showErrorMessage(`Can't execute '${cell.document.languageId}' yet`)
    }
  }

  private async _execVDM(execution: vscode.NotebookCellExecution, cell: vscode.NotebookCell, backend: Backend | undefined): Promise<Backend> {
    if(backend == undefined){
      try{
        backend = await Backend.startSession(await getFreePort(), cell);
      }catch(e) {
        throw "Could not start vdmsl backend: "+e;
      }
    }else{
      await backend.addContent(cell);
    }

    this._renderVDMSession(execution, backend.address);
    return backend;
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