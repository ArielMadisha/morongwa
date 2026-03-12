import express, { Response } from "express";
import Cart from "../data/models/Cart";
import Product from "../data/models/Product";
import Song from "../data/models/Song";
import ResellerWall from "../data/models/ResellerWall";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

function getEffectivePrice(product: { price: number; discountPrice?: number }): number {
  const p = product as any;
  if (p.discountPrice != null && p.discountPrice >= 0 && p.discountPrice < p.price) return p.discountPrice;
  return p.price;
}

/** Get price per unit for given quantity, considering bulk tiers. */
function getProductPriceForQty(product: any, qty: number): number {
  const tiers = product?.bulkTiers;
  if (Array.isArray(tiers) && tiers.length > 0) {
    const tier = tiers
      .filter((t: any) => qty >= t.minQty && qty <= t.maxQty)
      .sort((a: any, b: any) => b.minQty - a.minQty)[0];
    if (tier && tier.price >= 0) return Number(tier.price);
  }
  return getEffectivePrice(product);
}

async function getResellerPrice(resellerId: string, productId: string, basePrice: number): Promise<number> {
  const wall = await ResellerWall.findOne({ resellerId });
  if (!wall) return basePrice;
  const wp = (wall.products as any[]).find((p) => (p.productId as any).toString() === productId);
  const pct = wp?.resellerCommissionPct ?? 0;
  if (pct <= 0) return basePrice;
  return Math.round(basePrice * (1 + pct / 100) * 100) / 100;
}

// Get my cart with product and music details
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user!._id, items: [], musicItems: [] });
    }

    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true })
      .select("title slug images price discountPrice bulkTiers currency stock outOfStock allowResell")
      .lean();

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const items: any[] = [];
    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString?.() ?? item.productId);
      if (!product) continue;
      let price = getProductPriceForQty(product, item.qty);
      if (item.resellerId) {
        price = await getResellerPrice((item.resellerId as any).toString(), (item.productId as any).toString(), price);
      }
      items.push({
        type: "product",
        productId: item.productId,
        qty: item.qty,
        resellerId: item.resellerId,
        product: {
          _id: product._id,
          title: product.title,
          slug: product.slug,
          images: product.images,
          price,
          originalPrice: (product as any).price,
          discountPrice: (product as any).discountPrice,
          bulkTiers: (product as any).bulkTiers,
          currency: product.currency,
          stock: product.stock,
          outOfStock: (product as any).outOfStock,
          allowResell: product.allowResell,
        },
        lineTotal: price * item.qty,
      });
    }

    const musicItems: any[] = [];
    if (cart.musicItems && cart.musicItems.length > 0) {
      const songIds = cart.musicItems.map((i) => i.songId);
      const songs = await Song.find({ _id: { $in: songIds }, downloadEnabled: true })
        .select("title artist artworkUrl downloadPrice type")
        .lean();
      const songMap = new Map(songs.map((s) => [s._id.toString(), s]));
      for (const item of cart.musicItems) {
        const song = songMap.get((item.songId as any).toString?.() ?? item.songId);
        if (!song) continue;
        const price = Number((song as any).downloadPrice ?? 10);
        musicItems.push({
          type: "music",
          songId: item.songId,
          qty: item.qty,
          song: {
            _id: song._id,
            title: (song as any).title,
            artist: (song as any).artist,
            artworkUrl: (song as any).artworkUrl,
            price,
            type: (song as any).type,
          },
          lineTotal: price * item.qty,
        });
      }
    }

    res.json({ data: { items, musicItems, updatedAt: cart.updatedAt } });
  } catch (err) {
    next(err);
  }
});

// Add or update item in cart (product or music)
router.post("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId, songId, qty = 1, resellerId, type } = req.body;

    if (type === "music" || songId) {
      if (!songId || qty < 1) throw new AppError("songId and qty (min 1) required for music", 400);
      const song = await Song.findOne({ _id: songId, downloadEnabled: true });
      if (!song) throw new AppError("Song not found or downloads not enabled", 404);
      if (String(song.userId) === String(req.user!._id)) {
        throw new AppError("You cannot add your own song to cart", 400);
      }

      let cart = await Cart.findOne({ user: req.user!._id });
      if (!cart) cart = await Cart.create({ user: req.user!._id, items: [], musicItems: [] });
      if (!cart.musicItems) cart.musicItems = [];

      const existing = cart.musicItems.find((i) => (i.songId as any).toString() === songId.toString());
      if (existing) {
        existing.qty += qty;
      } else {
        cart.musicItems.push({ songId: song._id, qty });
      }
      await cart.save();
      return res.json({ message: "Music added to cart", data: { items: cart.items, musicItems: cart.musicItems, updatedAt: cart.updatedAt } });
    }

    if (!productId || qty < 1) {
      throw new AppError("productId and qty (min 1) required", 400);
    }

    const product = await Product.findOne({ _id: productId, active: true });
    if (!product) throw new AppError("Product not found", 404);
    if ((product as any).outOfStock) throw new AppError("Product is out of stock", 400);
    if (product.stock < qty) throw new AppError("Insufficient stock", 400);

    let cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) cart = await Cart.create({ user: req.user!._id, items: [], musicItems: [] });

    const existing = cart.items.find(
      (i) => (i.productId as any).toString() === productId.toString()
    );
    if (existing) {
      const newQty = existing.qty + qty;
      if (product.stock < newQty) throw new AppError("Insufficient stock", 400);
      existing.qty = newQty;
      if (resellerId) existing.resellerId = resellerId;
    } else {
      cart.items.push({
        productId: product._id,
        qty,
        resellerId: resellerId || undefined,
      });
    }

    await cart.save();

    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true })
      .select("title slug images price discountPrice bulkTiers currency stock outOfStock")
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const items: any[] = [];
    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString());
      let price = product ? getProductPriceForQty(product, item.qty) : 0;
      if (product && item.resellerId) {
        price = await getResellerPrice((item.resellerId as any).toString(), (item.productId as any).toString(), price);
      }
      items.push({
        productId: item.productId,
        qty: item.qty,
        resellerId: item.resellerId,
        product: product ? { _id: product._id, title: product.title, price, currency: product.currency } : null,
        lineTotal: price * item.qty,
      });
    }

    res.json({ data: { items, musicItems: cart.musicItems || [], updatedAt: cart.updatedAt } });
  } catch (err) {
    next(err);
  }
});

// Update item qty
router.put("/item/:productId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params;
    const { qty } = req.body;
    if (qty !== undefined && (qty < 1 || !Number.isInteger(qty))) {
      throw new AppError("qty must be a positive integer", 400);
    }

    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) throw new AppError("Cart not found", 404);

    const item = cart.items.find((i) => (i.productId as any).toString() === productId);
    if (!item) throw new AppError("Item not in cart", 404);

    if (qty === 0) {
      cart.items = cart.items.filter((i) => (i.productId as any).toString() !== productId);
    } else {
      const product = await Product.findById(productId);
      if (!product) throw new AppError("Product not found", 404);
      if ((product as any).outOfStock) throw new AppError("Product is out of stock", 400);
      if (product.stock < qty) throw new AppError("Insufficient stock", 400);
      item.qty = qty;
    }

    await cart.save();
    res.json({ message: "Cart updated", data: { items: cart.items, updatedAt: cart.updatedAt } });
  } catch (err) {
    next(err);
  }
});

// Remove item from cart
router.delete("/item/:productId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) return res.json({ message: "Cart empty" });

    cart.items = cart.items.filter((i) => (i.productId as any).toString() !== productId);
    await cart.save();
    res.json({ message: "Item removed", data: { items: cart.items, musicItems: cart.musicItems || [], updatedAt: cart.updatedAt } });
  } catch (err) {
    next(err);
  }
});

// Remove music item from cart
router.delete("/music/:songId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { songId } = req.params;
    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) return res.json({ message: "Cart empty" });

    if (cart.musicItems) {
      cart.musicItems = cart.musicItems.filter((i) => (i.songId as any).toString() !== songId);
      await cart.save();
    }
    res.json({ message: "Music item removed", data: { items: cart.items, musicItems: cart.musicItems || [], updatedAt: cart.updatedAt } });
  } catch (err) {
    next(err);
  }
});

export default router;
