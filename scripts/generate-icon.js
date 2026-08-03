/**
 * Generates media/icon.png (256x256) — the Marketplace icon — from the same
 * geometry as media/icon.svg, using only built-in Node modules.
 *
 * Design: an amber isometric cube lifting out of an open slate crate, on a
 * dark rounded tile. Original artwork; intentionally avoids the Blockbench,
 * Minecraft, Mojang, Microsoft and VS Code marks.
 *
 * Usage: node scripts/generate-icon.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Canvas } = require('./lib/png');

const SIZE = 256;

// Palette (original, brand-neutral)
const BG = [0x13, 0x1a, 0x22, 255]; // dark slate tile
const CUBE_TOP = [0xff, 0xc9, 0x4a, 255]; // amber
const CUBE_LEFT = [0xe0, 0x9f, 0x2d, 255];
const CUBE_RIGHT = [0xb9, 0x7b, 0x1d, 255];
const CRATE_BACK_L = [0x2a, 0x36, 0x48, 255];
const CRATE_BACK_R = [0x23, 0x2d, 0x3c, 255];
const CRATE_INNER = [0x0c, 0x10, 0x16, 255];
const CRATE_FRONT_L = [0x3d, 0x4e, 0x64, 255];
const CRATE_FRONT_R = [0x33, 0x41, 0x54, 255];
const CRATE_RIM = [0x55, 0x6b, 0x88, 255];
const DASH = [0x7f, 0xd1, 0xb9, 255]; // mint motion dashes

/** Isometric diamond helpers: half-width w, half-height h around (cx, cy). */
const top = (cx, cy, w, h) => [
  [cx, cy - h],
  [cx + w, cy],
  [cx, cy + h],
  [cx - w, cy],
];
const leftFace = (cx, cy, w, h, d) => [
  [cx - w, cy],
  [cx, cy + h],
  [cx, cy + h + d],
  [cx - w, cy + d],
];
const rightFace = (cx, cy, w, h, d) => [
  [cx + w, cy],
  [cx, cy + h],
  [cx, cy + h + d],
  [cx + w, cy + d],
];

function draw() {
  const c = new Canvas(SIZE, SIZE);
  c.fillRoundedBackground(44, BG);

  // --- Open crate, back half (drawn before the cube so the cube sits inside)
  const crate = { cx: 128, cy: 158, w: 78, h: 39, d: 42 };
  // Back walls: the two upper edges of the rim diamond, extruded down.
  c.fillPoly(
    [
      [crate.cx - crate.w, crate.cy],
      [crate.cx, crate.cy - crate.h],
      [crate.cx, crate.cy - crate.h + crate.d],
      [crate.cx - crate.w, crate.cy + crate.d],
    ],
    CRATE_BACK_L
  );
  c.fillPoly(
    [
      [crate.cx, crate.cy - crate.h],
      [crate.cx + crate.w, crate.cy],
      [crate.cx + crate.w, crate.cy + crate.d],
      [crate.cx, crate.cy - crate.h + crate.d],
    ],
    CRATE_BACK_R
  );
  // Crate interior (visible around the cube).
  c.fillPoly(top(crate.cx, crate.cy, crate.w, crate.h), CRATE_INNER);

  // --- Cube, lifted out of the crate
  const cube = { cx: 128, cy: 92, w: 50, h: 25, d: 50 };
  c.fillPoly(top(cube.cx, cube.cy, cube.w, cube.h), CUBE_TOP);
  c.fillPoly(leftFace(cube.cx, cube.cy, cube.w, cube.h, cube.d), CUBE_LEFT);
  c.fillPoly(rightFace(cube.cx, cube.cy, cube.w, cube.h, cube.d), CUBE_RIGHT);

  // --- Crate front walls (overlap the cube's lower half → "inside the box")
  c.fillPoly(
    [
      [crate.cx - crate.w, crate.cy],
      [crate.cx, crate.cy + crate.h],
      [crate.cx, crate.cy + crate.h + crate.d],
      [crate.cx - crate.w, crate.cy + crate.d],
    ],
    CRATE_FRONT_L
  );
  c.fillPoly(
    [
      [crate.cx, crate.cy + crate.h],
      [crate.cx + crate.w, crate.cy],
      [crate.cx + crate.w, crate.cy + crate.d],
      [crate.cx, crate.cy + crate.h + crate.d],
    ],
    CRATE_FRONT_R
  );
  // Thin rim highlight along the two front-top edges.
  const rim = 5;
  c.fillPoly(
    [
      [crate.cx - crate.w, crate.cy],
      [crate.cx, crate.cy + crate.h],
      [crate.cx, crate.cy + crate.h + rim],
      [crate.cx - crate.w, crate.cy + rim],
    ],
    CRATE_RIM
  );
  c.fillPoly(
    [
      [crate.cx, crate.cy + crate.h],
      [crate.cx + crate.w, crate.cy],
      [crate.cx + crate.w, crate.cy + rim],
      [crate.cx, crate.cy + crate.h + rim],
    ],
    CRATE_RIM
  );

  // --- Mint motion dashes beside the cube (lift-off)
  c.fillRect(40, 84, 22, 8, DASH);
  c.fillRect(52, 62, 16, 8, DASH);
  c.fillRect(194, 84, 22, 8, DASH);
  c.fillRect(188, 62, 16, 8, DASH);

  return c.toPng();
}

const outPath = path.join(__dirname, '..', 'media', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, draw());
console.log(`Wrote ${outPath}`);
