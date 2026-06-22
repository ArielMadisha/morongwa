import Product from "../data/models/Product";
import {
  buildProductColorOptions,
  colorsLookLikeBackgroundMisdetect,
  colorsLookUnderDetected,
  filterBackgroundColorSwatches,
} from "./productColorDetection";
import {
  adminColorsCoverAllImages,
  normalizeAdminProductColors,
  type ProductColorOption,
} from "../utils/productColorTypes";

/** Detect and persist colors on a product document (create/import/update). */
export async function assignProductColors(
  productId: string,
  opts?: {
    images?: string[];
    externalData?: Record<string, unknown> | null;
    force?: boolean;
    adminColors?: ProductColorOption[] | null;
    colorsManual?: boolean;
  }
): Promise<ProductColorOption[]> {
  const product = await Product.findById(productId)
    .select("images externalData colors colorsManual")
    .lean();
  if (!product) return [];

  const existing = Array.isArray((product as any).colors) ? (product as any).colors : [];
  const images = opts?.images ?? (product as any).images ?? [];
  const colorsManual = opts?.colorsManual ?? !!(product as any).colorsManual;

  if (colorsManual && !opts?.force) {
    return existing.length ? (existing as ProductColorOption[]) : [];
  }

  const adminColors = opts?.adminColors ?? null;
  if (adminColors?.length && adminColorsCoverAllImages(adminColors, images.length)) {
    await Product.updateOne(
      { _id: productId },
      { $set: { colors: adminColors, colorsManual: true } }
    );
    return adminColors;
  }

  const shouldRedetect =
    opts?.force ||
    (existing.length > 0 && colorsLookLikeBackgroundMisdetect(existing as ProductColorOption[])) ||
    (existing.length > 0 && colorsLookUnderDetected(existing as ProductColorOption[], images.length));
  if (existing.length > 0 && !shouldRedetect && !adminColors?.length) {
    return existing as ProductColorOption[];
  }

  const externalData = opts?.externalData ?? ((product as any).externalData as Record<string, unknown> | undefined);
  const detected = await buildProductColorOptions({ images, externalData });
  if (detected.length === 0) {
    if (adminColors?.length) {
      await Product.updateOne({ _id: productId }, { $set: { colors: adminColors, colorsManual: false } });
      return adminColors;
    }
    if (shouldRedetect && existing.length > 0) {
      const cleaned = filterBackgroundColorSwatches(existing as ProductColorOption[]);
      if (cleaned.length) {
        await Product.updateOne({ _id: productId }, { $set: { colors: cleaned, colorsManual: false } });
        return cleaned;
      }
    }
    return existing.length ? (existing as ProductColorOption[]) : [];
  }

  let merged: ProductColorOption[];
  if (adminColors?.length && !adminColorsCoverAllImages(adminColors, images.length)) {
    merged = mergeAdminPartialColors(detected, adminColors);
  } else if (opts?.force || shouldRedetect) {
    merged = detected;
  } else if (existing.length > 0) {
    merged = mergeDetectedWithExisting(detected, existing as ProductColorOption[]);
  } else {
    merged = detected;
  }

  if (adminColors?.length) {
    merged = mergeAdminPartialColors(merged, adminColors);
  }

  await Product.updateOne({ _id: productId }, { $set: { colors: merged, colorsManual: false } });
  return merged;
}

function mergeAdminPartialColors(
  detected: ProductColorOption[],
  adminColors: ProductColorOption[]
): ProductColorOption[] {
  const byIndex = new Map<number, ProductColorOption>();
  for (const opt of detected) byIndex.set(opt.imageIndex, opt);
  for (const opt of adminColors) byIndex.set(opt.imageIndex, opt);
  return filterBackgroundColorSwatches([...byIndex.values()].sort((a, b) => a.imageIndex - b.imageIndex));
}

function mergeDetectedWithExisting(
  detected: ProductColorOption[],
  existing: ProductColorOption[]
): ProductColorOption[] {
  const merged = filterBackgroundColorSwatches([...detected]);
  const coveredIndices = new Set(merged.map((c) => c.imageIndex));
  const names = new Set(merged.map((c) => c.name.toLowerCase()));
  for (const prev of existing) {
    if (coveredIndices.has(prev.imageIndex)) continue;
    const n = prev.name.toLowerCase();
    if (names.has(n)) continue;
    if (!filterBackgroundColorSwatches([prev]).length) continue;
    if (prev.imageIndex > 0) {
      merged.push(prev);
      names.add(n);
      coveredIndices.add(prev.imageIndex);
    }
  }
  return filterBackgroundColorSwatches(merged);
}

/** Lazy backfill when serving a product with images but no colors yet (or bad background swatches). */
export async function ensureProductColors(product: {
  _id?: unknown;
  images?: string[];
  externalData?: Record<string, unknown> | null;
  colors?: ProductColorOption[] | null;
  colorsManual?: boolean;
}): Promise<ProductColorOption[]> {
  const existing = Array.isArray(product.colors) ? product.colors : [];
  if (product.colorsManual) return existing;
  const needsFix =
    existing.length === 0 ||
    colorsLookLikeBackgroundMisdetect(existing) ||
    colorsLookUnderDetected(existing, product.images?.length ?? 0);
  if (!needsFix) return existing;
  if (!product._id || !Array.isArray(product.images) || product.images.length === 0) {
    return existing;
  }
  try {
    return await assignProductColors(String(product._id), {
      images: product.images,
      externalData: product.externalData,
      force: existing.length > 0,
    });
  } catch (err) {
    console.warn("ensureProductColors failed:", (err as Error)?.message || err);
    return existing;
  }
}

export { normalizeAdminProductColors, adminColorsCoverAllImages };
