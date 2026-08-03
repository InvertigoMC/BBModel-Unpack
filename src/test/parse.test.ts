import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { BBModelError, loadBBModel, parseBBModelText } from '../core/parse';
import { loadFixtureModel, readFixture } from './helpers';

describe('parseBBModelText', () => {
  it('parses a valid model', () => {
    const model = parseBBModelText(readFixture('simple_cube.bbmodel'));
    assert.equal(model.meta?.model_format, 'bedrock');
  });

  it('tolerates a UTF-8 byte order mark', () => {
    const model = parseBBModelText('﻿' + readFixture('simple_cube.bbmodel'));
    assert.equal(model.name, 'simple_cube');
  });

  it('rejects malformed JSON with a parse error', () => {
    assert.throws(
      () => parseBBModelText(readFixture('broken.bbmodel')),
      (err: unknown) => err instanceof BBModelError && err.code === 'parse'
    );
  });

  it('rejects JSON that is not a Blockbench project', () => {
    assert.throws(
      () => parseBBModelText(readFixture('not_a_model.bbmodel')),
      (err: unknown) => err instanceof BBModelError && err.code === 'shape'
    );
  });

  it('rejects a non-object JSON root', () => {
    assert.throws(
      () => parseBBModelText('[1, 2, 3]'),
      (err: unknown) => err instanceof BBModelError && err.code === 'shape'
    );
  });

  it('explains LZUTF8-compressed backups instead of failing cryptically', () => {
    assert.throws(
      () => parseBBModelText('<lz>äöü-compressed-payload'),
      (err: unknown) =>
        err instanceof BBModelError && err.code === 'unsupported' && /Blockbench/.test(err.message)
    );
  });
});

describe('normalizeModel', () => {
  it('migrates legacy fields (geometry_name, missing model_format, shade mirroring)', () => {
    const model = loadFixtureModel('legacy_box.bbmodel');
    assert.equal(model.identifier, 'legacy_box');
    assert.equal(model.modelFormat, 'bedrock_old'); // inferred from bone_rig
    const element = model.elements[0];
    assert.equal(element.mirror_uv, true); // migrated from shade: false
  });

  it('builds the outliner tree from inline groups (bbmodel <= 4.x)', () => {
    const model = loadFixtureModel('simple_cube.bbmodel');
    assert.equal(model.rootNodes.length, 1);
    const root = model.rootNodes[0];
    assert.equal(root.kind, 'group');
    if (root.kind === 'group') {
      assert.equal(root.group.name, 'body');
      assert.deepEqual(root.group.rotation, [0, 45, 0]);
      assert.equal(root.group.children.length, 1);
      assert.deepEqual(root.group.children[0], { kind: 'element', uuid: 'element-cube-1' });
    }
  });

  it('resolves the flat groups[] array of bbmodel 5.0 files', () => {
    const model = loadFixtureModel('groups_v5.bbmodel');
    const root = model.rootNodes[0];
    assert.equal(root.kind, 'group');
    if (root.kind !== 'group') return;
    assert.equal(root.group.name, 'root');
    const child = root.group.children[0];
    assert.equal(child.kind, 'group');
    if (child.kind !== 'group') return;
    assert.equal(child.group.name, 'child');
    assert.deepEqual(child.group.rotation, [10, 0, 0]); // from the flat groups[] data
    assert.deepEqual(child.group.children[0], { kind: 'element', uuid: 'v5-cube-1' });
  });

  it('un-inverts outliner Z rotation for pre-3.2 files', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '3.0', model_format: 'bedrock_old' },
        elements: [{ uuid: 'e1', from: [0, 0, 0], to: [1, 1, 1] }],
        outliner: [{ uuid: 'g1', name: 'bone', origin: [0, 0, 0], rotation: [0, 0, 10], children: ['e1'] }],
      })
    );
    const root = model.rootNodes[0];
    assert.equal(root.kind, 'group');
    if (root.kind === 'group') assert.deepEqual(root.group.rotation, [0, 0, -10]);
  });

  it('warns about elements the outliner never references', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.5', model_format: 'bedrock' },
        elements: [
          { uuid: 'used', from: [0, 0, 0], to: [1, 1, 1] },
          { uuid: 'orphan', from: [0, 0, 0], to: [1, 1, 1] },
        ],
        outliner: ['used'],
      })
    );
    assert.ok(model.warnings.some((w) => w.includes('not referenced')));
  });

  it('warns about unknown outliner references and keeps going', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.5', model_format: 'bedrock' },
        elements: [{ uuid: 'e1', from: [0, 0, 0], to: [1, 1, 1] }],
        outliner: ['e1', 'ghost-uuid'],
      })
    );
    assert.equal(model.rootNodes.length, 1);
    assert.ok(model.warnings.some((w) => w.includes('ghost-uuid')));
  });
});
