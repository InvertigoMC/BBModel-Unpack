/**
 * Small numeric / Molang helpers mirroring the behavior of Blockbench's own
 * export utilities (`js/util/util.js`, `js/util/molang.ts`,
 * `js/util/math_util.js`), so converted output matches what Blockbench itself
 * would write.
 */

import { Vec3 } from './types';

/** Matches Blockbench's `isStringNumber` (allows a trailing `f`). */
const STRING_NUM_REGEX = /^-?\d+(\.\d+f?)?$/;

export function isStringNumber(value: string): boolean {
  return STRING_NUM_REGEX.test(value);
}

/** Round to `decimals` places and normalize `-0` to `0`. */
export function cleanNumber(n: number, decimals = 6): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  const r = Math.round(n * factor) / factor;
  return Object.is(r, -0) ? 0 : r;
}

/** Coerce an arbitrary JSON value to a finite number, with fallback. */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Coerce an arbitrary JSON value to a Vec3, padding/truncating as needed. */
export function toVec3(value: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (Array.isArray(value)) {
    return [
      toNumber(value[0], fallback[0]),
      toNumber(value[1], fallback[1]),
      toNumber(value[2], fallback[2]),
    ];
  }
  return [...fallback];
}

export function vecAllEqual(vec: Vec3, n: number): boolean {
  return vec[0] === n && vec[1] === n && vec[2] === n;
}

/**
 * Blockbench's `trimFloatNumber`: fixed to `maxDigits` decimals, trailing
 * zeros stripped, `-0` normalized.
 */
export function trimFloat(value: number, maxDigits = 4): string {
  let s = value.toFixed(maxDigits);
  if (s.includes('.')) s = s.replace(/0+$/g, '').replace(/\.$/g, '');
  return s === '-0' ? '0' : s;
}

/**
 * Blockbench's `exportMolang` (js/util/util.js): numbers pass through,
 * numeric strings become numbers, other strings have newlines stripped,
 * anything falsy becomes 0.
 */
export function exportMolang(input: unknown): number | string {
  if (!input) return 0;
  if (typeof input === 'string') {
    if (!Number.isNaN(Number(input))) {
      const n = Number.parseFloat(input);
      return Number.isNaN(n) ? 0 : n;
    }
    return input.replace(/\n/g, '');
  }
  if (typeof input === 'number') return input;
  return 0;
}

/**
 * Negate a keyframe value the way Blockbench's `invertMolang` does for
 * numbers and numeric strings. For genuine Molang expressions Blockbench
 * rewrites the expression term by term; we instead wrap it as `-(expr)`,
 * which is semantically equivalent Molang but textually different — callers
 * should surface a "lossy formatting" note when that path is taken.
 */
export function invertMolangValue(value: number | string): {
  value: number | string;
  approximated: boolean;
} {
  if (typeof value === 'number') return { value: -value === 0 ? 0 : -value, approximated: false };
  if (value === '' || value === '0') return { value, approximated: false };
  if (isStringNumber(value)) {
    return { value: (-Number.parseFloat(value)).toString(), approximated: false };
  }
  return { value: `-(${value})`, approximated: true };
}

/**
 * Compare two dotted version strings ("4.5" vs "4.10") numerically.
 * Returns -1, 0, or 1. Unparseable segments are treated as 0.
 */
export function compareVersions(a: string, b: string): number {
  const as = a.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const bs = b.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/**
 * Format a keyframe time the way Blockbench does: snap to the animation's
 * snapping grid (clamped to 1–120 fps, default 24), trim to 4 decimals, and
 * always include a decimal part ("1" → "1.0").
 */
export function timecodeString(time: number, snapping: number | undefined): string {
  const fps = Math.min(Math.max(toNumber(snapping, 24) || 24, 1), 120);
  const snapped = Math.max(Math.round(time * fps) / fps, 0);
  let code = trimFloat(snapped, 4);
  if (!code.includes('.')) code += '.0';
  return code;
}
