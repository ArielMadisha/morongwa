import express, { Response } from "express";
import Cart from "../data/models/Cart";
import Order from "../data/models/Order";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import Wallet from "../data/models/Wallet";
import Payment from "../data/models/Payment";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { initiatePayment } from "../services/payment";

const router = express.Router();

const PLATFORM_FEE_PCT = parseFloat(process.env.PLATFORM_FEE_PCT || "2.5");
const DEFAULT_SHIPPING = 100; // flat ZAR

// Get checkout quote from current cart
router.post("/quote", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart || cart.items.length === 0) {
      throw new AppError("Cart is empty", 400);
    }

    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true }).lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotal = 0;
    let commissionTotal = 0;

    for (const item of cart.items) {
      const product = productMap.get((item.productId as any).toString());
      if (!product) continue;
      const linePrice = (product as any).price * item.qty;
      subtotal += linePrice;
      if (item.resellerId && (product as any).allowResell && (product as any).commissionPct) {
        commissionTotal += (linePrice * (product as any).commissionPct) / 100;
      }
    }

    const shipping = DEFAULT_SHIPPING;
    const platformFee = (subtotal * PLATFORM_FEE_PCT) / 100;
    const total = subtotal + shipping + platformFee;

    res.json({
      data: {
        subtotal,
        shipping,
        commissionTotal,
        platformFee,
        total,
        currency: "ZAR",
        itemCount: cart.items.length,
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
      .populate("supplierId", "userId")
      .lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

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
      if ((product as any).stock < item.qty) {
        throw new AppError(`Insufficient stock for ${(product as any).title}`, 400);
      }
      if (!supplierId) supplierId = (product as any).supplierId?._id ?? (product as any).supplierId;
      const price = (product as any).price;
      const lineTotal = price * item.qty;
      subtotal += lineTotal;
      let commissionValue = 0;
      if (item.resellerId && (product as any).allowResell && (product as any).commissionPct) {
        commissionValue = (lineTotal * (product as any).commissionPct) / 100;
        commissionTotal += commissionValue;
      }
      orderItems.push({
        productId: product._id,
        qty: item.qty,
        price,
        resellerId: item.resellerId,
        commissionPct: (product as any).commissionPct,
        commissionValue,
      });
    }

    const shipping = DEFAULT_SHIPPING;
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
