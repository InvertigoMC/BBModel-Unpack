const INVALID_PUNCT = '<>:"/\\|?*';

function isInvalidFileNameChar(ch: string): boolean {
  return ch.charCodeAt(0) < 0x20 || INVALID_PUNCT.includes(ch);
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const MAX_NAME_LENGTH = 120;

export function sanitizeFileName(input: string, fallback = 'unnamed'): string {
  let name = (input ?? '').trim();
  name = Array.from(name, (ch) => (isInvalidFileNameChar(ch) ? '_' : ch)).join('');
  name = name.replace(/^[\s.]+|[\s.]+$/g, '');
  if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH).trim();
  if (name.length === 0) name = fallback;
  const stem = name.split('.')[0] ?? name;
  if (RESERVED_NAMES.test(stem)) name = `_${name}`;
  return name;
}

export function splitExtension(fileName: string): { stem: string; ext: string } {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0) return { stem: fileName, ext: '' };
  return { stem: fileName.slice(0, idx), ext: fileName.slice(idx) };
}

export function uniqueName(fileName: string, taken: Set<string>): string {
  const key = (n: string) => n.toLowerCase();
  if (!taken.has(key(fileName))) return fileName;
  const { stem, ext } = splitExtension(fileName);
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(key(candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

export function sanitizeIdentifier(input: string, fallback = 'unknown'): string {
  const body = (input ?? '').trim().replace(/^geometry\./, '');
  const clean = body.replace(/[^a-zA-Z0-9_.]/g, '_').replace(/^\.+|\.+$/g, '');
  return clean.length ? clean : fallback;
}
