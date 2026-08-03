import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { findFilesByExtension, NodeFileIO } from '../core/fileio';

const io = new NodeFileIO();
const tempRoots: string[] = [];

async function makeTree(structure: Record<string, string>): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'bbmodel-scan-test-'));
  tempRoots.push(root);
  for (const [relative, content] of Object.entries(structure)) {
    const target = path.join(root, relative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, content);
  }
  return root;
}

after(async () => {
  for (const dir of tempRoots) {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

describe('findFilesByExtension', () => {
  it('finds .bbmodel files recursively, sorted, case-insensitively', async () => {
    const root = await makeTree({
      'robot.bbmodel': '{}',
      'mobs/bee.bbmodel': '{}',
      'mobs/deep/UPPER.BBMODEL': '{}',
      'textures/skin.png': 'not a model',
      'readme.txt': 'nope',
    });
    const found = await findFilesByExtension(io, root, '.bbmodel');
    assert.deepEqual(
      found.map((f) => path.relative(root, f).replace(/\\/g, '/')).sort(),
      ['mobs/bee.bbmodel', 'mobs/deep/UPPER.BBMODEL', 'robot.bbmodel']
    );
  });

  it('skips node_modules and .git directories', async () => {
    const root = await makeTree({
      'keep.bbmodel': '{}',
      'node_modules/pkg/sneaky.bbmodel': '{}',
      '.git/objects/sneaky.bbmodel': '{}',
    });
    const found = await findFilesByExtension(io, root, '.bbmodel');
    assert.equal(found.length, 1);
    assert.ok(found[0].endsWith('keep.bbmodel'));
  });

  it('returns an empty list for folders without matches or missing folders', async () => {
    const root = await makeTree({ 'only.txt': 'x' });
    assert.deepEqual(await findFilesByExtension(io, root, '.bbmodel'), []);
    assert.deepEqual(await findFilesByExtension(io, path.join(root, 'does-not-exist'), '.bbmodel'), []);
  });
});
