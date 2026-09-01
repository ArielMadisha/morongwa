import { Router, Request, Response } from "express";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import { buildPublicProductMatch, getApprovedSupplierIds } from "../services/publicProductListing";
import TVPost from "../data/models/TVPost";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { slugify } from "../utils/helpers";
import { upload } from "../middleware/upload";
import { inferTopCategoryForProduct, MARKETPLACE_TOP_CATEGORIES } from "../services/marketplaceCategoryClassifier";
import {
  coerceCreateProductCurrencyFields,
  mapProductsStripInrForApi,
  normalizeProductCurrencyInrToZarForApi,
} from "../utils/currencyPolicy";
import { enrichProductsWithStoreFields } from "../services/enrichProductStoreFields";
import {
  FOOD_CATEGORY,
  FOOD_HUB_EXCLUDED_CATEGORIES,
  isFoodMarketplaceCategory,
} from "../config/foodMarketplace";
import {
  adminMarkupPctForCategory,
  catalogListPriceFromSupplierBaseZar,
  getMarketplaceCategoryMarkup,
} from "../config/marketplaceCategoryMarkups";
import { normalizeBulkTierMaxQty } from "../config/bulkTierLimits";
import {
  encodeUploadsPublicPath,
  normalizeProductImageUrls,
  uploadsPathFromFilename,
} from "../utils/uploadFilePath";
import { resolveSupplierForProductUpload } from "../utils/supplierAccess";
import { resolveSupplierStoreCurrency } from "../utils/storeProductCurrency";
import { assignProductColors, ensureProductColors } from "../services/assignProductColors";
import { resolveWarehouseFreeLocalForSupplier } from "../services/warehouseLocalDelivery";
import { resolveFreeShippingFieldsForCreate } from "../services/productFreeShipping";
import Store from "../data/models/Store";
import { bumpStatusStripCache } from "../services/statusStripPolicy";
import { normalizeProductSizes } from "../utils/productSizeTypes";

const router = Router();

function withEncodedProductImages<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((p) => ({
    ...p,
    images: normalizeProductImageUrls(p.images),
  }));
}
const DEFAULT_PRODUCT_CATEGORY = "Home, Garden & Furniture";

function normalizePublicProductCategories(input: unknown, productForInference?: { title?: unknown; description?: unknown; tags?: unknown }): string[] {
  const raw = Array.isArray(input) ? input : [];
  const cleaned = raw
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => v.toLowerCase() !== "local")
    .filter((v, idx, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === idx)
    .filter((v) => MARKETPLACE_TOP_CATEGORIES.some((c) => c.toLowerCase() === v.toLowerCase()));
  if (cleaned.length > 0) return [cleaned[0]];
  const inferred = productForInference ? inferTopCategoryForProduct(productForInference) : null;
  return [inferred || DEFAULT_PRODUCT_CATEGORY];
}

/**
 * POST /api/products/upload-images
 * Upload 1–10 product images (auth, verified supplier). Returns { urls: string[] }.
 */
router.post(
  "/upload-images",
  authenticate,
  upload.array("images", 10),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const supplierIdQ = String(req.query.supplierId || req.body?.supplierId || "").trim();
      const supplier = await resolveSupplierForProductUpload(req.user!._id, supplierIdQ || undefined);
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files?.length) throw new AppError("At least one image is required (max 10).", 400);
      if (files.length > 10) throw new AppError("Maximum 10 images allowed.", 400);
      const nonImage = files.find((f) => !f.mimetype?.startsWith("image/"));
      if (nonImage) throw new AppError("All files must be images (e.g. JPEG, PNG, GIF, WebP).", 400);
      const urls = files.map((f) => encodeUploadsPublicPath(uploadsPathFromFilename(f.filename)));
      res.status(201).json({ urls });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/products
 * List products (from approved suppliers only). Query: limit, random (1 = random sample for landing).
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string)?.trim();
    const foodCategoryQuery = isFoodMarketplaceCategory(category);
    const limit = Math.min(
      parseInt(req.query.limit as string, 10) || 20,
      foodCategoryQuery ? 300 : 50
    );
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const random = req.query.random === "1" || req.query.random === "true";
    const q = (req.query.q as string)?.trim();
    const warehouseCity = String(req.query.warehouseCity || req.query.warehouse || "")
      .trim()
      .toLowerCase();

    const approvedSupplierIds = await getApprovedSupplierIds();

    let match: Record<string, unknown>;
    if (q && q.length >= 2) {
      match = {
        active: true,
        $or: [
          { title: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
          { categories: { $in: [new RegExp(q, "i")] } },
          { tags: { $in: [new RegExp(q, "i")] } },
        ],
      };
    } else {
      const base = buildPublicProductMatch(approvedSupplierIds);
      if (!base || !((base.$or as unknown[])?.length)) {
        return res.json({ data: [], count: 0 });
      }
      match = base;
    }
    if (category) {
      match = {
        ...match,
        categories: { $in: [new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")] },
      };
    } else {
      // QwertyHub feed: never mix Food & Restaurant / kota menu into the product grid.
      match = {
        ...match,
        categories: { $not: new RegExp(`^${FOOD_CATEGORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      };
    }
    if (warehouseCity) {
      // e.g. warehouseCity=hammanskraal → Qwertymates Hammanskraal warehouse free-local products
      match = {
        ...match,
        warehouseFreeLocalCity: { $regex: warehouseCity.replace(/[^a-z0-9]/gi, ""), $options: "i" },
      };
    }

    const query = Product.find(match)
      .select("title slug description images price discountPrice bulkTiers currency stock outOfStock categories tags sku availableCountries ratingAvg ratingCount supplierSource allowResell supplierId createdAt freeShippingEnabled freeShippingAreas colors sizes warehouseFreeLocalCity warehouseFreeLocalCountry")
      .populate("supplierId", "storeName userId")
      .lean();

    if (random) {
      const all = await query.limit(limit * 3).exec(); // fetch extra then sample
      const shuffled = all.sort(() => Math.random() - 0.5);
      const enriched = await enrichProductsWithStoreFields(shuffled.slice(0, limit) as Record<string, unknown>[]);
      const data = withEncodedProductImages(
        mapProductsStripInrForApi(enriched as Record<string, unknown>[]) as Record<string, unknown>[]
      );
      return res.json({ data, count: data.length });
    }

    const total = await Product.countDocuments(match);
    const raw = await query.sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
    const enriched = await enrichProductsWithStoreFields(raw as Record<string, unknown>[]);
    const data = withEncodedProductImages(
      mapProductsStripInrForApi(enriched as Record<string, unknown>[]) as Record<string, unknown>[]
    );
    const hasMore = skip + data.length < total;
    res.json({ data, count: data.length, page, limit, total, hasMore });
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ error: true, message: "Failed to list products" });
  }
});

/**
 * GET /api/products/categories
 * List unique product categories for active public products.
 */
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const approvedSupplierIds = await getApprovedSupplierIds();
    const publicMatch = buildPublicProductMatch(approvedSupplierIds);
    if (!publicMatch) {
      return res.json({ data: [] });
    }
    const categories = await Product.aggregate([
      { $match: { ...publicMatch, categories: { $exists: true, $ne: [] } } },
      { $unwind: "$categories" },
      { $project: { c: { $trim: { input: "$categories" } } } },
      { $match: { c: { $ne: "" } } },
      { $match: { c: { $not: /^local$/i } } },
      {
        $match: {
          $expr: {
            $not: {
              $in: [
                { $toLower: "$c" },
                FOOD_HUB_EXCLUDED_CATEGORIES.map((x) => x.toLowerCase()),
              ],
            },
          },
        },
      },
      { $group: { _id: { $toLower: "$c" }, label: { $first: "$c" }, count: { $sum: 1 } } },
      { $sort: { count: -1, label: 1 } },
      { $limit: 50 },
      { $project: { _id: 0, name: "$label", count: 1 } },
    ]);
    res.json({ data: categories });
  } catch (err) {
    console.error("GET /api/products/categories error:", err);
    res.status(500).json({ error: true, message: "Failed to list categories" });
  }
});

/**
 * GET /api/products/:id
 * Single product by ID or slug (only from approved suppliers).
 */
router.get("/:idOrSlug", async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);

    const approvedSupplierIds = await getApprovedSupplierIds();
    const baseQuery = buildPublicProductMatch(approvedSupplierIds);
    if (!baseQuery || !((baseQuery.$or as unknown[])?.length)) {
      return res.status(404).json({ error: true, message: "Product not found" });
    }

    const query = isMongoId
      ? Product.findOne({ _id: idOrSlug, ...baseQuery })
      : Product.findOne({ slug: idOrSlug, ...baseQuery });

    const product = await query
      .populate("supplierId", "storeName status shippingCost")
      .lean()
      .exec();

    if (!product) {
      return res.status(404).json({ error: true, message: "Product not found" });
    }

    const DEFAULT_SHIPPING = 100;
    const src = (product as any).supplierSource;
    const isExternal = src && ["cj", "spocket", "eprolo"].includes(src);
    let estimatedShipping: number | null;
    let shippingNote = "Shipping is calculated at checkout.";
    if (isExternal) {
      const extId = (product as any).externalSupplierId;
      if (extId) {
        const ExternalSupplier = (await import("../data/models/ExternalSupplier")).default;
        const ext = await ExternalSupplier.findById(extId).select("shippingCost").lean();
        const configured = Number((ext as any)?.shippingCost);
        if (Number.isFinite(configured) && configured >= 0 && src !== "cj") {
          estimatedShipping = configured;
          shippingNote = "Estimated from supplier tariff. Final shipping is confirmed at checkout.";
        } else {
          estimatedShipping = null;
          shippingNote = "Shipping is calculated at checkout from live courier/supplier rates.";
        }
      } else {
        estimatedShipping = null;
        shippingNote = "Shipping is calculated at checkout from live courier/supplier rates.";
      }
    } else {
      estimatedShipping = ((product as any).supplierId as any)?.shippingCost ?? DEFAULT_SHIPPING;
      shippingNote = "Estimated from supplier tariff. Final shipping is confirmed at checkout.";
    }

    const normalized = normalizeProductCurrencyInrToZarForApi(
      product as Record<string, unknown>
    ) as typeof product;
    const [enriched] = await enrichProductsWithStoreFields([normalized as Record<string, unknown>]);
    const row = (enriched ?? normalized) as Record<string, unknown>;
    const colors = await ensureProductColors({
      _id: row._id,
      images: row.images as string[] | undefined,
      externalData: row.externalData as Record<string, unknown> | undefined,
      colors: row.colors as any,
      colorsManual: !!(row as any).colorsManual,
    });
    res.json({
      data: {
        ...row,
        images: normalizeProductImageUrls(row.images),
        colors: colors.length ? colors : row.colors,
        sizes: normalizeProductSizes(row.sizes as string[] | undefined),
        estimatedShipping,
        shippingNote,
      },
    });
  } catch (err) {
    console.error("GET /api/products/:id error:", err);
    res.status(500).json({ error: true, message: "Failed to get product" });
  }
});

/**
 * POST /api/products
 * Create product (verified suppliers only).
 * Body: title, description?, images?, **price** = supplier base in store currency (ZAR, BWP, …),
 * discountPrice? = optional sale base (must be below base), bulk tier prices in same currency.
 * Currency defaults from supplier store country (e.g. BW → BWP for The P100 Store).
 * Stored `price` is catalog list in that currency after category admin % markup.
 */
router.post("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = req.body as {
      supplierId?: string;
      title: string;
      description?: string;
      images?: string[];
      price: number;
      discountPrice?: number;
      bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
      currency?: string;
      stock?: number;
      outOfStock?: boolean;
      sku?: string;
      sizes?: string[];
      allowResell?: boolean;
      categories?: string[];
      tags?: string[];
      availableCountries?: string[];
      freeShippingEnabled?: boolean;
      freeShippingAreas?: Array<{ countryCode: string; locality: string }>;
    };
    const supplier = await resolveSupplierForProductUpload(
      req.user!._id,
      body.supplierId ? String(body.supplierId).trim() : undefined
    );
    const { title, price } = body;
    if (!title || title.trim() === "" || price == null || Number(price) < 0) {
      throw new AppError("title and price are required", 400);
    }
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length < 1) throw new AppError("At least one product image is required (max 10).", 400);
    if (images.length > 10) throw new AppError("Maximum 10 product images allowed.", 400);
    let slug = slugify(title.trim());
    let n = 1;
    while (await Product.findOne({ slug })) slug = `${slugify(title.trim())}-${++n}`;
    const discountPrice = body.discountPrice != null ? Number(body.discountPrice) : undefined;
    const bulkTiers = Array.isArray(body.bulkTiers)
      ? body.bulkTiers
          .filter((t) => t != null && Number(t.minQty) >= 0 && Number(t.price) >= 0)
          .map((t) => {
            const minQty = Number(t.minQty);
            return {
              minQty,
              maxQty: normalizeBulkTierMaxQty(Number(t.maxQty), minQty),
              price: Number(t.price),
            };
          })
          .filter((t) => t.maxQty >= t.minQty)
      : undefined;
    const storeCurrency = await resolveSupplierStoreCurrency(supplier._id);
    const coerced = coerceCreateProductCurrencyFields({
      currency: body.currency || storeCurrency,
      price: Number(price),
      ...(discountPrice != null ? { discountPrice } : {}),
      ...(bulkTiers && bulkTiers.length > 0 ? { bulkTiers } : {}),
    });

    const categories = normalizePublicProductCategories(body.categories, {
      title: title.trim(),
      description: body.description,
      tags: body.tags,
    });
    const topCategory = categories[0] || DEFAULT_PRODUCT_CATEGORY;
    const adminPct = adminMarkupPctForCategory(topCategory);
    const mkRule = getMarketplaceCategoryMarkup(topCategory);
    const allowResell = body.allowResell != null ? !!body.allowResell : true;

    const baseMain = coerced.price;
    const listPrice = catalogListPriceFromSupplierBaseZar(baseMain, topCategory);

    let listDiscount: number | undefined;
    if (
      coerced.discountPrice != null &&
      coerced.discountPrice > 0 &&
      coerced.discountPrice < baseMain
    ) {
      const ld = catalogListPriceFromSupplierBaseZar(coerced.discountPrice, topCategory);
      if (ld < listPrice) listDiscount = ld;
    }

    const listBulkTiers =
      coerced.bulkTiers && coerced.bulkTiers.length > 0
        ? coerced.bulkTiers.map((t) => ({
            minQty: Number(t.minQty),
            maxQty: Number(t.maxQty),
            price: catalogListPriceFromSupplierBaseZar(Number(t.price), topCategory),
          }))
        : undefined;

    const markupFields: {
      qwertymatesMarkupPct: number;
      minResalePrice?: number;
      recommendedResellerPrice?: number;
      resellerMarginPct?: number;
    } = { qwertymatesMarkupPct: adminPct };
    if (allowResell && mkRule) {
      const mid = (mkRule.resellerMinPct + mkRule.resellerMaxPct) / 2;
      markupFields.minResalePrice = Math.round(listPrice * (1 + mkRule.resellerMinPct / 100) * 100) / 100;
      markupFields.recommendedResellerPrice = Math.round(listPrice * (1 + mid / 100) * 100) / 100;
      markupFields.resellerMarginPct = Math.round(mid * 10) / 10;
    }

    const linkedStore = supplier.linkedStoreId
      ? await Store.findById(supplier.linkedStoreId).select("name").lean()
      : await Store.findOne({ supplierId: supplier._id, type: "supplier" }).select("name").lean();
    const warehouseFreeLocal = resolveWarehouseFreeLocalForSupplier({
      storeName: supplier.storeName,
      linkedStoreName: linkedStore?.name,
    });
    let freeShippingFields: ReturnType<typeof resolveFreeShippingFieldsForCreate>;
    try {
      freeShippingFields = resolveFreeShippingFieldsForCreate(body, warehouseFreeLocal);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "Invalid free shipping areas", 400);
    }

    const product = await Product.create({
      supplierId: supplier._id,
      title: title.trim(),
      slug,
      description: body.description?.trim(),
      images,
      price: listPrice,
      ...(listDiscount != null && { discountPrice: listDiscount }),
      ...(listBulkTiers && listBulkTiers.length > 0 && { bulkTiers: listBulkTiers }),
      currency: coerced.currency,
      stock: body.stock != null ? Number(body.stock) : 0,
      outOfStock: body.outOfStock != null ? !!body.outOfStock : false,
      sku: body.sku?.trim(),
      sizes: normalizeProductSizes(Array.isArray(body.sizes) ? body.sizes : []),
      allowResell,
      categories,
      tags: Array.isArray(body.tags) ? body.tags : [],
      availableCountries: Array.isArray(body.availableCountries) ? body.availableCountries.filter(Boolean) : [],
      ...freeShippingFields,
      active: true,
      ...markupFields,
    });
    // Auto-create TVPost so product appears on wall feed (default home page)
    await TVPost.create({
      creatorId: supplier.userId,
      type: "product",
      mediaUrls: images,
      productId: product._id,
      caption: title.trim(),
      status: "approved",
    }).catch(() => {});
    void assignProductColors(String(product._id), { images }).catch(() => {});
    bumpStatusStripCache();
    const { queueFacebookPostForProduct } = await import("../services/facebookMarketplacePostService");
    queueFacebookPostForProduct(String(product._id), "supplier-create");
    res.status(201).json({ message: "Product created", data: product });
  } catch (err) {
    next(err);
  }
});

export default router;
