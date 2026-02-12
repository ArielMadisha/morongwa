import { Router, Request, Response } from "express";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
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
    const random = req.query.random === "1" || req.query.random === "true";

    const approvedSupplierIds = await Supplier.find({ status: "approved" })
      .select("_id")
      .lean()
      .then((docs) => docs.map((d) => d._id));

    if (approvedSupplierIds.length === 0) {
      return res.json({ data: [], count: 0 });
    }

    let query = Product.find({
      supplierId: { $in: approvedSupplierIds },
      active: true,
    })
      .select("title slug description images price discountPrice currency stock outOfStock categories tags ratingAvg ratingCount")
      .populate("supplierId", "storeName")
      .lean();

    if (random) {
      const all = await query.limit(limit * 3).exec(); // fetch extra then sample
      const shuffled = all.sort(() => Math.random() - 0.5);
      const data = shuffled.slice(0, limit);
      return res.json({ data, count: data.length });
    }

    const data = await query.sort({ createdAt: -1 }).limit(limit).exec();
    res.json({ data, count: data.length });
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ error: true, message: "Failed to list products" });
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

    const approvedSupplierIds = await Supplier.find({ status: "approved" })
      .select("_id")
      .lean()
      .then((docs) => docs.map((d) => d._id));

    const baseQuery = {
      active: true,
      supplierId: { $in: approvedSupplierIds },
    };

    const query = isMongoId
      ? Product.findOne({ _id: idOrSlug, ...baseQuery })
      : Product.findOne({ slug: idOrSlug, ...baseQuery });

    const product = await query
      .populate("supplierId", "storeName status")
      .lean()
      .exec();

    if (!product) {
      return res.status(404).json({ error: true, message: "Product not found" });
    }

    res.json({ data: product });
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
      currency?: string;
      stock?: number;
      outOfStock?: boolean;
      sku?: string;
      sizes?: string[];
      allowResell?: boolean;
      categories?: string[];
      tags?: string[];
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
    const product = await Product.create({
      supplierId: supplier._id,
      title: title.trim(),
      slug,
      description: body.description?.trim(),
      images,
      price: Number(price),
      ...(discountPrice != null && discountPrice >= 0 && discountPrice < Number(price) && { discountPrice }),
      currency: body.currency || "ZAR",
      stock: body.stock != null ? Number(body.stock) : 0,
      outOfStock: body.outOfStock != null ? !!body.outOfStock : false,
      sku: body.sku?.trim(),
      sizes: Array.isArray(body.sizes) ? body.sizes : [],
      allowResell: body.allowResell != null ? !!body.allowResell : true,
      categories: Array.isArray(body.categories) ? body.categories : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      active: true,
    });
    res.status(201).json({ message: "Product created", data: product });
  } catch (err) {
    next(err);
  }
});

export default router;
