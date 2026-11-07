import * as zlib from 'node:zlib';

/**
 * Minimal PNG decoder for RGBA8 / RGB8 non-interlaced images.
 * Enough to decode screenshots produced by the renderer itself (color types 2 and 6, bit depth 8).
 */

export interface DecodedPNG {
	width: number;
	height: number;
	/** RGBA bytes, row-major, 4 bytes per pixel. */
	data: Uint8Array;
}

interface Chunk {
	type: string;
	data: Buffer;
}

function readChunks(buffer: Buffer): Chunk[] {
	const chunks: Chunk[] = [];
	let offset = 8; // signature
	while (offset + 8 <= buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString('latin1', offset + 4, offset + 8);
		const data = buffer.subarray(offset + 8, offset + 8 + length);
		chunks.push({ type, data });
		offset += 12 + length;
		if (type === 'IEND') break;
	}
	return chunks;
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	if (pb <= pc) return b;
	return c;
}

/** Reconstruct raw scanlines according to the PNG filter types. */
function unfilter(raw: Buffer, width: number, height: number, bpp: number): Buffer {
	const stride = width * bpp;
	const out = Buffer.alloc(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const rowStart = y * (stride + 1) + 1;
		for (let x = 0; x < stride; x++) {
			const i = rowStart + x;
			const b = raw[i];
			const left = x >= bpp ? out[y * stride + x - bpp] : 0;
			const up = y > 0 ? out[(y - 1) * stride + x] : 0;
			const upLeft = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
			let value = b;
			switch (filter) {
				case 0: value = b; break;
				case 1: value = b + left; break;
				case 2: value = b + up; break;
				case 3: value = b + ((left + up) >> 1); break;
				case 4: value = b + paeth(left, up, upLeft); break;
				default: throw new Error(`Unknown PNG filter type: ${filter}`);
			}
			out[y * stride + x] = value & 0xff;
		}
	}
	return out;
}

export function decodePNG(buffer: Buffer): DecodedPNG {
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	if (buffer.length < 8 || !buffer.subarray(0, 8).equals(signature)) {
		throw new Error('Not a PNG file (bad signature)');
	}

	const chunks = readChunks(buffer);
	const ihdr = chunks.find(c => c.type === 'IHDR');
	const idatData = chunks.filter(c => c.type === 'IDAT');
	if (!ihdr || idatData.length === 0) {
		throw new Error('PNG file is missing IHDR or IDAT chunks');
	}

	const width = ihdr.data.readUInt32BE(0);
	const height = ihdr.data.readUInt32BE(4);
	const bitDepth = ihdr.data[8];
	const colorType = ihdr.data[9];
	const interlace = ihdr.data[12];

	if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth} (expected 8)`);
	if (interlace !== 0) throw new Error('Interlaced PNG images are not supported');
	if (colorType !== 6 && colorType !== 2) {
		throw new Error(`Unsupported PNG color type: ${colorType} (expected 6/RGBA or 2/RGB)`);
	}

	const channels = colorType === 6 ? 4 : 3;
	const raw = zlib.inflateSync(Buffer.concat(idatData.map(c => c.data)));
	const pixels = unfilter(raw, width, height, channels);

	const data = new Uint8Array(width * height * 4);
	if (channels === 4) {
		data.set(pixels);
	} else {
		for (let i = 0, o = 0; i < width * height; i++, o += 4) {
			data[o] = pixels[i * 3];
			data[o + 1] = pixels[i * 3 + 1];
			data[o + 2] = pixels[i * 3 + 2];
			data[o + 3] = 255;
		}
	}

	return { width, height, data };
}

/** Encode an RGBA buffer as an 8-bit, non-interlaced RGBA PNG (used by tests to build fixtures). */
export function encodePNG(width: number, height: number, data: Uint8Array): Buffer {
	if (data.length !== width * height * 4) {
		throw new Error(`encodePNG: expected ${width * height * 4} bytes, got ${data.length}`);
	}
	const crcTable: number[] = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		crcTable[n] = c >>> 0;
	}
	function crc32(chunkData: Buffer): number {
		let c = 0xffffffff;
		for (const byte of chunkData) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	}
	function chunk(type: string, body: Buffer): Buffer {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(body.length);
		const typeBuf = Buffer.from(type, 'latin1');
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])));
		return Buffer.concat([len, typeBuf, body, crc]);
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0; // no interlace

	const stride = width * 4;
	const filtered = Buffer.alloc(height * (stride + 1));
	for (let y = 0; y < height; y++) {
		filtered[y * (stride + 1)] = 0; // filter type 0 (none)
		filtered.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}

	const idat = zlib.deflateSync(filtered);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', idat),
		chunk('IEND', Buffer.alloc(0)),
	]);
}
