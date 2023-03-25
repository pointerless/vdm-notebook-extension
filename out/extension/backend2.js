"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Backend2 = void 0;
const subspawn_1 = require("subspawn");
const node_fetch_1 = require("node-fetch");
const vscode = require("vscode");
const util_1 = require("util");
const crypto_1 = require("crypto");
const FormData = require('form-data');
class Backend2 {
    constructor() {
        this.address = "";
        this._processOwner = "";
        this._storageUri = vscode.Uri.file("");
        this._files = [];
    }
    async storeSourceText(text, type) {
        let fileUri = vscode.Uri.file(this._storageUri.fsPath + "/" + crypto_1.randomUUID() + "." + type);
        await vscode.workspace.fs.writeFile(fileUri, new util_1.TextEncoder().encode(text));
        return fileUri;
    }
    static async startSession(port, sourceType, sourceText, storageUri) {
        let backend = new Backend2();
        backend._processOwner = `kernel-${port}`;
        backend.address = `http://127.0.0.1:${port}`;
        backend._storageUri = storageUri;
        let file = await backend.storeSourceText(sourceText, sourceType);
        console.log(file);
        backend._files.push(file);
        subspawn_1.subProcess(backend._processOwner, `java -jar /home/harry/IdeaProjects/vdmj-remote/target/vdmj-remote-1.0-SNAPSHOT-shaded.jar -p ${port} -t ${sourceType} --sourcePath ${file.fsPath}`, true);
        for (let i = 0; i < 1000; i++) {
            await node_fetch_1.default(backend.address + "/startup").then(() => { i = 1000; }).catch(() => console.log("Failed " + i));
        }
        return backend;
    }
    dispose() {
        try {
            subspawn_1.killSubProcesses(this._processOwner);
            for (let file of this._files) {
                vscode.workspace.fs.delete(file);
            }
        }
        catch (e) {
            console.error(e);
        }
    }
}
exports.Backend2 = Backend2;
//# sourceMappingURL=backend2.js.map