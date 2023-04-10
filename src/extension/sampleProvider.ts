import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from "util";
import fetch, { Request } from "node-fetch";
import { subProcess, killSubProcesses } from 'subspawn';
import { Backend } from './backend';

import { randomUUID } from "crypto";
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

const FormData = require('form-data');

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

export class SampleContentSerializer implements vscode.NotebookSerializer {
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

export class SampleKernel {
  readonly id = 'vdm-notebook-renderer-kernel';
  public readonly label = 'VDM Notebook Kernel';
  readonly supportedLanguages = ['json', 'vdmsl', 'javascript', 'html']; //, 'vdmpp', 'vdmrt', 'vdm-cli', 'vdm-gui'];

  private _executionOrder = 0;
  private readonly _controller: vscode.NotebookController;

  //private vdmCellSessions = new Map<number, SessionInfo>();
  //private _restAPI: Backend;

  private cellBackends = new Map<number, Backend>();

  private vdmslBackend: Backend | undefined;
  private vdmrtBackend = null;
  private vdmppBackend = null;

  private storageUri: vscode.Uri;

  constructor(storageUri: vscode.Uri) {
    this.storageUri = storageUri;
    //this._restAPI = new Backend();

    this._controller = vscode.notebooks.createNotebookController(this.id,
      'vdm-notebook-renderer',
      this.label);

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._executeAll.bind(this);
  }

  dispose(): void {
    console.log("Disposing");
    this._controller.dispose();
    //this._restAPI.dispose();
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

    if (cell.document.languageId === "json") {
      this._execJson(execution, cell)
        .then(() => {
          execution.end(true, Date.now());
        })
        .catch((err) => {
          execution.end(false, Date.now());
          console.error(err);
        });
    } else if (cell.document.languageId === "vdmsl") {
      await this._execVDMSL(execution, cell)
        .then(() => {
          execution.end(true, Date.now());
        })
        .catch((err) => {
          execution.end(false, Date.now());
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

  private async _execJson(execution: vscode.NotebookCellExecution, cell: vscode.NotebookCell): Promise<void> {
    try {
      execution.replaceOutput([new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.json(JSON.parse(cell.document.getText()), "x-application/sample-json-renderer"),
        vscode.NotebookCellOutputItem.json(JSON.parse(cell.document.getText()))
      ])]);

      execution.end(true, Date.now());
    } catch (err: any) {
      execution.replaceOutput([new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.error(err)
      ])]);
    }
  }


  private async _execVDMSL(execution: vscode.NotebookCellExecution, cell: vscode.NotebookCell): Promise<void> {
    /*if (this.vdmCellSessions.has(cell.index)) {
      await this._restAPI.endSession(this.vdmCellSessions.get(cell.index)?.id)
        .then(async () => {
          await this._restAPI.startSession(cell.document.getText())
            .then(async sessionInfo => {
              this.vdmCellSessions.set(cell.index, sessionInfo as SessionInfo);
              this._renderVDMSession(execution, cell);
            }).catch(reason => {
              throw Error(reason);
            });
        }).catch(reason => {
          throw Error(reason);
        });
    } else {
      await this._restAPI.startSession(cell.document.getText())
        .then(async sessionInfo => {
          this.vdmCellSessions.set(cell.index, sessionInfo as SessionInfo);
          this._renderVDMSession(execution, cell);
        }).catch(reason => {
          throw Error(reason);
        });
    }*/

    
    
    if(this.vdmslBackend == undefined){
      this.vdmslBackend = await Backend.startSession(await getFreePort(), cell);
    }else{
      await this.vdmslBackend.addContent(cell);
    }

    this._renderVDMSession(execution, this.vdmslBackend.address);

    /*if(this.cellBackends.has(cell.index)){
      this.cellBackends.get(cell.index)?.dispose();
      this.cellBackends.set(cell.index, await Backend2.startSession(8080, "vdmsl", cell.document.getText()));
      this._renderVDMSession(execution, cell);
    }else{
      this.cellBackends.set(cell.index, await Backend2.startSession(8080, "vdmsl", cell.document.getText()));
      this._renderVDMSession(execution, cell);
    }*/
  }

  private async _execHTML(execution: vscode.NotebookCellExecution, cell: vscode.NotebookCell) {
    execution.replaceOutput([new vscode.NotebookCellOutput([
      vscode.NotebookCellOutputItem.text(`${cell.document.getText()}`, "text/html")
    ])]);
  }

  private async _renderVDMSession(execution: vscode.NotebookCellExecution,address: string) {
    execution.replaceOutput(VDMOutput.fromAddress(address));
    //execution.replaceOutput(VDMOutput.fromSessionOutputs(this.vdmCellSessions.get(cell.index)?.sessionOutputs));
  }

}