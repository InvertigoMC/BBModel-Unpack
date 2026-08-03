/** Shared utilities for the unit tests (plain Node, no VS Code involved). */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadBBModel } from '../core/parse';
import { Logger } from '../core/extractor';
import { NormalizedModel } from '../core/types';

/** fixtures/ lives at the repo root; tests run from out/test/. */
export const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'fixtures');

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

export function loadFixtureModel(name: string): NormalizedModel {
  return loadBBModel(readFixture(name));
}

export const nullLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Typed convenience for digging into generated JSON structures. */
export function get(value: unknown, ...keys: Array<string | number>): any {
  let current: any = value;
  for (const key of keys) current = current?.[key];
  return current;
}
