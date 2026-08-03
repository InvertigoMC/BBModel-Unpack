/**
 * Texture extraction. Embedded textures are stored in the `textures` array
 * as base64 data URLs (`source: "data:image/png;base64,..."`). This module
 * decodes them to raw bytes, derives safe unique file names, optionally
 * emits a Minecraft `.mcmeta` for flipbook/animated textures, and reports
 * textures that are only stored as external path references.
 *
 * Decoding is pure data handling: base64 -> bytes. Nothing from the model is
 * ever evaluated or executed, and file names are fully sanitized.
 */

import { BBTexture } from './types';
import { sanitizeFileName, splitExtension, uniqueName } from './names';
import { toNumber } from './mathUtil';

/** Known image MIME types and their file extensions. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
  'image/tga': '.tga',
  'image/x-targa': '.tga',
};

const DATA_URL_REGEX = /^data:([\w/+.-]+);base64,([\s\S]*)$/;

export interface DecodedLayer {
  fileName: string;
  bytes: Uint8Array;
}

export interface TextureItem {
  /** Index in the model's `textures` array. */
  index: number;
  /** Safe file name including extension (unique within this extraction). */
  fileName: string;
  /** Decoded image bytes; undefined when the texture is not embedded. */
  bytes?: Uint8Array;
  /** Original name as stored in the model. */
  originalName: string;
  /** External path recorded in the model (informational). */
  externalPath?: string;
  /** Relative path recorded in the model (resolvable next to the .bbmodel). */
  relativePath?: string;
  /** Optional Minecraft animation metadata (written as `<fileName>.mcmeta`). */
  mcmeta?: Record<string, unknown>;
  /** Decoded texture layers, when the texture uses Blockbench layers. */
  layers: DecodedLayer[];
  /** Non-fatal notes about this texture. */
  notes: string[];
}

export interface TexturesResult {
  items: TextureItem[];
  embeddedCount: number;
  externalOnlyCount: number;
  warnings: string[];
}

/** Decode a base64 data URL into bytes, or explain why it cannot be. */
function decodeDataUrl(
  source: string
): { bytes: Uint8Array; ext: string } | { error: string } {
  const match = DATA_URL_REGEX.exec(source);
  if (!match) {
    return { error: 'texture "source" is not a base64 data URL' };
  }
  const [, mime, payload] = match;
  const base64 = payload.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    return { error: 'base64 payload contains invalid characters' };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch (err) {
    return { error: `base64 decoding failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!bytes.length) return { error: 'base64 payload is empty' };
  const ext = MIME_EXTENSIONS[mime.toLowerCase()];
  if (!ext) {
    return { bytes, ext: '.bin' };
  }
  return { bytes, ext };
}

/** Build `.mcmeta` animation data for flipbook textures, when configured. */
function buildMcmeta(texture: BBTexture): Record<string, unknown> | undefined {
  const frameTime = toNumber(texture.frame_time, 0);
  const hasCustomOrder = texture.frame_order_type === 'custom' && typeof texture.frame_order === 'string';
  const interpolate = texture.frame_interpolate === true;
  if (frameTime <= 1 && !hasCustomOrder && !interpolate) return undefined;

  const animation: Record<string, unknown> = {};
  if (frameTime > 1) animation.frametime = frameTime;
  if (interpolate) animation.interpolate = true;
  if (hasCustomOrder) {
    const frames = (texture.frame_order ?? '')
      .split(/\s+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (frames.length) animation.frames = frames;
  }
  return { animation };
}

/** Decode all textures of a model. Pure function: no file system access. */
export function decodeTextures(textures: BBTexture[]): TexturesResult {
  const warnings: string[] = [];
  const items: TextureItem[] = [];
  const takenNames = new Set<string>();
  let embeddedCount = 0;
  let externalOnlyCount = 0;

  textures.forEach((texture, index) => {
    const notes: string[] = [];
    const originalName =
      (typeof texture.name === 'string' && texture.name.trim()) || `texture_${index}`;

    let bytes: Uint8Array | undefined;
    let ext = '.png';
    if (typeof texture.source === 'string' && texture.source.startsWith('data:')) {
      const decoded = decodeDataUrl(texture.source);
      if ('error' in decoded) {
        warnings.push(`Texture "${originalName}": ${decoded.error}; skipped.`);
        notes.push(`Embedded data could not be decoded (${decoded.error}).`);
      } else {
        bytes = decoded.bytes;
        ext = decoded.ext;
        if (ext === '.bin') {
          notes.push('Unknown image MIME type; written with a .bin extension.');
        }
        embeddedCount++;
      }
    } else if (typeof texture.source === 'string' && texture.source.length) {
      notes.push('Texture "source" is not a data URL; only its metadata was extracted.');
    }

    // Derive the output file name: keep the model's name, normalize the extension.
    let stemSource = sanitizeFileName(originalName, `texture_${index}`);
    const split = splitExtension(stemSource);
    if (split.ext && (split.ext.toLowerCase() === ext || MIME_EXTENSIONS[`image/${split.ext.slice(1).toLowerCase()}`])) {
      stemSource = split.stem;
      if (!bytes) ext = split.ext.toLowerCase();
    }
    const fileName = uniqueName(`${stemSource}${ext}`, takenNames);
    takenNames.add(fileName.toLowerCase());

    if (!bytes) {
      if (texture.path || texture.relative_path) {
        externalOnlyCount++;
        notes.push('Not embedded in the .bbmodel; the model references an external file.');
      } else {
        warnings.push(`Texture "${originalName}" has no embedded data and no file reference.`);
      }
    }

    const layers: DecodedLayer[] = [];
    if (Array.isArray(texture.layers) && texture.layers.length) {
      const layerNames = new Set<string>();
      texture.layers.forEach((layer, layerIndex) => {
        if (typeof layer?.data_url !== 'string' || !layer.data_url.startsWith('data:')) return;
        const decoded = decodeDataUrl(layer.data_url);
        if ('error' in decoded) {
          warnings.push(`Texture "${originalName}" layer ${layerIndex}: ${decoded.error}; layer skipped.`);
          return;
        }
        const layerStem = sanitizeFileName(
          typeof layer.name === 'string' && layer.name.trim() ? layer.name : `layer_${layerIndex}`,
          `layer_${layerIndex}`
        );
        const layerFile = uniqueName(`${splitExtension(layerStem).stem}${decoded.ext}`, layerNames);
        layerNames.add(layerFile.toLowerCase());
        layers.push({ fileName: layerFile, bytes: decoded.bytes });
      });
      if (layers.length) {
        notes.push(`${layers.length} editing layer(s) exported separately.`);
      }
    }

    items.push({
      index,
      fileName,
      bytes,
      originalName,
      externalPath: typeof texture.path === 'string' && texture.path ? texture.path : undefined,
      relativePath:
        typeof texture.relative_path === 'string' && texture.relative_path
          ? texture.relative_path
          : undefined,
      mcmeta: bytes ? buildMcmeta(texture) : undefined,
      layers,
      notes,
    });
  });

  return { items, embeddedCount, externalOnlyCount, warnings };
}
