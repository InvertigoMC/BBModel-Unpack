import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { uniqueName } from './names';

export interface DirEntry {
  name: string;

  isDirectory: boolean;
}

export interface FileIO {

  exists(targetPath: string): Promise<boolean>;

  mkdirp(targetPath: string): Promise<void>;

  writeFile(targetPath: string, data: Uint8Array): Promise<void>;

  readFile(targetPath: string): Promise<Uint8Array>;

  readDir(targetPath: string): Promise<string[]>;

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
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    } catch {
      return [];
    }
  }
}

const SKIP_DIRECTORIES = new Set(['node_modules', '.git']);

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
    const subdirs: string[] = [];
    for (const entry of await io.readDirEntries(dir)) {
      if (entry.isDirectory) {
        if (!SKIP_DIRECTORIES.has(entry.name.toLowerCase())) subdirs.push(path.join(dir, entry.name));
      } else if (entry.name.toLowerCase().endsWith(suffix)) {
        results.push(path.join(dir, entry.name));
      }
    }
    await Promise.all(subdirs.map((sub) => walk(sub, depth + 1)));
  };
  await walk(rootDir, 0);
  return results.sort();
}

export type ConflictStrategy = 'unique' | 'overwrite';

export interface WriteOutcome {

  path: string;

  fileName: string;

  renamed: boolean;

  overwrote: boolean;
}

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

export async function nextAvailableDirectory(io: FileIO, basePath: string): Promise<string> {
  if (!(await io.exists(basePath))) return basePath;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${basePath}-${i}`;
    if (!(await io.exists(candidate))) return candidate;
  }
  return `${basePath}-${Date.now()}`;
}

export async function directoryHasEntries(io: FileIO, targetPath: string): Promise<boolean> {
  if (!(await io.exists(targetPath))) return false;
  const entries = await io.readDir(targetPath);
  return entries.length > 0;
}
