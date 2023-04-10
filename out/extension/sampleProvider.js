"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SampleKernel = exports.SampleContentSerializer = void 0;
const vscode = require("vscode");
const util_1 = require("util");
const backend_1 = require("./backend");
const custom_output_1 = require("./custom-output");
const net_1 = require("net");
async function getFreePort() {
    return new Promise(res => {
        const srv = (0, net_1.createServer)();
        srv.listen(0, () => {
            const port = srv.address().port;
            srv.close((err) => res(port));
        });
    });
}
const FormData = require('form-data');
class SampleContentSerializer {
    constructor() {
        this.label = 'VDM Notebook Content Serializer';
    }
    async deserializeNotebook(data, token) {
        var contents = new util_1.TextDecoder().decode(data); // convert to String to make JSON object
        // Read file contents
        let raw;
        try {
            raw = JSON.parse(contents);
        }
        catch {
            raw = { cells: [] };
        }
        // Create array of Notebook cells for the VS Code API from file contents
        const cells = raw.cells.map(item => new vscode.NotebookCellData(item.kind, item.value, item.language));
        // Pass read and formatted Notebook Data to VS Code to display Notebook with saved cells
        return new vscode.NotebookData(cells);
    }
    async serializeNotebook(data, token) {
        // Map the Notebook data into the format we want to save the Notebook data as
        let contents = { cells: [] };
        for (const cell of data.cells) {
            contents.cells.push({
                kind: cell.kind,
                language: cell.languageId,
                value: cell.value
            });
        }
        // Give a string of all the data to save and VS Code will handle the rest
        return new util_1.TextEncoder().encode(JSON.stringify(contents));
    }
}
exports.SampleContentSerializer = SampleContentSerializer;
class SampleKernel {
    constructor(storageUri) {
        this.id = 'vdm-notebook-renderer-kernel';
        this.label = 'VDM Notebook Kernel';
        this.supportedLanguages = ['json', 'vdmsl', 'javascript', 'html']; //, 'vdmpp', 'vdmrt', 'vdm-cli', 'vdm-gui'];
        this._executionOrder = 0;
        //private vdmCellSessions = new Map<number, SessionInfo>();
        //private _restAPI: Backend;
        this.cellBackends = new Map();
        this.vdmrtBackend = null;
        this.vdmppBackend = null;
        this.storageUri = storageUri;
        //this._restAPI = new Backend();
        this._controller = vscode.notebooks.createNotebookController(this.id, 'vdm-notebook-renderer', this.label);
        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._executeAll.bind(this);
    }
    dispose() {
        console.log("Disposing");
        this._controller.dispose();
        //this._restAPI.dispose();
    }
    async _executeAll(cells, _notebook, _controller) {
        for (let cell of cells) {
            await this._doExecution(cell);
        }
    }
    async _doExecution(cell) {
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
        }
        else if (cell.document.languageId === "vdmsl") {
            await this._execVDMSL(execution, cell)
                .then(() => {
                execution.end(true, Date.now());
            })
                .catch((err) => {
                execution.end(false, Date.now());
                console.error(err);
            });
        }
        else if (cell.document.languageId === "html") {
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
    async _execJson(execution, cell) {
        try {
            execution.replaceOutput([new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.json(JSON.parse(cell.document.getText()), "x-application/sample-json-renderer"),
                    vscode.NotebookCellOutputItem.json(JSON.parse(cell.document.getText()))
                ])]);
            execution.end(true, Date.now());
        }
        catch (err) {
            execution.replaceOutput([new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.error(err)
                ])]);
        }
    }
    async _execVDMSL(execution, cell) {
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
        if (this.vdmslBackend == undefined) {
            this.vdmslBackend = await backend_1.Backend.startSession(await getFreePort(), cell);
        }
        else {
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
    async _execHTML(execution, cell) {
        execution.replaceOutput([new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.text(`${cell.document.getText()}`, "text/html")
            ])]);
    }
    async _renderVDMSession(execution, address) {
        execution.replaceOutput(custom_output_1.VDMOutput.fromAddress(address));
        //execution.replaceOutput(VDMOutput.fromSessionOutputs(this.vdmCellSessions.get(cell.index)?.sessionOutputs));
    }
}
exports.SampleKernel = SampleKernel;
//# sourceMappingURL=sampleProvider.js.map