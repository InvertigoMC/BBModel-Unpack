import { VerifyOptions, VerifyResult } from './types';

/**
 * Ink-margin verification for rendered previews.
 * Detects empty renders and clipping (ink too close to the image edge),
 * purely from decoded RGBA pixels — no image metadata needed.
 */

const DEFAULT_ALPHA_THRESHOLD = 8;

export function verifyImage(
	width: number,
	height: number,
	data: Uint8Array,
	options: VerifyOptions = {}
): VerifyResult {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new Error('verifyImage: width and height must be positive');
	}
	if (data.length !== width * height * 4) {
		throw new Error(`verifyImage: data must have ${width * height * 4} RGBA bytes, got ${data.length}`);
	}

	const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
	const bg = options.backgroundColor;

	const isBackground = (i: number): boolean => {
		const a = data[i + 3];
		if (a <= alphaThreshold) return true;
		if (bg && a === 255) {
			return data[i] === bg[0] && data[i + 1] === bg[1] && data[i + 2] === bg[2];
		}
		return false;
	};

	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	let inkCount = 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (!isBackground(i)) {
				inkCount++;
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
		}
	}

	if (inkCount === 0) {
		return {
			hasInk: false,
			inkBox: { x: 0, y: 0, width: 0, height: 0 },
			margins: { left: 0, right: 0, top: 0, bottom: 0 },
			coverage: 0,
		};
	}

	const inkWidth = maxX - minX + 1;
	const inkHeight = maxY - minY + 1;

	return {
		hasInk: true,
		inkBox: { x: minX, y: minY, width: inkWidth, height: inkHeight },
		margins: {
			left: minX,
			top: minY,
			right: width - 1 - maxX,
			bottom: height - 1 - maxY,
		},
		coverage: inkCount / (width * height),
	};
}

export type VerifyOutcome = 'ok' | 'empty' | 'clipped' | 'tight';

/** Classify a verified image against the desired minimum margin. */
export function classify(verify: VerifyResult, minMargin: number): VerifyOutcome {
	if (!verify.hasInk) return 'empty';
	const { margins } = verify;
	const smallest = Math.min(margins.left, margins.right, margins.top, margins.bottom);
	if (smallest <= 0) return 'clipped';
	if (smallest < minMargin) return 'tight';
	return 'ok';
}
