import fs from "fs";
import sharp from "sharp";
import { resolveLocalUploadFilePath, encodeUploadsPublicPath } from "../utils/uploadFilePath";
import { normalizeColorName, type ProductColorOption } from "../utils/productColorTypes";

const NAMED_COLORS: Array<{ name: string; hex: string; r: number; g: number; b: number }> = [
  { name: "Black", hex: "#111111", r: 17, g: 17, b: 17 },
  { name: "White", hex: "#F5F5F5", r: 245, g: 245, b: 245 },
  { name: "Navy", hex: "#1B2A4A", r: 27, g: 42, b: 74 },
  { name: "Navy Blue", hex: "#1E3A5F", r: 30, g: 58, b: 95 },
  { name: "Blue", hex: "#2563EB", r: 37, g: 99, b: 235 },
  { name: "Light Blue", hex: "#93C5FD", r: 147, g: 197, b: 253 },
  { name: "Sky Blue", hex: "#38BDF8", r: 56, g: 189, b: 248 },
  { name: "Red", hex: "#DC2626", r: 220, g: 38, b: 38 },
  { name: "Green", hex: "#16A34A", r: 22, g: 163, b: 74 },
  { name: "Grey", hex: "#6B7280", r: 107, g: 114, b: 128 },
  { name: "Gray", hex: "#6B7280", r: 107, g: 114, b: 128 },
  { name: "Beige", hex: "#D4C4A8", r: 212, g: 196, b: 168 },
  { name: "Brown", hex: "#78350F", r: 120, g: 53, b: 15 },
  { name: "Light Brown", hex: "#C4A574", r: 196, g: 164, b: 116 },
  { name: "Pink", hex: "#EC4899", r: 236, g: 72, b: 153 },
  { name: "Purple", hex: "#7C3AED", r: 124, g: 58, b: 237 },
  { name: "Yellow", hex: "#EAB308", r: 234, g: 179, b: 8 },
  { name: "Orange", hex: "#EA580C", r: 234, g: 88, b: 12 },
  { name: "Khaki", hex: "#B8A88A", r: 184, g: 168, b: 138 },
  { name: "Maroon", hex: "#7F1D1D", r: 127, g: 29, b: 29 },
  { name: "Cream", hex: "#FFFDD0", r: 255, g: 253, b: 208 },
  { name: "Gold", hex: "#CA8A04", r: 202, g: 138, b: 4 },
  { name: "Silver", hex: "#C0C0C0", r: 192, g: 192, b: 192 },
];

const VARIANT_COLOR_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\blight\s+blue\b/i, name: "Light Blue" },
  { pattern: /\bnavy\s+blue\b/i, name: "Navy Blue" },
  { pattern: /\bsky\s+blue\b/i, name: "Sky Blue" },
  { pattern: /\bnavy\b/i, name: "Navy" },
  { pattern: /\bblack\b/i, name: "Black" },
  { pattern: /\bwhite\b/i, name: "White" },
  { pattern: /\bgrey\b|\bgray\b/i, name: "Grey" },
  { pattern: /\bblue\b/i, name: "Blue" },
  { pattern: /\bred\b/i, name: "Red" },
  { pattern: /\bgreen\b/i, name: "Green" },
  { pattern: /\bpink\b/i, name: "Pink" },
  { pattern: /\bpurple\b/i, name: "Purple" },
  { pattern: /\byellow\b/i, name: "Yellow" },
  { pattern: /\borange\b/i, name: "Orange" },
  { pattern: /\bbeige\b/i, name: "Beige" },
  { pattern: /\bbrown\b/i, name: "Brown" },
  { pattern: /\blight\s+brown\b/i, name: "Light Brown" },
  { pattern: /\bkhaki\b/i, name: "Khaki" },
  { pattern: /\bmaroon\b/i, name: "Maroon" },
  { pattern: /\bcream\b/i, name: "Cream" },
  { pattern: /\bgold\b/i, name: "Gold" },
  { pattern: /\bsilver\b/i, name: "Silver" },
];

/** Merge near-duplicate swatch names for cleaner storefront UI. */
const COLOR_NAME_CANONICAL: Record<string, string> = {
  "navy blue": "Navy",
  gray: "Grey",
  "sky blue": "Light Blue",
};

const BACKGROUND_COLOR_NAMES = new Set(["beige", "khaki", "cream"]);

function rgbDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function nearestNamedColor(r: number, g: number, b: number): { name: string; hex: string } {
  // Yellow / mustard garment (including striped tees — not tan walls)
  if (r > 185 && g > 140 && b < 72 && r - b > 50 && g > b && (r > 205 || g > 145)) {
    return { name: "Yellow", hex: "#EAB308" };
  }

  // Green / olive garment
  if (g >= r - 8 && g >= b && g - Math.min(r, b) > 10 && g > 50) {
    if (b < g - 12 || Math.abs(g - r) < 30) {
      return { name: "Green", hex: "#16A34A" };
    }
  }

  // Maroon / burgundy garment (including bright burgundy coats)
  if (r > 55 && r > g + 15 && r > b + 15 && g < 120 && b < 125) {
    return { name: "Maroon", hex: "#7F1D1D" };
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Cool/warm heather grey fabric (not Light Blue — blue channel often slightly higher in grey wool)
  if (r > 130 && g > 130 && b > 130 && delta < 55) {
    if (r > 205 && g > 200 && b > 195 && delta < 30) {
      return { name: "White", hex: "#F5F5F5" };
    }
    return { name: "Grey", hex: "#6B7280" };
  }

  // Warm cream / off-white coat
  if (r > 168 && g > 138 && b > 128 && r - g < 45 && delta < 50) {
    return { name: "White", hex: "#F5F5F5" };
  }

  // Blue-dominant pixels → blue family (skip muted cool greys handled above)
  if (b >= r && b >= g && b - Math.min(r, g) > 12) {
    if (b > 200 && g > 170) {
      return { name: "Light Blue", hex: "#93C5FD" };
    }
    if (b > 160 && g > 130) {
      return { name: "Light Blue", hex: "#93C5FD" };
    }
    if (r < 35 && g < 50 && b < 95) {
      return { name: "Navy", hex: "#1B2A4A" };
    }
    if (b > 70) {
      return { name: "Blue", hex: "#2563EB" };
    }
  }

  if (r > 210 && g > 205 && b > 200 && delta < 38) {
    return { name: "White", hex: "#F5F5F5" };
  }

  let best = NAMED_COLORS[0];
  let bestDist = Infinity;
  for (const c of NAMED_COLORS) {
    const d = rgbDistance({ r, g, b }, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  const canonical = COLOR_NAME_CANONICAL[best.name.toLowerCase()] || best.name;
  const entry = NAMED_COLORS.find((c) => c.name.toLowerCase() === canonical.toLowerCase()) || best;
  return { name: entry.name, hex: entry.hex };
}

function parseColorFromVariantName(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  for (const { pattern, name } of VARIANT_COLOR_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return null;
}

async function loadImageBufferOnce(url: string, origin: string): Promise<Buffer | null> {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  const local = resolveLocalUploadFilePath(trimmed);
  if (local) {
    try {
      return fs.readFileSync(local);
    } catch {
      /* try remote below */
    }
  }

  let fetchPath = trimmed;
  if (fetchPath.startsWith("/uploads/")) {
    fetchPath = encodeUploadsPublicPath(fetchPath);
  } else if (/^https?:\/\//i.test(fetchPath)) {
    try {
      fetchPath = new URL(fetchPath).pathname;
      fetchPath = encodeUploadsPublicPath(fetchPath);
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const fetchUrl = `${origin.replace(/\/$/, "")}${fetchPath.startsWith("/") ? fetchPath : `/${fetchPath}`}`;
  try {
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Origins to try when loading `/uploads/` files remotely (skip localhost — not reachable from scripts/CI). */
function remoteUploadOrigins(): string[] {
  const candidates = [
    process.env.PUBLIC_SITE_URL,
    process.env.FRONTEND_URL,
    process.env.API_PUBLIC_URL,
    "https://www.qwertymates.com",
    "https://api.qwertymates.com",
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.replace(/\/$/, ""));

  const out: string[] = [];
  for (const origin of candidates) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) continue;
    if (!out.includes(origin)) out.push(origin);
  }
  if (!out.length) out.push("https://www.qwertymates.com");
  return out;
}

async function loadImageBuffer(url: string): Promise<Buffer | null> {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  // Absolute URL — fetch directly (with retries)
  if (/^https?:\/\//i.test(trimmed)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(trimmed, { signal: AbortSignal.timeout(20000) });
        if (res.ok) return Buffer.from(await res.arrayBuffer());
      } catch {
        /* retry */
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return null;
  }

  for (const origin of remoteUploadOrigins()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const buf = await loadImageBufferOnce(trimmed, origin);
      if (buf) return buf;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 300));
    }
  }
  return null;
}

/** True for studio walls, wood shelving, beige interiors — not garment colors. */
export function isLikelyBackgroundPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2 / 255;

  // Pure white studio backdrop (not white clothing)
  if (r > 245 && g > 242 && b > 238 && delta < 14) return true;

  // Cream / warm off-white walls
  if (r > 210 && g > 200 && b > 175 && delta < 40 && r - b < 55) return true;

  // Warm wood / tan studio backgrounds — including richer orange-brown walls (not garments)
  if (r > 90 && g > 50 && b < g && r - b > 28 && lightness >= 0.18 && lightness <= 0.78) {
    const warmHue = r >= g - 8 && g >= b - 8;
    if (warmHue) {
      // Keep saturated orange/red clothing; drop muted warm interiors
      if (delta < 95 || (r < 175 && g < 145)) return true;
    }
  }

  // Beige / khaki interior props
  if (r > 150 && g > 130 && b > 95 && delta < 50 && r - b < 75 && lightness > 0.45) {
    if (delta < 42) return true;
  }

  // Orange/tan studio backdrop (not yellow clothing or maroon garments)
  if (r > 155 && g > 85 && b < 85 && r - b > 50 && r - g < 75) {
    if (g <= 140 || pixelColorfulness(r, g, b) < 90) return true;
  }

  return false;
}

/** Neutral light-grey photo studio (not medium silver/beige garments). */
function isLightGreyStudioRgb(r: number, g: number, b: number): boolean {
  const delta = Math.max(r, g, b) - Math.min(r, g, b);
  return r > 172 && g > 170 && b > 168 && delta < 22;
}

function pixelColorfulness(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

type Rgb = { r: number; g: number; b: number };

/** Supplier collages on square canvases — 4×4 captures variant corners reliably. */
function samplingGrids(width: number, height: number): Array<{ cols: number; rows: number }> {
  const ratio = width / Math.max(height, 1);
  const squareish = width >= 700 && height >= 700 && ratio > 0.85 && ratio < 1.18;
  if (squareish) return [{ cols: 4, rows: 4 }];
  if (width >= 800 && height >= 800) return [{ cols: 4, rows: 4 }];
  if (width >= 500 && height >= 500) return [{ cols: 3, rows: 3 }];
  return [{ cols: 2, rows: 2 }];
}

/** Sample a crop and return up to 3 distinct non-background garment colors. */
async function sampleRegionGarmentColors(
  buf: Buffer,
  width: number,
  height: number,
  left: number,
  top: number,
  cropW: number,
  cropH: number
): Promise<Rgb[]> {
  const safeLeft = Math.max(0, Math.min(left, width - 1));
  const safeTop = Math.max(0, Math.min(top, height - 1));
  const safeW = Math.max(1, Math.min(cropW, width - safeLeft));
  const safeH = Math.max(1, Math.min(cropH, height - safeTop));

  const { data, info } = await sharp(buf)
    .removeAlpha()
    .extract({ left: safeLeft, top: safeTop, width: safeW, height: safeH })
    .resize(32, 32, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, { r: number; g: number; b: number; weight: number }>();

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isLikelyBackgroundPixel(r, g, b)) continue;
    if (isLightGreyStudioRgb(r, g, b)) continue;

    let weight = 1 + pixelColorfulness(r, g, b) / 28;
    if (b > r + 10 && b > g - 5) weight *= 3;
    if (b > 130 && g > 100 && b > r) weight *= 1.5;
    if (g > r + 12 && g > b + 8 && g > 60) weight *= 3.5;
    if (g > 45 && r > 40 && Math.abs(g - r) < 28 && b < g - 12) weight *= 5;
    if (r > 155 && g > 130 && b > 120 && r - b < 35 && r - g < 30) weight *= 5;
    if (r > 165 && g > 135 && b > 125 && r - g < 45 && pixelColorfulness(r, g, b) < 50) weight *= 4;
    if (r > 70 && r > g + 15 && r > b + 15 && g < 100) weight *= 3;
    if (r < 40 && g < 40 && b < 40) weight *= 2;
    if (r > 220 && g > 220 && b > 215) weight *= 1.8;
    if (pixelColorfulness(r, g, b) < 25 && r > g && g > b && r > 100) weight *= 0.2;

    const qr = Math.round(r / 18) * 18;
    const qg = Math.round(g / 18) * 18;
    const qb = Math.round(b / 18) * 18;
    const key = `${qr},${qg},${qb}`;
    const prev = buckets.get(key);
    if (prev) {
      const total = prev.weight + weight;
      prev.r = (prev.r * prev.weight + r * weight) / total;
      prev.g = (prev.g * prev.weight + g * weight) / total;
      prev.b = (prev.b * prev.weight + b * weight) / total;
      prev.weight = total;
    } else {
      buckets.set(key, { r, g, b, weight });
    }
  }

  if (!buckets.size) return [];

  const sorted = [...buckets.values()].sort((a, b) => b.weight - a.weight);
  const out: Rgb[] = [];
  for (const bucket of sorted) {
    const rgb = { r: Math.round(bucket.r), g: Math.round(bucket.g), b: Math.round(bucket.b) };
    if (isLikelyBackgroundPixel(rgb.r, rgb.g, rgb.b)) continue;
    if (isLightGreyStudioRgb(rgb.r, rgb.g, rgb.b)) continue;
    const named = nearestNamedColor(rgb.r, rgb.g, rgb.b);
    if (BACKGROUND_COLOR_NAMES.has(named.name.toLowerCase())) continue;
    if (out.some((o) => rgbDistance(o, rgb) < 38)) continue;
    out.push(rgb);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Extract garment colors from one image — grid sampling handles collage layouts
 * (multiple outfits in one photo) and ignores warm studio backgrounds.
 */
async function extractProductColorsFromBuffer(buf: Buffer): Promise<Rgb[]> {
  try {
    const meta = await sharp(buf).metadata();
    const width = meta.width || 64;
    const height = meta.height || 64;

    const layouts = samplingGrids(width, height);
    const found: Rgb[] = [];

    for (const { cols, rows } of layouts) {
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const cellW = Math.floor(width / cols);
          const cellH = Math.floor(height / rows);
          const insetX = Math.floor(cellW * 0.18);
          const insetY = Math.floor(cellH * 0.15);
          const left = gx * cellW + insetX;
          const top = gy * cellH + insetY;
          const cropW = Math.floor(cellW * 0.64);
          const cropH = Math.floor(cellH * 0.7);

          const regionColors = await sampleRegionGarmentColors(buf, width, height, left, top, cropW, cropH);
          for (const rgb of regionColors) {
            if (!isLikelyBackgroundPixel(rgb.r, rgb.g, rgb.b)) found.push(rgb);
          }
        }
      }
    }

    if (!found.length) {
      const cw = Math.floor(width * 0.5);
      const ch = Math.floor(height * 0.5);
      const left = Math.floor((width - cw) / 2);
      const top = Math.floor((height - ch) / 2);
      const regionColors = await sampleRegionGarmentColors(buf, width, height, left, top, cw, ch);
      for (const rgb of regionColors) {
        if (!isLikelyBackgroundPixel(rgb.r, rgb.g, rgb.b)) found.push(rgb);
      }
    }

    if (!found.length) {
      const { dominant } = await sharp(buf).resize(96, 96, { fit: "cover" }).removeAlpha().stats();
      if (dominant) {
        const rgb = {
          r: Math.round(dominant.r),
          g: Math.round(dominant.g),
          b: Math.round(dominant.b),
        };
        if (!isLikelyBackgroundPixel(rgb.r, rgb.g, rgb.b)) found.push(rgb);
      }
    }

    return clusterSimilarRgb(found);
  } catch (err) {
    console.warn("extractProductColorsFromBuffer failed:", (err as Error)?.message || err);
    return [];
  }
}

/** Merge similar RGB samples within the same color family (avoid olive → maroon merges). */
function clusterSimilarRgb(samples: Rgb[]): Rgb[] {
  const clusters: Array<{ r: number; g: number; b: number; n: number }> = [];
  for (const s of samples) {
    const sFamily = nearestNamedColor(s.r, s.g, s.b).name.toLowerCase();
    const hit = clusters.find((c) => {
      const cFamily = nearestNamedColor(Math.round(c.r), Math.round(c.g), Math.round(c.b)).name.toLowerCase();
      return cFamily === sFamily && rgbDistance(c, s) < 42;
    });
    if (hit) {
      hit.r = (hit.r * hit.n + s.r) / (hit.n + 1);
      hit.g = (hit.g * hit.n + s.g) / (hit.n + 1);
      hit.b = (hit.b * hit.n + s.b) / (hit.n + 1);
      hit.n += 1;
    } else {
      clusters.push({ ...s, n: 1 });
    }
  }
  return clusters.map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
}

function canonicalColorName(name: string): string {
  const key = normalizeColorName(name).toLowerCase();
  return COLOR_NAME_CANONICAL[key] || normalizeColorName(name);
}

/** Storefront label from sampled garment RGB. */
function garmentDisplayColorName(rgb: Rgb, named: { name: string; hex: string }): { name: string; hex: string } {
  const { r, g, b } = rgb;
  const lightness = (r + g + b) / 3;
  const neutralDelta = Math.max(r, g, b) - Math.min(r, g, b);
  const base = canonicalColorName(named.name);
  const key = base.toLowerCase();

  if (key === "grey" || key === "gray" || key === "silver") {
    if (r > g && r > b && r - b > 12) {
      return { name: "White", hex: "#F5F5F5" };
    }
    return { name: "Grey", hex: lightness > 165 ? "#9CA3AF" : "#6B7280" };
  }
  if (key === "white" || key === "cream") {
    return { name: "White", hex: "#F5F5F5" };
  }
  if (key === "beige" || key === "khaki") {
    if (lightness > 150 && neutralDelta < 45) {
      return { name: "White", hex: "#F5F5F5" };
    }
  }
  if (key === "brown" || key === "light brown") {
    if (lightness > 150 && neutralDelta < 45) {
      return { name: "White", hex: "#F5F5F5" };
    }
  }
  if (key === "maroon" || key === "red" || key === "pink") {
    if (r > 90 && r > g + 20) {
      return { name: "Maroon", hex: "#7F1D1D" };
    }
  }
  if (key === "navy" || key === "blue") {
    if (r < 28 && g < 38 && b < 55) {
      return { name: "Black", hex: "#111111" };
    }
  }
  if (key === "black") {
    return { name: "Black", hex: "#111111" };
  }
  return { name: base, hex: named.hex };
}

async function bufferLooksLikeCollage(buf: Buffer): Promise<boolean> {
  const meta = await sharp(buf).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const ratio = w / Math.max(h, 1);
  return w >= 700 && h >= 700 && ratio > 0.85 && ratio < 1.18;
}

/** One dominant garment color from a portrait variant photo (blazer/trousers in frame). */
async function detectPrimaryGarmentColorFromBuffer(buf: Buffer): Promise<Rgb | null> {
  const meta = await sharp(buf).metadata();
  const width = meta.width || 640;
  const height = meta.height || 1080;
  const bands = [
    { top: 0.24, h: 0.22, weight: 1.2 },
    { top: 0.34, h: 0.22, weight: 1.0 },
    { top: 0.44, h: 0.16, weight: 0.35 },
  ];

  let best: { rgb: Rgb; score: number } | null = null;
  let bestNeutral: { rgb: Rgb; score: number } | null = null;

  for (const band of bands) {
    const cw = Math.floor(width * 0.55);
    const ch = Math.floor(height * band.h);
    const left = Math.floor((width - cw) / 2);
    const top = Math.floor(height * band.top);
    const regionColors = await sampleRegionGarmentColors(buf, width, height, left, top, cw, ch);
    for (let rank = 0; rank < regionColors.length; rank++) {
      const rgb = regionColors[rank];
      let score = ((3 - rank) * 10 + pixelColorfulness(rgb.r, rgb.g, rgb.b) / 4) * band.weight;
      const neutralDelta = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
      if (neutralDelta < 18 && Math.abs(rgb.r - rgb.g) < 14) score += 18;
      if (isLightGreyStudioRgb(rgb.r, rgb.g, rgb.b)) {
        if (!bestNeutral || score > bestNeutral.score) bestNeutral = { rgb, score };
        continue;
      }
      if (!best || score > best.score) best = { rgb, score };
    }
  }

  if (best) return best.rgb;
  return bestNeutral?.rgb || null;
}

/** One swatch per portrait photo when each image is a separate color variant. */
async function detectPortraitVariantColors(images: string[]): Promise<ProductColorOption[]> {
  if (images.length < 2) return [];

  const options: ProductColorOption[] = [];
  let portraitCount = 0;

  for (let i = 0; i < images.length; i++) {
    const buf = await loadImageBuffer(images[i]);
    if (!buf) continue;
    if (await bufferLooksLikeCollage(buf)) return [];

    const meta = await sharp(buf).metadata();
    const w = meta.width || 640;
    const h = meta.height || 1080;
    if (h < w * 1.05) return [];
    portraitCount += 1;

    const primary = await detectPrimaryGarmentColorFromBuffer(buf);
    if (!primary) continue;
    if (isLikelyBackgroundPixel(primary.r, primary.g, primary.b)) continue;

    const named = nearestNamedColor(primary.r, primary.g, primary.b);
    if (BACKGROUND_COLOR_NAMES.has(named.name.toLowerCase())) continue;
    const display = garmentDisplayColorName(primary, named);
    options.push({
      name: display.name,
      hex: display.hex,
      imageIndex: i,
    });
  }

  if (options.length < Math.min(images.length, 2)) return [];
  return options.sort((a, b) => a.imageIndex - b.imageIndex);
}

function dedupeColors(options: ProductColorOption[]): ProductColorOption[] {
  const out: ProductColorOption[] = [];
  for (const opt of options) {
    const name = canonicalColorName(opt.name);
    const dup = out.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (dup) continue;
    out.push({ ...opt, name });
  }
  return out.slice(0, 12);
}

const CHROMATIC_COLOR_NAMES = new Set([
  "blue",
  "light blue",
  "green",
  "maroon",
  "red",
  "yellow",
  "pink",
  "purple",
  "orange",
]);

/** Prefer distinct garment hues; keep neutrals when many chromatic colors were found. */
function prioritizeGarmentSwatches(options: ProductColorOption[]): ProductColorOption[] {
  const chromatic = options.filter((o) => CHROMATIC_COLOR_NAMES.has(o.name.toLowerCase()));
  if (chromatic.length >= 4) {
    const white = options.filter((o) => o.name.toLowerCase() === "white");
    return dedupeColors([...chromatic, ...white]);
  }
  if (chromatic.length >= 3) {
    const extras = options.filter((o) => {
      const n = o.name.toLowerCase();
      return n === "white" || n === "black";
    });
    return dedupeColors([...chromatic, ...extras]);
  }
  return options;
}

/** Drop warm hues misread from tan studio walls on cool pastel multi-color sets (e.g. bucket hat). */
function pruneFalseWarmHues(options: ProductColorOption[]): ProductColorOption[] {
  const names = new Set(options.map((o) => o.name.toLowerCase()));
  if (!names.has("light blue") || !names.has("white") || !names.has("black")) return options;
  return options.filter(
    (o) => !["yellow", "red", "orange", "gold", "maroon"].includes(o.name.toLowerCase())
  );
}

/** When Blue was sampled from a medium shirt, drop Navy duplicate (keep Light Blue). */
function collapseNearDuplicateBlues(options: ProductColorOption[]): ProductColorOption[] {
  const names = new Set(options.map((o) => o.name.toLowerCase()));
  const hasLightBlue = names.has("light blue");
  const hasBlue = names.has("blue");
  if (hasLightBlue && hasBlue) {
    if (names.has("white")) {
      return options.filter((o) => !["blue", "navy"].includes(o.name.toLowerCase()));
    }
    return options.filter((o) => o.name.toLowerCase() !== "light blue");
  }
  if (hasBlue) return options.filter((o) => o.name.toLowerCase() !== "navy");
  return options;
}

/** Drop background mis-detections when clearer garment colors exist (e.g. Brown wall → Light Blue shirt). */
export function filterBackgroundColorSwatches(options: ProductColorOption[]): ProductColorOption[] {
  if (options.length <= 1) return options;
  const hasGarmentColors = options.some((o) => !BACKGROUND_COLOR_NAMES.has(o.name.toLowerCase()));
  if (!hasGarmentColors) return options;
  return options.filter((o) => {
    const n = o.name.toLowerCase();
    if (BACKGROUND_COLOR_NAMES.has(n)) return false;
    if (n === "orange" && hasGarmentColors) return false;
    return true;
  });
}

/** True when stored swatches likely came from studio backgrounds, not garments. */
export function colorsLookLikeBackgroundMisdetect(colors: ProductColorOption[]): boolean {
  if (!colors.length) return false;
  const names = colors.map((c) => c.name.toLowerCase());
  const hasBrown = names.includes("brown");
  const hasBeigeFamily = names.some((n) => BACKGROUND_COLOR_NAMES.has(n));
  const hasApparel = names.some(
    (n) =>
      !BACKGROUND_COLOR_NAMES.has(n) &&
      ["black", "white", "navy", "blue", "light blue", "red", "green", "pink", "purple", "grey"].includes(n)
  );
  return (hasBrown || hasBeigeFamily) && hasApparel;
}

/** True when stored swatches look like a partial detect (e.g. only Black/White on a multi-color product). */
export function colorsLookUnderDetected(
  colors: ProductColorOption[],
  imageCount: number
): boolean {
  if (imageCount < 2 || colors.length === 0) return false;
  if (colors.length < imageCount) return true;
  if (imageCount >= 3 && colors.length < Math.min(imageCount, 4)) return true;
  if (colors.length >= 4) return false;
  const names = colors.map((c) => c.name.toLowerCase());
  const neutralOnly = names.every((n) => ["black", "white", "grey", "gray", "silver"].includes(n));
  return colors.length <= 2 && neutralOnly && imageCount >= 3;
}

/** Parse CJ / EPROLO variant names into color options when available. */
export function extractColorsFromExternalData(
  externalData: Record<string, unknown> | undefined | null,
  imageCount: number
): ProductColorOption[] {
  if (!externalData || typeof externalData !== "object") return [];
  const variants = Array.isArray((externalData as any).variants)
    ? (externalData as any).variants
    : Array.isArray((externalData as any).variantlist)
      ? (externalData as any).variantlist
      : [];
  if (!variants.length) return [];

  const options: ProductColorOption[] = [];
  let imageCursor = 0;
  for (const v of variants) {
    const nameRaw =
      v?.variantNameEn ||
      v?.variantName ||
      v?.name ||
      [v?.option1, v?.option2, v?.option3].filter(Boolean).join(" ");
    const parsed = parseColorFromVariantName(String(nameRaw || ""));
    if (!parsed) continue;
    const normalized = canonicalColorName(parsed);
    if (options.some((o) => o.name.toLowerCase() === normalized.toLowerCase())) continue;
    const named = NAMED_COLORS.find((c) => c.name.toLowerCase() === normalized.toLowerCase());
    const imageIndex = imageCount > 1 ? Math.min(imageCursor, imageCount - 1) : 0;
    imageCursor += 1;
    options.push({
      name: normalized,
      hex: named?.hex || "#6B7280",
      imageIndex,
    });
  }
  return dedupeColors(options);
}

/** Detect garment colors per product image (ignores studio backgrounds). */
export async function detectColorsFromImages(images: string[]): Promise<ProductColorOption[]> {
  const urls = (images || []).filter((u) => typeof u === "string" && u.trim());
  if (!urls.length) return [];

  const variantGallery = await detectPortraitVariantColors(urls);
  if (variantGallery.length >= Math.max(2, Math.ceil(urls.length * 0.6))) {
    return filterBackgroundColorSwatches(variantGallery);
  }

  const byName = new Map<string, ProductColorOption>();

  for (let i = 0; i < urls.length; i++) {
    const buf = await loadImageBuffer(urls[i]);
    if (!buf) continue;
    const rgbs = await extractProductColorsFromBuffer(buf);
    if (!rgbs.length) continue;

    const imageOptions: ProductColorOption[] = [];
    for (const rgb of rgbs) {
      const named = nearestNamedColor(rgb.r, rgb.g, rgb.b);
      if (BACKGROUND_COLOR_NAMES.has(named.name.toLowerCase())) continue;
      imageOptions.push({
        name: canonicalColorName(named.name),
        hex: named.hex,
        imageIndex: i,
      });
    }

    const dedicatedPhoto = imageOptions.length === 1;
    for (const opt of imageOptions) {
      const key = opt.name.toLowerCase();
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, opt);
        continue;
      }
      const prevDedicated = prev.imageIndex !== 0 || i === 0;
      if (dedicatedPhoto && i > 0) {
        byName.set(key, opt);
      } else if (!prevDedicated && dedicatedPhoto) {
        byName.set(key, opt);
      }
    }
  }

  return pruneFalseWarmHues(
    prioritizeGarmentSwatches(
      collapseNearDuplicateBlues(filterBackgroundColorSwatches(dedupeColors([...byName.values()])))
    )
  );
}

/** Build color options: supplier variants first, then image detection. */
export async function buildProductColorOptions(input: {
  images?: string[];
  externalData?: Record<string, unknown> | null;
}): Promise<ProductColorOption[]> {
  const images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  const fromVariants = extractColorsFromExternalData(input.externalData, images.length);
  const fromImages = await detectColorsFromImages(images);

  const variantsTrusted =
    fromVariants.length >= 2 && !colorsLookLikeBackgroundMisdetect(fromVariants);

  if (variantsTrusted && fromImages.length < 2) {
    return filterBackgroundColorSwatches(fromVariants);
  }

  if (fromImages.length >= 2) {
    if (fromVariants.length) {
      const variantNames = new Set(fromVariants.map((v) => v.name.toLowerCase()));
      const merged = [...fromImages];
      for (const v of fromVariants) {
        if (BACKGROUND_COLOR_NAMES.has(v.name.toLowerCase())) continue;
        if (!merged.some((m) => m.name.toLowerCase() === v.name.toLowerCase())) {
          merged.push(v);
        }
      }
      if (variantNames.has("white") && !merged.some((m) => m.name.toLowerCase() === "white")) {
        const white = fromVariants.find((v) => v.name.toLowerCase() === "white");
        if (white) merged.push(white);
      }
      return filterBackgroundColorSwatches(dedupeColors(merged));
    }
    return filterBackgroundColorSwatches(fromImages);
  }

  if (fromVariants.length && fromImages.length) {
    return filterBackgroundColorSwatches(dedupeColors([...fromVariants, ...fromImages]));
  }
  return fromImages.length
    ? filterBackgroundColorSwatches(fromImages)
    : filterBackgroundColorSwatches(fromVariants);
}
