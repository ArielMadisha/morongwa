/** Detected or supplier-derived color option for marketplace products. */
export interface ProductColorOption {
  /** Display name, e.g. "Navy", "Light Blue" */
  name: string;
  /** Swatch hex, e.g. "#1B2A4A" */
  hex: string;
  /** Index into product.images[] — switches gallery when selected */
  imageIndex: number;
}

/** Default swatch hex for common admin-entered color names. */
export const PRODUCT_COLOR_HEX_BY_NAME: Record<string, string> = {
  black: "#111111",
  white: "#F5F5F5",
  navy: "#1B2A4A",
  blue: "#2563EB",
  "light blue": "#93C5FD",
  red: "#DC2626",
  maroon: "#7F1D1D",
  brown: "#78350F",
  "light brown": "#C4A574",
  beige: "#D4C4A8",
  khaki: "#B8A88A",
  green: "#16A34A",
  yellow: "#EAB308",
  orange: "#EA580C",
  pink: "#EC4899",
  purple: "#7C3AED",
  grey: "#6B7280",
  gray: "#6B7280",
  silver: "#C0C0C0",
  gold: "#CA8A04",
  cream: "#FFFDD0",
};

export function normalizeColorName(name: string): string {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hexForProductColorName(name: string, hex?: string): string {
  const rawHex = String(hex || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(rawHex)) return rawHex;
  const key = normalizeColorName(name).toLowerCase();
  return PRODUCT_COLOR_HEX_BY_NAME[key] || "#6B7280";
}

/** Parse admin-supplied color rows; returns null when input is empty/invalid. */
export function normalizeAdminProductColors(
  input: unknown,
  imageCount: number
): ProductColorOption[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: ProductColorOption[] = [];
  for (let i = 0; i < input.length; i++) {
    const row = input[i];
    if (!row || typeof row !== "object") continue;
    const name = normalizeColorName(String((row as ProductColorOption).name || ""));
    if (!name) continue;
    const imageIndexRaw = Number((row as ProductColorOption).imageIndex);
    const imageIndex =
      Number.isFinite(imageIndexRaw) && imageIndexRaw >= 0 && imageIndexRaw < imageCount
        ? imageIndexRaw
        : i;
    out.push({
      name,
      hex: hexForProductColorName(name, (row as ProductColorOption).hex),
      imageIndex,
    });
  }
  if (!out.length) return null;
  const byIndex = new Map<number, ProductColorOption>();
  for (const opt of out) byIndex.set(opt.imageIndex, opt);
  return [...byIndex.values()].sort((a, b) => a.imageIndex - b.imageIndex);
}

/** True when admin provided one named color per product image. */
export function adminColorsCoverAllImages(colors: ProductColorOption[], imageCount: number): boolean {
  if (imageCount < 1 || colors.length < imageCount) return false;
  const indices = new Set(colors.map((c) => c.imageIndex));
  for (let i = 0; i < imageCount; i++) {
    if (!indices.has(i)) return false;
  }
  return true;
}

export function cartLineKey(productId: string, resellerId?: string | null, selectedColor?: string | null): string {
  return `${productId}::${resellerId || ""}::${normalizeColorName(selectedColor || "").toLowerCase()}`;
}
