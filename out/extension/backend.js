"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Backend = void 0;
const subspawn_1 = require("subspawn");
const node_fetch_1 = require("node-fetch");
const FormData = require('form-data');
class Backend {
    constructor(restAPIURL = "http://127.0.0.1:8080") {
        this.restAPIURL = restAPIURL;
        subspawn_1.subProcess("kernel", "java -jar /home/harry/IdeaProjects/vdmj-rest-api/target/vdmj-rest-api-1.0-SNAPSHOT-shaded.jar", true);
    }
    async startSession(scriptText, filename = "source") {
        const formData = new FormData();
        const blob = Buffer.from(scriptText);
        formData.append('file', blob, filename);
        return new Promise((resolve, reject) => {
            const req = new node_fetch_1.Request(`${this.restAPIURL}/startSession/VDMSL`);
            const init = {
                method: "POST",
                body: formData
            };
            node_fetch_1.default(req, init).then(response => {
                response.json()
                    .then(sessionInfo => {
                    resolve(sessionInfo);
                }).catch(reason => reject(reason));
            }).catch(reason => reject(reason));
        });
    }
    async endSession(sessionId) {
        if (typeof sessionId === undefined) {
            throw new Error("Cannot end session with undefined id");
        }
        return new Promise((resolve, reject) => {
            const req = new node_fetch_1.Request(`${this.restAPIURL}/${sessionId}/endSession`);
            const init = {
                method: "POST"
            };
            node_fetch_1.default(req, init)
                .then(response => {
                response.text()
                    .then(outcome => {
                    resolve(outcome);
                }).catch(reason => reject(reason));
            }).catch(reason => reject(reason));
        });
    }
    dispose() {
        try {
            subspawn_1.killSubProcesses("kernel");
        }
        catch (e) {
            console.error(e);
        }
    }
}
exports.Backend = Backend;
;
//# sourceMappingURL=backend.js.map