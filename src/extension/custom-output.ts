import * as vscode from 'vscode';
import { SessionOutput } from './backend';
import { randomUUID } from "crypto";

export class VDMOutputItem extends vscode.NotebookCellOutputItem {

    /*static singleWebOutput(accessURL: string, displayName: string): vscode.NotebookCellOutputItem{
        return super.json({accessURL, displayName}, "x-application/vdm-web-output");
    }*/

    static singleWebOutput(address: string): vscode.NotebookCellOutputItem{
        return super.json({address}, "x-application/vdm-web-output");
    }

    static getWebOutputText(accessURL: string, displayName: string, frameID: string): string{
        let script = `<script>
                window.addEventListener("message", (e) => { 
                    console.debug("CALLED");
                var this_frame = document.getElementById("${frameID}");
                if(this_frame === null){
                    console.debug("NULLED");
                }else if (this_frame.contentWindow === e.source) {
                    this_frame.height = e.data.height + "px";
                    this_frame.style.height = e.data.height + "px";
                }
                });
                </script>`;
        return `<h2 class=>Hosting at: <a href="${accessURL}">${accessURL}</a></h2> 
                <iframe id="${frameID}" scrolling="no" 
                style="position: relative; float: right; width: 100%;" sandbox="allow-same-origin allow-scripts" 
                allow="cross-origin-isolated" src="${accessURL}" title="${displayName}">
                </iframe> \n ${script}`;
    }

}

export class VDMOutput extends vscode.NotebookCellOutput {

    /*static fromSessionOutputs(sessionOutputs: SessionOutput[] | undefined): vscode.NotebookCellOutput[]{

        if(sessionOutputs === undefined){
            throw Error("No session outputs");
        }

        let output = sessionOutputs[0];

        //let items: vscode.NotebookCellOutputItem[] = [];
        
        return [new vscode.NotebookCellOutput([VDMOutputItem.singleWebOutput(output.accessURL, output.displayName)])];
        
    }*/

    static fromAddress(address: string | undefined){
        if(address === undefined){
            throw Error("Address undefined");
        }

        return [new vscode.NotebookCellOutput([VDMOutputItem.singleWebOutput(address)])];
    }

}