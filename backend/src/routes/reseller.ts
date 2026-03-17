import express, { Response } from "express";
import ResellerWall from "../data/models/ResellerWall";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import User from "../data/models/User";
import Store from "../data/models/Store";
import TVPost from "../data/models/TVPost";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { slugify } from "../utils/helpers";

const router = express.Router();

// Get reseller wall by userId (public)
router.get("/wall/:userId", async (req: express.Request, res: Response, next) => {
  try {
    const { userId } = req.params;
    const wall = await ResellerWall.findOne({ resellerId: userId })
      .populate("products.productId")
      .lean();
    if (!wall) {
      return res.json({
        data: {
          resellerId: userId,
          products: [],
          reseller: null,
        },
      });
    }

    const productIds = (wall.products as any[])
      .map((p) => p.productId)
      .filter(Boolean)
      .map((p) => (p as any)._id);
    const products = await Product.find({
      _id: { $in: productIds },
      active: true,
    })
      .populate("supplierId", "storeName")
      .lean();

    const supplierIds = [...new Set(products.map((p: any) => p.supplierId?._id ?? p.supplierId).filter(Boolean))];
    const approvedSupplierIds = await Supplier.find({ status: "approved", _id: { $in: supplierIds } })
      .select("_id")
      .lean()
      .then((docs) => docs.map((d) => d._id.toString()));

    const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));
    const wallProducts = (wall.products as any[])
      .map((wp) => {
        const product = productMap.get((wp.productId as any)?._id?.toString?.() ?? wp.productId?.toString?.());
        if (!product) return null;
        const src = (product as any).supplierSource;
        const isExternal = ["cj", "spocket", "eprolo"].includes(src);
        const isApproved = isExternal || approvedSupplierIds.includes((product as any).supplierId?._id?.toString?.() ?? (product as any).supplierId?.toString?.());
        if (!isApproved) return null;
        const pct = wp.resellerCommissionPct ?? 5;
        return {
          productId: (product as any)._id,
          product: product,
          resellerCommissionPct: pct,
          addedAt: wp.addedAt,
        };
      })
      .filter(Boolean);

    const reseller = await User.findById(userId).select("name email").lean();

    res.json({
      data: {
        resellerId: wall.resellerId,
        products: wallProducts,
        reseller: reseller ? { name: reseller.name, _id: (reseller as any)._id } : null,
      },
    });
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

    let wall = await ResellerWall.findOne({ resellerId: req.user!._id });
    if (!wall) wall = await ResellerWall.create({ resellerId: req.user!._id, products: [] });

    const exists = wall.products.some((p) => (p.productId as any).toString() === productId);
    if (exists) {
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
    const wall = await ResellerWall.findOne({ resellerId: req.user!._id });
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

// Get my wall (auth)
router.get("/wall/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const wall = await ResellerWall.findOne({ resellerId: req.user!._id })
      .populate("products.productId")
      .lean();
    if (!wall) {
      return res.json({ data: { resellerId: req.user!._id, products: [], reseller: { name: req.user!.name, _id: req.user!._id } } });
    }

    const productIds = (wall.products as any[])
      .map((p) => {
        const pid = p.productId;
        if (!pid) return null;
        return pid && typeof pid === "object" && "_id" in pid ? (pid as any)._id : pid;
      })
      .filter(Boolean);
    // Include inactive products so reseller sees items they added (supplier may have deactivated)
    const products = await Product.find({ _id: { $in: productIds } })
      .populate("supplierId", "storeName")
      .lean();
    const productMap = new Map(products.map((p: any) => [String(p._id), p]));
    const wallProducts = (wall.products as any[])
      .map((wp) => {
        const pid = wp.productId;
        const id = pid && typeof pid === "object" && "_id" in pid ? (pid as any)._id : pid;
        const idStr = id ? String(id) : "";
        const product = productMap.get(idStr) ?? (pid && typeof pid === "object" && "title" in pid ? pid : null);
        return {
          productId: id ?? pid,
          product,
          resellerCommissionPct: wp.resellerCommissionPct ?? 5,
          addedAt: wp.addedAt,
        };
      })
      .filter((wp) => wp.product != null);

    res.json({
      data: {
        resellerId: wall.resellerId,
        products: wallProducts,
        reseller: { name: req.user!.name, _id: req.user!._id },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
