import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { decodePNG, encodePNG } from '../png';

test('encodePNG -> decodePNG round trip preserves RGBA pixels', () => {
	const W = 23, H = 11;
	const data = new Uint8Array(W * H * 4);
	// L-shaped ink pattern to exercise multiple filter-equivalent rows
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = (y * W + x) * 4;
			if (x < 5 || y < 3) {
				data[i] = (x * 7) % 256; data[i + 1] = (y * 11) % 256; data[i + 2] = 42; data[i + 3] = 255;
			}
		}
	}
	const png = encodePNG(W, H, data);
	const decoded = decodePNG(png);
	assert.strictEqual(decoded.width, W);
	assert.strictEqual(decoded.height, H);
	assert.deepEqual(decoded.data, data);
});

test('decodePNG rejects non-PNG input', () => {
	assert.throws(() => decodePNG(Buffer.from('not a png')), /Not a PNG/);
});

test('decodePNG rejects unsupported bit depths / color types / interlace', () => {
	const png16 = encodePNG(2, 2, new Uint8Array(16));
	// flip bit depth byte in IHDR to 16
	png16[24] = 16;
	assert.throws(() => decodePNG(png16), /bit depth/);
	const pngPal = encodePNG(2, 2, new Uint8Array(16));
	pngPal[25] = 3;
	assert.throws(() => decodePNG(pngPal), /color type/);
	const pngInter = encodePNG(2, 2, new Uint8Array(16));
	pngInter[28] = 1;
	assert.throws(() => decodePNG(pngInter), /Interlaced/);
});
