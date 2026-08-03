'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Canvas } = require('./lib/png');

const OUT_DIR = path.join(__dirname, '..', 'fixtures');

function checkerDataUrl(width, height, cell, colorA, colorB) {
  const c = new Canvas(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      c.set(x, y, on ? colorA : colorB);
    }
  }
  return `data:image/png;base64,${c.toPng().toString('base64')}`;
}

const simpleCube = {
  meta: { format_version: '4.5', model_format: 'bedrock', box_uv: true },
  name: 'simple_cube',
  geometry_name: 'simple_cube', // legacy field on purpose (tests migration)
  visible_box: [1, 1.5, 0],
  resolution: { width: 16, height: 16 },
  elements: [
    {
      name: 'cube',
      box_uv: true,
      type: 'cube',
      uuid: 'element-cube-1',
      from: [-2, 0, -2],
      to: [2, 4, 2],
      autouv: 0,
      color: 0,
      origin: [0, 2, 0],
      uv_offset: [0, 0],
      faces: {
        north: { uv: [0, 4, 4, 8], texture: 0 },
        east: { uv: [4, 4, 8, 8], texture: 0 },
        south: { uv: [8, 4, 12, 8], texture: 0 },
        west: { uv: [12, 4, 16, 8], texture: 0 },
        up: { uv: [4, 0, 8, 4], texture: 0 },
        down: { uv: [8, 0, 12, 4], texture: 0 },
      },
    },
  ],
  outliner: [
    {
      name: 'body',
      origin: [0, 2, 0],
      rotation: [0, 45, 0],
      bedrock_binding: '',
      color: 0,
      uuid: 'group-body-1',
      export: true,
      mirror_uv: false,
      isOpen: true,
      locked: false,
      visibility: true,
      autouv: 0,
      children: ['element-cube-1'],
    },
  ],
  textures: [
    {
      path: '',
      name: 'cube.png',
      folder: '',
      namespace: '',
      id: '0',
      particle: false,
      render_mode: 'default',
      visible: true,
      mode: 'bitmap',
      saved: false,
      uuid: 'texture-1',
      source: checkerDataUrl(16, 16, 4, [200, 120, 40, 255], [90, 60, 30, 255]),
    },
  ],
};

const animatedBot = {
  meta: { format_version: '4.9', model_format: 'bedrock', box_uv: false },
  name: 'animated_bot',
  model_identifier: 'animated_bot',
  visible_box: [2, 2, 0],
  resolution: { width: 32, height: 32 },
  elements: [
    {
      name: 'head_cube',
      type: 'cube',
      uuid: 'el-head-cube',
      box_uv: false,
      from: [-3, 10, -3],
      to: [3, 16, 3],
      origin: [0, 10, 0],
      faces: {
        north: { uv: [0, 0, 6, 6], texture: 0 },
        east: { uv: [0, 6, 6, 12], texture: 0 },
        south: { uv: [0, 6, 6, 12], texture: 0 },
        west: { uv: [0, 6, 6, 12], texture: 0 },
        up: { uv: [6, 0, 12, 6], texture: 0 },
        down: { uv: [12, 0, 18, 6], texture: 0 },
      },
    },
    {
      name: 'body_cube',
      type: 'cube',
      uuid: 'el-body-cube',
      box_uv: false,
      from: [-4, 0, -2],
      to: [4, 10, 2],
      origin: [0, 6, 0],
      rotation: [0, 0, 22.5],
      inflate: 0.25,
      faces: {
        north: { uv: [0, 12, 8, 22], texture: 0 },
        east: { uv: [8, 12, 12, 22], texture: 0 },
        south: { uv: [12, 12, 20, 22], texture: 0 },
        west: { uv: [20, 12, 24, 22], texture: 0 },
        up: { uv: [8, 22, 16, 26], texture: 0 },
        down: { uv: [16, 22, 24, 26], texture: null },
      },
    },
    {
      name: 'lead',
      type: 'locator',
      uuid: 'el-locator-lead',
      position: [1.5, 12, -2],
      rotation: [0, 0, 0],
    },
    {
      name: 'ik_target',
      type: 'null_object',
      uuid: 'el-null-ik',
      position: [0, 0, 4],
    },
    {
      name: 'decor_mesh',
      type: 'mesh',
      uuid: 'el-mesh-1',
      origin: [0, 16, 0],
      vertices: {
        a: [0, 0, 0],
        b: [2, 0, 0],
        c: [2, 2, 0],
      },
      faces: {
        f1: { vertices: ['a', 'b', 'c'], uv: { a: [0, 0], b: [1, 0], c: [1, 1] }, texture: 0 },
      },
    },
  ],
  outliner: [
    {
      name: 'body',
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      uuid: 'g-body',
      export: true,
      isOpen: true,
      children: [
        'el-body-cube',
        'el-locator-lead',
        'el-null-ik',
        'el-mesh-1',
        {
          name: 'head',
          origin: [0, 10, 0],
          rotation: [0, 0, 0],
          uuid: 'g-head',
          export: true,
          isOpen: true,
          children: ['el-head-cube'],
        },
      ],
    },
  ],
  textures: [
    {
      name: 'bot.png',
      id: '0',
      particle: false,
      render_mode: 'default',
      mode: 'bitmap',
      uuid: 'tex-bot',
      source: checkerDataUrl(32, 32, 8, [90, 200, 190, 255], [30, 70, 90, 255]),
    },
    {
      name: 'flip',
      id: '1',
      particle: true,
      render_mode: 'default',
      mode: 'bitmap',
      uuid: 'tex-flip',
      frame_time: 2,
      frame_interpolate: true,
      source: checkerDataUrl(16, 32, 8, [240, 240, 240, 255], [40, 40, 40, 255]),
    },
  ],
  animations: [
    {
      uuid: 'anim-idle',
      name: 'animation.bot.idle',
      loop: 'loop',
      override: false,
      length: 1,
      snapping: 24,
      animators: {
        'g-head': {
          name: 'head',
          type: 'bone',
          keyframes: [
            {
              channel: 'rotation',
              data_points: [{ x: '0', y: '0', z: '0' }],
              uuid: 'kf-1',
              time: 0,
              interpolation: 'catmullrom',
            },
            {
              channel: 'rotation',
              data_points: [{ x: '0', y: '10', z: '0' }],
              uuid: 'kf-2',
              time: 0.5,
              interpolation: 'catmullrom',
            },
            {
              channel: 'rotation',
              data_points: [{ x: '5', y: '0', z: '0' }],
              uuid: 'kf-3',
              time: 1,
              interpolation: 'linear',
            },
            {
              channel: 'position',
              data_points: [{ x: 'math.sin(query.anim_time * 90)', y: '1', z: '0' }],
              uuid: 'kf-4',
              time: 0,
              interpolation: 'linear',
            },
            {
              channel: 'scale',
              data_points: [{ x: '1.2', y: '1.2', z: '1.2' }],
              uuid: 'kf-5',
              time: 0,
              interpolation: 'linear',
              uniform: true,
            },
          ],
        },
        'g-body': {
          name: 'body',
          type: 'bone',
          keyframes: [
            {
              channel: 'position',
              data_points: [{ x: '0', y: '0', z: '0' }],
              uuid: 'kf-6',
              time: 0,
              interpolation: 'step',
            },
            {
              channel: 'position',
              data_points: [{ x: '0', y: '2', z: '0' }],
              uuid: 'kf-7',
              time: 0.5,
              interpolation: 'linear',
            },
          ],
        },
      },
    },
    {
      uuid: 'anim-wave',
      name: 'animation.bot.wave',
      loop: 'hold',
      override: true,
      length: 2,
      snapping: 24,
      anim_time_update: 'query.anim_time + query.delta_time',
      animators: {
        effects: {
          name: 'Effects',
          type: 'effect',
          keyframes: [
            {
              channel: 'sound',
              data_points: [{ effect: 'mob.bot.hi' }],
              uuid: 'kf-8',
              time: 0.25,
            },
            {
              channel: 'particle',
              data_points: [{ effect: 'sparkle', locator: 'lead', script: 'v.x = 1' }],
              uuid: 'kf-9',
              time: 0.5,
            },
            {
              channel: 'timeline',
              data_points: [{ script: 'v.x = 1;\n/say hi\nquery.foo' }],
              uuid: 'kf-10',
              time: 1,
            },
          ],
        },
      },
    },
  ],
  animation_controllers: [
    {
      uuid: 'ctrl-1',
      name: 'controller.animation.bot',
      initial_state: 'state-default',
      states: [
        {
          uuid: 'state-default',
          name: 'default',
          animations: [{ uuid: 'sa-1', key: 'animation.bot.idle', blend_value: '' }],
          transitions: [{ uuid: 'tr-1', target: 'state-active', condition: 'q.is_moving' }],
        },
        {
          uuid: 'state-active',
          name: 'active',
          animations: [{ uuid: 'sa-2', key: 'animation.bot.wave', blend_value: '0.5' }],
          transitions: [{ uuid: 'tr-2', target: 'state-default', condition: '!q.is_moving' }],
          on_entry: 'v.t = 0',
          blend_transition: 0.2,
          blend_via_shortest_path: true,
        },
      ],
    },
  ],
  display: {
    thirdperson_righthand: {
      rotation: [10, 0, 0],
      translation: [0, 2.5, 0],
      scale: [0.375, 0.375, 0.375],
    },
  },
};

const legacyBox = {
  meta: { format_version: '3.6', box_uv: true, bone_rig: true },
  name: 'legacy_box',
  geometry_name: 'legacy_box',
  resolution: { width: 16, height: 16 },
  elements: [
    {
      name: 'old_cube',
      uuid: 'legacy-cube-1',
      from: [0, 0, 0],
      to: [4, 4, 4],
      origin: [0, 0, 0],
      uv_offset: [0, 0],
      shade: false,
    },
  ],
  outliner: [
    {
      name: 'root_bone',
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      uuid: 'legacy-group-1',
      export: true,
      children: ['legacy-cube-1'],
    },
  ],
  textures: [],
};

const groupsV5 = {
  meta: { format_version: '5.0', model_format: 'bedrock', box_uv: false },
  name: 'groups_v5',
  model_identifier: 'groups_v5',
  resolution: { width: 16, height: 16 },
  elements: [
    {
      name: 'leaf_cube',
      type: 'cube',
      uuid: 'v5-cube-1',
      box_uv: false,
      from: [-1, 0, -1],
      to: [1, 2, 1],
      origin: [0, 0, 0],
      faces: {
        north: { uv: [0, 0, 2, 2], texture: 0 },
        east: { uv: [0, 0, 2, 2], texture: 0 },
        south: { uv: [0, 0, 2, 2], texture: 0 },
        west: { uv: [0, 0, 2, 2], texture: 0 },
        up: { uv: [0, 0, 2, 2], texture: 0 },
        down: { uv: [0, 0, 2, 2], texture: 0 },
      },
    },
  ],
  groups: [
    { uuid: 'v5-root', name: 'root', origin: [0, 0, 0], rotation: [0, 0, 0], export: true, isOpen: true },
    { uuid: 'v5-child', name: 'child', origin: [0, 4, 0], rotation: [10, 0, 0], export: true, isOpen: true },
  ],
  outliner: [
    {
      uuid: 'v5-root',
      isOpen: true,
      children: [{ uuid: 'v5-child', isOpen: true, children: ['v5-cube-1'] }],
    },
  ],
  textures: [
    {
      name: 'tiny.png',
      id: '0',
      mode: 'bitmap',
      uuid: 'v5-tex',
      source: checkerDataUrl(16, 16, 2, [120, 120, 220, 255], [40, 40, 90, 255]),
    },
  ],
};

function writeJson(name, value) {
  const target = path.join(OUT_DIR, name);
  fs.writeFileSync(target, JSON.stringify(value, null, '\t') + '\n');
  console.log(`Wrote ${target}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeJson('simple_cube.bbmodel', simpleCube);
writeJson('animated_bot.bbmodel', animatedBot);
writeJson('legacy_box.bbmodel', legacyBox);
writeJson('groups_v5.bbmodel', groupsV5);

fs.writeFileSync(path.join(OUT_DIR, 'broken.bbmodel'), '{ "meta": { "format_version": "4.5" ');
fs.writeFileSync(path.join(OUT_DIR, 'not_a_model.bbmodel'), JSON.stringify({ hello: 'world' }));
console.log('Wrote broken.bbmodel, not_a_model.bbmodel');
