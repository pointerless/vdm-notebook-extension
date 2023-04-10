import fetch from "node-fetch";
import * as vscode from "vscode";
import { TextEncoder } from 'util';
import { randomUUID } from 'crypto';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

const tmp = require("tmp");

export class Backend {

    address: string = "";
    _process: ChildProcessWithoutNullStreams | undefined;
    _fileStore: vscode.Uri = vscode.Uri.file("");
    _fileMap: Map<number, vscode.Uri> = new Map();
    _port: number = 0;
    _sourceType: string = "";
    _healthy: boolean = true;

    private async storeSourceText(cell: vscode.NotebookCell){
        console.log(cell);
        if(!this._fileMap.has(cell.index)){
            this._fileMap.set(cell.index, vscode.Uri.joinPath(this._fileStore, `${randomUUID()}.${cell.document.languageId}`));
        }
        const fileToWrite = this._fileMap.get(cell.index) as vscode.Uri;
        await vscode.workspace.fs.writeFile(fileToWrite, new TextEncoder().encode(cell.document.getText()));
    }

    static async startSession(port: number, cell: vscode.NotebookCell) : Promise<Backend>{
        let backend = new Backend();
        backend._port = port;
        backend._sourceType = cell.document.languageId;
        backend._fileStore = vscode.Uri.file(tmp.dirSync().name);

        backend.address = `http://127.0.0.1:${port}`;
        await backend.storeSourceText(cell);

        return new Promise<Backend>((resolve, reject) => {

            const successRegex = new RegExp(`VDMJ\\sRemote\\sSession\\sStarted:\\s${port}`);

            backend._process = spawn(`java`, 
            ["-jar", "/home/harry/IdeaProjects/vdmj-remote/target/vdmj-remote-1.0-SNAPSHOT-shaded.jar", 
            "-p", `${port}`, "-t", `${backend._sourceType}`, "--sourcePath", `${backend._fileStore.fsPath}`],
            {});

            backend._process.stdout.on('data', (data) => {
                console.log(`${cell.document.languageId}-backend: ${data}`)
                if(successRegex.test(data)){
                    resolve(backend);
                }
            })

            backend._process.stderr.on('data', (data) => {
                console.error(`${cell.document.languageId}-backend: ${data}`)
                backend._healthy = false;
            })

            backend._process.on('close', (close) => {
                console.debug(`${cell.document.languageId}-backend: ${close}`)
                backend._healthy = false;
            })

            return backend;
        })
    }

    public async addContent(cell: vscode.NotebookCell){
        await this.storeSourceText(cell);
        await fetch(this.address+"/reload", {method: "POST"}).then(response => { console.log(response) });
    }

    async dispose() {
        try{
            // TODO: More graceful method of killing child process
            await fetch(this.address+"/stopMain", {method: "POST"});
            this._process?.kill('SIGKILL');
            vscode.workspace.fs.delete(this._fileStore);
        }catch(e){
            console.error(e);
        }
    }

}