import express, { Response } from "express";
import Product from "../data/models/Product";
import ProductEnquiry from "../data/models/ProductEnquiry";
import ProductEnquiryMessage from "../data/models/ProductEnquiryMessage";
import Supplier from "../data/models/Supplier";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { sendNotification } from "../services/notification";

const router = express.Router();

// POST /api/product-enquiry/product/:productId - create enquiry and send first message
router.post("/product/:productId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params as { productId: string };
    const { message } = req.body;

    const product = await Product.findById(productId).populate("supplierId", "userId").lean();
    if (!product) throw new AppError("Product not found", 404);

    const supplier = product.supplierId as any;
    const sellerIdRaw = supplier?.userId ?? supplier;
    if (!sellerIdRaw) throw new AppError("Product has no seller", 400);

    const sellerId = typeof sellerIdRaw === "object" ? sellerIdRaw._id ?? sellerIdRaw : sellerIdRaw;
    const buyerId = req.user!._id;
    if (buyerId.toString() === sellerId.toString()) throw new AppError("Cannot enquire about your own product", 400);

    let enquiry = await ProductEnquiry.findOne({ productId, buyerId });
    if (!enquiry) {
      enquiry = await ProductEnquiry.create({
        productId,
        buyerId,
        sellerId,
      });
    }

    const content = (message || "").trim().substring(0, 2000) || "Hi, I'm interested in this product.";
    const msg = await ProductEnquiryMessage.create({
      enquiryId: enquiry._id,
      senderId: buyerId,
      content,
    });
    await ProductEnquiry.updateOne({ _id: enquiry._id }, { lastMessageAt: new Date() });

    // Notify seller
    try {
      await sendNotification({
        user: sellerId.toString(),
        type: "product_enquiry",
        message: `${req.user!.name} enquired about "${(product as any).title}"`,
        channel: "realtime",
      });
    } catch (e) {
      // ignore notification failure
    }

    const populated = await ProductEnquiryMessage.findById(msg._id)
      .populate("senderId", "name avatar")
      .lean();

    res.status(201).json({
      data: { enquiry: { _id: enquiry._id }, message: populated },
      message: "Enquiry sent. Seller will be notified.",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/product-enquiry - list my enquiries

router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!._id.toString();
    const enquiries = await ProductEnquiry.find({
      $or: [{ buyerId: userId }, { sellerId: userId }],
    })
      .populate("productId", "title images slug")
      .populate("buyerId", "name avatar")
      .populate("sellerId", "name avatar")
      .sort({ lastMessageAt: -1 })
      .lean();

    res.json({ data: enquiries });
  } catch (err) {
    next(err);
  }
});

// GET /api/product-enquiry/:id/messages

router.get("/:id/messages", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const enquiry = await ProductEnquiry.findById(req.params.id);
    if (!enquiry) throw new AppError("Enquiry not found", 404);

    const userId = req.user!._id.toString();
    if (enquiry.buyerId.toString() !== userId && enquiry.sellerId.toString() !== userId) {
      throw new AppError("Unauthorized", 403);
    }

    const messages = await ProductEnquiryMessage.find({ enquiryId: enquiry._id })
      .populate("senderId", "name avatar")
      .sort({ createdAt: 1 })
      .lean();

    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /api/product-enquiry/:id/messages

router.post("/:id/messages", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) throw new AppError("content required", 400);

    const enquiry = await ProductEnquiry.findById(req.params.id).populate("productId", "title");
    if (!enquiry) throw new AppError("Enquiry not found", 404);

    const userId = req.user!._id.toString();
    if (enquiry.buyerId.toString() !== userId && enquiry.sellerId.toString() !== userId) {
      throw new AppError("Unauthorized", 403);
    }

    const receiverId = enquiry.buyerId.toString() === userId ? enquiry.sellerId : enquiry.buyerId;

    const msg = await ProductEnquiryMessage.create({
      enquiryId: enquiry._id,
      senderId: req.user!._id,
      content: content.trim().substring(0, 2000),
    });
    await ProductEnquiry.updateOne({ _id: enquiry._id }, { lastMessageAt: new Date() });

    // Notify receiver
    try {
      await sendNotification({
        user: receiverId,
        type: "product_enquiry",
        message: `${req.user!.name} replied about "${(enquiry.productId as any).title}"`,
        channel: "realtime",
      });
    } catch (e) {
      // ignore
    }

    const populated = await ProductEnquiryMessage.findById(msg._id)
      .populate("senderId", "name avatar")
      .lean();

    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
});

export default router;
