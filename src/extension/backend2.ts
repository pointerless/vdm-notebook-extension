import { subProcess, killSubProcesses } from 'subspawn';
import fetch, { Request } from "node-fetch";
import * as vscode from "vscode";
import { TextEncoder } from 'util';
import { randomUUID } from 'crypto';

const FormData = require('form-data');

export class Backend2 {

    address: string = "";
    _processOwner: string = "";
    _storageUri: vscode.Uri = vscode.Uri.file("");
    _files: vscode.Uri[] = [];

    private async storeSourceText(text: string, type: string){
        let fileUri = vscode.Uri.file(this._storageUri.fsPath + "/" + randomUUID() + "." + type);
        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(text));
        return fileUri;
    }
    
    static async startSession(port: number, sourceType: string, sourceText: string, storageUri: vscode.Uri){
        let backend = new Backend2();

        backend._processOwner = `kernel-${port}`;
        backend.address = `http://127.0.0.1:${port}`;
        backend._storageUri = storageUri;
        let file = await backend.storeSourceText(sourceText, sourceType);
        console.log(file);
        backend._files.push(file);

        subProcess(backend._processOwner, `java -jar /home/harry/IdeaProjects/vdmj-remote/target/vdmj-remote-1.0-SNAPSHOT-shaded.jar -p ${port} -t ${sourceType} --sourcePath ${file.fsPath}`, true);

        for(let i=0; i<1000; i++){
            await fetch(backend.address+"/startup").then(() => {i = 1000;}).catch(() => console.log("Failed "+i));
        }

        return backend;
    }

    dispose(){
        try{
            killSubProcesses(this._processOwner);
            for(let file of this._files){
                vscode.workspace.fs.delete(file);
            }
        }catch(e){
            console.error(e);
        }
    }

}