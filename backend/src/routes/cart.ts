import express, { Response } from "express";
import Cart from "../data/models/Cart";
import Product from "../data/models/Product";
import Song from "../data/models/Song";
import MusicPurchase from "../data/models/MusicPurchase";
import ResellerWall from "../data/models/ResellerWall";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { effectiveResellerMarkupPctFromWall } from "../config/marketplaceCategoryMarkups";
import { getProductPriceForQty } from "../utils/productPricing";
import {
  cartHasFoodMenuItem,
  productIsInstorePickup,
  withFoodOrderServiceFee,
} from "../config/foodMarketplace";
import { normalizeColorName } from "../utils/productColorTypes";
import { normalizeSizeToken, resolveSelectedSize } from "../utils/productSizeTypes";

const router = express.Router();

/** Drop cart lines whose products were deleted/deactivated. */
async function pruneMissingCartProductLines(cart: InstanceType<typeof Cart>): Promise<boolean> {
  const items = Array.isArray(cart.items) ? cart.items : [];
  if (!items.length) return false;
  const ids = items.map((i) => i.productId).filter(Boolean);
  const active = await Product.find({ _id: { $in: ids }, active: true }).select("_id").lean();
  const ok = new Set(active.map((p) => String(p._id)));
  const next = items.filter((i) => ok.has(String(i.productId)));
  if (next.length === items.length) return false;
  cart.items = next as typeof cart.items;
  await cart.save();
  return true;
}

/**
 * Food/grocery pickup carts must not mix with courier/marketplace goods (and vice versa).
 * Returns how many opposing lines were removed.
 */
async function stripConflictingCartLines(
  cart: InstanceType<typeof Cart>,
  incomingIsPickup: boolean
): Promise<number> {
  const items = Array.isArray(cart.items) ? cart.items : [];
  if (!items.length) return 0;
  const ids = items.map((i) => i.productId).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids }, active: true })
    .select("_id categories tags")
    .lean();
  const map = new Map(products.map((p) => [String(p._id), p]));
  const next = items.filter((i) => {
    const p = map.get(String(i.productId));
    if (!p) return false;
    const isPickup = productIsInstorePickup(p as any);
    return incomingIsPickup ? isPickup : !isPickup;
  });
  const removed = items.length - next.length;
  if (removed > 0) {
    cart.items = next as typeof cart.items;
  }
  return removed;
}

function resolveSelectedColor(
  raw: unknown,
  product: { colors?: Array<{ name: string }> | null },
  opts?: { required?: boolean }
): string | undefined {
  const colors = Array.isArray(product.colors) ? product.colors : [];
  if (colors.length === 0) return undefined;
  const sel = normalizeColorName(String(raw || ""));
  if (!sel) {
    if (opts?.required === false) return undefined;
    throw new AppError("Please select a color", 400);
  }
  const match = colors.find((c) => c.name.toLowerCase() === sel.toLowerCase());
  if (!match) throw new AppError("Invalid color selection", 400);
  return match.name;
}

function cartLineMatches(
  item: { productId: unknown; resellerId?: unknown; selectedColor?: string | null; selectedSize?: string | null },
  productId: string,
  resellerId?: string | null,
  selectedColor?: string | null,
  selectedSize?: string | null
): boolean {
  const pid = String((item.productId as any)?.toString?.() ?? item.productId);
  if (pid !== String(productId)) return false;
  const rid = item.resellerId ? String(item.resellerId) : "";
  const wantRid = resellerId ? String(resellerId) : "";
  if (rid !== wantRid) return false;
  const c = normalizeColorName(item.selectedColor || "").toLowerCase();
  const wantC = normalizeColorName(selectedColor || "").toLowerCase();
  if (c !== wantC) return false;
  const s = normalizeSizeToken(item.selectedSize || "");
  const wantS = normalizeSizeToken(selectedSize || "");
  return s === wantS;
}

async function getResellerPrice(
  resellerId: string,
  productId: string,
  basePrice: number,
  categories?: string[]
): Promise<number> {
  const wall = await ResellerWall.findOne({ resellerId });
  if (!wall) return basePrice;
  const wp = (wall.products as any[]).find((p) => (p.productId as any).toString() === productId);
  if (!wp) return basePrice;
  const pct = effectiveResellerMarkupPctFromWall(wp.resellerCommissionPct, categories);
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
    await pruneMissingCartProductLines(cart);

    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true })
      .select("title slug images price discountPrice bulkTiers currency stock outOfStock allowResell categories tags colors sizes")
      .lean();

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const cartHasMenu = cartHasFoodMenuItem(products as any[]);
    const items: any[] = [];
    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString?.() ?? item.productId);
      if (!product) continue;
      let price = getProductPriceForQty(product, item.qty);
      if (item.resellerId) {
        price = await getResellerPrice(
          (item.resellerId as any).toString(),
          (item.productId as any).toString(),
          price,
          (product as any).categories
        );
      }
      const priced = withFoodOrderServiceFee(price, product as any, { cartHasMenuItem: cartHasMenu });
      price = priced.unitPrice;
      items.push({
        type: "product",
        productId: item.productId,
        qty: item.qty,
        resellerId: item.resellerId,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        foodServiceFeeZar: priced.serviceFeeZar,
        product: {
          _id: product._id,
          title: product.title,
          slug: product.slug,
          images: product.images,
          colors: (product as any).colors,
          sizes: (product as any).sizes,
          price,
          originalPrice: (product as any).price,
          discountPrice: (product as any).discountPrice,
          bulkTiers: (product as any).bulkTiers,
          currency: product.currency,
          stock: product.stock,
          outOfStock: (product as any).outOfStock,
          allowResell: product.allowResell,
          categories: (product as any).categories,
          tags: (product as any).tags,
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
    const { productId, songId, qty = 1, resellerId, type, selectedColor, selectedSize } = req.body;

    if (type === "music" || songId) {
      if (!songId || qty < 1) throw new AppError("songId and qty (min 1) required for music", 400);
      const song = await Song.findOne({ _id: songId, downloadEnabled: true });
      if (!song) throw new AppError("Song not found or downloads not enabled", 404);
      if (String(song.userId) === String(req.user!._id)) {
        throw new AppError("You cannot add your own song to cart", 400);
      }
      const alreadyPurchased = await MusicPurchase.findOne({ songId: song._id, buyerId: req.user!._id });
      if (alreadyPurchased) {
        throw new AppError("You already own this song. Check your Downloads in profile.", 400);
      }

      let cart = await Cart.findOne({ user: req.user!._id });
      if (!cart) cart = await Cart.create({ user: req.user!._id, items: [], musicItems: [] });
      if (!cart.musicItems) cart.musicItems = [];

      const existing = cart.musicItems.find((i) => (i.songId as any).toString() === songId.toString());
      if (existing) {
        existing.qty = 1;
      } else {
        cart.musicItems.push({ songId: song._id, qty: 1 });
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
    const isPickup = productIsInstorePickup(product as any);
    // Food/grocery menus are unlimited unless marked outOfStock.
    if (!isPickup && Number(product.stock || 0) < qty) {
      throw new AppError("Insufficient stock", 400);
    }
    const colorChoice =
      resolveSelectedColor(selectedColor, product as any, { required: false }) ||
      (Array.isArray((product as any).colors) && (product as any).colors[0]?.name
        ? String((product as any).colors[0].name)
        : undefined);
    const sizeChoice = resolveSelectedSize(selectedSize, product as any, { required: false });

    let cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) cart = await Cart.create({ user: req.user!._id, items: [], musicItems: [] });
    await pruneMissingCartProductLines(cart);
    await stripConflictingCartLines(cart, isPickup);

    const existing = cart.items.find((i) =>
      cartLineMatches(i, String(productId), resellerId || undefined, colorChoice, sizeChoice)
    );
    if (existing) {
      const newQty = existing.qty + qty;
      if (!isPickup && Number(product.stock || 0) < newQty) {
        throw new AppError("Insufficient stock", 400);
      }
      existing.qty = newQty;
      if (resellerId) existing.resellerId = resellerId;
    } else {
      cart.items.push({
        productId: product._id,
        qty,
        resellerId: resellerId || undefined,
        ...(colorChoice ? { selectedColor: colorChoice } : {}),
        ...(sizeChoice ? { selectedSize: sizeChoice } : {}),
      });
    }

    await cart.save();

    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true })
      .select("title slug images price discountPrice bulkTiers currency stock outOfStock categories colors sizes")
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const items: any[] = [];
    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString());
      let price = product ? getProductPriceForQty(product, item.qty) : 0;
      if (product && item.resellerId) {
        price = await getResellerPrice(
          (item.resellerId as any).toString(),
          (item.productId as any).toString(),
          price,
          (product as any).categories
        );
      }
      items.push({
        productId: item.productId,
        qty: item.qty,
        resellerId: item.resellerId,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        product: product ? { _id: product._id, title: product.title, price, currency: product.currency } : null,
        lineTotal: price * item.qty,
      });
    }

    res.json({ data: { items, musicItems: cart.musicItems || [], updatedAt: cart.updatedAt } });
  } catch (err) {
    next(err);
  }
});

// Update item qty and/or color/size (variants can be chosen later in cart)
router.put("/item/:productId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params;
    const { qty, selectedColor, selectedSize, updateColor, updateSize } = req.body;
    const colorQ = selectedColor != null ? String(selectedColor) : undefined;
    const sizeQ = selectedSize != null ? String(selectedSize) : undefined;
    if (qty !== undefined && (qty < 1 || !Number.isInteger(qty))) {
      throw new AppError("qty must be a positive integer", 400);
    }

    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) throw new AppError("Cart not found", 404);

    const sameProduct = cart.items.filter((i) => String(i.productId) === String(productId));
    const target =
      (colorQ != null || sizeQ != null
        ? cart.items.find((i) => cartLineMatches(i, productId, i.resellerId as any, colorQ, sizeQ))
        : undefined) ||
      (sameProduct.length === 1 ? sameProduct[0] : undefined);
    if (!target) throw new AppError("Item not in cart", 404);

    if (qty === 0) {
      cart.items = cart.items.filter(
        (i) => !cartLineMatches(i, productId, target.resellerId as any, target.selectedColor, target.selectedSize)
      );
    } else {
      const product = await Product.findById(productId);
      if (!product) throw new AppError("Product not found", 404);
      if ((product as any).outOfStock) throw new AppError("Product is out of stock", 400);
      if (qty !== undefined) {
        const isPickup = productIsInstorePickup(product as any);
        if (!isPickup && Number(product.stock || 0) < qty) {
          throw new AppError("Insufficient stock", 400);
        }
        target.qty = qty;
      }

      const wantsVariantUpdate = updateColor !== undefined || updateSize !== undefined;
      if (wantsVariantUpdate) {
        const nextColor =
          updateColor !== undefined
            ? resolveSelectedColor(updateColor, product as any, { required: true })
            : target.selectedColor;
        const nextSize =
          updateSize !== undefined
            ? resolveSelectedSize(updateSize, product as any, { required: true })
            : target.selectedSize;

        const duplicate = cart.items.find(
          (i) =>
            i !== target &&
            cartLineMatches(
              i,
              productId,
              target.resellerId as any,
              nextColor || "",
              nextSize || ""
            )
        );
        if (duplicate) {
          const mergedQty = Number(duplicate.qty || 0) + Number(target.qty || 0);
          if (product.stock < mergedQty) throw new AppError("Insufficient stock", 400);
          duplicate.qty = mergedQty;
          cart.items = cart.items.filter((i) => i !== target);
        } else {
          if (updateColor !== undefined) {
            if (nextColor) target.selectedColor = nextColor;
            else delete (target as { selectedColor?: string }).selectedColor;
          }
          if (updateSize !== undefined) {
            if (nextSize) target.selectedSize = nextSize;
            else delete (target as { selectedSize?: string }).selectedSize;
          }
        }
      }
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
    const selectedColor = req.query.selectedColor != null ? String(req.query.selectedColor) : undefined;
    const selectedSize = req.query.selectedSize != null ? String(req.query.selectedSize) : undefined;
    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart) return res.json({ message: "Cart empty" });

    const sameProduct = cart.items.filter((i) => String(i.productId) === String(productId));
    const target =
      (selectedColor != null || selectedSize != null
        ? cart.items.find((i) => cartLineMatches(i, productId, i.resellerId as any, selectedColor, selectedSize))
        : undefined) ||
      (sameProduct.length === 1 ? sameProduct[0] : undefined);

    if (target) {
      cart.items = cart.items.filter(
        (i) => !cartLineMatches(i, productId, target.resellerId as any, target.selectedColor, target.selectedSize)
      );
    } else {
      cart.items = cart.items.filter((i) => (i.productId as any).toString() !== productId);
    }
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
