import fetch from "node-fetch";
import * as vscode from "vscode";
import { TextEncoder } from 'util';
import { UUID } from 'crypto';
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import * as net from "net";
import * as tmp from "tmp";

/**
 * Backend class for vdmj-remote, runs and manages VDM code cells
 */
export class Backend {

    address: string = "";
    _process: ChildProcessWithoutNullStreams | undefined;
    _fileStore: vscode.Uri = vscode.Uri.file("");
    _port: number = 0;
    _sourceType: string = "";
    _healthy: boolean = true;
    _idFileMap: Map<UUID, vscode.Uri> = new Map();
    _indexIdMap: Map<number, UUID> = new Map();


    /**
     * Deletes (now redundant) source file by id
     * 
     * @param id `cell.metadata.vdmKernelId` for file to be deleted
     */
    private async deleteOldSource(id: UUID){
        vscode.workspace.fs.delete(this._idFileMap.get(id) as vscode.Uri);
        this._idFileMap.delete(id);
    }

    /**
     * Stores/updates stored file version of Cell,
     * if `cell.index` matches a previously stored 
     * file but `cell.metadata.vdmKernelId` does not,
     * then the file stored for that (now deleted or 
     * moved up) is deleted
     * 
     * @param cell Cell to store/update
     */
    private async storeSourceText(cell: vscode.NotebookCell){
        const cellId = cell.metadata.vdmKernelId as UUID;
        const fileToWrite = vscode.Uri.joinPath(this._fileStore, `${cellId}.${cell.document.languageId}`);
        this._idFileMap.set(cellId, fileToWrite);
        if(this._indexIdMap.has(cell.index) && this._indexIdMap.get(cell.index) !== cellId){
            await this.deleteOldSource(this._indexIdMap.get(cell.index) as UUID);
        }
        this._indexIdMap.set(cell.index, cellId);
        await vscode.workspace.fs.writeFile(fileToWrite, new TextEncoder().encode(cell.document.getText()));
    }

    /**
     * Starts a new session, returning a Backend instance
     * 
     * @param port Port to host the vdmj-remote REST API on
     * @param cell Starting cell to execute
     * @returns Promise for Backend instance 
     */
    static async startSession(port: number, cell: vscode.NotebookCell) : Promise<Backend>{
        let backend = new Backend();
        backend._port = port;
        backend._sourceType = cell.document.languageId;
        backend._fileStore = vscode.Uri.file(tmp.dirSync().name);

        backend.address = `http://127.0.0.1:${port}`;
        await backend.storeSourceText(cell);

        return new Promise<Backend>((resolve, reject) => {

            type IPCLog = {
                type: string,
                message: string,
                errorLevel: string | undefined,
                properties: {[key: string]: string} | undefined
            }

            const ipcServer = net.createServer((socket) => {
                socket.on('data', (data) => {
                    let logData = JSON.parse(data.toString()) as IPCLog;
                    if(logData.type == "START"){
                        vscode.window.showInformationMessage(`VDM Backend started successfully: ${logData.message}`);
                        resolve(backend);
                    }else if(logData.type === "STOP"){
                        vscode.window.showErrorMessage(`VDM Backend exited: ${logData.message}`)
                    }else if(logData.type === "ERROR"){
                        if(logData.errorLevel === undefined){
                            vscode.window.showErrorMessage(`VDM Backend gave error: ${logData.message}`)
                        }else{
                            vscode.window.showErrorMessage(`VDM Backend gave ${logData.errorLevel} error: ${logData.message}`)
                        }
                    }
                })
            })

            ipcServer.listen(0, "127.0.0.1", () => {
                console.log(__dirname);

                type ServerAddress = {
                    address: string,
                    family: string,
                    port: number
                };

                const ipcAddressObj = ipcServer.address() as ServerAddress;

                console.log(ipcAddressObj);

                backend._process = spawn(`java`, 
                ["-jar", "./vdmj-remote.jar", 
                "-p", `${port}`, "-t", `${backend._sourceType}`, "--sourcePath", `${backend._fileStore.fsPath}`,
                "--ipcAddress", `${ipcAddressObj.address}:${ipcAddressObj.port}`],
                {cwd: __dirname});
    
                backend._process.stdout.on('data', (data) => {
                    console.log(`${cell.document.languageId.toUpperCase()}-backend: ${data}`)
                })
    
                backend._process.stderr.on('data', (data) => {
                    console.error(`${cell.document.languageId.toUpperCase()}-backend: ${data}`)
                    reject(data);
                    backend._healthy = false;
                    vscode.window.showErrorMessage(`${cell.document.languageId.toUpperCase()} backend gave error message: ${data}`)
                })
    
                backend._process.on('close', (close) => {
                    console.debug(`${cell.document.languageId.toUpperCase()}-backend: ${close}`)
                    backend._healthy = false;
                    vscode.window.showErrorMessage(`${cell.document.languageId.toUpperCase()} backend process exited unexpectedly with code ${close}`);
                })
            })

        })
    }

    /**
     * Add content, used on existing Backend instance
     * to run a cell
     * 
     * @param cell Cell to run
     */
    public async addContent(cell: vscode.NotebookCell){
        await this.storeSourceText(cell);
        await fetch(this.address+"/reload", {method: "POST"}).then(response => { console.log(response) });
    }

    /**
     * Disposes and cleans up Backend instance
     */
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