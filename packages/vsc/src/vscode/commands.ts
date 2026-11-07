import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  ALL_SECTIONS,
  BBModelError,
  ConflictStrategy,
  ExtractSection,
  ExtractionCancelledError,
  ExtractionSummary,
  buildInventory,
  directoryHasEntries,
  extractBBModel,
  findFilesByExtension,
  loadBBModel,
  nextAvailableDirectory,
  renderInventoryMarkdown,
  sanitizeFileName,
} from '@bbmodels-tools/core';
import { WorkspaceFileIO } from './workspaceFileIO';

const BBMODEL_EXT = '.bbmodel';
const LARGE_FILE_BYTES = 100 * 1024 * 1024;

interface CommandDeps {
  log: vscode.LogOutputChannel;
}

function coreLogger(log: vscode.LogOutputChannel) {
  return {
    info: (message: string) => log.info(message),
    warn: (message: string) => log.warn(message),
    error: (message: string) => log.error(message),
  };
}

function isBBModelUri(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith(BBMODEL_EXT);
}

async function resolveTargets(
  uri: vscode.Uri | undefined,
  uris: vscode.Uri[] | undefined
): Promise<vscode.Uri[]> {
  const candidates: vscode.Uri[] = [];
  if (Array.isArray(uris) && uris.length) candidates.push(...uris);
  else if (uri) candidates.push(uri);

  if (!candidates.length) {
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active && isBBModelUri(active)) {
      candidates.push(active);
    } else {
      const picked = await vscode.window.showOpenDialog({
        title: 'Select a Blockbench model to extract',
        canSelectMany: true,
        filters: { 'Blockbench models': ['bbmodel'] },
        openLabel: 'Extract',
      });
      if (picked) candidates.push(...picked);
    }
  }

  const valid: vscode.Uri[] = [];
  for (const candidate of candidates) {
    if (candidate.scheme !== 'file') {
      void vscode.window.showErrorMessage(
        `BBModel Unpack: "${candidate.toString()}" is not a local file. Only local .bbmodel files are supported.`
      );
      continue;
    }
    if (!isBBModelUri(candidate)) {
      void vscode.window.showErrorMessage(
        `BBModel Unpack: "${path.basename(candidate.fsPath)}" is not a .bbmodel file.`
      );
      continue;
    }
    valid.push(candidate);
  }
  return valid;
}

interface OutputPlan {
  outDir: string;
  conflict: ConflictStrategy;
}

async function planOutput(io: WorkspaceFileIO, sourcePath: string): Promise<OutputPlan | undefined> {
  const config = vscode.workspace.getConfiguration('bbmodelUnpack');
  const mode = config.get<string>('output.mode', 'alongside');
  const onExisting = config.get<string>('output.onExisting', 'ask');

  const stem = sanitizeFileName(path.basename(sourcePath, path.extname(sourcePath)), 'model');
  let parentDir = path.dirname(sourcePath);

  if (mode === 'ask') {
    const picked = await vscode.window.showOpenDialog({
      title: 'Select the folder to extract into',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(parentDir),
      openLabel: 'Extract here',
    });
    if (!picked?.length) return undefined;
    parentDir = picked[0].fsPath;
  }

  let outDir = path.join(parentDir, `${stem}_extracted`);
  let conflict: ConflictStrategy = 'unique';

  if (await directoryHasEntries(io, outDir)) {
    let choice = onExisting;
    if (choice === 'ask') {
      const newFolder = 'Use New Folder';
      const merge = 'Merge (Keep Existing)';
      const overwrite = 'Overwrite Matching Files';
      const answer = await vscode.window.showWarningMessage(
        `"${path.basename(outDir)}" already exists and is not empty.`,
        { modal: true, detail: 'Choose how to write the extracted files.' },
        newFolder,
        merge,
        overwrite
      );
      if (!answer) return undefined;
      choice = answer === newFolder ? 'newFolder' : answer === merge ? 'merge' : 'overwrite';
    }
    if (choice === 'newFolder') {
      outDir = await nextAvailableDirectory(io, outDir);
    } else if (choice === 'overwrite') {
      conflict = 'overwrite';
    } // 'merge' keeps outDir with the default 'unique' strategy.
  }

  return { outDir, conflict };
}

async function readModel(io: WorkspaceFileIO, uri: vscode.Uri, log: vscode.LogOutputChannel) {
  const bytes = await io.readFile(uri.fsPath);
  if (bytes.byteLength > LARGE_FILE_BYTES) {
    log.warn(`${uri.fsPath} is ${(bytes.byteLength / 1024 / 1024).toFixed(0)} MB; extraction may take a while.`);
  }
  const text = new TextDecoder('utf-8').decode(bytes);
  return loadBBModel(text);
}

async function showFailure(log: vscode.LogOutputChannel, fileName: string, err: unknown): Promise<void> {
  if (err instanceof ExtractionCancelledError) {
    log.warn(`${fileName}: extraction cancelled by the user.`);
    void vscode.window.showInformationMessage(`BBModel Unpack: extraction of "${fileName}" was cancelled.`);
    return;
  }
  const message = err instanceof BBModelError ? err.message : err instanceof Error ? err.message : String(err);
  log.error(`${fileName}: ${message}`);
  if (err instanceof Error && err.stack && !(err instanceof BBModelError)) log.error(err.stack);
  const action = await vscode.window.showErrorMessage(`BBModel Unpack — ${fileName}: ${message}`, 'Show Log');
  if (action === 'Show Log') log.show(true);
}

async function showSuccess(
  log: vscode.LogOutputChannel,
  fileName: string,
  summary: ExtractionSummary
): Promise<void> {
  const artifactCount = summary.artifacts.length;
  const warningSuffix = summary.warnings.length
    ? ` with ${summary.warnings.length} warning${summary.warnings.length === 1 ? '' : 's'}`
    : '';
  const message = `Extracted ${artifactCount} file${artifactCount === 1 ? '' : 's'} from "${fileName}"${warningSuffix}.`;

  const openFolder = 'Open Folder';
  const showLog = 'Show Log';
  const action = summary.warnings.length
    ? await vscode.window.showWarningMessage(message, openFolder, showLog)
    : await vscode.window.showInformationMessage(message, openFolder);

  if (action === openFolder) {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(summary.outDir));
  } else if (action === showLog) {
    log.show(true);
  }
}

export async function extractCommand(
  deps: CommandDeps,
  uri: vscode.Uri | undefined,
  uris: vscode.Uri[] | undefined,
  sections: ExtractSection[]
): Promise<void> {
  const { log } = deps;
  const targets = await resolveTargets(uri, uris);
  if (!targets.length) return;
  const isBatch = targets.length > 1;

  const io = new WorkspaceFileIO();
  const config = vscode.workspace.getConfiguration('bbmodelUnpack');
  const prettyJson = config.get<boolean>('output.prettyJson', true);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let warningCount = 0;
  let cancelled = false;

  for (const target of targets) {
    const fileName = path.basename(target.fsPath);
    try {
      log.info(`--- Extracting ${target.fsPath}`);
      const model = await readModel(io, target, log);
      const plan = await planOutput(io, target.fsPath);
      if (!plan) {
        log.info(`${fileName}: destination selection cancelled.`);
        skipped++;
        continue;
      }
      log.info(`${fileName}: writing to ${plan.outDir} (conflicts: ${plan.conflict})`);

      const summary = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Extracting ${fileName}`,
          cancellable: true,
        },
        (progress, token) =>
          extractBBModel({
            model,
            sourcePath: target.fsPath,
            outDir: plan.outDir,
            io,
            log: coreLogger(log),
            options: { sections, prettyJson, conflict: plan.conflict },
            progress: {
              report: (message) => progress.report({ message, increment: 100 / 5 }),
            },
            token,
          })
      );
      succeeded++;
      warningCount += summary.warnings.length;
      if (isBatch) {
        log.info(
          `${fileName}: ${summary.artifacts.length} artifact(s), ${summary.warnings.length} warning(s) -> ${summary.outDir}`
        );
      } else {
        await showSuccess(log, fileName, summary);
      }
    } catch (err) {
      if (isBatch) {
        if (err instanceof ExtractionCancelledError) {
          cancelled = true;
          log.warn(`${fileName}: cancelled — stopping the batch.`);
          break;
        }
        failed++;
        const message =
          err instanceof BBModelError ? err.message : err instanceof Error ? err.message : String(err);
        log.error(`${fileName}: ${message}`);
      } else {
        await showFailure(log, fileName, err);
      }
    }
  }

  if (isBatch) {
    const parts = [`extracted ${succeeded} of ${targets.length} models`];
    if (warningCount) parts.push(`${warningCount} warning${warningCount === 1 ? '' : 's'}`);
    if (failed) parts.push(`${failed} failed`);
    if (skipped) parts.push(`${skipped} skipped`);
    if (cancelled) parts.push('stopped early');
    const message = `BBModel Unpack: ${parts.join(' · ')}.`;
    const showLog = 'Show Log';
    const action =
      failed || warningCount || cancelled
        ? await vscode.window.showWarningMessage(message, showLog)
        : await vscode.window.showInformationMessage(message, showLog);
    if (action === showLog) log.show(true);
  }
}

export async function extractFolderCommand(
  deps: CommandDeps,
  uri: vscode.Uri | undefined,
  uris: vscode.Uri[] | undefined
): Promise<void> {
  const { log } = deps;
  let folders: vscode.Uri[] = [];
  if (Array.isArray(uris) && uris.length) folders = uris;
  else if (uri) folders = [uri];

  if (!folders.length) {
    const picked = await vscode.window.showOpenDialog({
      title: 'Select a folder to scan for .bbmodel files',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: true,
      openLabel: 'Scan for Models',
    });
    if (!picked?.length) return;
    folders = picked;
  }

  const io = new WorkspaceFileIO();
  const files: string[] = [];
  for (const folder of folders) {
    if (folder.scheme !== 'file') {
      void vscode.window.showErrorMessage(
        `BBModel Unpack: "${folder.toString()}" is not a local folder. Only local folders are supported.`
      );
      continue;
    }
    if (isBBModelUri(folder)) {
      files.push(folder.fsPath);
      continue;
    }
    log.info(`Scanning ${folder.fsPath} for .bbmodel files…`);
    files.push(...(await findFilesByExtension(io, folder.fsPath, BBMODEL_EXT)));
  }

  const unique = [...new Set(files)].sort();
  if (!unique.length) {
    void vscode.window.showInformationMessage(
      `BBModel Unpack: no .bbmodel files found in the selected folder${folders.length === 1 ? '' : 's'}.`
    );
    return;
  }

  const label =
    folders.length === 1 ? `"${path.basename(folders[0].fsPath)}"` : `${folders.length} folders`;
  const names = unique.slice(0, 8).map((f) => path.basename(f));
  const detail =
    unique.length > names.length
      ? `${names.join('\n')}\n…and ${unique.length - names.length} more`
      : names.join('\n');
  const extractAll = 'Extract All';
  const confirm = await vscode.window.showInformationMessage(
    `Extract ${unique.length} .bbmodel file${unique.length === 1 ? '' : 's'} found in ${label}?`,
    { modal: true, detail },
    extractAll
  );
  if (confirm !== extractAll) {
    log.info('Folder extraction cancelled at the confirmation prompt.');
    return;
  }

  await extractCommand(
    deps,
    undefined,
    unique.map((f) => vscode.Uri.file(f)),
    ALL_SECTIONS
  );
}

export async function previewCommand(
  deps: CommandDeps,
  uri: vscode.Uri | undefined,
  uris: vscode.Uri[] | undefined
): Promise<void> {
  const { log } = deps;
  const targets = await resolveTargets(uri, uris);
  if (!targets.length) return;

  const io = new WorkspaceFileIO();
  for (const target of targets) {
    const fileName = path.basename(target.fsPath);
    try {
      log.info(`--- Previewing ${target.fsPath}`);
      const model = await readModel(io, target, log);
      const inventory = buildInventory(model);
      const markdown = renderInventoryMarkdown(inventory, model, target.fsPath);
      const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
      await vscode.window.showTextDocument(document, { preview: false });
    } catch (err) {
      await showFailure(log, fileName, err);
    }
  }
}

export const SECTIONS_ALL: ExtractSection[] = ALL_SECTIONS;
export const SECTIONS_TEXTURES: ExtractSection[] = ['textures'];
export const SECTIONS_GEOMETRY: ExtractSection[] = ['geometry'];

export const SECTIONS_ANIMATIONS: ExtractSection[] = ['animations', 'controllers'];
