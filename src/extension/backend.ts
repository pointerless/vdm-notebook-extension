import fetch from "node-fetch";
import * as vscode from "vscode";
import { TextEncoder } from 'util';
import { randomUUID } from 'crypto';
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import * as tmp from "tmp";

tmp.setGracefulCleanup();

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
            let resolved = false;


            console.log(__dirname);

            backend._process = spawn(`java`, 
            ["-jar", "./vdmj-remote.jar", 
            "-p", `${port}`, "-t", `${backend._sourceType}`, "--sourcePath", `${backend._fileStore.fsPath}`],
            {cwd: __dirname});

            backend._process.stdout.on('data', (data) => {
                console.log(`${cell.document.languageId.toUpperCase()}-backend: ${data}`)
                if(successRegex.test(data) && !resolved){
                    resolve(backend);
                    resolved = true;
                    vscode.window.showInformationMessage(`${cell.document.languageId.toUpperCase()} backend started successfully`);
                }
            })

            backend._process.stderr.on('data', (data) => {
                console.error(`${cell.document.languageId.toUpperCase()}-backend: ${data}`)
                backend._healthy = false;
                if(!resolved){
                    reject(data);
                    resolved = true;
                }else{
                    vscode.window.showErrorMessage(`${cell.document.languageId.toUpperCase()} backend gave error message: ${data}`)
                }
            })

            backend._process.on('close', (close) => {
                console.debug(`${cell.document.languageId.toUpperCase()}-backend: ${close}`)
                backend._healthy = false;
                if(!resolved){
                    reject(`${cell.document.languageId.toUpperCase()} backend process exited with code ${close}`);
                    resolved = true;
                }else{
                    vscode.window.showErrorMessage(`${cell.document.languageId.toUpperCase()} backend process exited unexpectedly with code ${close}`);
                }
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
            if(this._process !== undefined){
                console.log("Killing backend");
                (this._process as ChildProcessWithoutNullStreams).kill();

                // May need to add the following for Windows compatability
                //process.kill((this._process as ChildProcessWithoutNullStreams).pid);


                // Unfortunately this is the only way I can find to currently delete created
                // tmp files cross platform...
                if(process.platform == 'win32'){
                    spawnSync("rmdir", ["/Q", "/S", this._fileStore.path]);
                }else{
                    spawnSync("rm", ["-rf", this._fileStore.path]);
                }

                // I would prefer to use this but for some reason the nodeJS delete 
                // system silently fails whereas this throws an unidentifiable error
                //await vscode.workspace.fs.delete(this._fileStore, {recursive: true});
                
            }
        }catch(e){
            console.error("Error in disposing Backend: "+e);
        }
    }

}