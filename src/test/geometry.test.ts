import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { convertToBedrockGeometry } from '../core/geometry';
import { loadBBModel } from '../core/parse';
import { get, loadFixtureModel } from './helpers';

describe('convertToBedrockGeometry', () => {
  it('converts a simple box-UV model with the Blockbench axis conventions', () => {
    const result = convertToBedrockGeometry(loadFixtureModel('simple_cube.bbmodel'));
    assert.ok(result.file);
    assert.equal(get(result.file, 'format_version'), '1.12.0');

    const description = get(result.file, 'minecraft:geometry', 0, 'description');
    assert.equal(description.identifier, 'geometry.simple_cube');
    assert.equal(description.texture_width, 16);
    assert.equal(description.texture_height, 16);
    assert.equal(description.visible_bounds_width, 1);
    assert.equal(description.visible_bounds_height, 1.5);
    assert.deepEqual(description.visible_bounds_offset, [0, 0, 0]);

    const bones = get(result.file, 'minecraft:geometry', 0, 'bones');
    assert.equal(bones.length, 1);
    const bone = bones[0];
    assert.equal(bone.name, 'body');
    assert.deepEqual(bone.pivot, [0, 2, 0]); // pivot X negated (−0 → 0)
    assert.deepEqual(bone.rotation, [0, -45, 0]); // X/Y rotation negated
    assert.equal(bone.parent, undefined);

    const cube = bone.cubes[0];
    assert.deepEqual(cube.origin, [-2, 0, -2]); // origin.x = −to.x
    assert.deepEqual(cube.size, [4, 4, 4]);
    assert.deepEqual(cube.uv, [0, 0]); // box UV offset
    assert.equal(cube.rotation, undefined); // unrotated cube
  });

  it('converts per-face UV, cube rotation, inflate, and flips up/down faces', () => {
    const result = convertToBedrockGeometry(loadFixtureModel('animated_bot.bbmodel'));
    assert.ok(result.file);
    const bones = get(result.file, 'minecraft:geometry', 0, 'bones');
    const body = bones.find((b: any) => b.name === 'body');
    const head = bones.find((b: any) => b.name === 'head');
    assert.ok(body && head);
    assert.equal(head.parent, 'body');

    const bodyCube = body.cubes[0];
    assert.equal(bodyCube.inflate, 0.25);
    assert.deepEqual(bodyCube.pivot, [0, 6, 0]);
    assert.deepEqual(bodyCube.rotation, [0, 0, 22.5]); // only X/Y negate; Z keeps sign

    const headCube = head.cubes[0];
    assert.deepEqual(headCube.uv.north, { uv: [0, 0], uv_size: [6, 6] });
    assert.deepEqual(headCube.uv.up, { uv: [12, 6], uv_size: [-6, -6] });
    assert.deepEqual(headCube.uv.down, { uv: [18, 6], uv_size: [-6, -6] });
    assert.equal(bodyCube.uv.down, undefined);
  });

  it('exports locators and null objects with mirrored X', () => {
    const result = convertToBedrockGeometry(loadFixtureModel('animated_bot.bbmodel'));
    const bones = get(result.file, 'minecraft:geometry', 0, 'bones');
    const body = bones.find((b: any) => b.name === 'body');
    assert.deepEqual(body.locators.lead, [-1.5, 12, -2]);
    assert.deepEqual(body.locators._null_ik_target, [0, 0, 4]);
    assert.equal(result.locatorCount, 2);
  });

  it('reports free-form meshes as skipped instead of dropping them silently', () => {
    const result = convertToBedrockGeometry(loadFixtureModel('animated_bot.bbmodel'));
    assert.equal(result.skipped.meshes, 1);
    assert.ok(result.warnings.some((w) => w.includes('mesh')));
  });

  it('handles the bbmodel 5.0 flat groups layout', () => {
    const result = convertToBedrockGeometry(loadFixtureModel('groups_v5.bbmodel'));
    const bones = get(result.file, 'minecraft:geometry', 0, 'bones');
    assert.deepEqual(
      bones.map((b: any) => [b.name, b.parent]),
      [
        ['root', undefined],
        ['child', 'root'],
      ]
    );
    const child = bones[1];
    assert.deepEqual(child.pivot, [0, 4, 0]);
    assert.deepEqual(child.rotation, [-10, 0, 0]);
    assert.equal(child.cubes.length, 1);
  });

  it('emits per-cube mirror when it differs from the bone (legacy shade flag)', () => {
    const result = convertToBedrockGeometry(loadFixtureModel('legacy_box.bbmodel'));
    const bones = get(result.file, 'minecraft:geometry', 0, 'bones');
    const cube = bones[0].cubes[0];
    assert.equal(cube.mirror, true);
    assert.deepEqual(cube.origin, [-4, 0, 0]);
  });

  it('collects loose root elements into a synthetic bb_main bone', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.5', model_format: 'bedrock', box_uv: true },
        resolution: { width: 16, height: 16 },
        elements: [
          { uuid: 'loose', type: 'cube', from: [0, 0, 0], to: [1, 1, 1], origin: [0, 0, 0], uv_offset: [0, 0] },
        ],
        outliner: ['loose'],
      })
    );
    const result = convertToBedrockGeometry(model);
    const bones = get(result.file, 'minecraft:geometry', 0, 'bones');
    assert.equal(bones[0].name, 'bb_main');
    assert.equal(bones[0].cubes.length, 1);
  });

  it('skips export:false groups without exported children', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.5', model_format: 'bedrock', box_uv: true },
        elements: [],
        outliner: [{ uuid: 'g1', name: 'hidden', origin: [0, 0, 0], export: false, children: [] }],
      })
    );
    const result = convertToBedrockGeometry(model);
    assert.equal(result.file, null);
    assert.equal(result.boneCount, 0);
  });

  it('raises format_version to 1.16.0 when a bone uses a Bedrock binding', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.5', model_format: 'bedrock', box_uv: true },
        elements: [
          { uuid: 'c1', type: 'cube', from: [0, 0, 0], to: [1, 1, 1], origin: [0, 0, 0], uv_offset: [0, 0] },
        ],
        outliner: [
          {
            uuid: 'g1',
            name: 'held_item',
            origin: [0, 0, 0],
            bedrock_binding: "q.item_slot_to_bone_name('main_hand')",
            children: ['c1'],
          },
        ],
      })
    );
    const result = convertToBedrockGeometry(model);
    assert.equal(get(result.file, 'format_version'), '1.16.0');
    const bone = get(result.file, 'minecraft:geometry', 0, 'bones', 0);
    assert.equal(bone.binding, "q.item_slot_to_bone_name('main_hand')");
  });

  it('deduplicates bone names with a warning', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.5', model_format: 'bedrock', box_uv: true },
        elements: [],
        outliner: [
          { uuid: 'g1', name: 'arm', origin: [0, 0, 0], children: [] },
          { uuid: 'g2', name: 'arm', origin: [1, 0, 0], children: [] },
        ],
      })
    );
    const result = convertToBedrockGeometry(model);
    const bones = get(result.file, 'minecraft:geometry', 0, 'bones');
    assert.deepEqual(
      bones.map((b: any) => b.name),
      ['arm', 'arm2']
    );
    assert.ok(result.warnings.some((w) => w.includes('Duplicate bone name')));
  });
});
