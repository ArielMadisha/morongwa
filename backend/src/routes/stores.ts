import express, { Response } from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Store from "../data/models/Store";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { applyStoreUpdates } from "../utils/applyStoreUpdates";
import { upload } from "../middleware/upload";
import { moderateMedia } from "../services/contentModeration";
import { buildWallProductsResponse } from "./reseller";
import { linkSupplierStore } from "../utils/ensureSupplierForStore";
import { searchPublicStores } from "../services/storeSearch";

const router = express.Router();

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapSupplierProductForStorefront(raw: Record<string, unknown>) {
  const id = raw._id != null ? String(raw._id) : "";
  return {
    productId: id,
    product: {
      _id: id,
      title: String(raw.title ?? ""),
      slug: String(raw.slug ?? ""),
      images: Array.isArray(raw.images) ? raw.images.map((x) => String(x)) : [],
      price: coerceNumber(raw.price),
      discountPrice:
        raw.discountPrice != null && raw.discountPrice !== ""
          ? coerceNumber(raw.discountPrice)
          : undefined,
      currency: String(raw.currency ?? "ZAR"),
      allowResell: !!raw.allowResell,
      stock: raw.stock != null ? coerceNumber(raw.stock) : undefined,
      outOfStock: !!raw.outOfStock,
      categories: Array.isArray(raw.categories) ? raw.categories.map((x) => String(x)) : [],
    },
    resellerCommissionPct: 0,
  };
}

/** Products for a specific storefront — supplier catalog or reseller wall. */
async function buildStoreProductsResponse(store: {
  _id: unknown;
  userId: unknown;
  type: string;
  supplierId?: unknown;
  name?: string;
}) {
  const ownerId =
    store.userId && typeof store.userId === "object" && (store.userId as { _id?: unknown })._id
      ? String((store.userId as { _id: unknown })._id)
      : String(store.userId ?? "");

  if (store.type === "reseller") {
    const wall = await buildWallProductsResponse(ownerId);
    return { products: wall.products ?? [], storeType: "reseller" as const };
  }

  let supplierOid: mongoose.Types.ObjectId | null = null;
  const rawSid = store.supplierId;
  if (rawSid) {
    const sid =
      typeof rawSid === "object" && rawSid !== null && "_id" in rawSid
        ? String((rawSid as { _id: unknown })._id)
        : String(rawSid);
    if (mongoose.Types.ObjectId.isValid(sid)) {
      supplierOid = new mongoose.Types.ObjectId(sid);
    }
  }

  if (!supplierOid) {
    const storeDoc = await Store.findById(store._id);
    if (storeDoc) {
      const { supplier } = await linkSupplierStore(storeDoc);
      supplierOid = supplier._id as mongoose.Types.ObjectId;
    }
  }

  if (!supplierOid) {
    return { products: [] as ReturnType<typeof mapSupplierProductForStorefront>[], storeType: "supplier" as const };
  }

  const supplier = await Supplier.findById(supplierOid).select("status storeName").lean();
  if (!supplier || supplier.status !== "approved") {
    return { products: [] as ReturnType<typeof mapSupplierProductForStorefront>[], storeType: "supplier" as const };
  }

  const products = await Product.find({ supplierId: supplierOid, active: true })
    .select("title slug images price discountPrice currency allowResell categories stock outOfStock createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return {
    products: products.map((p) => mapSupplierProductForStorefront(p as Record<string, unknown>)),
    storeType: "supplier" as const,
  };
}

/** GET /api/stores/search – public storefront search (MacGyver + /search page) */
router.get("/search", async (req: express.Request, res: Response, next) => {
  try {
    const q = (req.query.q as string)?.trim() || "";
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 40);
    const data = await searchPublicStores(q, limit);
    res.json({ data, count: data.length });
  } catch (err) {
    next(err);
  }
});

/** GET /api/stores/me – list current user's stores */
router.get("/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const stores = await Store.find({ userId: req.user!._id })
      .populate("supplierId", "storeName status")
      .lean();
    res.json({ data: stores });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/stores/:id – update store (owner only). Fields: name, address, email, cellphone, whatsapp, stripBackgroundPic */
router.put("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const body = req.body as {
      name?: string;
      country?: string;
      countryCode?: string;
      address?: string;
      email?: string;
      cellphone?: string;
      whatsapp?: string;
      stripBackgroundPic?: string;
      vertical?: string;
    };
    const store = await Store.findOne({ _id: id, userId: req.user!._id });
    if (!store) throw new AppError("Store not found", 404);

    try {
      await applyStoreUpdates(store, body);
    } catch (e) {
      const msg = (e as Error)?.message || "Invalid store update";
      throw new AppError(msg, 400);
    }
    res.json({ message: "Store updated", data: store });
  } catch (err) {
    next(err);
  }
});

/** POST /api/stores/:id/strip-background – upload strip background image (owner only) */
router.post(
  "/:id/strip-background",
  authenticate,
  upload.single("image"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { id } = req.params;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file || !file.mimetype?.startsWith("image/")) {
        throw new AppError("A valid image file is required", 400);
      }
      const filePath = (file as any).path || path.join(__dirname, "../../uploads", file.filename);
      const mod = await moderateMedia(filePath, file.mimetype);
      if (!mod.safe || mod.sensitive) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
        throw new AppError(
          mod.reason || "Image rejected. Nudity or suggestive content is not allowed.",
          400
        );
      }
      const store = await Store.findOne({ _id: id, userId: req.user!._id });
      if (!store) throw new AppError("Store not found", 404);
      const baseRaw = process.env.API_URL || `${req.protocol}://${req.get("host")}`;
      const base = baseRaw.replace(/\/api\/?$/, "").replace(/\/$/, "");
      const url = `${base}/uploads/${file.filename}`;
      store.stripBackgroundPic = url;
      await store.save();
      res.status(201).json({ url, data: store });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/stores/by-slug/:slug/products – public products for this storefront */
router.get("/by-slug/:slug/products", async (req: express.Request, res: Response, next) => {
  try {
    const store = await Store.findOne({ slug: req.params.slug })
      .populate("userId", "name")
      .populate("supplierId", "storeName status")
      .lean();
    if (!store) return res.status(404).json({ error: true, message: "Store not found" });
    const payload = await buildStoreProductsResponse(store);
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
});

/** GET /api/stores/by-slug/:slug – public store by slug (for store page) */
router.get("/by-slug/:slug", async (req: express.Request, res: Response, next) => {
  try {
    const store = await Store.findOne({ slug: req.params.slug })
      .populate("userId", "name")
      .populate("supplierId", "storeName status")
      .lean();
    if (!store) return res.status(404).json({ error: true, message: "Store not found" });
    res.json({ data: store });
  } catch (err) {
    next(err);
  }
});

export default router;
