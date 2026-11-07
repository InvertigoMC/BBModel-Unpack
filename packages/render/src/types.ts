/**
 * Shared types for the automated Blockbench renderer.
 */

export interface Logger {
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
}

export type Vec3 = [number, number, number];

export interface BBox {
	min: Vec3;
	max: Vec3;
}

/** Orthographic camera placement in Blockbench world units. */
export interface CameraSpec {
	position: Vec3;
	target: Vec3;
	left: number;
	right: number;
	top: number;
	bottom: number;
	near: number;
	far: number;
}

export type CameraDirection = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | Vec3 | CameraAngles;

/** Camera direction expressed as orbit angles in degrees.
 *
 * Conventions (Blockbench world: Y up, north = -Z):
 * - yaw: 0 = front (+Z), 90 = right (+X), 180 = back (-Z), -90 = left (-X)
 * - elevation: 0 = level with the model, positive = above (top = +90)
 */
export interface CameraAngles {
	yaw?: number;
	elevation?: number;
}

export interface FitOptions {
	/** Camera direction preset, explicit direction vector, or orbit angles (degrees). */
	direction?: CameraDirection;
	/** Extra margin relative to the model half-extents. Default 1.15. */
	padding?: number;
	/** Width divided by height of the target image. Default 1. */
	aspect?: number;
}

export interface FittedCamera {
	camera: CameraSpec;
	/** The model bounding box the camera was fitted against. */
	box: BBox;
	/** Resolved direction unit vector (from target towards the camera). */
	direction: Vec3;
	halfWidth: number;
	halfHeight: number;
}

export interface Margins {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export interface VerifyOptions {
	/** Alpha values above this count as ink. Default 8 (0-255). */
	alphaThreshold?: number;
	/** When set, pixels matching this opaque background color also count as ink-free (for non-transparent renders). */
	backgroundColor?: Vec3;
	/** Required minimum margin in pixels on every side. Default 16. */
	minMargin?: number;
}

export interface VerifyResult {
	hasInk: boolean;
	inkBox: { x: number; y: number; width: number; height: number };
	margins: Margins;
	coverage: number;
}

export interface RenderRequest {
	/** Raw `.bbmodel` file content (JSON text). */
	content: string;
	/** A display-name for the model, used in logs and temp file names. */
	name?: string;
	/** Camera direction preset. Default 'iso'. */
	direction?: CameraDirection;
	/** Output image width in pixels. Default 512. */
	width?: number;
	height?: number;
	/** Framing padding. Default 1.15. */
	padding?: number;
	/** Render with a transparent background (default true). */
	transparent?: boolean;
}

export interface RenderResult {
	/** PNG image bytes. */
	png: Uint8Array;
	width: number;
	height: number;
	/** The framed bounding box in model units. */
	box: BBox;
	/** The camera used for the final render. */
	camera: CameraSpec;
	/** Ink margins measured on the final image. */
	margins: Margins;
	/** Number of render attempts (1 = framed correctly on first try). */
	attempts: number;
	warnings: string[];
}
