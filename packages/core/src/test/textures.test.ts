import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { decodeTextures } from '../textures';
import { loadFixtureModel } from './helpers';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function isPng(bytes: Uint8Array | undefined): boolean {
  return !!bytes && PNG_MAGIC.every((b, i) => bytes[i] === b);
}

describe('decodeTextures', () => {
  it('decodes embedded base64 textures into valid PNG bytes', () => {
    const model = loadFixtureModel('simple_cube.bbmodel');
    const result = decodeTextures(model.textures);
    assert.equal(result.items.length, 1);
    assert.equal(result.embeddedCount, 1);
    assert.equal(result.items[0].fileName, 'cube.png');
    assert.ok(isPng(result.items[0].bytes));
  });

  it('adds a file extension when the texture name lacks one', () => {
    const model = loadFixtureModel('animated_bot.bbmodel');
    const result = decodeTextures(model.textures);
    const flip = result.items.find((i) => i.originalName === 'flip');
    assert.ok(flip);
    assert.equal(flip.fileName, 'flip.png');
  });

  it('emits .mcmeta data for flipbook textures', () => {
    const model = loadFixtureModel('animated_bot.bbmodel');
    const result = decodeTextures(model.textures);
    const flip = result.items.find((i) => i.originalName === 'flip');
    assert.deepEqual(flip?.mcmeta, { animation: { frametime: 2, interpolate: true } });
    const plain = result.items.find((i) => i.originalName === 'bot.png');
    assert.equal(plain?.mcmeta, undefined);
  });

  it('keeps duplicate names apart with " (2)" suffixes', () => {
    const source = loadFixtureModel('simple_cube.bbmodel').textures[0].source as string;
    const result = decodeTextures([
      { name: 'skin.png', source },
      { name: 'skin.png', source },
    ]);
    assert.deepEqual(
      result.items.map((i) => i.fileName),
      ['skin.png', 'skin (2).png']
    );
  });

  it('sanitizes hostile names so they cannot escape the output folder', () => {
    const source = loadFixtureModel('simple_cube.bbmodel').textures[0].source as string;
    const result = decodeTextures([{ name: '../../evil.png', source }, { name: 'CON', source }]);
    for (const item of result.items) {
      assert.ok(!item.fileName.includes('/') && !item.fileName.includes('\\'), item.fileName);
      assert.ok(!item.fileName.startsWith('.'), item.fileName);
    }
    assert.ok(result.items[1].fileName.startsWith('_CON'));
  });

  it('warns on invalid base64 instead of writing garbage', () => {
    const result = decodeTextures([{ name: 'bad.png', source: 'data:image/png;base64,@@not-base64@@' }]);
    assert.equal(result.items[0].bytes, undefined);
    assert.ok(result.warnings.some((w) => w.includes('bad.png')));
  });

  it('reports textures that only exist as external references', () => {
    const result = decodeTextures([{ name: 'external.png', path: 'C:/somewhere/external.png' }]);
    assert.equal(result.embeddedCount, 0);
    assert.equal(result.externalOnlyCount, 1);
    assert.equal(result.items[0].bytes, undefined);
    assert.equal(result.items[0].externalPath, 'C:/somewhere/external.png');
  });
});
