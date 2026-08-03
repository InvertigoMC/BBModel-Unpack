import * as vscode from 'vscode';
import {
  extractCommand,
  extractFolderCommand,
  previewCommand,
  SECTIONS_ALL,
  SECTIONS_ANIMATIONS,
  SECTIONS_GEOMETRY,
  SECTIONS_TEXTURES,
} from './vscode/commands';
import { BBModelBadgeProvider } from './vscode/decorations';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('BBModel Unpack', { log: true });
  const deps = { log };
  log.info('BBModel Unpack activated.');

  const badges = new BBModelBadgeProvider();

  context.subscriptions.push(
    log,
    vscode.commands.registerCommand(
      'bbmodel-unpack.extractAll',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => extractCommand(deps, uri, uris, SECTIONS_ALL)
    ),
    vscode.commands.registerCommand(
      'bbmodel-unpack.extractTextures',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => extractCommand(deps, uri, uris, SECTIONS_TEXTURES)
    ),
    vscode.commands.registerCommand(
      'bbmodel-unpack.extractGeometry',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => extractCommand(deps, uri, uris, SECTIONS_GEOMETRY)
    ),
    vscode.commands.registerCommand(
      'bbmodel-unpack.extractAnimations',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => extractCommand(deps, uri, uris, SECTIONS_ANIMATIONS)
    ),
    vscode.commands.registerCommand(
      'bbmodel-unpack.preview',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => previewCommand(deps, uri, uris)
    ),
    vscode.commands.registerCommand(
      'bbmodel-unpack.extractFolder',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => extractFolderCommand(deps, uri, uris)
    ),
    badges,
    vscode.window.registerFileDecorationProvider(badges)
  );
}

export function deactivate(): void {
}
