import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { sanitizeFileName, sanitizeIdentifier, splitExtension, uniqueName } from '../names';

describe('sanitizeFileName', () => {
  it('replaces invalid characters', () => {
    assert.equal(sanitizeFileName('a<b>:c/d\\e|f?g*h'), 'a_b__c_d_e_f_g_h');
  });

  it('strips path traversal fragments', () => {
    const name = sanitizeFileName('../../etc/passwd');
    assert.ok(!name.includes('/') && !name.includes('..' + '/'));
    assert.ok(!name.startsWith('.'));
  });

  it('guards reserved Windows device names', () => {
    assert.equal(sanitizeFileName('CON'), '_CON');
    assert.equal(sanitizeFileName('aux.png'), '_aux.png');
    assert.equal(sanitizeFileName('console.png'), 'console.png'); // not reserved
  });

  it('trims dots/spaces and never returns an empty string', () => {
    assert.equal(sanitizeFileName('  name.  '), 'name');
    assert.equal(sanitizeFileName(''), 'unnamed');
    assert.equal(sanitizeFileName('...'), 'unnamed');
  });

  it('caps extremely long names', () => {
    assert.ok(sanitizeFileName('x'.repeat(500)).length <= 120);
  });
});

describe('uniqueName', () => {
  it('appends " (n)" before the extension on collision', () => {
    const taken = new Set(['tex.png', 'tex (2).png']);
    assert.equal(uniqueName('tex.png', taken), 'tex (3).png');
    assert.equal(uniqueName('fresh.png', taken), 'fresh.png');
  });

  it('is case-insensitive like Windows/macOS file systems', () => {
    assert.equal(uniqueName('Tex.PNG', new Set(['tex.png'])), 'Tex (2).PNG');
  });
});

describe('splitExtension', () => {
  it('splits regular names', () => {
    assert.deepEqual(splitExtension('model.geo.json'), { stem: 'model.geo', ext: '.json' });
  });
  it('treats dot-files as extensionless', () => {
    assert.deepEqual(splitExtension('.hidden'), { stem: '.hidden', ext: '' });
  });
});

describe('sanitizeIdentifier', () => {
  it('strips a geometry. prefix and invalid characters', () => {
    assert.equal(sanitizeIdentifier('geometry.my model!'), 'my_model_');
  });
  it('falls back when empty', () => {
    assert.equal(sanitizeIdentifier('   '), 'unknown');
  });
});
