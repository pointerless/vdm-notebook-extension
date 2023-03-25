"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VDMOutput = exports.VDMOutputItem = void 0;
const vscode = require("vscode");
class VDMOutputItem extends vscode.NotebookCellOutputItem {
    /*static singleWebOutput(accessURL: string, displayName: string): vscode.NotebookCellOutputItem{
        return super.json({accessURL, displayName}, "x-application/vdm-web-output");
    }*/
    static singleWebOutput(address) {
        return super.json({ address }, "x-application/vdm-web-output");
    }
    static getWebOutputText(accessURL, displayName, frameID) {
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
exports.VDMOutputItem = VDMOutputItem;
class VDMOutput extends vscode.NotebookCellOutput {
    /*static fromSessionOutputs(sessionOutputs: SessionOutput[] | undefined): vscode.NotebookCellOutput[]{

        if(sessionOutputs === undefined){
            throw Error("No session outputs");
        }

        let output = sessionOutputs[0];

        //let items: vscode.NotebookCellOutputItem[] = [];
        
        return [new vscode.NotebookCellOutput([VDMOutputItem.singleWebOutput(output.accessURL, output.displayName)])];
        
    }*/
    static fromAddress(address) {
        if (address === undefined) {
            throw Error("Address undefined");
        }
        return [new vscode.NotebookCellOutput([VDMOutputItem.singleWebOutput(address)])];
    }
}
exports.VDMOutput = VDMOutput;
//# sourceMappingURL=custom-output.js.map