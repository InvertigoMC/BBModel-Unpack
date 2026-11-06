import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadBBModel } from '../parse';
import { Logger } from '../extractor';
import { NormalizedModel } from '../types';

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

export function get(value: unknown, ...keys: Array<string | number>): any {
  let current: any = value;
  for (const key of keys) current = current?.[key];
  return current;
}
