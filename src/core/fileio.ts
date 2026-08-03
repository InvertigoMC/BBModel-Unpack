/**
 * File-system abstraction used by the extractor.
 *
 * The extractor itself never imports the `vscode` module so it can be unit
 * tested with plain Node. Inside the extension a `workspace.fs`-backed
 * implementation is injected (see `../vscode/workspaceFileIO.ts`); tests and
 * scripts use `NodeFileIO` below (async `node:fs/promises` throughout).
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { uniqueName } from './names';

export interface DirEntry {
  name: string;
  /**
   * True only for real directories. Symbolic links report false so directory
   * walks cannot cycle.
   */
  isDirectory: boolean;
}

export interface FileIO {
  /** True when a file or directory exists at the path. */
  exists(targetPath: string): Promise<boolean>;
  /** Recursively create a directory (no error when it already exists). */
  mkdirp(targetPath: string): Promise<void>;
  /** Write a file, replacing any existing file at that exact path. */
  writeFile(targetPath: string, data: Uint8Array): Promise<void>;
  /** Read a file fully. */
  readFile(targetPath: string): Promise<Uint8Array>;
  /** List the entry names of a directory ([] when it does not exist). */
  readDir(targetPath: string): Promise<string[]>;
  /** List directory entries with their kind ([] when it does not exist). */
  readDirEntries(targetPath: string): Promise<DirEntry[]>;
}

export class NodeFileIO implements FileIO {
  async exists(targetPath: string): Promise<boolean> {
    try {
      await fsp.stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  async mkdirp(targetPath: string): Promise<void> {
    await fsp.mkdir(targetPath, { recursive: true });
  }
  async writeFile(targetPath: string, data: Uint8Array): Promise<void> {
    await fsp.writeFile(targetPath, data);
  }
  async readFile(targetPath: string): Promise<Uint8Array> {
    return fsp.readFile(targetPath);
  }
  async readDir(targetPath: string): Promise<string[]> {
    try {
      return await fsp.readdir(targetPath);
    } catch {
      return [];
    }
  }
  async readDirEntries(targetPath: string): Promise<DirEntry[]> {
    try {
      const entries = await fsp.readdir(targetPath, { withFileTypes: true });
      // Dirent.isDirectory() is false for symlinks, which keeps walks acyclic.
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    } catch {
      return [];
    }
  }
}

/** Directories that never contain user models and are skipped when scanning. */
const SKIP_DIRECTORIES = new Set(['node_modules', '.git']);

/**
 * Recursively find files with the given extension (case-insensitive) under
 * `rootDir`. Returns absolute paths, sorted. Symlinked directories are not
 * followed and well-known junk directories are skipped.
 */
export async function findFilesByExtension(
  io: FileIO,
  rootDir: string,
  extension: string,
  maxDepth = 32
): Promise<string[]> {
  const suffix = extension.toLowerCase();
  const results: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;
    for (const entry of await io.readDirEntries(dir)) {
      if (entry.isDirectory) {
        if (SKIP_DIRECTORIES.has(entry.name.toLowerCase())) continue;
        await walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.name.toLowerCase().endsWith(suffix)) {
        results.push(path.join(dir, entry.name));
      }
    }
  };
  await walk(rootDir, 0);
  return results.sort();
}

/** How to behave when a target file already exists. */
export type ConflictStrategy = 'unique' | 'overwrite';

export interface WriteOutcome {
  /** Absolute path actually written. */
  path: string;
  /** File name actually used (may differ from the requested one). */
  fileName: string;
  /** True when the name was changed to avoid overwriting an existing file. */
  renamed: boolean;
  /** True when an existing file was overwritten (only with 'overwrite'). */
  overwrote: boolean;
}

/**
 * Write `data` into `directory/fileName` without ever destroying data
 * silently: with 'unique' an existing file causes a " (2)"-style rename,
 * with 'overwrite' the file is replaced and the outcome says so.
 */
export async function safeWriteFile(
  io: FileIO,
  directory: string,
  fileName: string,
  data: Uint8Array,
  strategy: ConflictStrategy
): Promise<WriteOutcome> {
  await io.mkdirp(directory);
  let finalName = fileName;
  let renamed = false;
  let overwrote = false;

  const exists = await io.exists(path.join(directory, fileName));
  if (exists) {
    if (strategy === 'unique') {
      const taken = new Set((await io.readDir(directory)).map((n) => n.toLowerCase()));
      finalName = uniqueName(fileName, taken);
      renamed = finalName !== fileName;
    } else {
      overwrote = true;
    }
  }

  const finalPath = path.join(directory, finalName);
  await io.writeFile(finalPath, data);
  return { path: finalPath, fileName: finalName, renamed, overwrote };
}

/**
 * Choose a directory that does not exist yet by appending "-2", "-3", ...
 * ("model_extracted" -> "model_extracted-2").
 */
export async function nextAvailableDirectory(io: FileIO, basePath: string): Promise<string> {
  if (!(await io.exists(basePath))) return basePath;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${basePath}-${i}`;
    if (!(await io.exists(candidate))) return candidate;
  }
  return `${basePath}-${Date.now()}`;
}

/** True when the directory exists and contains at least one entry. */
export async function directoryHasEntries(io: FileIO, targetPath: string): Promise<boolean> {
  if (!(await io.exists(targetPath))) return false;
  const entries = await io.readDir(targetPath);
  return entries.length > 0;
}
