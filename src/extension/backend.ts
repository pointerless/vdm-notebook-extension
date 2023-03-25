import { subProcess, killSubProcesses } from 'subspawn';
import fetch, { Request } from "node-fetch";

const FormData = require('form-data');

export type SessionOutput = {
    type: string,
    module: string,
    accessURL: string,
    displayName: string,
};
  
export type SessionInfo = {
    id: string,
    sessionOutputs: SessionOutput[],
    sourceType: string,
    sessionDir: string
};

export class Backend {

    restAPIURL: string;

    constructor(restAPIURL="http://127.0.0.1:8080"){
        this.restAPIURL = restAPIURL;
        subProcess("kernel", "java -jar /home/harry/IdeaProjects/vdmj-rest-api/target/vdmj-rest-api-1.0-SNAPSHOT-shaded.jar", true);
    }

    async startSession(scriptText: string, filename="source"){
        const formData = new FormData();
        const blob = Buffer.from(scriptText);
        formData.append('file', blob, filename);
        return new Promise<SessionInfo>((resolve, reject) => {
            const req = new Request(`${this.restAPIURL}/startSession/VDMSL`);
            const init = {
                method: "POST",
                body: formData
            };
            fetch(req, init).then(response => {
                response.json()
                .then(sessionInfo => {
                    resolve(sessionInfo as SessionInfo);
                }).catch(reason => reject(reason));
            }).catch(reason => reject(reason));
        });
    }

    async endSession(sessionId: string | undefined){
        if(typeof sessionId === undefined){
            throw new Error("Cannot end session with undefined id");
        }
        
        return new Promise<string>((resolve, reject) => {
            const req = new Request(`${this.restAPIURL}/${sessionId}/endSession`);
            const init = {
              method: "POST"
            };
            fetch(req, init)
            .then(response => {
                response.text()
                .then(outcome => {
                    resolve(outcome);
                }).catch(reason => reject(reason));
            }).catch(reason => reject(reason));
        });
    }

    dispose(){
        try{
            killSubProcesses("kernel");
        }catch(e){
            console.error(e);
        }
    }


};