import { AppError } from "../middleware/errorHandler";

/** Letter sizes in display order (used to expand ranges like S-4XL). */
export const LETTER_SIZE_ORDER = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
] as const;

export function normalizeSizeToken(size: string | undefined | null): string {
  return String(size || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function canonicalSizeLabel(token: string): string {
  const key = normalizeSizeToken(token);
  if (!key) return "";
  const idx = LETTER_SIZE_ORDER.indexOf(key as (typeof LETTER_SIZE_ORDER)[number]);
  return idx >= 0 ? LETTER_SIZE_ORDER[idx] : String(token).trim();
}

export function expandSizeRange(start: string, end: string): string[] {
  const a = normalizeSizeToken(start);
  const b = normalizeSizeToken(end);
  const i1 = LETTER_SIZE_ORDER.indexOf(a as (typeof LETTER_SIZE_ORDER)[number]);
  const i2 = LETTER_SIZE_ORDER.indexOf(b as (typeof LETTER_SIZE_ORDER)[number]);
  if (i1 >= 0 && i2 >= 0 && i2 >= i1) {
    return LETTER_SIZE_ORDER.slice(i1, i2 + 1).map(String);
  }
  return [String(start).trim(), String(end).trim()].filter(Boolean);
}

/** Expand one admin entry (e.g. "S-4XL" or "M") into selectable sizes. */
export function parseProductSizeEntry(entry: string): string[] {
  const raw = String(entry || "").trim();
  if (!raw) return [];
  const rangeMatch = raw.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (rangeMatch) {
    return expandSizeRange(rangeMatch[1], rangeMatch[2]);
  }
  return [raw];
}

/** Normalize product sizes: expand ranges, dedupe, preserve letter-size labels. */
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

export function resolveSelectedSize(
  raw: unknown,
  product: { sizes?: string[] | null }
): string | undefined {
  const sizes = normalizeProductSizes(product.sizes);
  if (sizes.length === 0) return undefined;
  const sel = normalizeSizeToken(String(raw || ""));
  if (!sel) throw new AppError("Please select a size", 400);
  const match = sizes.find((s) => normalizeSizeToken(s) === sel);
  if (!match) throw new AppError("Invalid size selection", 400);
  return match;
}
