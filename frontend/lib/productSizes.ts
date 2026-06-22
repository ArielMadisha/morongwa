/** Mirror of backend productSizeTypes — expand S-4XL etc. for shopper size pickers. */

export const LETTER_SIZE_ORDER = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
] as const;

export function normalizeSizeToken(size: string | undefined | null): string {
  return String(size || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function canonicalSizeLabel(token: string): string {
  const key = normalizeSizeToken(token);
  if (!key) return '';
  const idx = LETTER_SIZE_ORDER.indexOf(key as (typeof LETTER_SIZE_ORDER)[number]);
  return idx >= 0 ? LETTER_SIZE_ORDER[idx] : String(token).trim();
}

function expandSizeRange(start: string, end: string): string[] {
  const a = normalizeSizeToken(start);
  const b = normalizeSizeToken(end);
  const i1 = LETTER_SIZE_ORDER.indexOf(a as (typeof LETTER_SIZE_ORDER)[number]);
  const i2 = LETTER_SIZE_ORDER.indexOf(b as (typeof LETTER_SIZE_ORDER)[number]);
  if (i1 >= 0 && i2 >= 0 && i2 >= i1) {
    return LETTER_SIZE_ORDER.slice(i1, i2 + 1).map(String);
  }
  return [String(start).trim(), String(end).trim()].filter(Boolean);
}

function parseProductSizeEntry(entry: string): string[] {
  const raw = String(entry || '').trim();
  if (!raw) return [];
  const rangeMatch = raw.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (rangeMatch) {
    return expandSizeRange(rangeMatch[1], rangeMatch[2]);
  }
  return [raw];
}

export function normalizeProductSizes(sizes: string[] | undefined | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of sizes || []) {
    for (const piece of parseProductSizeEntry(entry)) {
      const label = canonicalSizeLabel(piece);
      const key = normalizeSizeToken(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}
