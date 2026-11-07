import { BBox, CameraAngles, CameraDirection, FitOptions, Vec3 } from './types';
import type { FittedCamera } from './types';

export type { FittedCamera };

const ISO: Vec3 = [1, 1, 1];
const PRESETS: Record<string, Vec3> = {
	iso: ISO,
	front: [0, 0, 1],
	back: [0, 0, -1],
	left: [-1, 0, 0],
	right: [1, 0, 0],
	top: [0, 1, 0],
	bottom: [0, -1, 0],
};

const DEFAULT_PADDING = 1.15;
const MIN_DEPTH = 10;

function normalize(v: Vec3): Vec3 {
	const len = Math.hypot(v[0], v[1], v[2]);
	if (len === 0 || !Number.isFinite(len)) throw new Error('Direction vector must be non-zero and finite');
	return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vec3, s: number): Vec3 {
	return [a[0] * s, a[1] * s, a[2] * s];
}

const BOX_CORNERS: [number, number, number][] = [
	[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
	[1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

/**
 * Fit an orthographic camera so the given bounding box is fully visible with padding,
 * regardless of rotation. Pure math, no THREE.js dependency, fully unit-testable.
 *
 * Extents are computed by projecting the 8 box corners onto the camera's right/up axes,
 * so rotated boxes are covered automatically.
 */
export function fitBoxToCamera(box: BBox, options: FitOptions = {}): FittedCamera {
	const desired: Vec3 = resolveDirection(options.direction ?? 'iso');
	const dir = normalize(desired);
	const padding = options.padding ?? DEFAULT_PADDING;
	const aspect = options.aspect ?? 1;

	if (!Number.isFinite(padding) || padding <= 0) throw new Error('padding must be a positive finite number');
	if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('aspect must be a positive finite number');
	validateBox(box);

	// Camera basis: dir points from target towards the camera.
	const worldUp: Vec3 = Math.abs(dir[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
	const right = normalize(cross(worldUp, dir));
	const up = normalize(cross(dir, right));

	const center: Vec3 = [
		(box.min[0] + box.max[0]) / 2,
		(box.min[1] + box.max[1]) / 2,
		(box.min[2] + box.max[2]) / 2,
	];

	// Project corners onto right/up/dir to get extents, including rotation of the box itself.
	let rightExtent = 0;
	let upExtent = 0;
	let dirExtent = 0;
	for (const corner of BOX_CORNERS) {
		const p: Vec3 = [
			(corner[0] ? box.max[0] : box.min[0]) - center[0],
			(corner[1] ? box.max[1] : box.min[1]) - center[1],
			(corner[2] ? box.max[2] : box.min[2]) - center[2],
		];
		rightExtent = Math.max(rightExtent, Math.abs(dot(p, right)));
		upExtent = Math.max(upExtent, Math.abs(dot(p, up)));
		dirExtent = Math.max(dirExtent, Math.abs(dot(p, dir)));
	}
	rightExtent *= padding;
	upExtent *= padding;

	// Expand both axes to satisfy the requested aspect ratio (cover, never crop).
	const halfHeight = Math.max(upExtent, rightExtent / aspect);
	const halfWidth = halfHeight * aspect;

	// Camera distance: far enough that near stays positive for the rotated extent along dir.
	const distance = dirExtent * 2 + MIN_DEPTH;
	const position = add(center, scale(dir, distance));
	const near = distance - dirExtent - 0.5;
	const far = distance + dirExtent + 0.5;

	return {
		camera: {
			position,
			target: center,
			left: -halfWidth,
			right: halfWidth,
			top: halfHeight,
			bottom: -halfHeight,
			near,
			far,
		},
		box,
		direction: dir,
		halfWidth,
		halfHeight,
	};
}

function resolveDirection(direction: CameraDirection): Vec3 {
	if (typeof direction === 'string') {
		const preset = PRESETS[direction];
		if (!preset) throw new Error(`Unknown camera direction preset: ${direction}`);
		return preset;
	}
	if (typeof direction === 'object' && direction !== null && !Array.isArray(direction)) {
		return cameraAnglesToDirection(direction);
	}
	return normalize(direction as Vec3);
}

/** Convert orbit angles (degrees, CameraAngles convention) to a direction unit vector. */
export function cameraAnglesToDirection(angles: CameraAngles): Vec3 {
	const yaw = toFinite(angles.yaw ?? 0, 'yaw');
	const elevation = toFinite(angles.elevation ?? 0, 'elevation');
	if (elevation <= -90 || elevation >= 90) {
		throw new Error('elevation must be strictly between -90 and 90 degrees');
	}
	const yawRad = (yaw * Math.PI) / 180;
	const elRad = (elevation * Math.PI) / 180;
	return [
		Math.cos(elRad) * Math.sin(yawRad),
		Math.sin(elRad),
		Math.cos(elRad) * Math.cos(yawRad),
	];
}

function toFinite(value: number, name: string): number {
	if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
	return value;
}

export function validateBox(box: BBox): void {
	for (const key of ['min', 'max'] as const) {
		const v = box[key];
		if (!Array.isArray(v) || v.length !== 3 || v.some(x => !Number.isFinite(x))) {
			throw new Error(`box.${key} must be a finite [x, y, z] triple`);
		}
	}
	if (box.min[0] > box.max[0] || box.min[1] > box.max[1] || box.min[2] > box.max[2]) {
		throw new Error('box.min must be <= box.max on every axis');
	}
	const spanX = box.max[0] - box.min[0];
	const spanY = box.max[1] - box.min[1];
	const spanZ = box.max[2] - box.min[2];
	if (spanX === 0 && spanY === 0 && spanZ === 0) {
		throw new Error('box is a single point (empty model geometry?)');
	}
}

/**
 * Compute the padding increase needed so an observed margin deficit is fixed.
 * `observedMargin` in pixels, `targetMargin` the desired minimum, `imageSize` the relevant image dimension.
 */
export function paddingIncreaseForMargins(
	observedMargin: number,
	targetMargin: number,
	imageSize: number
): number {
	if (!Number.isFinite(observedMargin) || observedMargin < 0) throw new Error('observedMargin must be non-negative');
	if (!Number.isFinite(targetMargin) || targetMargin < 0) throw new Error('targetMargin must be non-negative');
	if (!Number.isFinite(imageSize) || imageSize <= 0) throw new Error('imageSize must be positive');
	if (observedMargin >= targetMargin) return 1;
	if (observedMargin === 0) return 1.5; // can't scale proportionally from zero; step up modestly
	const halfExtent = imageSize / 2 - observedMargin;
	return Math.min(2, Math.max(1.05, (halfExtent + targetMargin) / halfExtent));
}
