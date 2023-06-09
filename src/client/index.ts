import { render, rerender } from './render';
import errorOverlay from 'vscode-notebook-error-overlay';
import type { ActivationFunction } from 'vscode-notebook-renderer';
import * as vscode from "vscode";
import 'bootstrap';

// Fix the public path so that any async import()'s work as expected.
declare const __webpack_relative_entrypoint_to_root__: string;
declare const scriptUrl: string;

__webpack_public_path__ = new URL(scriptUrl.replace(/[^/]+$/, '') + __webpack_relative_entrypoint_to_root__).toString();

// ----------------------------------------------------------------------------
// This is the entrypoint to the notebook renderer's webview client-side code.
// This contains some boilerplate that calls the `render()` function when new
// output is available. You probably don't need to change this code; put your
// rendering logic inside of the `render()` function.
// ----------------------------------------------------------------------------

export const activate: ActivationFunction = context => {
  return {
    renderOutputItem(outputItem, element) {
      let outputObj = outputItem.json();
      outputObj.id = outputItem.id;
      errorOverlay.wrap(element, () => {
        if(element !== null && element.childElementCount === 1 && element.children[0].id === "vdm-root-node"){
          // Rerender
          const node = element.children[0] as HTMLElement;
          rerender({container: node, mime: outputItem.mime, value: outputObj, context});
        }else{
          // Render
          element.innerHTML = '';
          const node = document.createElement('div');
          node.id = "vdm-root-node";
          element.appendChild(node);
          render({ container: node, mime: outputItem.mime, value: outputObj, context });
        }
      });
    },
    disposeOutputItem(outputId) {
      // Do any teardown here. outputId is the cell output being deleted, or
      // undefined if we're clearing all outputs.
    }
  };
};
