/**
 * FileIO implementation backed by `vscode.workspace.fs`, so all writes go
 * through VS Code's file system layer (respecting things like local history
 * and remote extension hosts) while the core extractor stays free of any
 * dependency on the `vscode` module.
 */

import * as vscode from 'vscode';
import { DirEntry, FileIO } from '../core/fileio';

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
    // createDirectory is recursive and succeeds when the directory exists.
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
      // Exact match on Directory: symlinked directories report a combined
      // flag and are deliberately not treated as walkable directories.
      return entries.map(([name, type]) => ({ name, isDirectory: type === vscode.FileType.Directory }));
    } catch {
      return [];
    }
  }
}
