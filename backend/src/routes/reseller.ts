import express, { Response } from "express";
import mongoose from "mongoose";
import ResellerWall from "../data/models/ResellerWall";
import Product from "../data/models/Product";
import User from "../data/models/User";
import Store from "../data/models/Store";
import TVPost from "../data/models/TVPost";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { slugify } from "../utils/helpers";

const router = express.Router();

/** 24-char hex only — mongoose's ObjectId.isValid() wrongly accepts 12-char strings and can break $in queries. */
function strictObjectIdHex(s: string | null | undefined): string | null {
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  return /^[a-fA-F0-9]{24}$/.test(t) ? t : null;
}

/** Match ResellerWall by resellerId whether stored as ObjectId or string (avoids duplicate / missed rows). */
function resellerWallFilter(resellerId: mongoose.Types.ObjectId | string) {
  const hex = strictObjectIdHex(String(resellerId));
  if (!hex) return { resellerId };
  const oid = new mongoose.Types.ObjectId(hex);
  return { $or: [{ resellerId: oid }, { resellerId: hex }] };
}

/** Stable hex string for a wall product ref (ObjectId, populated doc, or string). */
function wallProductIdToHex(pid: unknown): string | null {
  if (pid == null) return null;
  if (typeof pid === "string") {
    return strictObjectIdHex(pid);
  }
  if (typeof pid === "object") {
    const o = pid as { _id?: unknown };
    if (o._id != null) {
      return strictObjectIdHex(String(o._id));
    }
  }
  try {
    return strictObjectIdHex(String(pid));
  } catch {
    return null;
  }
}

function isPopulatedProductDoc(pid: unknown): pid is Record<string, unknown> {
  return (
    typeof pid === "object" &&
    pid != null &&
    "_id" in pid &&
    typeof (pid as { title?: unknown }).title === "string"
  );
}

/** BSON-safe number (Decimal128 / legacy types from some imports). */
function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v != null && typeof v === "object" && typeof (v as { toString?: () => string }).toString === "function") {
    const n = parseFloat((v as { toString: () => string }).toString());
    if (Number.isFinite(n)) return n;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** JSON-safe product for API (avoids 500 from non-serializable lean docs). */
function sanitizeWallProduct(raw: any): any {
  if (!raw || typeof raw !== "object") return null;
  try {
    const id = raw._id != null ? String(raw._id) : undefined;
    let supplierId: unknown = raw.supplierId;
    if (supplierId && typeof supplierId === "object" && supplierId !== null && "storeName" in supplierId) {
      supplierId = { storeName: (supplierId as { storeName?: string }).storeName };
    } else if (supplierId != null && typeof supplierId === "object") {
      supplierId = { _id: String((supplierId as { _id?: unknown })._id ?? "") };
    }
    return {
      _id: id,
      title: String(raw.title ?? ""),
      slug: String(raw.slug ?? ""),
      images: Array.isArray(raw.images) ? raw.images.map((x: unknown) => String(x)) : [],
      price: coerceNumber(raw.price),
      discountPrice:
        raw.discountPrice != null && raw.discountPrice !== ""
          ? coerceNumber(raw.discountPrice)
          : undefined,
      currency: String(raw.currency ?? "ZAR"),
      allowResell: !!raw.allowResell,
      supplierId,
      supplierSource: raw.supplierSource,
      active: raw.active !== false,
    };
  } catch {
    return null;
  }
}

/** Same wall rows as /wall/me — include inactive products so reseller storefronts stay in sync. */
async function buildWallProductsResponse(resellerId: string) {
  try {
    const ridHex = strictObjectIdHex(resellerId);
    if (!ridHex) {
      return { resellerId, products: [] as any[], reseller: null as null | { name?: string; _id: unknown } };
    }
    const resellerOid = new mongoose.Types.ObjectId(ridHex);

    const wall = await ResellerWall.findOne(resellerWallFilter(resellerOid))
      .populate("products.productId")
      .lean();
    if (!wall) {
      return { resellerId, products: [] as any[], reseller: null as null | { name?: string; _id: unknown } };
    }

    const wallRows = wall.products as any[];
    const hexIds = [...new Set(wallRows.map((p) => wallProductIdToHex(p.productId)).filter(Boolean))] as string[];

    let products: any[] = [];
    try {
      products = await Product.find({ _id: { $in: hexIds } })
        .populate("supplierId", "storeName")
        .lean();
    } catch {
      for (const h of hexIds) {
        try {
          const one = await Product.findById(h).populate("supplierId", "storeName").lean();
          if (one) products.push(one);
        } catch {
          /* skip bad id */
        }
      }
    }

    const productMap = new Map<string, any>(products.map((p: any) => [String(p._id), p]));

    const missingHex = hexIds.filter((h) => !productMap.has(h));
    if (missingHex.length > 0) {
      await Promise.all(
        missingHex.map(async (h) => {
          try {
            const one = await Product.findById(h).populate("supplierId", "storeName").lean();
            if (one) productMap.set(String((one as any)._id), one);
          } catch {
            /* skip bad id */
          }
        })
      );
    }

    const wallProducts = wallRows
      .map((wp) => {
        const pid = wp.productId;
        const hex = wallProductIdToHex(pid);
        const raw =
          (hex ? productMap.get(hex) : null) ?? (isPopulatedProductDoc(pid) ? pid : null);
        const product = raw != null ? sanitizeWallProduct(raw) : null;
        const productIdOut = hex ?? (raw && (raw as any)._id != null ? String((raw as any)._id) : pid);
        return {
          productId: productIdOut != null ? String(productIdOut) : "",
          product,
          resellerCommissionPct: wp.resellerCommissionPct ?? 5,
          addedAt: wp.addedAt,
        };
      })
      .filter((wp) => wp.product != null);

    const reseller = await User.findById(resellerOid).select("name email").lean();
    return {
      resellerId: String(wall.resellerId),
      products: wallProducts.map((wp) => ({
        ...wp,
        addedAt:
          wp.addedAt instanceof Date
            ? wp.addedAt.toISOString()
            : wp.addedAt != null
              ? String(wp.addedAt)
              : undefined,
      })),
      reseller: reseller ? { name: reseller.name, _id: String((reseller as any)._id) } : null,
    };
  } catch (err) {
    console.error("[reseller] buildWallProductsResponse", err);
    return {
      resellerId,
      products: [] as any[],
      reseller: null as null | { name?: string; _id: unknown },
    };
  }
}

// Must be registered BEFORE /wall/:userId — otherwise "me" is captured as :userId and CastError breaks My Store.
router.get("/wall/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = String(req.user?._id ?? "");
    if (!strictObjectIdHex(uid)) {
      throw new AppError("Invalid session", 401);
    }
    const base = await buildWallProductsResponse(uid);
    const resellerId = String(base.resellerId ?? uid);
    const reseller = base.reseller
      ? { name: base.reseller.name, _id: String((base.reseller as { _id?: unknown })._id) }
      : { name: req.user!.name, _id: String(req.user!._id) };
    res.json({
      data: {
        resellerId,
        products: base.products ?? [],
        reseller,
      },
    });
  } catch (err) {
    console.error("[reseller] GET /wall/me", err);
    const uid = String(req.user?._id ?? "");
    if (err instanceof AppError) {
      return next(err);
    }
    res.json({
      data: {
        resellerId: uid,
        products: [],
        reseller: { name: req.user?.name ?? "", _id: uid },
      },
    });
  }
});

// Get reseller wall by userId (public)
router.get("/wall/:userId", async (req: express.Request, res: Response, next) => {
  try {
    const { userId } = req.params;
    const data = await buildWallProductsResponse(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// Add product to my reseller wall (auth). Body: resellerCommissionPct (3-7, default 5)
router.post("/wall/add/:productId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params;
    let resellerCommissionPct = 5;
    if (req.body?.resellerCommissionPct != null) {
      const val = Number(req.body.resellerCommissionPct);
      if (val < 3 || val > 7) throw new AppError("Reseller commission must be between 3% and 7%", 400);
      resellerCommissionPct = Math.round(val);
    }
    const product = await Product.findOne({ _id: productId, active: true })
      .populate("supplierId")
      .lean();
    if (!product) throw new AppError("Product not found", 404);
    if (!(product as any).allowResell) {
      throw new AppError("Product is not available for reselling", 400);
    }

    const supplierSource = (product as any).supplierSource;
    const isExternal = ["cj", "spocket", "eprolo"].includes(supplierSource);
    if (!isExternal) {
      const supplier = (product as any).supplierId;
      if (!supplier || (supplier as any).status !== "approved") {
        throw new AppError("Product supplier is not approved", 400);
      }
    }

    // Auto-create reseller store when user first adds a product to their wall
    let store = await Store.findOne({ userId: req.user!._id, type: "reseller" });
    if (!store) {
      const userDoc = await User.findById(req.user!._id).select("username name").lean();
      const username = (userDoc as any)?.username;
      // If user has a supplier store, reuse its name for consistency (avoid "My Store" + "obed store" confusion)
      const existingSupplierStore = await Store.findOne({ userId: req.user!._id, type: "supplier" }).lean();
      const baseName = existingSupplierStore?.name ?? (username ? `${username}'s Store` : "My Store");
      const baseSlug = username ? `${username}-store` : "my-store";
      let slug = slugify(baseSlug);
      let n = 1;
      while (await Store.findOne({ slug })) slug = `${slugify(baseSlug)}-${++n}`;
      store = await Store.create({
        userId: req.user!._id,
        name: baseName,
        slug,
        type: "reseller",
      });
    }

    let wall = await ResellerWall.findOne(resellerWallFilter(req.user!._id));
    if (!wall) wall = await ResellerWall.create({ resellerId: req.user!._id, products: [] });

    const exists = wall.products.some((p) => (p.productId as any).toString() === productId);
    if (exists) {
      if (!store) {
        const userDoc = await User.findById(req.user!._id).select("username name").lean();
        const username = (userDoc as any)?.username;
        const existingSupplierStore = await Store.findOne({ userId: req.user!._id, type: "supplier" }).lean();
        const baseName = existingSupplierStore?.name ?? (username ? `${username}'s Store` : "My Store");
        const baseSlug = username ? `${username}-store` : "my-store";
        let slug = slugify(baseSlug);
        let n = 1;
        while (await Store.findOne({ slug })) slug = `${slugify(baseSlug)}-${++n}`;
        await Store.create({
          userId: req.user!._id,
          name: baseName,
          slug,
          type: "reseller",
        });
      }
      return res.json({ message: "Product already on your wall", data: { products: wall.products } });
    }

    wall.products.push({ productId: product._id, resellerCommissionPct, addedAt: new Date() });
    await wall.save();

    // Create TV post so resold product appears on reseller's wall and in QwertyHub feed (without Resale button – it's the resold version)
    const existingPost = await TVPost.findOne({
      creatorId: req.user!._id,
      type: "product",
      productId: product._id,
      status: "approved",
    });
    if (!existingPost) {
      const images = product.images || [];
      await TVPost.create({
        creatorId: req.user!._id,
        type: "product",
        mediaUrls: images.length > 0 ? images : [],
        productId: product._id,
        caption: product.title || "Reselling product",
        status: "approved",
        fromResellerWall: true,
      }).catch(() => {});
    }

    res.json({ message: "Product added to your wall", data: { products: wall.products } });
  } catch (err) {
    next(err);
  }
});

// Remove product from my wall
router.delete("/wall/remove/:productId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params;
    const wall = await ResellerWall.findOne(resellerWallFilter(req.user!._id));
    if (!wall) throw new AppError("Wall not found", 404);

    wall.products = wall.products.filter((p) => (p.productId as any).toString() !== productId);
    await wall.save();

    // Remove TV post so resold product no longer appears on wall/feed
    await TVPost.deleteOne({
      creatorId: req.user!._id,
      type: "product",
      productId,
      status: "approved",
    }).catch(() => {});

    res.json({ message: "Product removed from wall", data: { products: wall.products } });
  } catch (err) {
    next(err);
  }
});

export default router;
