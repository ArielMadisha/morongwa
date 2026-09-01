import express, { Response } from "express";
import Supplier from "../data/models/Supplier";
import Product from "../data/models/Product";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { upload } from "../middleware/upload";
import {
  listApprovedSupplierProfilesForUser,
  resolveSupplierForProductUpload,
} from "../utils/supplierAccess";
import { notifyHrInbox } from "../services/notification";
import {
  isShopPrepStatus,
  listShopOrderReceiptsForUser,
  updateShopOrderPrepStatus,
} from "../services/shopOrderReceipts";

const router = express.Router();

// Upload a document (ID, form, etc.) for supplier application – auth required
router.post("/upload-document", authenticate, upload.single("document"), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) {
      throw new AppError("No file uploaded. Please select a document (PDF, image).", 400);
    }
    const base = process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const path = `${base.replace(/\/$/, "")}/uploads/${req.file.filename}`;
    res.json({
      success: true,
      path: `/uploads/${req.file.filename}`,
      fullUrl: path,
    });
  } catch (err) {
    next(err);
  }
});

// Apply to become a supplier (seller/manufacturer) – auth required
router.post("/apply", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const {
      type,
      storeName,
      pickupAddress,
      companyRegNo,
      directorsIdDoc,
      directorsIdDocs,
      idDocument,
      contactEmail,
      contactPhone,
      verificationFeeWaived,
    } = req.body;

    if (!type || !["company", "individual"].includes(type)) {
      throw new AppError("type must be 'company' or 'individual'", 400);
    }
    if (!contactEmail || !contactPhone) {
      throw new AppError("contactEmail and contactPhone are required", 400);
    }

    const directorDocs = Array.isArray(directorsIdDocs) && directorsIdDocs.length > 0
      ? directorsIdDocs.filter((p: any) => typeof p === "string" && p.trim())
      : directorsIdDoc ? [directorsIdDoc] : [];

    if (type === "company") {
      if (!companyRegNo) throw new AppError("companyRegNo is required for company", 400);
      if (directorDocs.length === 0) throw new AppError("At least one directors ID document is required for company", 400);
    } else {
      if (!idDocument) throw new AppError("idDocument (seller ID document reference) is required for individual", 400);
    }

    let supplier = await Supplier.findOne({ userId: req.user!._id });
    if (supplier) {
      if (supplier.status === "approved") {
        throw new AppError("You are already an approved supplier", 400);
      }
      if (supplier.status === "pending") {
        throw new AppError("Application already pending review", 400);
      }
      // Rejected: allow re-apply
      supplier.type = type;
      supplier.storeName = storeName;
      supplier.pickupAddress = pickupAddress;
      supplier.companyRegNo = type === "company" ? companyRegNo : undefined;
      (supplier as any).directorsIdDocs = type === "company" ? directorDocs : undefined;
      (supplier as any).directorsIdDoc = type === "company" ? directorDocs[0] : undefined;
      supplier.idDocument = type === "individual" ? idDocument : undefined;
      supplier.contactEmail = contactEmail;
      supplier.contactPhone = contactPhone;
      supplier.verificationFeeWaived = type === "individual" ? true : !!verificationFeeWaived;
      supplier.status = "pending";
      supplier.appliedAt = new Date();
      supplier.rejectionReason = undefined;
      supplier.reviewedAt = undefined;
      supplier.reviewedBy = undefined;
      await supplier.save();
    } else {
      supplier = await Supplier.create({
        userId: req.user!._id,
        status: "pending",
        type,
        storeName,
        pickupAddress,
        companyRegNo: type === "company" ? companyRegNo : undefined,
        directorsIdDocs: type === "company" ? directorDocs : undefined,
        directorsIdDoc: type === "company" ? directorDocs[0] : undefined,
        idDocument: type === "individual" ? idDocument : undefined,
        contactEmail,
        contactPhone,
        verificationFeeWaived: type === "individual" ? true : !!verificationFeeWaived,
        appliedAt: new Date(),
      });
    }

    void notifyHrInbox({
      subject: "New supplier application",
      message: [
        `Supplier application submitted (${supplier.type}).`,
        `Store: ${storeName || "—"}`,
        `Contact: ${contactEmail} / ${contactPhone}`,
        `User id: ${req.user!._id}`,
        `Supplier id: ${supplier._id}`,
      ].join("\n"),
    });

    res.json({
      message: "Application submitted. We will review and notify you.",
      data: {
        _id: supplier._id,
        status: supplier.status,
        type: supplier.type,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Update my supplier profile (shipping cost, etc.) – approved suppliers only
router.put("/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findOne({ userId: req.user!._id });
    if (!supplier) throw new AppError("Supplier not found", 404);
    if (supplier.status !== "approved") throw new AppError("Only approved suppliers can update profile", 403);
    const body = req.body as Record<string, unknown>;
    if (body.shippingCost !== undefined) {
      const val = Number(body.shippingCost);
      (supplier as any).shippingCost = val >= 0 ? val : undefined;
    }
    if (body.pickupAddress !== undefined) (supplier as any).pickupAddress = body.pickupAddress;
    await supplier.save();
    res.json({ message: "Profile updated", data: supplier });
  } catch (err) {
    next(err);
  }
});

// Get my supplier application/status – auth required
router.get("/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const profiles = await listApprovedSupplierProfilesForUser(req.user!._id);
    if (profiles.length > 0) {
      const primary = await Supplier.findById(profiles[0]._id).lean();
      return res.json({ data: primary, profiles });
    }
    const supplier = await Supplier.findOne({ userId: req.user!._id }).lean();
    if (!supplier) {
      return res.json({ data: null, profiles: [] });
    }
    res.json({ data: supplier, profiles: [] });
  } catch (err) {
    next(err);
  }
});

/** All approved supplier profiles for this user (multi-store / multi-country). */
router.get("/me/profiles", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const profiles = await listApprovedSupplierProfilesForUser(req.user!._id);
    res.json({ data: profiles });
  } catch (err) {
    next(err);
  }
});

// Get my products (approved suppliers only) – auth required
router.get("/me/products", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const supplierIdQ = String(req.query.supplierId || "").trim();
    let supplier;
    if (supplierIdQ) {
      supplier = await resolveSupplierForProductUpload(req.user!._id, supplierIdQ);
    } else {
      const profiles = await listApprovedSupplierProfilesForUser(req.user!._id);
      if (profiles.length !== 1) {
        return res.json({ data: [] });
      }
      supplier = await Supplier.findById(profiles[0]._id);
    }
    if (!supplier) {
      return res.json({ data: [] });
    }
    const products = await Product.find({ supplierId: supplier._id, active: true })
      .populate("supplierId", "storeName")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: products });
  } catch (err) {
    next(err);
  }
});

/**
 * QwertyHub Shop Orders — paid / in-progress orders for this merchant's store(s).
 * Query: limit, status (order status or prep: new|preparing|ready|collected)
 */
router.get("/me/orders", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const data = await listShopOrderReceiptsForUser({
      userId: req.user!._id.toString(),
      limit: Number(req.query.limit) || 50,
      status: String(req.query.status || "").trim() || undefined,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** Update kitchen/shop prep status for one of this merchant's supplier profiles on an order. */
router.patch("/me/orders/:orderId/prep-status", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const prepStatus = String((req.body as { prepStatus?: string })?.prepStatus || "").trim().toLowerCase();
    if (!isShopPrepStatus(prepStatus)) {
      throw new AppError("prepStatus must be one of: new, preparing, ready, collected", 400);
    }
    const supplierId = String((req.body as { supplierId?: string })?.supplierId || "").trim() || undefined;
    const data = await updateShopOrderPrepStatus({
      userId: req.user!._id.toString(),
      orderId: String(req.params.orderId || ""),
      supplierId,
      prepStatus,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
