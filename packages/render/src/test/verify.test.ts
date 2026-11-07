import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { verifyImage, classify } from '../verify';

const W = 64;
const H = 64;

function blank(withBackground = true): Uint8Array {
	const data = new Uint8Array(W * H * 4);
	if (withBackground) {
		for (let i = 0; i < W * H; i++) {
			data[i * 4 + 3] = 255;
			data[i * 4] = 30; data[i * 4 + 1] = 34; data[i * 4 + 2] = 47;
		}
	}
	return data;
}

test('detects empty transparent render', () => {
	const v = verifyImage(W, H, blank(false));
	assert.strictEqual(v.hasInk, false);
	assert.strictEqual(classify(v, 16), 'empty');
});

test('detects ink in the center, correct margins and ink box', () => {
	const data = blank(false);
	for (let y = 20; y < 44; y++) {
		for (let x = 28; x < 36; x++) {
			const i = (y * W + x) * 4 + 3;
			data[i] = 255;
		}
	}
	const data2 = blank(false);
	for (let y = 20; y < 44; y++) for (let x = 28; x < 36; x++) data2[(y * W + x) * 4 + 3] = 255;
	const v = verifyImage(W, H, data2);
	assert.strictEqual(v.hasInk, true);
	assert.deepEqual(v.inkBox, { x: 28, y: 20, width: 8, height: 24 });
	assert.equal(v.margins.left, 28);
	assert.equal(v.margins.right, 63 - 35);
	assert.equal(v.margins.top, 20);
	assert.equal(v.margins.bottom, 63 - 43);
	assert.strictEqual(classify(v, 16), 'ok');
});

test('classify: clipped when ink touches the edge', () => {
	const data = blank(false);
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[(y * W + x) * 4 + 3] = 255;
	const v = verifyImage(W, H, data);
	assert.strictEqual(classify(v, 16), 'clipped');
});

test('classify: tight when margin below threshold', () => {
	const data = blank(false);
	// ink starting at x=8, y=8: smaller than minMargin 16
	for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) data[(y * W + x) * 4 + 3] = 255;
	const v = verifyImage(W, H, data);
	assert.strictEqual(classify(v, 16), 'tight');
	assert.strictEqual(classify(v, 4), 'ok');
});

test('transparent-ish pixels below alphaThreshold are background', () => {
	const data = blank(false);
	for (let i = 0; i < W * H; i++) data[i * 4 + 3] = 5; // nearly transparent noise
	const v = verifyImage(W, H, data, { alphaThreshold: 8 });
	assert.strictEqual(v.hasInk, false);
});

test('backgroundColor treated as no ink for opaque renders', () => {
	const data = new Uint8Array(W * H * 4);
	for (let i = 0; i < W * H; i++) {
		data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; // white everywhere
	}
	const noBg = verifyImage(W, H, data);
	assert.strictEqual(noBg.hasInk, true, 'white without matching bg is ink');
	// Give alphaThreshold epsilon: alpha exactly 255 matches bg -> background
	const withBg = verifyImage(W, H, data, { backgroundColor: [255, 255, 255] });
	assert.strictEqual(withBg.hasInk, false);
});

test('coverage is the fraction of ink pixels', () => {
	const data = blank(false);
	// half the image
	for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) data[(y * W + x) * 4 + 3] = 255;
	const v = verifyImage(W, H, data);
	assert.ok(Math.abs(v.coverage - 0.5) < 0.001);
});

test('input validation throws', () => {
	assert.throws(() => verifyImage(0, 10, new Uint8Array(0)));
	assert.throws(() => verifyImage(10, 10, new Uint8Array(100)));
});
