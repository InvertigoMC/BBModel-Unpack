import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { cameraAnglesToDirection, fitBoxToCamera, paddingIncreaseForMargins, FittedCamera } from '../framing';

function box(min: [number, number, number], max: [number, number, number]) {
	return { min, max };
}

function close(actual: readonly number[], expected: readonly number[], tolerance: number, msg?: string) {
	for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
		closeTo(actual[i] ?? NaN, expected[i] ?? NaN, tolerance, msg ?? `index ${i}`);
	}
}
function closeTo(actual: number, expected: number, tolerance: number, msg?: string) {
	assert.ok(Math.abs(actual - expected) <= tolerance, `${msg ?? 'value'}: ${actual} vs ${expected} (+/- ${tolerance})`);
}

function corners(b: { min: [number, number, number]; max: [number, number, number] }): [number, number, number][] {
	return [
		b.min,
		[b.max[0], b.min[1], b.min[2]],
		[b.min[0], b.max[1], b.min[2]],
		[b.min[0], b.min[1], b.max[2]],
		[b.max[0], b.max[1], b.min[2]],
		[b.max[0], b.min[1], b.max[2]],
		[b.min[0], b.max[1], b.max[2]],
		b.max,
	];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a: readonly number[], b: readonly number[]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(a: readonly number[]): [number, number, number] {
	const l = Math.hypot(a[0], a[1], a[2]);
	return [a[0] / l, a[1] / l, a[2] / l];
}
function sub(a: readonly number[], b: readonly number[]): [number, number, number] {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Reconstruct the camera basis vectors the same way framing.ts does. */
function basisOf(fit: FittedCamera): { right: [number, number, number]; up: [number, number, number] } {
	const dir = fit.direction;
	const worldUp: [number, number, number] = Math.abs(dir[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
	const right = norm(cross(worldUp, dir));
	const up = cross(dir, right);
	return { right, up };
}

test('iso direction resolves to a normalized diagonal looking at the box center', () => {
	const fit = fitBoxToCamera(box([-5, -1, -3], [5, 18, 4]));
	const { camera, direction } = fit;
	closeTo(dot3(direction, direction), 1, 1e-9, 'direction normalized');
	// camera looks from a positive x/y/z octant (iso)
	assert.ok(camera.position[0] > camera.target[0]);
	assert.ok(camera.position[1] > camera.target[1]);
	assert.ok(camera.position[2] > camera.target[2]);
});

test('all 8 corners of a bbox project inside the camera ortho rect (iso)', () => {
	const b = box([-5, -1, -3], [5, 18, 4]);
	const fit = fitBoxToCamera(b, { aspect: 1 });
	const { right, up } = basisOf(fit);
	const { camera } = fit;
	for (const c of corners(b)) {
		const p = sub(c, camera.target);
		const dr = dot3(p, right);
		const du = dot3(p, up);
		assert.ok(dr >= camera.left - 1e-9 && dr <= camera.right + 1e-9, `corner right extent ${dr}`);
		assert.ok(du >= camera.bottom - 1e-9 && du <= camera.top + 1e-9, `corner up extent ${du}`);
	}
});

test('wide flat box still fits (rotated projection covered)', () => {
	const b = box([-16, 0, -16], [16, 2, 16]);
	const fit = fitBoxToCamera(b, { aspect: 1 });
	const { right, up } = basisOf(fit);
	for (const c of corners(b)) {
		const p = sub(c, fit.camera.target);
		const dr = dot3(p, right);
		const du = dot3(p, up);
		assert.ok(dr >= fit.camera.left - 1e-9 && dr <= fit.camera.right + 1e-9, `right extent ${dr} vs [${fit.camera.left}, ${fit.camera.right}]`);
		assert.ok(du >= fit.camera.bottom - 1e-9 && du <= fit.camera.top + 1e-9, `up extent ${du} vs [${fit.camera.bottom}, ${fit.camera.top}]`);
	}
});

test('padding expands the ortho rect proportionally', () => {
	const b = box([-5, -1, -3], [5, 18, 4]);
	const tight = fitBoxToCamera(b, { padding: 1, aspect: 1 });
	const padded = fitBoxToCamera(b, { padding: 1.3, aspect: 1 });
	assert.ok(padded.halfHeight > tight.halfHeight);
	closeTo(padded.halfHeight / tight.halfHeight, 1.3, 0.001);
});

test('aspect 2 (wide) expands horizontally, not vertically', () => {
	const b = box([-5, -1, -3], [5, 18, 4]);
	const sq = fitBoxToCamera(b, { padding: 1, aspect: 1 });
	const wide = fitBoxToCamera(b, { padding: 1, aspect: 2 });
	closeTo(wide.halfHeight, sq.halfHeight, 1e-6);
	closeTo(wide.halfWidth, sq.halfHeight * 2, 1e-6);
});

test('direction presets move the camera to plausible octants', () => {
	const b = box([-5, -1, -3], [5, 18, 4]);
	const front = fitBoxToCamera(b, { direction: 'front' });
	assert.ok(front.camera.position[2] > front.camera.target[2]);
	assert.strictEqual(front.camera.position[0], front.camera.target[0]);
	const top = fitBoxToCamera(b, { direction: 'top' });
	assert.ok(top.camera.position[1] > top.camera.target[1]);
});

test('explicit direction vector is used normalized', () => {
	const b = box([0, 0, 0], [10, 10, 10]);
	const fit = fitBoxToCamera(b, { direction: [2, 0, 0] });
	assert.ok(fit.camera.position[0] > 0);
	assert.strictEqual(fit.camera.position[1], 5);
	assert.strictEqual(fit.camera.position[2], 5);
});

test('near/far fully contain the box along the view axis', () => {
	const b = box([-5, -1, -3], [5, 18, 4]);
	const fit = fitBoxToCamera(b);
	const dir = fit.direction;
	for (const c of corners(b)) {
		// signed distance along dir from camera position toward target
		const p = sub(c, fit.camera.position);
		// projection onto the direction pointing away from the camera (towards target) is
		// negative of dot(p, dir); flip sign so "depth into the scene" is positive.
		const depth = -dot3(p, dir);
		assert.ok(depth >= fit.camera.near - 1e-9, `corner depth ${depth} near ${fit.camera.near}`);
		assert.ok(depth <= fit.camera.far + 1e-9, `corner depth ${depth} far ${fit.camera.far}`);
	}
});

test('invalid input throws', () => {
	assert.throws(() => fitBoxToCamera(box([5, 0, 0], [-5, 1, 1])));
	assert.throws(() => fitBoxToCamera({ min: [0, 0, 0], max: [0, 0, 0] }));
	assert.throws(() => fitBoxToCamera(box([0, 0, 0], [1, 1, 1]), { padding: 0 }));
	assert.throws(() => fitBoxToCamera(box([0, 0, 0], [1, 1, 1]), { aspect: -1 }));
	assert.throws(() => fitBoxToCamera(box([0, 0, 0], [1, 1, 1]), { direction: 'diagonal' as never }));
	// NaN in box
	assert.throws(() => fitBoxToCamera({ min: [0, 0, NaN], max: [1, 1, 1] }));
});

test('cameraAnglesToDirection: conventions match presets', () => {
	const d = (yaw: number, elevation: number) => cameraAnglesToDirection({ yaw, elevation });
	const close = (a: readonly number[], b: readonly number[], eps = 1e-9) => {
		assert.ok(Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
	};
	close(d(0, 0), [0, 0, 1]);
	close(d(90, 0), [1, 0, 0]);
	close(d(180, 0), [0, 0, -1]);
	close(d(-90, 0), [-1, 0, 0]);
	close(cameraAnglesToDirection({ yaw: 45, elevation: Math.atan(1 / Math.sqrt(2)) * 180 / Math.PI }), [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], 1e-9);
	// arbitrary orbit angle is normalized
	const v = d(123, 37);
	closeTo(v[0] * v[0] + v[1] * v[1] + v[2] * v[2], 1, 1e-12);
});

test('fitBoxToCamera accepts orbit angles (object direction)', () => {
	const b = box([-5, -1, -3], [5, 18, 4]);
	const front = fitBoxToCamera(b, { direction: 'front' });
	const byAngles = fitBoxToCamera(b, { direction: { yaw: 0, elevation: 0 } });
	close(byAngles.camera.position, front.camera.position, 1e-9);
	// yaw rotation moves the camera around the Y axis
	const yawed = fitBoxToCamera(b, { direction: { yaw: 90, elevation: 0 } });
	assert.ok(yawed.camera.position[0] > yawed.camera.target[0]);
	closeTo(yawed.camera.position[2], yawed.camera.target[2], 1e-9);
	// top view via elevation is equivalent to the 'top' preset
	const top = fitBoxToCamera(b, { direction: 'top' });
	const elTop = fitBoxToCamera(b, { direction: { elevation: 89 } });
	assert.ok(elTop.camera.position[1] > elTop.camera.target[1]);
	assert.ok(top.camera.position[1] > top.camera.target[1]);
});

test('cameraAnglesToDirection rejects invalid input', () => {
	assert.throws(() => cameraAnglesToDirection({ yaw: NaN }));
	assert.throws(() => cameraAnglesToDirection({ elevation: 90 }));
	assert.throws(() => cameraAnglesToDirection({ elevation: 91.5 }));
});

test('paddingIncreaseForMargins scales proportionally and is capped', () => {
	assert.strictEqual(paddingIncreaseForMargins(100, 50, 512), 1);
	assert.ok(paddingIncreaseForMargins(10, 50, 512) > 1.1);
	assert.ok(paddingIncreaseForMargins(0, 50, 512) > 1.2);
	assert.ok(paddingIncreaseForMargins(10, 50, 512) <= 2);
	assert.ok(paddingIncreaseForMargins(1, 100, 64) <= 2);
});
