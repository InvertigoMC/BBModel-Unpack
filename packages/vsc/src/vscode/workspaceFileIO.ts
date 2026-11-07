import * as vscode from 'vscode';
import { DirEntry, FileIO } from '@bbmodel-tools/core';

export class WorkspaceFileIO implements FileIO {
  async exists(targetPath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
      return true;
    } catch {
      return false;
    }
  }

  async mkdirp(targetPath: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(targetPath));
  }

  async writeFile(targetPath: string, data: Uint8Array): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), data);
  }

  async readFile(targetPath: string): Promise<Uint8Array> {
    return vscode.workspace.fs.readFile(vscode.Uri.file(targetPath));
  }

  async readDir(targetPath: string): Promise<string[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(targetPath));
      return entries.map(([name]) => name);
    } catch {
      return [];
    }
  }

  async readDirEntries(targetPath: string): Promise<DirEntry[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(targetPath));
      return entries.map(([name, type]) => ({ name, isDirectory: type === vscode.FileType.Directory }));
    } catch {
      return [];
    }
  }
}
