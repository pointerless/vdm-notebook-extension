"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Backend2 = void 0;
const node_fetch_1 = require("node-fetch");
const vscode = require("vscode");
const util_1 = require("util");
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const tmp = require("tmp");
class Backend2 {
    constructor() {
        this.address = "";
        this._fileStore = vscode.Uri.file("");
        this._fileMap = new Map();
        this._port = 0;
        this._sourceType = "";
        this._healthy = true;
    }
    async storeSourceText(cell) {
        console.log(cell);
        if (!this._fileMap.has(cell.index)) {
            this._fileMap.set(cell.index, vscode.Uri.joinPath(this._fileStore, `${(0, crypto_1.randomUUID)()}.${cell.document.languageId}`));
        }
        const fileToWrite = this._fileMap.get(cell.index);
        await vscode.workspace.fs.writeFile(fileToWrite, new util_1.TextEncoder().encode(cell.document.getText()));
    }
    static async startSession(port, cell) {
        let backend = new Backend2();
        backend._port = port;
        backend._sourceType = cell.document.languageId;
        backend._fileStore = vscode.Uri.file(tmp.dirSync().name);
        backend.address = `http://127.0.0.1:${port}`;
        await backend.storeSourceText(cell);
        return new Promise((resolve, reject) => {
            const successRegex = new RegExp(`VDMJ\\sRemote\\sSession\\sStarted:\\s${port}`);
            backend._process = (0, child_process_1.spawn)(`java`, ["-jar", "/home/harry/IdeaProjects/vdmj-remote/target/vdmj-remote-1.0-SNAPSHOT-shaded.jar",
                "-p", `${port}`, "-t", `${backend._sourceType}`, "--sourcePath", `${backend._fileStore.fsPath}`], {});
            backend._process.stdout.on('data', (data) => {
                console.log(`${cell.document.languageId}-backend: ${data}`);
                if (successRegex.test(data)) {
                    resolve(backend);
                }
            });
            backend._process.stderr.on('data', (data) => {
                console.error(`${cell.document.languageId}-backend: ${data}`);
                backend._healthy = false;
            });
            backend._process.on('close', (close) => {
                console.debug(`${cell.document.languageId}-backend: ${close}`);
                backend._healthy = false;
            });
            return backend;
        });
    }
    async addContent(cell) {
        await this.storeSourceText(cell);
        await (0, node_fetch_1.default)(this.address + "/reload", { method: "POST" }).then(response => { console.log(response); });
    }
    async dispose() {
        var _a;
        try {
            // TODO: More graceful method of killing child process
            await (0, node_fetch_1.default)(this.address + "/stopMain", { method: "POST" });
            (_a = this._process) === null || _a === void 0 ? void 0 : _a.kill('SIGKILL');
            vscode.workspace.fs.delete(this._fileStore);
        }
        catch (e) {
            console.error(e);
        }
    }
}
exports.Backend2 = Backend2;
//# sourceMappingURL=backend2.js.map