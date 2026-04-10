import { Router, Request, Response } from "express";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import { buildPublicProductMatch, getApprovedSupplierIds } from "../services/publicProductListing";
import TVPost from "../data/models/TVPost";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { slugify } from "../utils/helpers";
import { upload } from "../middleware/upload";

const router = Router();

/**
 * POST /api/products/upload-images
 * Upload 1–5 product images (auth, verified supplier). Returns { urls: string[] }.
 */
router.post(
  "/upload-images",
  authenticate,
  upload.array("images", 5),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const supplier = await Supplier.findOne({ userId: req.user!._id, status: "approved" });
      if (!supplier) throw new AppError("Only verified suppliers can upload product images.", 403);
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files?.length) throw new AppError("At least one image is required (max 5).", 400);
      if (files.length > 5) throw new AppError("Maximum 5 images allowed.", 400);
      const nonImage = files.find((f) => !f.mimetype?.startsWith("image/"));
      if (nonImage) throw new AppError("All files must be images (e.g. JPEG, PNG, GIF, WebP).", 400);
      const baseRaw = process.env.API_URL || `${req.protocol}://${req.get("host")}`;
      const base = baseRaw.replace(/\/api\/?$/, "").replace(/\/$/, "");
      const urls = files.map((f) => `${base}/uploads/${f.filename}`);
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
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const random = req.query.random === "1" || req.query.random === "true";
    const q = (req.query.q as string)?.trim();
    const category = (req.query.category as string)?.trim();

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
        categories: { $in: [new RegExp(`^${category}$`, "i")] },
      };
    }

    const query = Product.find(match)
      .select("title slug description images price discountPrice bulkTiers currency stock outOfStock categories tags availableCountries ratingAvg ratingCount supplierSource allowResell")
      .populate("supplierId", "storeName")
      .lean();

    if (random) {
      const all = await query.limit(limit * 3).exec(); // fetch extra then sample
      const shuffled = all.sort(() => Math.random() - 0.5);
      const data = shuffled.slice(0, limit);
      return res.json({ data, count: data.length });
    }

    const total = await Product.countDocuments(match);
    const data = await query.sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
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
    const categories = await Product.aggregate([
      { $match: { active: true, categories: { $exists: true, $ne: [] } } },
      { $unwind: "$categories" },
      { $project: { c: { $trim: { input: "$categories" } } } },
      { $match: { c: { $ne: "" } } },
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

    res.json({
      data: {
        ...product,
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
 * Create product (verified suppliers only). Body: title, description?, images?, price, currency?, stock?, sku?, allowResell?, commissionPct?, categories?, tags?
 */
router.post("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findOne({ userId: req.user!._id, status: "approved" });
    if (!supplier) throw new AppError("Only verified suppliers can add products. Apply to become a supplier first.", 403);
    const body = req.body as {
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
    };
    const { title, price } = body;
    if (!title || title.trim() === "" || price == null || Number(price) < 0) {
      throw new AppError("title and price are required", 400);
    }
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length < 1) throw new AppError("At least one product image is required (max 5).", 400);
    if (images.length > 5) throw new AppError("Maximum 5 product images allowed.", 400);
    let slug = slugify(title.trim());
    let n = 1;
    while (await Product.findOne({ slug })) slug = `${slugify(title.trim())}-${++n}`;
    const discountPrice = body.discountPrice != null ? Number(body.discountPrice) : undefined;
    const bulkTiers = Array.isArray(body.bulkTiers)
      ? body.bulkTiers
          .filter((t) => t != null && Number(t.minQty) >= 0 && Number(t.maxQty) >= Number(t.minQty) && Number(t.price) >= 0)
          .map((t) => ({ minQty: Number(t.minQty), maxQty: Number(t.maxQty), price: Number(t.price) }))
      : undefined;
    const product = await Product.create({
      supplierId: supplier._id,
      title: title.trim(),
      slug,
      description: body.description?.trim(),
      images,
      price: Number(price),
      ...(discountPrice != null && discountPrice >= 0 && discountPrice < Number(price) && { discountPrice }),
      ...(bulkTiers && bulkTiers.length > 0 && { bulkTiers }),
      currency: body.currency || "ZAR",
      stock: body.stock != null ? Number(body.stock) : 0,
      outOfStock: body.outOfStock != null ? !!body.outOfStock : false,
      sku: body.sku?.trim(),
      sizes: Array.isArray(body.sizes) ? body.sizes : [],
      allowResell: body.allowResell != null ? !!body.allowResell : true,
      categories: Array.isArray(body.categories) ? body.categories : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      availableCountries: Array.isArray(body.availableCountries) ? body.availableCountries.filter(Boolean) : [],
      active: true,
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
    res.status(201).json({ message: "Product created", data: product });
  } catch (err) {
    next(err);
  }
});

export default router;
