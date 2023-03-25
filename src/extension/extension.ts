// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { SampleContentSerializer, SampleKernel } from './sampleProvider';

// This method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  let storageUri = context.storageUri;

  if(storageUri === null || storageUri === undefined){
    storageUri = context.globalStorageUri;
  }
  
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer(
      'vdm-notebook-renderer', new SampleContentSerializer(), { transientOutputs: true }
    ),
    new SampleKernel(storageUri)
  );
  
}

// This method is called when your extension is deactivated
export function deactivate() { }
