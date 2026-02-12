import express, { Response } from "express";
import Cart from "../data/models/Cart";
import Order from "../data/models/Order";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import ResellerWall from "../data/models/ResellerWall";
import Wallet from "../data/models/Wallet";
import Payment from "../data/models/Payment";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { initiatePayment } from "../services/payment";
import { ADMIN_PRODUCT_COMMISSION_PCT } from "../config/fees.config";

const router = express.Router();

const PLATFORM_FEE_PCT = parseFloat(process.env.PLATFORM_FEE_PCT || "2.5");
const DEFAULT_SHIPPING_PER_SUPPLIER = 100; // flat ZAR per supplier when not set

function getEffectivePrice(product: { price: number; discountPrice?: number }): number {
  const p = product as any;
  if (p.discountPrice != null && p.discountPrice >= 0 && p.discountPrice < p.price) return p.discountPrice;
  return p.price;
}

// Get reseller commission for a product from wall (3-7%)
async function getResellerCommissionPct(resellerId: string, productId: string): Promise<number | null> {
  const wall = await ResellerWall.findOne({ resellerId });
  if (!wall) return null;
  const wp = (wall.products as any[]).find((p) => (p.productId as any).toString() === productId);
  return wp?.resellerCommissionPct ?? null;
}

// Get checkout quote from current cart
router.post("/quote", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart || cart.items.length === 0) {
      throw new AppError("Cart is empty", 400);
    }

    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true })
      .populate("supplierId", "shippingCost storeName")
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const uniqueSupplierIds = new Set<string>();
    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString());
      if (product) {
        const sid = (product as any).supplierId?._id ?? (product as any).supplierId;
        if (sid) uniqueSupplierIds.add(sid.toString());
      }
    }

    const supplierIds = Array.from(uniqueSupplierIds);
    const suppliers = await Supplier.find({ _id: { $in: supplierIds } }).select("shippingCost storeName").lean();
    const supplierMap = new Map(suppliers.map((s) => [s._id.toString(), s]));
    let shipping = 0;
    const DEFAULT_SHIPPING_PER_SUPPLIER = 100;
    for (const sid of supplierIds) {
      const s = supplierMap.get(sid);
      shipping += (s as any)?.shippingCost ?? DEFAULT_SHIPPING_PER_SUPPLIER;
    }

    let subtotal = 0;
    let commissionTotal = 0;
    const breakdown: Array<{ productId: string; originalPrice: number; sellingPrice: number; adminCommission: number; resellerCommission?: number }> = [];

    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString());
      if (!product) continue;
      const origPrice = (product as any).price;
      const effectivePrice = getEffectivePrice(product as any);
      let sellingPrice = effectivePrice;
      let resellerCommissionPct: number | null = null;
      if (item.resellerId && (product as any).allowResell) {
        resellerCommissionPct = await getResellerCommissionPct((item.resellerId as any).toString(), (item.productId as any).toString());
        if (resellerCommissionPct != null) {
          sellingPrice = Math.round(effectivePrice * (1 + resellerCommissionPct / 100) * 100) / 100;
          commissionTotal += (effectivePrice * resellerCommissionPct) / 100 * item.qty;
        }
      }
      const linePrice = sellingPrice * item.qty;
      subtotal += linePrice;
      const adminCommission = (effectivePrice * item.qty * ADMIN_PRODUCT_COMMISSION_PCT);
      breakdown.push({
        productId: (product as any)._id.toString(),
        originalPrice: origPrice,
        sellingPrice,
        adminCommission,
        resellerCommission: resellerCommissionPct != null ? (effectivePrice * resellerCommissionPct) / 100 : undefined,
      });
    }

    const platformFee = (subtotal * PLATFORM_FEE_PCT) / 100;
    const total = subtotal + shipping + platformFee;
    const adminCommissionTotal = breakdown.reduce((s, b) => s + b.adminCommission, 0);

    const shippingBreakdown = supplierIds.map((sid) => {
      const s = supplierMap.get(sid);
      return { supplierId: sid, storeName: (s as any)?.storeName ?? "Supplier", shippingCost: (s as any)?.shippingCost ?? DEFAULT_SHIPPING_PER_SUPPLIER };
    });

    res.json({
      data: {
        subtotal,
        shipping,
        shippingBreakdown,
        commissionTotal,
        adminCommissionTotal,
        platformFee,
        total,
        currency: "ZAR",
        itemCount: cart.items.length,
        paymentBreakdown: breakdown,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Create order and pay (wallet or card)
router.post("/pay", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { paymentMethod, deliveryAddress } = req.body;
    if (!paymentMethod || !["wallet", "card"].includes(paymentMethod)) {
      throw new AppError("paymentMethod must be 'wallet' or 'card'", 400);
    }

    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart || cart.items.length === 0) {
      throw new AppError("Cart is empty", 400);
    }

    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true })
      .populate("supplierId", "userId shippingCost")
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const uniqueSupplierIds = new Set<string>();
    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString());
      if (product) {
        const sid = (product as any).supplierId?._id ?? (product as any).supplierId;
        if (sid) uniqueSupplierIds.add(sid.toString());
      }
    }
    const suppliers = await Supplier.find({ _id: { $in: Array.from(uniqueSupplierIds) } }).select("shippingCost").lean();
    const supplierMap = new Map(suppliers.map((s) => [s._id.toString(), s]));
    let shipping = 0;
    for (const sid of uniqueSupplierIds) {
      const s = supplierMap.get(sid);
      shipping += (s as any)?.shippingCost ?? DEFAULT_SHIPPING_PER_SUPPLIER;
    }

    const orderItems: Array<{
      productId: any;
      qty: number;
      price: number;
      resellerId?: any;
      commissionPct?: number;
      commissionValue?: number;
    }> = [];
    let subtotal = 0;
    let commissionTotal = 0;
    let supplierId: any = null;

    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString());
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 400);
      if ((product as any).outOfStock) {
        throw new AppError(`Product ${(product as any).title} is out of stock`, 400);
      }
      if ((product as any).stock < item.qty) {
        throw new AppError(`Insufficient stock for ${(product as any).title}`, 400);
      }
      if (!supplierId) supplierId = (product as any).supplierId?._id ?? (product as any).supplierId;
      let price = getEffectivePrice(product as any);
      let commissionPct: number | undefined;
      if (item.resellerId && (product as any).allowResell) {
        const pct = await getResellerCommissionPct((item.resellerId as any).toString(), (item.productId as any).toString());
        if (pct != null) {
          commissionPct = pct;
          price = Math.round(price * (1 + pct / 100) * 100) / 100;
        }
      }
      const lineTotal = price * item.qty;
      subtotal += lineTotal;
      let commissionValue = 0;
      if (commissionPct != null) {
        const effectiveBase = getEffectivePrice(product as any);
        commissionValue = (effectiveBase * item.qty * commissionPct) / 100;
        commissionTotal += commissionValue;
      }
      orderItems.push({
        productId: product._id,
        qty: item.qty,
        price,
        resellerId: item.resellerId,
        commissionPct,
        commissionValue,
      });
    }

    const platformFee = (subtotal * PLATFORM_FEE_PCT) / 100;
    const total = subtotal + shipping + platformFee;

    const order = await Order.create({
      buyerId: req.user!._id,
      supplierId,
      status: "pending_payment",
      items: orderItems,
      amounts: {
        subtotal,
        shipping,
        commissionTotal,
        platformFee,
        total,
        currency: "ZAR",
      },
      delivery: { address: deliveryAddress || "" },
      paymentMethod,
    });

    if (paymentMethod === "wallet") {
      let wallet = await Wallet.findOne({ user: req.user!._id });
      if (!wallet) wallet = await Wallet.create({ user: req.user!._id });
      if (wallet.balance < total) {
        await Order.findByIdAndUpdate(order._id, { status: "cancelled" });
        throw new AppError("Insufficient wallet balance", 400);
      }
      wallet.balance -= total;
      wallet.transactions.push({
        type: "debit",
        amount: -total,
        reference: `ORDER-${order._id}`,
        createdAt: new Date(),
      });
      await wallet.save();
      order.status = "paid";
      order.paidAt = new Date();
      order.paymentReference = `WALLET-${order._id}`;
      await order.save();
      cart.items = [];
      await cart.save();

      return res.json({
        data: {
          orderId: order._id,
          status: "paid",
          message: "Order paid with wallet",
        },
      });
    }

    // Card: create Payment and initiate PayGate
    const reference = `ORDER-${order._id}`;
    await Payment.create({
      user: req.user!._id,
      amount: total,
      reference,
      status: "pending",
    });

    const paymentResult = await initiatePayment({
      amount: total,
      reference,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3001"}/checkout/return?orderId=${order._id}`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
    });

    if (!paymentResult.success) {
      throw new AppError(paymentResult.error || "Payment initiation failed", 500);
    }

    cart.items = [];
    await cart.save();

    res.json({
      data: {
        orderId: order._id,
        status: "pending_payment",
        paymentUrl: paymentResult.paymentUrl,
        reference,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get order by ID (buyer only)
router.get("/order/:orderId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate("items.productId", "title slug images price currency")
      .lean();
    if (!order) throw new AppError("Order not found", 404);
    if ((order as any).buyerId.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

export default router;
