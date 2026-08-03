import * as vscode from 'vscode';

export class BBModelBadgeProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;
  private readonly configListener: vscode.Disposable;

  constructor() {
    this.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('bbmodelUnpack.explorer.badges')) {
        this.emitter.fire(undefined);
      }
    });
  }

  dispose(): void {
    this.configListener.dispose();
    this.emitter.dispose();
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!uri.fsPath.toLowerCase().endsWith('.bbmodel')) return undefined;
    const config = vscode.workspace.getConfiguration('bbmodelUnpack');
    if (!config.get<boolean>('explorer.badges', true)) return undefined;
    const decoration = new vscode.FileDecoration(
      'BB',
      'Blockbench model — right-click to extract its contents'
    );
    decoration.propagate = false;
    return decoration;
  }
}
