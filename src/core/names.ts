/**
 * Filesystem-safe naming helpers. Extracted artifacts are named after
 * user-controlled strings from inside the model file (texture names, model
 * names, ...), so every name is sanitized before it touches the file system:
 * no path separators, no reserved Windows device names, no traversal.
 */

/** Punctuation that is invalid in file names on Windows (superset of POSIX). */
const INVALID_PUNCT = '<>:"/\\|?*';

/** True for characters that must not appear in a file name segment. */
function isInvalidFileNameChar(ch: string): boolean {
  // Control characters (below 0x20) are rejected alongside the punctuation set.
  return ch.charCodeAt(0) < 0x20 || INVALID_PUNCT.includes(ch);
}

/** Reserved Windows device names (case-insensitive, with or without extension). */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const MAX_NAME_LENGTH = 120;

/**
 * Make a single path *segment* safe for all supported platforms.
 * Never returns an empty string.
 */
export function sanitizeFileName(input: string, fallback = 'unnamed'): string {
  let name = (input ?? '').trim();
  name = Array.from(name, (ch) => (isInvalidFileNameChar(ch) ? '_' : ch)).join('');
  // Remove leading/trailing dots and spaces (Windows strips them silently).
  name = name.replace(/^[\s.]+|[\s.]+$/g, '');
  if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH).trim();
  if (name.length === 0) name = fallback;
  const stem = name.split('.')[0] ?? name;
  if (RESERVED_NAMES.test(stem)) name = `_${name}`;
  return name;
}

/** Split "name.ext" into stem + extension (extension includes the dot). */
export function splitExtension(fileName: string): { stem: string; ext: string } {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0) return { stem: fileName, ext: '' };
  return { stem: fileName.slice(0, idx), ext: fileName.slice(idx) };
}

/**
 * Produce a collision-free variant of `fileName` given a set of names that
 * are already taken (case-insensitive, mirroring Windows/macOS defaults):
 * "tex.png" -> "tex (2).png" -> "tex (3).png" ...
 */
export function uniqueName(fileName: string, taken: Set<string>): string {
  const key = (n: string) => n.toLowerCase();
  if (!taken.has(key(fileName))) return fileName;
  const { stem, ext } = splitExtension(fileName);
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(key(candidate))) return candidate;
  }
  // Practically unreachable; timestamp guarantees uniqueness.
  return `${stem}-${Date.now()}${ext}`;
}

/**
 * Sanitize the body of a Bedrock geometry identifier ("geometry.<body>").
 * Blockbench writes the identifier verbatim; Bedrock expects
 * [a-zA-Z0-9_.] in practice, so anything else becomes "_".
 */
export function sanitizeIdentifier(input: string, fallback = 'unknown'): string {
  const body = (input ?? '').trim().replace(/^geometry\./, '');
  const clean = body.replace(/[^a-zA-Z0-9_.]/g, '_').replace(/^\.+|\.+$/g, '');
  return clean.length ? clean : fallback;
}
