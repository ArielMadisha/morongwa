// Admin routes for platform management
import fs from "fs";
import path from "path";
import crypto from "crypto";
import express, { Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../data/models/User";
import Follow from "../data/models/Follow";
import Task from "../data/models/Task";
import Payment from "../data/models/Payment";
import Transaction from "../data/models/Transaction";
import AuditLog from "../data/models/AuditLog";
import Escrow from "../data/models/Escrow";
import Supplier from "../data/models/Supplier";
import SupplierDeletionRequest from "../data/models/SupplierDeletionRequest";
import StoreDeletionRequest from "../data/models/StoreDeletionRequest";
import Order from "../data/models/Order";
import CourierShipment from "../data/models/CourierShipment";
import ResellerWall from "../data/models/ResellerWall";
import Store from "../data/models/Store";
import Product from "../data/models/Product";
import TVPost from "../data/models/TVPost";
import TVComment from "../data/models/TVComment";
import TVReport from "../data/models/TVReport";
import Advert from "../data/models/Advert";
import LandingBackground from "../data/models/LandingBackground";
import ProductEnquiry from "../data/models/ProductEnquiry";
import ArtistVerification from "../data/models/ArtistVerification";
import Song from "../data/models/Song";
import Cart from "../data/models/Cart";
import DirectMessage from "../data/models/DirectMessage";
import AdminBroadcast from "../data/models/AdminBroadcast";
import {
  countBroadcastRecipients,
  listBroadcastAreaOptions,
  sendAdminUserBroadcast,
  type BroadcastAudienceInput,
} from "../services/adminUserBroadcast";
import Wallet from "../data/models/Wallet";
import Setting from "../data/models/Setting";
import MoneyRequest from "../data/models/MoneyRequest";
import AdminPermission, {
  AdminSection,
  ADMIN_SECTION_SLUGS,
  SUPPORT_CATEGORY_MAIN,
} from "../data/models/AdminPermission";
import TuckshopCashAgentRegistration from "../data/models/TuckshopCashAgentRegistration";
import { musicUploadSong, musicUploadAlbum } from "../middleware/musicUpload";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams, slugify } from "../utils/helpers";
import {
  assertCanCreateStoreForUser,
  userCanOwnMultipleStores,
} from "../utils/multiStoreAccess";
import {
  backfillSupplierStoresMissingLink,
  ensureApprovedSupplierForStore,
  linkSupplierStore,
} from "../utils/ensureSupplierForStore";
import {
  enrichSuppliersWithStoreCountry,
  filterSuppliersWithLiveStore,
} from "../utils/supplierAccess";
import { resolveSupplierStoreCurrency } from "../utils/storeProductCurrency";
import {
  defaultStoreCountryFromUserCountryCode,
  resolveStoreCountry,
  STORE_LOCATION_COUNTRIES,
} from "../config/storeCountries";
import {
  coerceCreateProductCurrencyFields,
  mapProductsStripInrForApi,
  normalizeProductCurrencyInrToZarForApi,
  stripInrFromMongooseProductDoc,
} from "../utils/currencyPolicy";
import {
  encodeUploadsPublicPath,
  normalizeProductImageUrls,
  uploadsPathFromFilename,
} from "../utils/uploadFilePath";
import { upload } from "../middleware/upload";
import { moderateMedia } from "../services/contentModeration";
import { sendNotification } from "../services/notification";
import { syncRunnerVerifiedFlag } from "../services/runnerVerification";
import payoutService from "../services/payoutService";
import fnbService from "../services/fnbService";
import {
  importProductFromCJ,
  searchAndImportFromCJ,
  searchCJProducts,
  importProductFromEprolo,
  searchAndImportFromEprolo,
  searchEproloProducts,
  importProductFromShein,
  searchSheinProducts,
  searchAndImportFromShein,
} from "../services/productImportService";
import { assignProductColors, normalizeAdminProductColors, adminColorsCoverAllImages } from "../services/assignProductColors";
import { normalizeProductSizes } from "../utils/productSizeTypes";
import { syncCjProductStock } from "../services/cjStockSyncService";
import { syncEproloProductStock } from "../services/eproloStockSyncService";
import { resolveWarehouseFreeLocalForSupplier } from "../services/warehouseLocalDelivery";
import { applyFreeShippingUpdate, resolveFreeShippingFieldsForCreate } from "../services/productFreeShipping";
import { syncSheinProductStock } from "../services/sheinStockSyncService";
import { isExternalSupplierConfigured } from "../services/suppliers/supplierService";
import { aggregateDropshippingReport, buildOrderProfitBreakdown } from "../services/dropshippingProfitService";
import {
  getPayGateFlatFeeZar,
  getWalletPayoutFeeZar,
  invalidatePaymentFeeCache,
  PAYGATE_FLAT_FEE_SETTING_KEY,
  WALLET_PAYOUT_FEE_SETTING_KEY,
} from "../services/payment";
import { inferTopCategoryForProduct, MARKETPLACE_TOP_CATEGORIES } from "../services/marketplaceCategoryClassifier";
import { normalizeBulkTierMaxQty } from "../config/bulkTierLimits";
import { sendSms } from "../services/otpDelivery";
import { findMatchingRunners } from "../services/matching";
import { logger } from "../services/monitoring";
import {
  getHlsPublicBase,
  getRtmpAppName,
  getRtmpPublicHost,
  isLivestreamPlaybackConfigured,
  isLivestreamPublishConfigured,
} from "../services/livestream";
import adminTvChannelRouter from "./adminTvChannel";
import adminCountryProfilesRouter from "./adminCountryProfiles";
import adminLiveMetricsRouter from "./adminLiveMetrics";
import adminMusicSoundLibraryRouter from "./adminMusicSoundLibrary";
import adminSponsoredVideoAdsRouter from "./adminSponsoredVideoAds";
import adminCourierRouter from "./adminCourier";
import adminFacebookIngestRouter from "./adminFacebookIngest";
import { runOnboardingAgentFraudScan, runTuckshopFraudScan } from "../services/registrationFraudScan";
import { listAgentRegistrationIncentiveReference } from "../config/agentRegistrationIncentive.config";
import { adminMarkupPctForCategory, getMarketplaceCategoryMarkup } from "../config/marketplaceCategoryMarkups";
import { enforceDelegatedAdminSectionAccess } from "../middleware/adminDelegateSectionGate";
import { waPremenuMediaUpload } from "../middleware/waPremenuMediaUpload";
import {
  WA_PREMENU_ADVERT_SETTING_KEY,
  WA_AD_CAMPAIGN_SCRIPTS,
  getWaPreMenuAdvertConfigResolved,
  mergeWaPreMenuAdvertPatch,
  invalidateWaPreMenuAdvertConfigCache,
  publicBundledWaPremenuSampleVideoUrl,
  publicBundledAcbpayVideoUrlA,
  publicBundledAcbpayVideoUrlB,
} from "../services/waPreMenuAdvertConfig";
import { LEGACY_PUBLISHER_USERNAMES } from "../config/legacyPublisherAccounts";
import {
  isInvalidNumericSchoolAccount,
  isNumericOnlyInstitutionName,
} from "../utils/schoolProfileDetection";
import { isGenericDisplayName, userPublicDisplayName } from "../utils/userDisplayLabel";

const router = express.Router();

/**
 * When admin links music to a user (or creates an artist), keep `ArtistVerification` in sync
 * so `/admin/artists` lists them (not only standalone `Song.userId`).
 */
async function upsertApprovedArtistVerification(params: {
  adminUserId: mongoose.Types.ObjectId;
  ownerUserId: mongoose.Types.ObjectId;
  type?: string;
  stageName?: string;
  labelName?: string;
}): Promise<void> {
  const rawType = String(params.type || "artist").toLowerCase();
  const validType = ["artist", "company", "producer"].includes(rawType) ? rawType : "artist";
  const set: Record<string, unknown> = {
    userId: params.ownerUserId,
    type: validType,
    status: "approved",
    manualVerified: true,
    verifiedAt: new Date(),
    verifiedBy: params.adminUserId,
  };
  const sn = String(params.stageName || "").trim();
  const ln = String(params.labelName || "").trim();
  if (sn) set.stageName = sn;
  if (ln) set.labelName = ln;

  await ArtistVerification.findOneAndUpdate(
    { userId: params.ownerUserId },
    { $set: set, $unset: { rejectionReason: 1 } },
    { upsert: true, new: true }
  );
  await User.updateOne({ _id: params.ownerUserId }, { $set: { artistVerified: true } });
}

/** Host hint for admin UI — no paths or secrets. */
function publicUrlHostHint(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withScheme);
    const port =
      u.port && u.port !== "443" && u.port !== "80" ? `:${u.port}` : "";
    return `${u.hostname}${port}`;
  } catch {
    return null;
  }
}
const DEFAULT_PRODUCT_CATEGORY = "Home, Garden & Furniture";
const FRONTEND_URL = String(process.env.FRONTEND_URL || "https://www.qwertymates.com").replace(/\/$/, "");

async function sendMerchantAgentDecisionWhatsApp(params: {
  phone?: string;
  name?: string;
  decision: "approved" | "rejected" | "suspended" | "reinstated";
  reason?: string;
  missingDocs?: string[];
}): Promise<void> {
  const phone = String(params.phone || "").trim();
  if (!phone) return;
  const userName = String(params.name || "there").trim() || "there";
  if (params.decision === "approved") {
    const activationLink = `${FRONTEND_URL}/wallet?merchantAgent=activate`;
    const merchantToolsLink = `${FRONTEND_URL}/pay/integrate`;
    const text = [
      "🎉 Approved!",
      "",
      `Hi ${userName}, your merchant application is approved.`,
      "",
      "You can now:",
      "✔️ Accept payments",
      "✔️ Cash-out to customers",
      "✔️ Prepaid Services",
      "✔️ Bill Payments",
      "",
      `Start here: ${activationLink}`,
      `Merchant tools: ${merchantToolsLink}`,
    ].join("\n");
    await sendSms({ phone, text, channel: "whatsapp" });
    return;
  }
  if (params.decision === "suspended") {
    const text = [
      "⛔ Merchant access suspended",
      "",
      `Hi ${userName}, your merchant wallet access is currently suspended.`,
      "Please contact support to resolve this.",
      "",
      `Support: ${FRONTEND_URL}/support?category=wallet:other`,
    ].join("\n");
    await sendSms({ phone, text, channel: "whatsapp" });
    return;
  }
  if (params.decision === "reinstated") {
    const activationLink = `${FRONTEND_URL}/wallet?merchantAgent=activate`;
    const merchantToolsLink = `${FRONTEND_URL}/pay/integrate`;
    const text = [
      "✅ Merchant access reinstated",
      "",
      `Hi ${userName}, your merchant wallet access is active again.`,
      "",
      "You can now:",
      "✔️ Accept payments",
      "✔️ Cash-out to customers",
      "✔️ Prepaid Services",
      "✔️ Bill Payments",
      "",
      `Start here: ${activationLink}`,
      `Merchant tools: ${merchantToolsLink}`,
    ].join("\n");
    await sendSms({ phone, text, channel: "whatsapp" });
    return;
  }
  const missingDocs = Array.isArray(params.missingDocs)
    ? params.missingDocs.map((d) => String(d || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  const reasonLine = params.reason ? `Missing/issue: ${params.reason}` : "Missing/issue: Please provide complete KYC/business documents.";
  const retryLink = `${FRONTEND_URL}/wallet`;
  const docsBlock = missingDocs.length
    ? ["Please send:", ...missingDocs.map((d) => `• ${d}`)].join("\n")
    : ["Please send:", "• ID copy", "• Business registration", "• Proof of address"].join("\n");
  const text = [
    "❌ Application incomplete",
    "",
    `Hi ${userName}, your merchant application needs updates.`,
    reasonLine,
    "",
    docsBlock,
    "",
    `Resubmit from: ${retryLink}`,
  ].join("\n");
  await sendSms({ phone, text, channel: "whatsapp" });
}

async function sendTuckshopCashAgentDecisionWhatsApp(params: {
  phoneDigits: string;
  approved: boolean;
  reason?: string;
}): Promise<void> {
  const digits = String(params.phoneDigits || "").replace(/\D/g, "");
  if (!digits || digits.length < 8) return;
  const text = params.approved
    ? "✅ Tuckshop approved. Commission logged."
    : [
        "Your tuckshop registration was not approved at this time.",
        params.reason ? `Reason: ${params.reason}` : "",
        "",
        "Reply 6 on the main menu if you need help from support.",
      ]
        .filter(Boolean)
        .join("\n");
  try {
    await sendSms({ phone: digits, text, channel: "whatsapp" });
  } catch (e) {
    logger.warn("Tuckshop cash-agent WhatsApp decision failed", { error: String((e as any)?.message || e) });
  }
}

function normalizeProductCategories(input: unknown, productForInference?: { title?: unknown; description?: unknown; tags?: unknown }): string[] {
  const raw = Array.isArray(input) ? input : [];
  const cleaned = raw
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => v.toLowerCase() !== "local")
    .filter((v, idx, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === idx)
    .filter((v) => MARKETPLACE_TOP_CATEGORIES.some((c) => c.toLowerCase() === v.toLowerCase()));
  if (cleaned.length > 0) return [cleaned[0]];
  const inferred = productForInference ? inferTopCategoryForProduct(productForInference) : null;
  return [inferred || DEFAULT_PRODUCT_CATEGORY];
}

/** Recompute catalog markup % and reseller MAP hints from current list price + category (keep in sync with POST /products create). */
function syncQwertymatesMarkupAndResellerHintsFromProductState(product: {
  categories?: unknown;
  price?: unknown;
  allowResell?: unknown;
  qwertymatesMarkupPct?: unknown;
  minResalePrice?: unknown;
  recommendedResellerPrice?: unknown;
  resellerMarginPct?: unknown;
}) {
  const categories = Array.isArray(product.categories) ? product.categories.map((c) => String(c)) : [];
  const topCategory = categories[0] || DEFAULT_PRODUCT_CATEGORY;
  const adminPct = adminMarkupPctForCategory(topCategory);
  (product as any).qwertymatesMarkupPct = adminPct;
  const mkRule = getMarketplaceCategoryMarkup(topCategory);
  const listPrice = Number(product.price) || 0;
  const allowResell =
    (product as any).allowResell === undefined || (product as any).allowResell === null ? true : !!(product as any).allowResell;
  if (allowResell && mkRule) {
    const mid = (mkRule.resellerMinPct + mkRule.resellerMaxPct) / 2;
    (product as any).minResalePrice = Math.round(listPrice * (1 + mkRule.resellerMinPct / 100) * 100) / 100;
    (product as any).recommendedResellerPrice = Math.round(listPrice * (1 + mid / 100) * 100) / 100;
    (product as any).resellerMarginPct = Math.round(mid * 10) / 10;
  } else {
    (product as any).minResalePrice = undefined;
    (product as any).recommendedResellerPrice = undefined;
    (product as any).resellerMarginPct = undefined;
  }
}

const isSuperAdmin = (req: AuthRequest) =>
  req.user?.role?.includes("superadmin") ?? false;

/** Require super-admin only */
const requireSuperAdmin = (_req: AuthRequest, res: Response, next: express.NextFunction) => {
  if (isSuperAdmin(_req)) return next();
  res.status(403).json({ error: "Super-admin only" });
};

/** Require super-admin OR admin with section permission */
const requireSection = (section: AdminSection) => {
  return async (req: AuthRequest, res: Response, next: express.NextFunction) => {
    if (isSuperAdmin(req)) return next();
    const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
    if (perm?.sections?.includes(section)) return next();
    res.status(403).json({ error: "Insufficient permissions for this section" });
  };
};

const ADMIN_SECTION_SET = new Set<string>(ADMIN_SECTION_SLUGS as unknown as string[]);

function filterValidAdminSections(sections: unknown): AdminSection[] {
  return (Array.isArray(sections) ? sections : [])
    .map((s) => String(s || "").trim())
    .filter((s): s is AdminSection => ADMIN_SECTION_SET.has(s));
}

/**
 * True for `user@host.tld` style lookups.
 * False for `@handle` only (so handles like `@cinamadisha` are not misread as email just because the TLD has a dot).
 */
function isProbableEmailLookup(raw: string): boolean {
  const t = String(raw || "").trim();
  if (!t) return false;
  if (/^@[^@\s]+$/.test(t)) return false;
  const at = t.indexOf("@");
  if (at <= 0 || at >= t.length - 1) return false;
  return t.slice(at + 1).includes(".");
}

/** Super-admin, or delegated admin with any of the listed sections */
const requireAnySection = (sections: AdminSection[]) => {
  return async (req: AuthRequest, res: Response, next: express.NextFunction) => {
    if (isSuperAdmin(req)) return next();
    const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
    const have = perm?.sections || [];
    if (sections.some((s) => have.includes(s))) return next();
    res.status(403).json({ error: "Insufficient permissions for this section" });
  };
};

function requireSuperAdminOrSections(sections: AdminSection[]) {
  return async (req: AuthRequest, res: Response, next: express.NextFunction) => {
    if (isSuperAdmin(req)) return next();
    const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
    const have = perm?.sections || [];
    if (sections.some((s) => have.includes(s))) return next();
    res.status(403).json({ error: "Super-admin or delegated product/dropship permission required" });
  };
}

/** Super-admin, or delegated admin with dropship / product scope (imports & stock sync) */
const requireSuperAdminOrDropshipSections = requireSuperAdminOrSections([
  "dropshipping",
  "product_uploads",
  "products",
] as AdminSection[]);

async function isDelegatedAdminUser(userId: mongoose.Types.ObjectId): Promise<boolean> {
  const row = await AdminPermission.findOne({ userId }).select("_id").lean();
  return Boolean(row);
}

/** Sub-admins (delegated) may only request supplier removal for suppliers they captured. */
async function userMayRequestSupplierDeletion(
  req: AuthRequest,
  supplier: { capturedByAdminId?: mongoose.Types.ObjectId | null }
): Promise<boolean> {
  if (isSuperAdmin(req)) return true;
  const delegated = await isDelegatedAdminUser(req.user!._id);
  if (!delegated) return true;
  const cap = supplier.capturedByAdminId;
  if (!cap) return false;
  return String(cap) === String(req.user!._id);
}

async function executeSupplierPermanentDelete(params: {
  supplierId: mongoose.Types.ObjectId;
  actingAdminId: mongoose.Types.ObjectId;
}): Promise<{ userId: mongoose.Types.ObjectId }> {
  const supplier = await Supplier.findById(params.supplierId);
  if (!supplier) throw new AppError("Supplier not found", 404);

  const sid = supplier._id;
  const active = ["pending_payment", "paid", "processing", "shipped"];
  const blocking = await Order.countDocuments({ supplierId: sid, status: { $in: active } });
  if (blocking > 0) {
    throw new AppError(
      "This supplier has marketplace orders still in progress. Cancel or fulfil them before permanent removal.",
      400
    );
  }

  const ownerId = supplier.userId;
  await Product.deleteMany({ supplierId: sid });
  await Store.deleteMany({ userId: ownerId, type: "supplier" });
  await Supplier.deleteOne({ _id: sid });

  await AuditLog.create({
    action: "SUPPLIER_DELETED_PERMANENT",
    user: params.actingAdminId,
    target: ownerId,
    meta: { supplierId: String(sid) },
  });

  return { userId: ownerId };
}

/** Remove marketplace products and detach them from carts, walls, adverts, and TV posts. */
async function cascadeDeleteMarketplaceProducts(
  productIds: mongoose.Types.ObjectId[]
): Promise<number> {
  if (!productIds.length) return 0;
  await Promise.all([
    ProductEnquiry.deleteMany({ productId: { $in: productIds } }),
    ResellerWall.updateMany(
      { "products.productId": { $in: productIds } },
      { $pull: { products: { productId: { $in: productIds } } } }
    ),
    Cart.updateMany(
      { "items.productId": { $in: productIds } },
      { $pull: { items: { productId: { $in: productIds } } } }
    ),
    Advert.updateMany({ productId: { $in: productIds } }, { $unset: { productId: "" } }),
    TVPost.updateMany({ productId: { $in: productIds } }, { $unset: { productId: "" } }),
  ]);
  const result = await Product.deleteMany({ _id: { $in: productIds } });
  return result.deletedCount ?? productIds.length;
}

const ACTIVE_ORDER_STATUSES = ["pending_payment", "paid", "processing", "shipped"];

async function notifySuperAdminsStoreDeletionRequest(params: {
  storeName: string;
  storeType: string;
  requestedBy: mongoose.Types.ObjectId;
}): Promise<void> {
  const supers = await User.find({ role: "superadmin" }).select("_id").lean();
  if (!supers.length) return;
  const requester = await User.findById(params.requestedBy).select("name email").lean();
  const who = requester?.name || requester?.email || "An admin";
  const message = `${who} requested removal of store "${params.storeName}" (${params.storeType}). Open Admin → Store removal queue to approve permanent deletion.`;
  await Promise.all(
    supers.map((s) =>
      sendNotification({
        userId: String(s._id),
        type: "admin_store_deletion_request",
        message,
        channel: "realtime",
      })
    )
  );
}

async function executeStorePermanentDelete(params: {
  storeId: mongoose.Types.ObjectId;
  actingAdminId: mongoose.Types.ObjectId;
}): Promise<{ productsDeleted: number; myStoreListingsCleared: number }> {
  const store = await Store.findById(params.storeId);
  if (!store) throw new AppError("Store not found", 404);

  const userId = store.userId;
  let productsDeleted = 0;
  let myStoreListingsCleared = 0;

  if (store.type === "supplier") {
    let supplier = store.supplierId ? await Supplier.findById(store.supplierId) : null;
    if (!supplier) supplier = await Supplier.findOne({ linkedStoreId: store._id });
    if (supplier) {
      const blocking = await Order.countDocuments({
        supplierId: supplier._id,
        status: { $in: ACTIVE_ORDER_STATUSES },
      });
      if (blocking > 0) {
        throw new AppError(
          "This supplier has marketplace orders still in progress. Cancel or fulfil them before permanent removal.",
          400
        );
      }
      const productDocs = await Product.find({ supplierId: supplier._id }).select("_id").lean();
      const productIds = productDocs.map((p) => p._id as mongoose.Types.ObjectId);
      productsDeleted = await cascadeDeleteMarketplaceProducts(productIds);
      await Supplier.deleteOne({ _id: supplier._id });
    }
  }

  if (store.type === "reseller") {
    const blocking = await Order.countDocuments({
      resellerId: userId,
      status: { $in: ACTIVE_ORDER_STATUSES },
    });
    if (blocking > 0) {
      throw new AppError(
        "This reseller has orders still in progress. Cancel or fulfil them before permanent removal.",
        400
      );
    }
    const wall = await ResellerWall.findOne({ resellerId: userId });
    if (wall?.products?.length) {
      myStoreListingsCleared = wall.products.length;
      wall.products = [];
      await wall.save();
    }
  }

  const meta = {
    userId: String(userId),
    type: store.type,
    slug: store.slug,
    name: store.name,
    supplierId: store.supplierId ? String(store.supplierId) : undefined,
    productsDeleted,
    myStoreListingsCleared,
  };
  await store.deleteOne();
  await AuditLog.create({
    action: "STORE_DELETED_BY_ADMIN",
    user: params.actingAdminId,
    target: store._id,
    meta,
  });

  return { productsDeleted, myStoreListingsCleared };
}

// All routes require admin or superadmin role (role-based access control)
router.use(authenticate, authorize("admin", "superadmin"));

/** Current user's delegated section permissions (for admin UI). Super-admin = all sections. */
router.get("/permissions/me", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401);
    if (isSuperAdmin(req)) {
      return res.json({
        isSuperAdmin: true,
        sections: [...ADMIN_SECTION_SLUGS],
        supportCategories: [...SUPPORT_CATEGORY_MAIN],
      });
    }
    const perm = await AdminPermission.findOne({ userId: req.user._id }).lean();
    if (!perm) {
      return res.json({
        isSuperAdmin: false,
        sections: [...ADMIN_SECTION_SLUGS],
        supportCategories: [...SUPPORT_CATEGORY_MAIN],
      });
    }
    return res.json({
      isSuperAdmin: false,
      sections: perm.sections || [],
      supportCategories: perm.supportCategories || [],
    });
  } catch (err) {
    next(err);
  }
});

router.use(enforceDelegatedAdminSectionAccess);

// Get platform statistics (dashboard)
router.get("/stats", async (req: AuthRequest, res: Response, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      pendingPayments,
      totalRevenueFromTransactions,
      totalRevenueFromSuccessfulPayments,
      escrowHeld,
      escrowReleased,
      escrowPendingPayout,
      walletFloatTotal,
      txByType,
      paymentByStatus,
      directWalletSendByStatus,
      moneyRequestByStatus,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ active: true }),
      Task.countDocuments(),
      Task.countDocuments({ status: "completed" }),
      Payment.countDocuments({ status: "pending" }),
      Transaction.aggregate([
        { $match: { type: "payment" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((r) => (r[0]?.total ?? 0) as number),
      Payment.aggregate([
        { $match: { status: "successful" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((r) => (r[0]?.total ?? 0) as number),
      Escrow.countDocuments({ status: "held" }),
      Escrow.countDocuments({ status: "released" }),
      Escrow.countDocuments({ status: "released", fnbStatus: { $in: ["pending", "submitted", "processing"] } }),
      Wallet.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]).then((r) => (r[0]?.total ?? 0) as number),
      Transaction.aggregate([
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]),
      Payment.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { "metadata.directWalletSend": true } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]),
      MoneyRequest.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const totalRevenue =
      Number(totalRevenueFromSuccessfulPayments || 0) > 0
        ? Number(totalRevenueFromSuccessfulPayments || 0)
        : Number(totalRevenueFromTransactions || 0);

    const pendingPayoutAmount = await Escrow.aggregate([
      { $match: { status: "released", fnbStatus: { $in: ["pending", "submitted", "processing"] } } },
      { $group: { _id: null, total: { $sum: "$runnersNet" } } },
    ]).then((r) => (r[0]?.total ?? 0) as number);

    const paymentStatusMap = new Map<string, { count: number; total: number }>();
    for (const row of paymentByStatus as Array<{ _id: string; count: number; total: number }>) {
      paymentStatusMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }
    const dwsStatusMap = new Map<string, { count: number; total: number }>();
    for (const row of directWalletSendByStatus as Array<{ _id: string; count: number; total: number }>) {
      dwsStatusMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }
    const moneyRequestStatusMap = new Map<string, { count: number; total: number }>();
    for (const row of moneyRequestByStatus as Array<{ _id: string; count: number; total: number }>) {
      moneyRequestStatusMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }
    const txTypeMap = new Map<string, { count: number; total: number }>();
    for (const row of txByType as Array<{ _id: string; count: number; total: number }>) {
      txTypeMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
    let paygateFeeCreditsCount = 0;
    let paygateFeeCreditsAmount = 0;
    if (adminEmail) {
      const adminUser = await User.findOne({ email: adminEmail }).select("_id").lean();
      if (adminUser?._id) {
        const fees = await Wallet.aggregate([
          { $match: { user: adminUser._id } },
          { $unwind: "$transactions" },
          {
            $match: {
              "transactions.reference": { $regex: "^PAYGATE-FEE-" },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: "$transactions.amount" },
            },
          },
        ]);
        paygateFeeCreditsCount = Number(fees[0]?.count || 0);
        paygateFeeCreditsAmount = Number(fees[0]?.total || 0);
      }
    }

    const successfulPaygateCount = Number(paymentStatusMap.get("successful")?.count || 0);
    const paygateFlatFee = Number(getPayGateFlatFeeZar() || 0);

    let fnbBalance: number | null = null;
    try {
      fnbBalance = await fnbService.getAccountBalance();
    } catch {
      // FNB not configured or unavailable
    }

    res.json({
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      pendingPayments,
      totalRevenue,
      escrowHeld,
      escrowReleased,
      escrowPendingPayoutCount: escrowPendingPayout,
      pendingPayoutAmount,
      pendingPayouts: pendingPayoutAmount,
      fnbBalance,
      moneyMetrics: {
        paygate: {
          successfulCount: Number(paymentStatusMap.get("successful")?.count || 0),
          successfulAmount: Number(paymentStatusMap.get("successful")?.total || 0),
          pendingCount: Number(paymentStatusMap.get("pending")?.count || 0),
          pendingAmount: Number(paymentStatusMap.get("pending")?.total || 0),
          failedCount: Number(paymentStatusMap.get("failed")?.count || 0),
          failedAmount: Number(paymentStatusMap.get("failed")?.total || 0),
        },
        directWalletSend: {
          successfulCount: Number(dwsStatusMap.get("successful")?.count || 0),
          successfulAmount: Number(dwsStatusMap.get("successful")?.total || 0),
          pendingCount: Number(dwsStatusMap.get("pending")?.count || 0),
          pendingAmount: Number(dwsStatusMap.get("pending")?.total || 0),
        },
        wallet: {
          floatTotal: Number(walletFloatTotal || 0),
          topupsTotal: Number(txTypeMap.get("topup")?.total || 0),
          payoutsTotal: Number(txTypeMap.get("payout")?.total || 0),
          creditsTotal: Number(txTypeMap.get("credit")?.total || 0),
          debitsTotal: Number(txTypeMap.get("debit")?.total || 0),
        },
        moneyRequests: {
          pendingCount: Number(moneyRequestStatusMap.get("pending")?.count || 0),
          pendingAmount: Number(moneyRequestStatusMap.get("pending")?.total || 0),
          paidCount: Number(moneyRequestStatusMap.get("paid")?.count || 0),
          paidAmount: Number(moneyRequestStatusMap.get("paid")?.total || 0),
          declinedCount: Number(moneyRequestStatusMap.get("declined")?.count || 0),
          expiredCount: Number(moneyRequestStatusMap.get("expired")?.count || 0),
        },
        adminCommission: {
          paygateFeeCreditsCount,
          paygateFeeCreditsAmount,
          paygateFlatFee,
          expectedFeeAmountFromSuccessfulPaygate: Math.round(successfulPaygateCount * paygateFlatFee * 100) / 100,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Date-range money metrics (for /admin/money-metrics). Query: from=ISO, to=ISO (inclusive window). Max 366 days. */
router.get("/money-metrics", async (req: AuthRequest, res: Response, next) => {
  try {
    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();
    if (!fromRaw || !toRaw) {
      return res.status(400).json({ error: "Query params from and to (ISO dates) are required" });
    }
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: "Invalid from or to date" });
    }
    if (to.getTime() < from.getTime()) {
      return res.status(400).json({ error: "to must be on or after from" });
    }
    const maxMs = 366 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxMs) {
      return res.status(400).json({ error: "Range too large (maximum 366 days)" });
    }

    const dateMatch = { createdAt: { $gte: from, $lte: to } } as const;

    const [
      walletFloatTotal,
      paymentByStatus,
      directWalletSendByStatus,
      txByType,
      moneyRequestByStatus,
      successfulPaymentsSum,
      successfulPaymentsCount,
    ] = await Promise.all([
      Wallet.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]).then((r) => (r[0]?.total ?? 0) as number),
      Payment.aggregate([
        { $match: dateMatch },
        { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        { $match: { ...dateMatch, "metadata.directWalletSend": true } },
        { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        { $match: dateMatch },
        { $group: { _id: "$type", count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ]),
      MoneyRequest.aggregate([
        { $match: dateMatch },
        { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        { $match: { ...dateMatch, status: "successful" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((r) => (r[0]?.total ?? 0) as number),
      Payment.countDocuments({ ...dateMatch, status: "successful" }),
    ]);

    const paymentStatusMap = new Map<string, { count: number; total: number }>();
    for (const row of paymentByStatus as Array<{ _id: string; count: number; total: number }>) {
      paymentStatusMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }
    const dwsStatusMap = new Map<string, { count: number; total: number }>();
    for (const row of directWalletSendByStatus as Array<{ _id: string; count: number; total: number }>) {
      dwsStatusMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }
    const moneyRequestStatusMap = new Map<string, { count: number; total: number }>();
    for (const row of moneyRequestByStatus as Array<{ _id: string; count: number; total: number }>) {
      moneyRequestStatusMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }
    const txTypeMap = new Map<string, { count: number; total: number }>();
    for (const row of txByType as Array<{ _id: string; count: number; total: number }>) {
      txTypeMap.set(String(row._id), { count: Number(row.count || 0), total: Number(row.total || 0) });
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
    let paygateFeeCreditsCount = 0;
    let paygateFeeCreditsAmount = 0;
    if (adminEmail) {
      const adminUser = await User.findOne({ email: adminEmail }).select("_id").lean();
      if (adminUser?._id) {
        const fees = await Wallet.aggregate([
          { $match: { user: adminUser._id } },
          { $unwind: "$transactions" },
          {
            $match: {
              "transactions.reference": { $regex: "^PAYGATE-FEE-" },
              "transactions.createdAt": { $gte: from, $lte: to },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: "$transactions.amount" },
            },
          },
        ]);
        paygateFeeCreditsCount = Number(fees[0]?.count || 0);
        paygateFeeCreditsAmount = Number(fees[0]?.total || 0);
      }
    }

    const paygateFlatFee = Number(getPayGateFlatFeeZar() || 0);
    const successfulPaygateCount = Number(successfulPaymentsCount || 0);

    const totalRevenueInPeriod = Number(successfulPaymentsSum || 0);
    const txPaymentTotal = Number(txTypeMap.get("payment")?.total || 0);
    const totalRevenue =
      totalRevenueInPeriod > 0 ? totalRevenueInPeriod : txPaymentTotal;

    res.json({
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totalRevenue,
      moneyMetrics: {
        paygate: {
          successfulCount: Number(paymentStatusMap.get("successful")?.count || 0),
          successfulAmount: Number(paymentStatusMap.get("successful")?.total || 0),
          pendingCount: Number(paymentStatusMap.get("pending")?.count || 0),
          pendingAmount: Number(paymentStatusMap.get("pending")?.total || 0),
          failedCount: Number(paymentStatusMap.get("failed")?.count || 0),
          failedAmount: Number(paymentStatusMap.get("failed")?.total || 0),
        },
        directWalletSend: {
          successfulCount: Number(dwsStatusMap.get("successful")?.count || 0),
          successfulAmount: Number(dwsStatusMap.get("successful")?.total || 0),
          pendingCount: Number(dwsStatusMap.get("pending")?.count || 0),
          pendingAmount: Number(dwsStatusMap.get("pending")?.total || 0),
        },
        wallet: {
          floatTotal: Number(walletFloatTotal || 0),
          topupsTotal: Number(txTypeMap.get("topup")?.total || 0),
          payoutsTotal: Number(txTypeMap.get("payout")?.total || 0),
          creditsTotal: Number(txTypeMap.get("credit")?.total || 0),
          debitsTotal: Number(txTypeMap.get("debit")?.total || 0),
        },
        moneyRequests: {
          pendingCount: Number(moneyRequestStatusMap.get("pending")?.count || 0),
          pendingAmount: Number(moneyRequestStatusMap.get("pending")?.total || 0),
          paidCount: Number(moneyRequestStatusMap.get("paid")?.count || 0),
          paidAmount: Number(moneyRequestStatusMap.get("paid")?.total || 0),
          declinedCount: Number(moneyRequestStatusMap.get("declined")?.count || 0),
          expiredCount: Number(moneyRequestStatusMap.get("expired")?.count || 0),
        },
        adminCommission: {
          paygateFeeCreditsCount,
          paygateFeeCreditsAmount,
          paygateFlatFee,
          expectedFeeAmountFromSuccessfulPaygate: Math.round(successfulPaygateCount * paygateFlatFee * 100) / 100,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Detail rows for a single money metric card (for /admin/money-metric-detail). */
router.get("/money-metrics/detail", async (req: AuthRequest, res: Response, next) => {
  try {
    const metric = String(req.query.metric || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const valid = new Set([
      "wallet_float",
      "paygate_successful",
      "direct_disbursed",
      "direct_pending",
      "money_requests_paid",
      "money_requests_pending",
      "admin_paygate_fee",
      "expected_fee",
    ]);
    if (!valid.has(metric)) {
      return res.status(400).json({ error: "Invalid metric" });
    }

    if (metric === "wallet_float") {
      const [rows, total] = await Promise.all([
        Wallet.find()
          .populate("user", "name email username")
          .sort({ balance: -1, _id: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Wallet.countDocuments(),
      ]);
      const items = rows.map((w: any) => ({
        balance: Number(w.balance || 0),
        name: w.user?.name || "",
        email: w.user?.email || "",
        username: w.user?.username || "",
        userId: w.user?._id ? String(w.user._id) : "",
        walletId: String(w._id),
      }));
      return res.json({
        data: {
          label: "Wallet float",
          hint: "Current wallet balances across users.",
          total,
          items,
        },
      });
    }

    if (metric === "paygate_successful") {
      const match = { status: "successful", $or: [{ "metadata.directWalletSend": { $exists: false } }, { "metadata.directWalletSend": { $ne: true } }] };
      const [rows, total] = await Promise.all([
        Payment.find(match)
          .populate("user", "name email")
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Payment.countDocuments(match),
      ]);
      const items = rows.map((p: any) => ({
        createdAt: p.createdAt,
        amount: Number(p.amount || 0),
        reference: p.reference || "",
        status: p.status || "",
        directWalletSend: !!p.metadata?.directWalletSend,
        userName: p.user?.name || "",
        userEmail: p.user?.email || "",
        userId: p.user?._id ? String(p.user._id) : "",
      }));
      return res.json({
        data: {
          label: "PayGate successful",
          hint: "Successful PayGate payment rows.",
          total,
          items,
        },
      });
    }

    if (metric === "direct_disbursed" || metric === "direct_pending") {
      const status = metric === "direct_disbursed" ? "successful" : "pending";
      const match = { status, "metadata.directWalletSend": true };
      const [rows, total] = await Promise.all([
        Payment.find(match)
          .populate("user", "name email")
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Payment.countDocuments(match),
      ]);
      const items = rows.map((p: any) => ({
        createdAt: p.createdAt,
        amount: Number(p.amount || 0),
        reference: p.reference || "",
        status: p.status || "",
        userName: p.user?.name || "",
        userEmail: p.user?.email || "",
        userId: p.user?._id ? String(p.user._id) : "",
      }));
      return res.json({
        data: {
          label: metric === "direct_disbursed" ? "Direct disbursed" : "Direct pending",
          hint: "Direct wallet-send payment rows.",
          total,
          items,
        },
      });
    }

    if (metric === "money_requests_paid" || metric === "money_requests_pending") {
      const status = metric === "money_requests_paid" ? "paid" : "pending";
      const [rows, total] = await Promise.all([
        MoneyRequest.find({ status })
          .populate("fromUser", "name email")
          .populate("toUser", "name email")
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        MoneyRequest.countDocuments({ status }),
      ]);
      const items = rows.map((r: any) => ({
        id: String(r._id),
        amount: Number(r.amount || 0),
        status: r.status || "",
        fromName: r.fromUser?.name || "",
        fromEmail: r.fromUser?.email || "",
        toName: r.toUser?.name || "",
        toEmail: r.toUser?.email || "",
        paidAt: r.paidAt || null,
        expiresAt: r.expiresAt || null,
        createdAt: r.createdAt || null,
      }));
      return res.json({
        data: {
          label: metric === "money_requests_paid" ? "Money requests paid" : "Money requests pending",
          hint: "Money request rows by status.",
          total,
          items,
        },
      });
    }

    if (metric === "admin_paygate_fee") {
      const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
      const adminUser = adminEmail ? await User.findOne({ email: adminEmail }).select("_id email name").lean() : null;
      if (!adminUser?._id) {
        return res.json({
          data: {
            label: "Admin PayGate fee earned",
            hint: "Wallet credits with PAYGATE-FEE-* reference.",
            warning: "ADMIN_EMAIL not configured or admin user not found.",
            total: 0,
            items: [],
          },
        });
      }
      const rows = await Wallet.aggregate([
        { $match: { user: adminUser._id } },
        { $unwind: "$transactions" },
        { $match: { "transactions.reference": { $regex: "^PAYGATE-FEE-" } } },
        { $sort: { "transactions.createdAt": -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            createdAt: "$transactions.createdAt",
            amount: "$transactions.amount",
            reference: "$transactions.reference",
            type: "$transactions.type",
          },
        },
      ]);
      const totalAgg = await Wallet.aggregate([
        { $match: { user: adminUser._id } },
        { $unwind: "$transactions" },
        { $match: { "transactions.reference": { $regex: "^PAYGATE-FEE-" } } },
        { $count: "count" },
      ]);
      return res.json({
        data: {
          label: "Admin PayGate fee earned",
          hint: "Wallet credits with PAYGATE-FEE-* reference.",
          total: Number(totalAgg[0]?.count || 0),
          items: rows.map((r: any) => ({
            createdAt: r.createdAt,
            amount: Number(r.amount || 0),
            reference: r.reference || "",
            type: r.type || "credit",
          })),
        },
      });
    }

    // expected_fee
    const paygateFlatFee = Number(getPayGateFlatFeeZar() || 0);
    const [rows, total] = await Promise.all([
      Payment.find({ status: "successful" })
        .populate("user", "name email")
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments({ status: "successful" }),
    ]);
    const items = rows.map((p: any) => ({
      createdAt: p.createdAt,
      amount: Number(p.amount || 0),
      impliedFee: paygateFlatFee,
      reference: p.reference || "",
      status: p.status || "",
      userName: p.user?.name || "",
      userEmail: p.user?.email || "",
      userId: p.user?._id ? String(p.user._id) : "",
    }));
    return res.json({
      data: {
        label: "Expected fee vs successful",
        hint: "Successful PayGate rows with implied flat fee per row.",
        configuredFlatFee: paygateFlatFee,
        total,
        items,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PayGate flat-fee report (admin wallet credits with PAYGATE-FEE-<reference>)
router.get("/paygate-fees/report", async (_req: AuthRequest, res: Response, next) => {
  try {
    const daysRaw = Number(_req.query.days ?? 30);
    const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, Math.floor(daysRaw))) : 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const end = new Date();

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
    if (!adminEmail) {
      return res.status(400).json({ error: "ADMIN_EMAIL not configured" });
    }
    const adminUser = await User.findOne({ email: adminEmail }).select("_id email name").lean();
    if (!adminUser?._id) {
      return res.status(404).json({ error: "Admin user not found for ADMIN_EMAIL" });
    }

    const rows = await Wallet.aggregate([
      { $match: { user: adminUser._id } },
      { $unwind: "$transactions" },
      {
        $match: {
          "transactions.reference": { $regex: "^PAYGATE-FEE-" },
          "transactions.createdAt": { $gte: start, $lte: end },
        },
      },
      {
        $project: {
          amount: "$transactions.amount",
          createdAt: "$transactions.createdAt",
          reference: "$transactions.reference",
          day: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$transactions.createdAt",
              timezone: "Africa/Johannesburg",
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    const dailyMap = new Map<string, { day: string; count: number; total: number }>();
    let totalFees = 0;
    for (const r of rows as any[]) {
      const day = String(r.day || "");
      const amount = Number(r.amount || 0);
      totalFees += amount;
      const prev = dailyMap.get(day) || { day, count: 0, total: 0 };
      prev.count += 1;
      prev.total += amount;
      dailyMap.set(day, prev);
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
    const txCount = rows.length;
    const avgFee = txCount > 0 ? Math.round((totalFees / txCount) * 100) / 100 : 0;

    return res.json({
      data: {
        windowDays: days,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        admin: {
          userId: String(adminUser._id),
          email: adminUser.email,
          name: adminUser.name,
        },
        totals: {
          transactions: txCount,
          totalFees: Math.round(totalFees * 100) / 100,
          averageFee: avgFee,
        },
        daily,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get all users with filters
router.get("/users", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, role, active, suspended } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = {};
    if (role) query.role = role;
    if (active !== undefined) query.active = active === "true";
    if (suspended !== undefined) query.suspended = suspended === "true";

    const [users, total] = await Promise.all([
      User.find(query).select("-passwordHash").sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      User.countDocuments(query),
    ]);

    const waQuery = { email: /@morongwa\.local$/i } as const;
    const waUserIds = await User.find(waQuery).select("_id").lean();
    const waIds = waUserIds.map((u: any) => u._id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      waRegisteredTotal,
      waRegisteredActive,
      waRegisteredSuspended,
      waRegisteredNewLast30d,
      waWalletActiveUsers,
      waLoginsLast7d,
    ] = await Promise.all([
      User.countDocuments(waQuery),
      User.countDocuments({ ...waQuery, active: true, suspended: { $ne: true } }),
      User.countDocuments({ ...waQuery, suspended: true }),
      User.countDocuments({ ...waQuery, createdAt: { $gte: thirtyDaysAgo } }),
      waIds.length
        ? Wallet.countDocuments({ user: { $in: waIds }, "transactions.0": { $exists: true } })
        : Promise.resolve(0),
      waIds.length
        ? AuditLog.countDocuments({
            action: "USER_LOGIN",
            user: { $in: waIds },
            createdAt: { $gte: sevenDaysAgo },
          })
        : Promise.resolve(0),
    ]);

    res.json({
      users,
      pagination: {
        total,
        page: Math.floor(skip / limitNum) + 1,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
      metrics: {
        whatsappRegistered: {
          total: waRegisteredTotal,
          active: waRegisteredActive,
          suspended: waRegisteredSuspended,
          newLast30d: waRegisteredNewLast30d,
        },
        whatsappActivity: {
          walletActiveUsers: waWalletActiveUsers,
          loginsLast7d: waLoginsLast7d,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Suspend/unsuspend user
router.post("/users/:id/suspend", async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);

    user.suspended = !user.suspended;
    user.suspendedAt = user.suspended ? new Date() : undefined;
    await user.save();

    await AuditLog.create({
      action: user.suspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
      user: req.user!._id,
      target: user._id,
      meta: { reason: req.body.reason },
    });

    if (user.suspended) {
      await sendNotification({
        userId: user._id.toString(),
        type: "ACCOUNT_SUSPENDED",
        message: "Your account has been suspended",
        channel: "email",
        email: {
          subject: "Account Suspended",
          html: `<p>Your account has been suspended. ${req.body.reason || ""}</p>`,
        },
      });
    }

    res.json({
      message: user.suspended ? "User suspended" : "User unsuspended",
      user,
    });
  } catch (err) {
    next(err);
  }
});

// Admin: Verify a runner's vehicle document
router.post('/users/:id/vehicles/:index/verify', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    const idx = parseInt(req.params.index as any, 10);
    if (isNaN(idx) || !(user.vehicles && user.vehicles[idx])) {
      throw new AppError('Vehicle not found', 404);
    }

    user.vehicles[idx].verified = true as any;
    await user.save();

    if (syncRunnerVerifiedFlag(user)) {
      await user.save();
    }

    await AuditLog.create({ action: 'VEHICLE_VERIFIED', user: req.user!._id, target: user._id, meta: { vehicleIndex: idx } });

    await sendNotification({
      userId: user._id.toString(),
      type: 'VEHICLE_VERIFIED',
      message: 'Your vehicle documents have been verified by admin',
      channel: 'email',
      email: { subject: 'Vehicle Verified', html: '<p>Your vehicle documents were verified.</p>' },
    });

    res.json({ message: 'Vehicle verified', user });
  } catch (err) {
    next(err);
  }
});

// Admin: Verify runner PDP
router.post('/users/:id/pdp/verify', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    if (!user.pdp) throw new AppError('PDP not found', 404);

    (user.pdp as any).verified = true;
    await user.save();

    if (syncRunnerVerifiedFlag(user)) {
      await user.save();
    }

    await AuditLog.create({ action: 'PDP_VERIFIED', user: req.user!._id, target: user._id, meta: {} });

    await sendNotification({
      userId: user._id.toString(),
      type: 'PDP_VERIFIED',
      message: 'Your Professional Driving Permit (PDP) has been verified',
      channel: 'email',
      email: { subject: 'PDP Verified', html: '<p>Your PDP was verified by admin.</p>' },
    });

    res.json({ message: 'PDP verified', user });
  } catch (err) {
    next(err);
  }
});

// Admin: Verify store/parcel runner ID document
router.post('/users/:id/runner-id-document/verify', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    if (!user.runnerIdDocument) throw new AppError('ID document not found', 404);

    user.runnerIdDocument.verified = true as any;
    await user.save();

    if (syncRunnerVerifiedFlag(user)) {
      await user.save();
    }

    await AuditLog.create({ action: 'RUNNER_ID_VERIFIED', user: req.user!._id, target: user._id, meta: {} });

    res.json({ message: 'ID document verified', user });
  } catch (err) {
    next(err);
  }
});

// Admin: Verify store/parcel runner proof of residence
router.post('/users/:id/runner-proof-of-residence/verify', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    if (!user.runnerProofOfResidence) throw new AppError('Proof of residence not found', 404);

    user.runnerProofOfResidence.verified = true as any;
    await user.save();

    if (syncRunnerVerifiedFlag(user)) {
      await user.save();
    }

    await AuditLog.create({
      action: 'RUNNER_PROOF_OF_RESIDENCE_VERIFIED',
      user: req.user!._id,
      target: user._id,
      meta: {},
    });

    res.json({ message: 'Proof of residence verified', user });
  } catch (err) {
    next(err);
  }
});

// Get all tasks with filters
router.get("/tasks", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status, taskType, waLocal } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = {};
    if (status) query.status = status;
    const pendingQuote =
      String(req.query.pendingQuote || "").trim() === "1" || String(req.query.pendingQuote || "").toLowerCase() === "true";
    if (pendingQuote) {
      query.status = "pending_quote";
    }

    const waLocalOn = String(waLocal || "").trim() === "1" || String(waLocal || "").toLowerCase() === "true";
    /** WhatsApp menu path 4 — Local Errand (taskType general + WA metadata or legacy title). */
    if (!pendingQuote && waLocalOn) {
      query.taskType = "general";
      query.$or = [
        { "workflowMeta.createdVia": "whatsapp" },
        { "workflowMeta.errandFlow": "local" },
        { title: { $regex: /^Local Errand/i } },
      ];
    } else if (!pendingQuote) {
      const tt = typeof taskType === "string" ? taskType.trim() : "";
      if (tt && tt !== "all") {
        const collectVariants = ["collect_send", "cross_border_collection"];
        const shopVariants = ["shop_send", "shop_and_send"];
        const transportVariants = ["transport", "large_transport"];
        if (tt === "collect_send") query.taskType = { $in: collectVariants };
        else if (tt === "shop_send") query.taskType = { $in: shopVariants };
        else if (tt === "transport") query.taskType = { $in: transportVariants };
        else if (tt === "general") query.taskType = "general";
        else query.taskType = tt;
      }
    }

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("client", "name email phone countryCode location")
        .populate("runner", "name email phone countryCode location")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Task.countDocuments(query),
    ]);

    res.json({
      tasks,
      pagination: {
        total,
        page: Math.floor(skip / limitNum) + 1,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Publish admin quote for WhatsApp Collect & Send tasks stuck in `pending_quote`. Notifies client (WhatsApp when phone known) and runners. */
router.post("/tasks/:id/publish-quote", async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id).populate("client", "name phone email");
    if (!task) throw new AppError("Task not found", 404);
    if (task.status !== "pending_quote") {
      throw new AppError("Task is not awaiting an admin quote", 400);
    }
    const raw = req.body?.clientTotalZar ?? req.body?.budget ?? req.body?.amount ?? req.body?.quotedTotal;
    const amount = typeof raw === "string" ? parseFloat(raw) : Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError("Valid quote amount (ZAR) is required", 400);
    }
    const rounded = Math.round(amount * 100) / 100;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 2000) : "";

    task.budget = rounded;
    task.suggestedFee = rounded;
    task.status = "posted";
    const wm = { ...(task.workflowMeta || {}) };
    wm.quoteStatus = "published";
    wm.adminQuotedAt = new Date().toISOString();
    wm.adminQuotedBy = req.user!._id;
    if (notes) wm.adminQuoteNotes = notes;
    task.workflowMeta = wm;
    await task.save();

    await AuditLog.create({
      action: "TASK_QUOTE_PUBLISHED",
      user: req.user!._id,
      target: task._id,
      meta: { amountZar: rounded, notes },
    });

    const clientUser = task.client as any;
    const phone = String(clientUser?.phone || "").trim();
    const msg = [
      "✅ Your Collect & Send quote is ready",
      "",
      `Amount: R${rounded.toFixed(2)}`,
      `Reference: #${String(task._id).slice(-6)}`,
      "",
      `Open your dashboard for next steps: ${FRONTEND_URL}/dashboard/client`,
    ].join("\n");

    if (phone) {
      try {
        await sendSms({ phone, text: msg, channel: "whatsapp" });
      } catch (e) {
        logger.warn("publish-quote WhatsApp notify failed", { error: String((e as any)?.message || e) });
      }
    }

    try {
      const matches = await findMatchingRunners(String(task._id));
      for (const match of (matches || []).slice(0, 5)) {
        await sendNotification({
          userId: match.runnerId,
          type: "NEW_TASK",
          message: `New Errands task: ${task.title} — R${rounded.toFixed(2)}`,
        });
      }
    } catch (e) {
      logger.warn("publish-quote runner notify failed", { error: String((e as any)?.message || e) });
    }

    await sendNotification({
      userId: task.client.toString(),
      type: "TASK_QUOTED",
      message: `Your errand quote is ready: R${rounded.toFixed(2)} — ${task.title}`,
      channel: "realtime",
    });

    res.json({ message: "Quote published", task });
  } catch (err) {
    next(err);
  }
});

// Cancel task (admin override)
router.post("/tasks/:id/cancel", async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);

    task.status = "cancelled";
    task.cancelledAt = new Date();
    await task.save();

    await AuditLog.create({
      action: "TASK_CANCELLED_BY_ADMIN",
      user: req.user!._id,
      target: task._id,
      meta: { reason: req.body.reason },
    });

    res.json({ message: "Task cancelled successfully", task });
  } catch (err) {
    next(err);
  }
});

/** Notify runners about an open posted task (admin broadcast). */
router.post("/tasks/:id/broadcast-runners", async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);
    if (task.status !== "posted") {
      throw new AppError("Broadcast is only available for tasks that are still posted (waiting for a runner).", 400);
    }

    const note =
      typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "";
    let matches = await findMatchingRunners(String(task._id), { limit: 25 });
    if (!matches.length) {
      const runners = await User.find({ role: "runner", active: true, suspended: false })
        .select("_id name")
        .limit(25)
        .lean();
      matches = runners.map((u: any) => ({
        runnerId: String(u._id),
        name: u.name || "",
        distance: 0,
        rating: 0,
        completedTasks: 0,
        score: 0,
      }));
    }

    const tail = String(task._id).slice(-6);
    const feeLabel = task.suggestedFee != null ? `R${Number(task.suggestedFee).toFixed(2)}` : `R${Number(task.budget || 0).toFixed(2)}`;
    const baseMsg =
      note ||
      `Admin broadcast — ${task.title} (${feeLabel}). Task #${tail}. Open Runner dashboard or ${FRONTEND_URL}/dashboard/runner`;

    const slice = matches.slice(0, 25);
    for (const m of slice) {
      await sendNotification({
        userId: m.runnerId,
        type: "ADMIN_TASK_BROADCAST",
        message: baseMsg,
        channel: "realtime",
      });
    }

    const wm = { ...(task.workflowMeta || {}) };
    wm.adminBroadcastAt = new Date().toISOString();
    wm.adminBroadcastBy = req.user!._id;
    wm.adminBroadcastCount = Number(wm.adminBroadcastCount || 0) + slice.length;
    task.workflowMeta = wm;
    await task.save();

    await AuditLog.create({
      action: "ADMIN_TASK_BROADCAST_RUNNERS",
      user: req.user!._id,
      target: task._id,
      meta: { notified: slice.length, hadNote: Boolean(note) },
    });

    res.json({ message: "Runners notified", notified: slice.length, task });
  } catch (err) {
    next(err);
  }
});

/** Ping a specific runner about a task (admin). */
router.post("/tasks/:id/contact-runner", async (req: AuthRequest, res: Response, next) => {
  try {
    const runnerId = String(req.body?.runnerUserId || req.body?.runnerId || "").trim();
    const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 2000) : "";
    if (!runnerId) throw new AppError("runnerUserId is required", 400);

    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);

    const runner = await User.findById(runnerId).select("role name suspended active").lean();
    if (!runner || !Array.isArray((runner as any).role) || !(runner as any).role.includes("runner")) {
      throw new AppError("Target user is not a runner", 400);
    }
    if (!(runner as any).active || (runner as any).suspended) {
      throw new AppError("Runner account is not active", 400);
    }

    const adminName = String((req.user as any)?.name || "Admin").trim() || "Admin";
    const tail = String(task._id).slice(-6);
    const text =
      message ||
      `Please review errands task "${task.title}" (#${tail}). ${FRONTEND_URL}/tasks/${task._id}`;

    await sendNotification({
      userId: runnerId,
      type: "ADMIN_TASK_DIRECT",
      message: `${adminName}: ${text}`,
      channel: "realtime",
    });

    await AuditLog.create({
      action: "ADMIN_TASK_CONTACT_RUNNER",
      user: req.user!._id,
      target: task._id,
      meta: { runnerId, snippet: text.slice(0, 240) },
    });

    res.json({ message: "Runner notified", taskId: task._id, runnerId });
  } catch (err) {
    next(err);
  }
});

// Get pending payouts
router.get("/payouts/pending", async (req: AuthRequest, res: Response, next) => {
  try {
    const pendingPayouts = await Transaction.find({ type: "payout", status: "pending" })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json({ payouts: pendingPayouts });
  } catch (err) {
    next(err);
  }
});

// Update user profile (admin)
router.put("/users/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);

    const body = req.body || {};
    const changes: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) throw new AppError("Name is required", 400);
      user.name = name;
      changes.name = name;
    }

    if (body.username !== undefined) {
      const raw = String(body.username || "").trim().toLowerCase();
      if (raw && !/^[a-z0-9._-]{3,32}$/.test(raw)) {
        throw new AppError("Username must be 3–32 characters (letters, numbers, . _ -)", 400);
      }
      if (raw) {
        const dup = await User.findOne({ username: raw, _id: { $ne: user._id } });
        if (dup) throw new AppError("Username already in use", 400);
      }
      user.username = raw || undefined;
      changes.username = raw || null;
    }

    if (body.email !== undefined) {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) throw new AppError("Valid email is required", 400);
      const dup = await User.findOne({ email, _id: { $ne: user._id } });
      if (dup) throw new AppError("Email already in use", 400);
      user.email = email;
      changes.email = email;
    }

    if (body.phone !== undefined) {
      const phone = String(body.phone || "").trim();
      user.phone = phone || undefined;
      changes.phone = phone || null;
    }

    if (body.countryCode !== undefined) {
      const cc = String(body.countryCode || "").trim().toUpperCase();
      if (cc && !STORE_LOCATION_COUNTRIES.some((c) => c.code === cc)) {
        throw new AppError("Invalid country code", 400);
      }
      user.countryCode = cc || undefined;
      changes.countryCode = cc || null;
    }

    if (body.runnerServiceCountry !== undefined) {
      const rsc = String(body.runnerServiceCountry || "").trim().toUpperCase();
      if (rsc && !STORE_LOCATION_COUNTRIES.some((c) => c.code === rsc)) {
        throw new AppError("Invalid runner service country", 400);
      }
      user.runnerServiceCountry = rsc || undefined;
      changes.runnerServiceCountry = rsc || null;
    }

    if (body.runnerServiceCity !== undefined) {
      const city = String(body.runnerServiceCity || "").trim().toLowerCase();
      user.runnerServiceCity = city || undefined;
      changes.runnerServiceCity = city || null;
    }

    await user.save();

    await AuditLog.create({
      action: "USER_UPDATED",
      user: req.user!._id,
      target: user._id,
      meta: { changes },
    });

    const safe = user.toObject();
    delete (safe as { passwordHash?: string }).passwordHash;
    res.json({ message: "User updated", user: safe });
  } catch (err) {
    next(err);
  }
});

// Activate user (unsuspend)
router.post("/users/:id/activate", async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    user.suspended = false;
    user.suspendedAt = undefined;
    await user.save();
    await AuditLog.create({
      action: "USER_ACTIVATED",
      user: req.user!._id,
      target: user._id,
      meta: {},
    });
    res.json({ message: "User activated", user });
  } catch (err) {
    next(err);
  }
});

/** Permanently delete a user (super-admin only). Use Suspend for most cases. */
router.delete("/users/:id", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (String(req.user!._id) === String(id)) {
      throw new AppError("You cannot delete your own account", 400);
    }
    const user = await User.findById(id);
    if (!user) throw new AppError("User not found", 404);

    const roles = Array.isArray(user.role) ? user.role : [user.role];
    if (roles.some((r) => r === "admin" || r === "superadmin")) {
      throw new AppError("Cannot delete admin or superadmin accounts. Suspend instead.", 400);
    }

    const oid = user._id;
    const orderCount = await Order.countDocuments({
      $or: [{ buyerId: oid }, { "items.resellerId": oid }],
    });
    if (orderCount > 0) {
      throw new AppError("Cannot delete a user with order history. Suspend the account instead.", 400);
    }
    const taskCount = await Task.countDocuments({
      $or: [{ client: oid }, { runner: oid }],
    });
    if (taskCount > 0) {
      throw new AppError("Cannot delete a user linked to errands/tasks. Suspend instead.", 400);
    }
    const txCount = await Transaction.countDocuments({ user: oid });
    if (txCount > 0) {
      throw new AppError("Cannot delete a user with ledger/payout history. Suspend instead.", 400);
    }
    const supplier = await Supplier.findOne({ userId: oid });
    if (supplier) {
      throw new AppError("Cannot delete a registered supplier from this action. Handle supplier records first or suspend.", 400);
    }
    const wallet = await Wallet.findOne({ user: oid });
    if (wallet && (wallet.balance > 0 || (wallet.transactions?.length ?? 0) > 0)) {
      throw new AppError("Cannot delete a user with wallet balance or wallet activity. Suspend instead.", 400);
    }

    await Cart.deleteMany({ user: oid });
    await ResellerWall.deleteMany({ resellerId: oid });
    await Store.deleteMany({ userId: oid });
    await TVPost.deleteMany({ creatorId: oid });
    await TVComment.deleteMany({ userId: oid });
    await DirectMessage.deleteMany({ $or: [{ sender: oid }, { receiver: oid }] });
    if (wallet) await Wallet.deleteOne({ _id: wallet._id });

    await User.deleteOne({ _id: oid });

    await AuditLog.create({
      action: "USER_DELETED",
      user: req.user!._id,
      target: oid,
      meta: { email: user.email, name: user.name },
    });

    res.json({ message: "User deleted permanently" });
  } catch (err) {
    next(err);
  }
});

// Approve payout (legacy Transaction-based)
router.post("/payouts/:id/approve", async (req: AuthRequest, res: Response, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) throw new AppError("Transaction not found", 404);
    if (transaction.type !== "payout") {
      throw new AppError("Not a payout transaction", 400);
    }
    transaction.status = "successful";
    await transaction.save();
    await AuditLog.create({
      action: "PAYOUT_APPROVED",
      user: req.user!._id,
      meta: { transactionId: transaction._id, amount: transaction.amount },
    });
    await sendNotification({
      userId: transaction.user!.toString(),
      type: "PAYOUT_APPROVED",
      message: `Your payout of R${transaction.amount} has been approved`,
      channel: "email",
      email: { subject: "Payout Approved" },
    });
    res.json({ message: "Payout approved successfully", transaction });
  } catch (err) {
    next(err);
  }
});

// Reject payout (legacy)
router.post("/payouts/:id/reject", async (req: AuthRequest, res: Response, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) throw new AppError("Transaction not found", 404);
    if (transaction.type !== "payout") throw new AppError("Not a payout transaction", 400);
    transaction.status = "failed";
    await transaction.save();
    await AuditLog.create({
      action: "PAYOUT_REJECTED",
      user: req.user!._id,
      meta: { transactionId: transaction._id, reason: req.body.reason },
    });
    res.json({ message: "Payout rejected", transaction });
  } catch (err) {
    next(err);
  }
});

// ——— Escrow: list, detail with ledger, release, refund, FNB payout ———

router.get("/escrows", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status as string;
    const [escrows, total] = await Promise.all([
      Escrow.find(query)
        .populate("task", "title status")
        .populate("client", "name email")
        .populate("runner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Escrow.countDocuments(query),
    ]);
    res.json({
      escrows,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/escrows/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const data = await payoutService.getEscrowDetails(req.params.id);
    res.json(data);
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/release", async (req: AuthRequest, res: Response, next) => {
  try {
    const escrow = await payoutService.releaseEscrow(req.params.id, "manual_release");
    await AuditLog.create({
      action: "ESCROW_MANUAL_RELEASE",
      user: req.user!._id,
      target: escrow._id,
      meta: { escrowId: escrow._id, taskId: escrow.task, runnersNet: escrow.runnersNet },
    });
    res.json({ message: "Escrow released; payout can be initiated.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/refund", async (req: AuthRequest, res: Response, next) => {
  try {
    const reason = (req.body.reason as string) || "Admin refund";
    const escrow = await payoutService.refundEscrow(req.params.id, reason);
    await AuditLog.create({
      action: "ESCROW_REFUND",
      user: req.user!._id,
      target: escrow._id,
      meta: { escrowId: escrow._id, reason },
    });
    res.json({ message: "Refund processed.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/initiate-payout", async (req: AuthRequest, res: Response, next) => {
  try {
    const escrow = await payoutService.initiatePayout(req.params.id);
    await AuditLog.create({
      action: "FNB_PAYOUT_INITIATED",
      user: req.user!._id,
      target: escrow._id,
      meta: { escrowId: escrow._id, fnbInstructionId: escrow.fnbInstructionId, amount: escrow.runnersNet },
    });
    res.json({ message: "FNB payout initiated.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/poll-payout", async (req: AuthRequest, res: Response, next) => {
  try {
    const escrow = await payoutService.pollPayoutStatus(req.params.id);
    res.json({ message: "Payout status updated.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

// FNB balance
router.get("/fnb/balance", async (req: AuthRequest, res: Response) => {
  try {
    const balance = await fnbService.getAccountBalance();
    res.json({ balance });
  } catch (err: any) {
    // Keep admin pages functional even when external bank API is temporarily down.
    res.json({
      balance: null,
      unavailable: true,
      error: "FNB balance unavailable",
      detail: err?.message || "Unknown FNB error",
    });
  }
});

// Audit logs (paginated)
router.get("/audit", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, action } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (action) query.action = action as string;
    const [logs, total] = await Promise.all([
      AuditLog.find(query).populate("user", "name email").populate("target").sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      AuditLog.countDocuments(query),
    ]);
    res.json({
      logs,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// --- Marketplace / Suppliers / Orders / Reseller ---

// List suppliers (filter by status). Backfills supplier stores missing marketplace Supplier links.
router.get("/suppliers", requireAnySection(["suppliers", "supplier_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status, hasActiveStore } = req.query;
    await backfillSupplierStoresMissingLink(req.user!._id);
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status as string;
    const activeStoreOnly =
      hasActiveStore === "1" || hasActiveStore === "true" || hasActiveStore === "yes";
    const [rawSuppliers, totalBeforeFilter] = await Promise.all([
      Supplier.find(query)
        .populate("userId", "name email phone countryCode runnerServiceCountry runnerServiceCity location")
        .sort({ appliedAt: -1 })
        .skip(activeStoreOnly ? 0 : skip)
        .limit(activeStoreOnly ? 500 : limitNum)
        .lean(),
      Supplier.countDocuments(query),
    ]);
    let list = rawSuppliers;
    let total = totalBeforeFilter;
    if (activeStoreOnly) {
      const filtered = await filterSuppliersWithLiveStore(rawSuppliers);
      total = filtered.length;
      list = filtered.slice(skip, skip + limitNum);
    }
    const suppliers = await enrichSuppliersWithStoreCountry(list);
    res.json({
      suppliers,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Create or onboard a supplier for an existing user (approved immediately).
 * Creates / repairs Supplier record and ensures a supplier Store exists (same rules as approve + admin store creation).
 */
router.post("/suppliers", requireAnySection(["suppliers", "supplier_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const body = req.body as {
      userId?: string;
      type?: "company" | "individual";
      storeName?: string;
      contactEmail?: string;
      contactPhone?: string;
    };
    const userId = String(body.userId || "").trim();
    if (!userId) throw new AppError("userId is required", 400);

    const user = await User.findById(userId).select("_id name email").lean();
    if (!user) throw new AppError("User not found", 404);

    const type: "company" | "individual" =
      body.type === "company" ? "company" : body.type === "individual" ? "individual" : "individual";

    const storeNameRaw = body.storeName != null ? String(body.storeName).trim() : "";
    const storeName =
      storeNameRaw ||
      String((user as { name?: string }).name || "").trim() ||
      "My Store";

    const now = new Date();
    const reviewer = req.user!._id;
    const multiStore = await userCanOwnMultipleStores(userId);

    let store = await Store.findOne({
      userId,
      type: "supplier",
      name: new RegExp(`^${storeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (!store && !multiStore) {
      store = await Store.findOne({ userId, type: "supplier" });
    }

    let supplier: InstanceType<typeof Supplier> | null = null;
    if (store?.supplierId) {
      supplier = await Supplier.findById(store.supplierId);
    }
    if (!supplier && multiStore && store) {
      supplier = await Supplier.findOne({ userId, linkedStoreId: store._id });
    }
    if (!supplier && !multiStore) {
      supplier = await Supplier.findOne({ userId });
      if (supplier?.status === "approved" && store) {
        throw new AppError("This user already has an approved supplier profile.", 409);
      }
    }

    if (!store) {
      await assertCanCreateStoreForUser(userId, "supplier");
      let slug = slugify(storeName);
      let n = 1;
      while (await Store.findOne({ slug })) slug = `${slugify(storeName)}-${++n}`;
      const owner = await User.findById(userId).select("countryCode").lean();
      const loc = defaultStoreCountryFromUserCountryCode((owner as { countryCode?: string })?.countryCode);
      store = await Store.create({
        userId,
        name: storeName,
        slug,
        type: "supplier",
        createdBy: reviewer,
        country: loc.country,
        countryCode: loc.countryCode,
      });
    }

    if (!supplier) {
      const linked = await ensureApprovedSupplierForStore({
        store: { _id: store._id, userId: store.userId, name: store.name },
        reviewedBy: reviewer,
      });
      supplier = await Supplier.findById(linked.supplier._id);
      if (!supplier) throw new AppError("Failed to create supplier profile", 500);
      if (body.contactEmail) supplier.contactEmail = String(body.contactEmail).trim();
      if (body.contactPhone) supplier.contactPhone = String(body.contactPhone).trim();
      supplier.type = type;
      supplier.capturedByAdminId = reviewer;
      await supplier.save();
    } else {
      supplier.status = "approved";
      supplier.type = type;
      supplier.storeName = storeName;
      if (body.contactEmail !== undefined)
        supplier.contactEmail = body.contactEmail ? String(body.contactEmail).trim() : undefined;
      if (body.contactPhone !== undefined)
        supplier.contactPhone = body.contactPhone ? String(body.contactPhone).trim() : undefined;
      supplier.reviewedAt = now;
      supplier.reviewedBy = reviewer;
      supplier.capturedByAdminId = reviewer;
      supplier.rejectionReason = undefined;
      await supplier.save();
    }

    await linkSupplierStore(store, reviewer);
    store = await Store.findById(store._id);

    await AuditLog.create({
      action: "SUPPLIER_CREATED_BY_ADMIN",
      user: reviewer,
      target: supplier.userId,
      meta: { supplierId: supplier._id, storeId: store?._id },
    });

    const populated = await Supplier.findById(supplier._id)
      .populate("userId", "name email phone countryCode location")
      .lean();

    res.status(201).json({
      message: "Supplier added",
      data: populated,
      store,
    });
  } catch (err) {
    next(err);
  }
});

// Get single supplier (admin detail)
router.get("/suppliers/:id", requireAnySection(["suppliers", "supplier_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .populate("userId", "name email")
      .populate("reviewedBy", "name email")
      .populate("capturedByAdminId", "name email")
      .lean();
    if (!supplier) throw new AppError("Supplier not found", 404);

    const [pendingRequest, mayRequest] = await Promise.all([
      SupplierDeletionRequest.findOne({ supplierId: supplier._id, status: "pending" })
        .populate("requestedBy", "name email")
        .lean(),
      userMayRequestSupplierDeletion(req, supplier as { capturedByAdminId?: mongoose.Types.ObjectId | null }),
    ]);

    res.json({
      data: {
        ...supplier,
        pendingSupplierDeletionRequest: pendingRequest,
        canRequestSupplierDeletion: Boolean(mayRequest && !pendingRequest),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Approve supplier – create supplier store when approved
router.post("/suppliers/:id/approve", requireAnySection(["suppliers", "supplier_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new AppError("Supplier not found", 404);
    if (supplier.status !== "pending") throw new AppError("Supplier is not pending", 400);
    supplier.status = "approved";
    supplier.reviewedAt = new Date();
    supplier.reviewedBy = req.user!._id;
    if (!supplier.capturedByAdminId) {
      supplier.capturedByAdminId = req.user!._id;
    }
    supplier.rejectionReason = undefined;
    await supplier.save();

    // Create supplier store for this user if not exists
    let store = await Store.findOne({ userId: supplier.userId, type: "supplier" });
    if (!store) {
      const name = supplier.storeName || "My Store";
      let slug = slugify(name);
      let n = 1;
      while (await Store.findOne({ slug })) slug = `${slugify(name)}-${++n}`;
      const owner = await User.findById(supplier.userId).select("countryCode").lean();
      const loc = defaultStoreCountryFromUserCountryCode((owner as { countryCode?: string })?.countryCode);
      store = await Store.create({
        userId: supplier.userId,
        name,
        slug,
        type: "supplier",
        supplierId: supplier._id,
        createdBy: req.user!._id,
        country: loc.country,
        countryCode: loc.countryCode,
      });
    }
    await AuditLog.create({
      action: "SUPPLIER_APPROVED",
      user: req.user!._id,
      target: supplier.userId,
      meta: { supplierId: supplier._id, storeId: store._id },
    });
    res.json({ message: "Supplier approved", data: supplier, store });
  } catch (err) {
    next(err);
  }
});

// Update supplier (e.g. shipping cost)
router.put("/suppliers/:id", requireAnySection(["suppliers", "supplier_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new AppError("Supplier not found", 404);
    const body = req.body as Record<string, unknown>;
    if (body.shippingCost !== undefined) {
      const val = Number(body.shippingCost);
      (supplier as any).shippingCost = val >= 0 ? val : undefined;
    }
    if (body.pickupAddress !== undefined) (supplier as any).pickupAddress = body.pickupAddress;
    await supplier.save();
    res.json({ message: "Supplier updated", data: supplier });
  } catch (err) {
    next(err);
  }
});

// Reject supplier
router.post("/suppliers/:id/reject", requireAnySection(["suppliers", "supplier_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body;
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new AppError("Supplier not found", 404);
    if (supplier.status !== "pending") throw new AppError("Supplier is not pending", 400);
    supplier.status = "rejected";
    supplier.reviewedAt = new Date();
    supplier.reviewedBy = req.user!._id;
    supplier.rejectionReason = reason || "";
    if (!supplier.capturedByAdminId) {
      supplier.capturedByAdminId = req.user!._id;
    }
    await supplier.save();
    await AuditLog.create({
      action: "SUPPLIER_REJECTED",
      user: req.user!._id,
      target: supplier.userId,
      meta: { supplierId: supplier._id, reason: reason || "" },
    });
    res.json({ message: "Supplier rejected", data: supplier });
  } catch (err) {
    next(err);
  }
});

/** Sub-admin: request permanent supplier removal (super-admin must approve). */
router.post(
  "/suppliers/:id/request-deletion",
  requireAnySection(["suppliers", "supplier_uploads"]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const supplier = await Supplier.findById(req.params.id);
      if (!supplier) throw new AppError("Supplier not found", 404);

      const existing = await SupplierDeletionRequest.findOne({ supplierId: supplier._id, status: "pending" });
      if (existing) throw new AppError("A removal request is already pending for this supplier.", 409);

      const may = await userMayRequestSupplierDeletion(req, supplier);
      if (!may) {
        throw new AppError("You can only request removal for suppliers you onboarded or approved (captured).", 403);
      }

      const doc = await SupplierDeletionRequest.create({
        supplierId: supplier._id,
        requestedBy: req.user!._id,
        status: "pending",
      });

      await AuditLog.create({
        action: "SUPPLIER_DELETION_REQUESTED",
        user: req.user!._id,
        target: supplier.userId,
        meta: { supplierId: String(supplier._id), requestId: String(doc._id) },
      });

      const populated = await SupplierDeletionRequest.findById(doc._id)
        .populate("requestedBy", "name email")
        .lean();

      res.status(201).json({ message: "Removal submitted for super-admin approval", data: populated });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/supplier-deletion-requests", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const status = String(req.query.status || "pending").trim();
    const q: Record<string, unknown> = {};
    if (status === "all") {
      // list every status
    } else if (status === "pending" || status === "approved" || status === "rejected") {
      q.status = status;
    } else {
      q.status = "pending";
    }
    const list = await SupplierDeletionRequest.find(q)
      .sort({ createdAt: -1 })
      .populate("supplierId")
      .populate("requestedBy", "name email")
      .populate("resolvedBy", "name email")
      .limit(500)
      .lean();
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
});

router.post("/supplier-deletion-requests/:id/approve", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const dr = await SupplierDeletionRequest.findById(req.params.id);
    if (!dr) throw new AppError("Request not found", 404);
    if (dr.status !== "pending") throw new AppError("This request is not pending", 400);

    await executeSupplierPermanentDelete({ supplierId: dr.supplierId, actingAdminId: req.user!._id });

    dr.status = "approved";
    dr.resolvedAt = new Date();
    dr.resolvedBy = req.user!._id;
    dr.rejectReason = undefined;
    await dr.save();

    res.json({ message: "Supplier removed permanently", data: dr });
  } catch (err) {
    next(err);
  }
});

router.post("/supplier-deletion-requests/:id/reject", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body as { reason?: string };
    const dr = await SupplierDeletionRequest.findById(req.params.id);
    if (!dr) throw new AppError("Request not found", 404);
    if (dr.status !== "pending") throw new AppError("This request is not pending", 400);

    dr.status = "rejected";
    dr.resolvedAt = new Date();
    dr.resolvedBy = req.user!._id;
    dr.rejectReason = reason ? String(reason).trim() : "";
    await dr.save();

    await AuditLog.create({
      action: "SUPPLIER_DELETION_REJECTED",
      user: req.user!._id,
      meta: { requestId: String(dr._id), supplierId: String(dr.supplierId), reason: dr.rejectReason },
    });

    res.json({ message: "Removal request rejected", data: dr });
  } catch (err) {
    next(err);
  }
});

// ——— Artist verification (manual approval) ———
router.get("/artist-verifications", async (req: AuthRequest, res: Response, next) => {
  try {
    const { status } = req.query;
    const query: any = {};
    if (status) query.status = status as string;
    const list = await ArtistVerification.find(query)
      .populate("userId", "name email avatar")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
});

router.post("/artist-verifications/:id/approve", async (req: AuthRequest, res: Response, next) => {
  try {
    const av = await ArtistVerification.findById(req.params.id);
    if (!av) throw new AppError("Not found", 404);
    if (av.status !== "pending") throw new AppError("Not pending", 400);
    av.status = "approved";
    av.manualVerified = true;
    av.verifiedAt = new Date();
    av.verifiedBy = req.user!._id;
    await av.save();
    await User.updateOne({ _id: av.userId }, { $set: { artistVerified: true } });
    res.json({ message: "Artist approved", data: av });
  } catch (err) {
    next(err);
  }
});

router.post("/artist-verifications/:id/reject", async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body;
    const av = await ArtistVerification.findById(req.params.id);
    if (!av) throw new AppError("Not found", 404);
    if (av.status !== "pending") throw new AppError("Not pending", 400);
    av.status = "rejected";
    av.rejectionReason = reason || "";
    await av.save();
    res.json({ message: "Artist rejected", data: av });
  } catch (err) {
    next(err);
  }
});

/** Admin: Create artist/publisher account for a user (bypass application) */
router.post("/artists", async (req: AuthRequest, res: Response, next) => {
  try {
    const { userId, type = "artist", stageName, labelName } = req.body;
    if (!userId) throw new AppError("userId required", 400);
    const targetUser = await User.findById(userId);
    if (!targetUser) throw new AppError("User not found", 404);
    const existing = await ArtistVerification.findOne({ userId: targetUser._id });
    if (existing?.status === "approved") {
      const av = await ArtistVerification.findOne({ userId: targetUser._id })
        .populate("userId", "name email avatar")
        .lean();
      return res.status(200).json({ message: "User is already a verified artist", data: av });
    }
    await upsertApprovedArtistVerification({
      adminUserId: req.user!._id,
      ownerUserId: targetUser._id,
      type,
      stageName: stageName?.trim(),
      labelName: labelName?.trim(),
    });
    const av = await ArtistVerification.findOne({ userId: targetUser._id })
      .populate("userId", "name email avatar")
      .lean();
    res.status(201).json({ message: "Artist account created", data: av });
  } catch (err) {
    next(err);
  }
});

/**
 * Backfill `ArtistVerification` from distinct `Song.userId` values (already-uploaded catalog).
 */
router.post("/artists/sync-from-music-catalog", async (req: AuthRequest, res: Response, next) => {
  try {
    const rawIds = await Song.distinct("userId", { userId: { $exists: true, $ne: null } });
    const ids = rawIds.filter((id) => id && mongoose.isValidObjectId(String(id)));
    let processed = 0;
    for (const uid of ids) {
      const song = await Song.findOne({ userId: uid }).sort({ createdAt: -1 }).lean();
      await upsertApprovedArtistVerification({
        adminUserId: req.user!._id,
        ownerUserId: uid as mongoose.Types.ObjectId,
        type: "artist",
        stageName: song?.artist || undefined,
      });
      processed += 1;
    }
    res.json({
      message: "Artist verifications synced from music catalog",
      distinctOwners: ids.length,
      processed,
    });
  } catch (err) {
    next(err);
  }
});

// ——— Admin: Music (songs/albums) ———
router.get("/music/songs", async (req: AuthRequest, res: Response, next) => {
  try {
    const songs = await Song.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: songs });
  } catch (err) {
    next(err);
  }
});

/** Admin: Upload song (bypass artist verification) - WAV only (Apple standard) */
router.post(
  "/music/upload-song",
  (req: AuthRequest, res: Response, next) => {
    musicUploadSong(req, res, (err) => {
      if (err) return next(new AppError(err.message || "Upload failed", 400));
      next();
    });
  },
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { userId, title, artist, songwriters, producer, genre, lyrics } = req.body;
      if (!title?.trim()) throw new AppError("Song title is required", 400);
      if (!artist?.trim()) throw new AppError("Artist name is required", 400);
      if (!genre?.trim()) throw new AppError("Genre is required", 400);
      const downloadEnabled = String(req.body?.downloadEnabled || "false") === "true";
      const parsedDownloadPrice = Number(req.body?.downloadPrice);
      const downloadPrice = Number.isFinite(parsedDownloadPrice) ? parsedDownloadPrice : undefined;
      if (downloadEnabled) {
        if (downloadPrice == null || downloadPrice < 10 || downloadPrice > 25) {
          throw new AppError("Download price must be between R10 and R25", 400);
        }
      }
      const creatorId = userId ? (await User.findById(userId))?._id : req.user!._id;
      if (!creatorId) throw new AppError("User not found", 404);

      const files = (req as any).files as { audio?: Express.Multer.File[]; artwork?: Express.Multer.File[] };
      const audioFile = files?.audio?.[0];
      const artworkFile = files?.artwork?.[0];
      if (!audioFile) throw new AppError("No audio file uploaded. Use WAV: 16-bit or 24-bit, 44.1 kHz, Stereo.", 400);
      if (!artworkFile) throw new AppError("No artwork uploaded. Use 1200×1200 JPEG or PNG.", 400);

      const audioUrl = `/uploads/music/${audioFile.filename}`;
      const artworkUrl = `/uploads/music/${artworkFile.filename}`;

      const song = await Song.create({
        type: "song",
        title: title.trim(),
        artist: artist.trim(),
        songwriters: songwriters?.trim(),
        producer: producer?.trim(),
        genre: genre.trim(),
        lyrics: lyrics?.trim(),
        audioUrl,
        artworkUrl,
        userId: creatorId,
        downloadEnabled,
        downloadPrice: downloadEnabled ? downloadPrice : undefined,
      });

      const linkedOwnerId = typeof userId === "string" ? userId.trim() : "";
      if (linkedOwnerId) {
        await upsertApprovedArtistVerification({
          adminUserId: req.user!._id,
          ownerUserId: creatorId as mongoose.Types.ObjectId,
          type: "artist",
          stageName: artist.trim(),
        });
      }

      const tvPost = await TVPost.create({
        creatorId,
        type: "audio",
        mediaUrls: [audioUrl],
        caption: `${title.trim()} – ${artist.trim()}`,
        genre: genre.trim(),
        hasWatermark: true,
        status: "approved",
      });

      const populated = await Song.findById(song._id).populate("userId", "name email").lean();
      res.status(201).json({ data: populated, post: await TVPost.findById(tvPost._id).populate("creatorId", "name avatar").lean() });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: Upload album (bypass artist verification) */
router.post(
  "/music/upload-album",
  (req: AuthRequest, res: Response, next) => {
    musicUploadAlbum(req, res, (err) => (err ? next(err) : next()));
  },
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { userId, title, artist, songwriters, producer, genre, lyrics } = req.body;
      if (!title?.trim()) throw new AppError("Album title is required", 400);
      if (!artist?.trim()) throw new AppError("Artist name is required", 400);
      if (!genre?.trim()) throw new AppError("Genre is required", 400);
      const downloadEnabled = String(req.body?.downloadEnabled || "false") === "true";
      const parsedDownloadPrice = Number(req.body?.downloadPrice);
      const downloadPrice = Number.isFinite(parsedDownloadPrice) ? parsedDownloadPrice : undefined;
      if (downloadEnabled) {
        if (downloadPrice == null || downloadPrice < 10 || downloadPrice > 25) {
          throw new AppError("Download price must be between R10 and R25", 400);
        }
      }
      const creatorId = userId ? (await User.findById(userId))?._id : req.user!._id;
      if (!creatorId) throw new AppError("User not found", 404);

      const files = (req as any).files as { tracks?: Express.Multer.File[]; artwork?: Express.Multer.File[] };
      const trackFiles = files?.tracks || [];
      const artworkFile = files?.artwork?.[0];
      if (!trackFiles.length) throw new AppError("At least one WAV track is required", 400);
      if (!artworkFile) throw new AppError("Album artwork is required", 400);

      const tracks = trackFiles.map((file) => ({
        title: path.parse(file.originalname).name,
        audioUrl: `/uploads/music/${file.filename}`,
      }));
      const artworkUrl = `/uploads/music/${artworkFile.filename}`;

      const album = await Song.create({
        type: "album",
        title: title.trim(),
        artist: artist.trim(),
        songwriters: songwriters?.trim(),
        producer: producer?.trim(),
        genre: genre.trim(),
        lyrics: lyrics?.trim(),
        audioUrl: tracks[0].audioUrl,
        artworkUrl,
        tracks,
        userId: creatorId,
        downloadEnabled,
        downloadPrice: downloadEnabled ? downloadPrice : undefined,
      });

      const linkedOwnerIdAlbum = typeof userId === "string" ? userId.trim() : "";
      if (linkedOwnerIdAlbum) {
        await upsertApprovedArtistVerification({
          adminUserId: req.user!._id,
          ownerUserId: creatorId as mongoose.Types.ObjectId,
          type: "artist",
          stageName: artist.trim(),
        });
      }

      const tvPost = await TVPost.create({
        creatorId,
        type: "audio",
        mediaUrls: [tracks[0].audioUrl],
        caption: `${title.trim()} (Album) – ${artist.trim()}`,
        genre: genre.trim(),
        hasWatermark: true,
        status: "approved",
      });

      const populated = await Song.findById(album._id).populate("userId", "name email").lean();
      res.status(201).json({ data: populated, post: await TVPost.findById(tvPost._id).populate("creatorId", "name avatar").lean() });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: Delete song or album */
router.delete("/music/songs/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) throw new AppError("Song not found", 404);

    const audioUrls = [song.audioUrl];
    if (song.type === "album" && Array.isArray((song as any).tracks)) {
      (song as any).tracks.forEach((t: { audioUrl: string }) => audioUrls.push(t.audioUrl));
    }

    await Song.deleteOne({ _id: song._id });
    await TVPost.deleteMany({ type: "audio", mediaUrls: { $in: audioUrls } });
    await Cart.updateMany(
      { "musicItems.songId": song._id },
      { $pull: { musicItems: { songId: song._id } } }
    );
    await AuditLog.create({ action: "SONG_DELETED_BY_ADMIN", user: req.user!._id, target: song._id, meta: { title: song.title, artist: song.artist } });
    res.json({ message: "Song deleted" });
  } catch (err) {
    next(err);
  }
});

function adminOrderShippingStatus(
  order: {
    status?: string;
    amounts?: { shipping?: number };
    delivery?: { method?: string };
  },
  courierStatus?: string | null
): string {
  if (courierStatus) return String(courierStatus).replace(/_/g, " ");
  const st = String(order.status || "");
  if (st === "shipped") return "shipped";
  if (st === "delivered") return "delivered";
  if (st === "processing") return "processing";
  if (st === "paid") {
    const shipping = Number(order.amounts?.shipping ?? 0);
    if (shipping > 0 || order.delivery?.method === "courier") return "pending";
    if (order.delivery?.method === "collection") return "collection";
    return "not required";
  }
  if (st === "pending_payment") return "pending payment";
  if (st === "cancelled" || st === "refunded") return st.replace(/_/g, " ");
  return "—";
}

// List marketplace orders (checkout orders)
router.get("/orders", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status as string;
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("buyerId", "name email phone")
        .populate("supplierId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(query),
    ]);
    const orderIds = orders.map((o) => o._id);
    const shipments =
      orderIds.length > 0
        ? await CourierShipment.find({ orderId: { $in: orderIds } })
            .select("orderId status")
            .lean()
        : [];
    const courierStatusByOrder = new Map(
      shipments.map((s) => [String(s.orderId), String(s.status || "")])
    );
    const ordersWithShipping = orders.map((order) => ({
      ...order,
      shippingStatus: adminOrderShippingStatus(
        order,
        courierStatusByOrder.get(String(order._id)) || null
      ),
    }));
    res.json({
      orders: ordersWithShipping,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

/** Per-order dropshipping / checkout profit (estimated COGS from supplierCost, PayGate fee, reseller + music splits). */
router.get("/dropshipping/orders/:orderId/profit", async (req: AuthRequest, res: Response, next) => {
  try {
    const data = await buildOrderProfitBreakdown(req.params.orderId);
    if (!data) throw new AppError("Order not found", 404);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/**
 * Daily or monthly aggregate: customer paid, estimated supplier COGS, shipping, fees, net platform commission.
 * Query: from=ISO, to=ISO, groupBy=day|month (max range 366 days).
 */
router.get("/dropshipping/report", async (req: AuthRequest, res: Response, next) => {
  try {
    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();
    const groupBy = req.query.groupBy === "month" ? "month" : "day";
    if (!fromRaw || !toRaw) throw new AppError("Query params from and to (ISO dates) are required", 400);
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new AppError("Invalid date range", 400);
    if (to.getTime() < from.getTime()) throw new AppError("to must be on or after from", 400);
    const maxMs = 366 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxMs) throw new AppError("Range too large (maximum 366 days)", 400);
    const report = await aggregateDropshippingReport({ from, to, groupBy });
    res.json({ data: report });
  } catch (err) {
    next(err);
  }
});

// Reseller stats (counts for admin)
router.get("/reseller-stats", async (req: AuthRequest, res: Response, next) => {
  try {
    const totalWalls = await ResellerWall.countDocuments();
    const wallsWithProducts = await ResellerWall.countDocuments({ "products.0": { $exists: true } });
    const totalProductsOnWalls = await ResellerWall.aggregate([
      { $project: { count: { $size: "$products" } } },
      { $group: { _id: null, total: { $sum: "$count" } } },
    ]).then((r) => (r[0]?.total ?? 0) as number);
    res.json({
      totalWalls,
      wallsWithProducts,
      totalProductsOnWalls,
    });
  } catch (err) {
    next(err);
  }
});

// ——— Stores (admin) ———

router.get("/stores/countries", async (_req: AuthRequest, res: Response) => {
  res.json({ countries: STORE_LOCATION_COUNTRIES });
});

router.get("/stores", async (req: AuthRequest, res: Response, next) => {
  try {
    await backfillSupplierStoresMissingLink(req.user!._id);
    const { page, limit, type, supplierId } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (type) query.type = type as string;
    if (supplierId && mongoose.Types.ObjectId.isValid(String(supplierId))) {
      query.supplierId = new mongoose.Types.ObjectId(String(supplierId));
    }
    const [stores, total] = await Promise.all([
      Store.find(query).populate("userId", "name email").populate("supplierId", "storeName status").sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Store.countDocuments(query),
    ]);
    res.json({
      stores,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/stores", async (req: AuthRequest, res: Response, next) => {
  try {
    const { userId, name, type, country, countryCode } = req.body as {
      userId: string;
      name: string;
      type: "supplier" | "reseller";
      country?: string;
      countryCode?: string;
    };
    if (!userId || !name || !type || !["supplier", "reseller"].includes(type)) {
      throw new AppError("userId, name, and type (supplier|reseller) are required", 400);
    }
    await assertCanCreateStoreForUser(userId, type);
    const resolvedCountry = resolveStoreCountry(String(countryCode || country || "").trim());
    if (!resolvedCountry) {
      throw new AppError("country is required — select the store location country", 400);
    }
    let slug = slugify(name.trim());
    let n = 1;
    while (await Store.findOne({ slug })) slug = `${slugify(name.trim())}-${++n}`;
    const storeData: any = {
      userId,
      name: name.trim(),
      slug,
      type,
      country: resolvedCountry.country,
      countryCode: resolvedCountry.countryCode,
      whatsappMarketCountries: type === "supplier" ? [resolvedCountry.countryCode] : undefined,
      createdBy: req.user!._id,
    };
    const store = await Store.create(storeData);
    if (type === "supplier") {
      await linkSupplierStore(store, req.user!._id);
    }
    await AuditLog.create({ action: "STORE_CREATED_BY_ADMIN", user: req.user!._id, target: store._id, meta: { userId, type } });
    res.status(201).json({ message: "Store created", data: store });
  } catch (err) {
    next(err);
  }
});

/**
 * Lightweight user list for "Create store" owner picker.
 * Delegated admins may have `stores` without `users` (GET /admin/users would 403).
 */
router.get("/stores/user-options", async (req: AuthRequest, res: Response, next) => {
  try {
    const limitRaw = parseInt(String(req.query.limit || "200"), 10);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200));
    const q = String(req.query.q || "").trim();
    const query: Record<string, unknown> = {};
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
        { username: { $regex: safe, $options: "i" } },
      ];
    }
    const users = await User.find(query)
      .select("_id name email username")
      .sort(q ? { name: 1 } : { createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.get("/stores/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const store = await Store.findById(req.params.id).populate("userId", "name email").populate("supplierId", "storeName status").populate("createdBy", "name").lean();
    if (!store) throw new AppError("Store not found", 404);
    res.json({ data: store });
  } catch (err) {
    next(err);
  }
});

router.put("/stores/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const body = req.body as {
      name?: string;
      type?: "supplier" | "reseller";
      country?: string;
      countryCode?: string;
      address?: string;
      email?: string;
      cellphone?: string;
      whatsapp?: string;
      stripBackgroundPic?: string;
      whatsappMarketCountries?: string[];
      mapsUrl?: string;
      latitude?: number | null;
      longitude?: number | null;
    };
    const store = await Store.findById(req.params.id);
    if (!store) throw new AppError("Store not found", 404);
    if (body.type === "supplier" || body.type === "reseller") {
      if (body.type !== store.type) {
        if (body.type === "supplier") {
          const existingSupplierStores = await Store.countDocuments({
            userId: store.userId,
            type: "supplier",
            _id: { $ne: store._id },
          });
          if (existingSupplierStores > 0 && !(await userCanOwnMultipleStores(store.userId))) {
            throw new AppError(
              "This user already has a supplier store. Convert that store or enable multi-store for this owner.",
              409
            );
          }
          store.type = "supplier";
        } else {
          store.type = "reseller";
          store.supplierId = undefined;
        }
      }
    }
    const { applyStoreUpdates } = await import("../utils/applyStoreUpdates");
    try {
      await applyStoreUpdates(store, body);
    } catch (e) {
      const msg = (e as Error)?.message || "Invalid store update";
      throw new AppError(msg, 400);
    }
    if (store.type === "supplier") {
      await linkSupplierStore(store, req.user!._id);
    }
    await AuditLog.create({
      action: "STORE_UPDATED_BY_ADMIN",
      user: req.user!._id,
      target: store._id,
      meta: { slug: store.slug, type: store.type },
    });
    const updated = await Store.findById(store._id)
      .populate("userId", "name email")
      .populate("supplierId", "storeName status")
      .lean();
    res.json({ message: "Store updated", data: updated ?? store });
  } catch (err) {
    next(err);
  }
});

/** Admin: upload store profile / banner image (stripBackgroundPic). */
router.post("/stores/:id/strip-background", upload.single("image"), async (req: AuthRequest, res: Response, next) => {
  try {
    const file = req.file;
    if (!file || !file.mimetype?.startsWith("image/")) {
      throw new AppError("A valid image file is required", 400);
    }
    const filePath = (file as Express.Multer.File & { path?: string }).path
      || path.join(__dirname, "../../uploads", file.filename);
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
    const store = await Store.findById(req.params.id);
    if (!store) throw new AppError("Store not found", 404);
    const url = uploadsPathFromFilename(file.filename);
    store.stripBackgroundPic = url;
    await store.save();
    await AuditLog.create({
      action: "STORE_STRIP_BACKGROUND_UPDATED",
      user: req.user!._id,
      target: store._id,
      meta: { stripBackgroundPic: url, slug: store.slug },
    });
    const updated = await Store.findById(store._id)
      .populate("userId", "name email")
      .populate("supplierId", "storeName status")
      .lean();
    res.status(201).json({ url, message: "Store profile picture updated", data: updated ?? store });
  } catch (err) {
    next(err);
  }
});

/** Sub-admin: request store removal (super-admin approves in queue). Super-admin may delete immediately via DELETE. */
router.post("/stores/:id/request-deletion", async (req: AuthRequest, res: Response, next) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) throw new AppError("Store not found", 404);

    const existing = await StoreDeletionRequest.findOne({ storeId: store._id, status: "pending" });
    if (existing) throw new AppError("A removal request is already pending for this store.", 409);

    const doc = await StoreDeletionRequest.create({
      storeId: store._id,
      requestedBy: req.user!._id,
      status: "pending",
    });

    await AuditLog.create({
      action: "STORE_DELETION_REQUESTED",
      user: req.user!._id,
      target: store.userId,
      meta: { storeId: String(store._id), requestId: String(doc._id), type: store.type },
    });

    await notifySuperAdminsStoreDeletionRequest({
      storeName: store.name,
      storeType: store.type,
      requestedBy: req.user!._id,
    });

    const populated = await StoreDeletionRequest.findById(doc._id)
      .populate("requestedBy", "name email")
      .populate("storeId")
      .lean();

    res.status(201).json({
      message: "Removal submitted for super-admin approval",
      data: populated,
      pendingApproval: true,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/stores/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isSuperAdmin(req)) {
      throw new AppError(
        "Only super-admin can delete a store immediately. Use request removal and wait for super-admin approval.",
        403
      );
    }
    const result = await executeStorePermanentDelete({
      storeId: new mongoose.Types.ObjectId(req.params.id),
      actingAdminId: req.user!._id,
    });
    res.json({
      message: "Store deleted",
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/store-deletion-requests", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const status = String(req.query.status || "pending").trim();
    const q: Record<string, unknown> = {};
    if (status === "all") {
      // all statuses
    } else if (status === "pending" || status === "approved" || status === "rejected") {
      q.status = status;
    } else {
      q.status = "pending";
    }
    const list = await StoreDeletionRequest.find(q)
      .sort({ createdAt: -1 })
      .populate("storeId")
      .populate("requestedBy", "name email")
      .populate("resolvedBy", "name email")
      .limit(500)
      .lean();
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
});

router.post("/store-deletion-requests/:id/approve", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const dr = await StoreDeletionRequest.findById(req.params.id);
    if (!dr) throw new AppError("Request not found", 404);
    if (dr.status !== "pending") throw new AppError("This request is not pending", 400);

    const result = await executeStorePermanentDelete({
      storeId: dr.storeId,
      actingAdminId: req.user!._id,
    });

    dr.status = "approved";
    dr.resolvedAt = new Date();
    dr.resolvedBy = req.user!._id;
    dr.rejectReason = undefined;
    await dr.save();

    res.json({ message: "Store removed permanently", data: dr, ...result });
  } catch (err) {
    next(err);
  }
});

router.post("/store-deletion-requests/:id/reject", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body as { reason?: string };
    const dr = await StoreDeletionRequest.findById(req.params.id);
    if (!dr) throw new AppError("Request not found", 404);
    if (dr.status !== "pending") throw new AppError("This request is not pending", 400);

    dr.status = "rejected";
    dr.resolvedAt = new Date();
    dr.resolvedBy = req.user!._id;
    dr.rejectReason = reason ? String(reason).trim() : "";
    await dr.save();

    await AuditLog.create({
      action: "STORE_DELETION_REJECTED",
      user: req.user!._id,
      meta: { requestId: String(dr._id), storeId: String(dr.storeId), reason: dr.rejectReason },
    });

    res.json({ message: "Removal request rejected", data: dr });
  } catch (err) {
    next(err);
  }
});

// ——— Products (admin: load products for marketplace) ———

router.post(
  "/products/upload-images",
  requireAnySection(["products", "product_uploads"]),
  upload.array("images", 10),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files?.length) throw new AppError("At least one image is required (max 10).", 400);
      if (files.length > 10) throw new AppError("Maximum 10 images allowed.", 400);
      const nonImage = files.find((f) => !f.mimetype?.startsWith("image/"));
      if (nonImage) throw new AppError("All files must be images (e.g. JPEG, PNG, GIF, WebP).", 400);
      const urls = files.map((f) => encodeUploadsPublicPath(uploadsPathFromFilename(f.filename)));
      res.status(201).json({ urls });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/products", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, supplierId, active, supplierSource } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (supplierId) query.supplierId = supplierId;
    if (active !== undefined) query.active = active === "true";
    if (supplierSource) query.supplierSource = supplierSource;
    const [products, total] = await Promise.all([
      Product.find(query).populate("supplierId", "storeName status").sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(query),
    ]);
    const mapped = mapProductsStripInrForApi(products as Record<string, unknown>[]) as Record<
      string,
      unknown
    >[];
    res.json({
      products: mapped.map((p) => ({ ...p, images: normalizeProductImageUrls(p.images) })),
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/products/categories", async (_req: AuthRequest, res: Response) => {
  res.json({ data: MARKETPLACE_TOP_CATEGORIES.filter((c) => c.toLowerCase() !== "local") });
});

/** Approved suppliers for Load Products dropdown (product_uploads admins need not have /suppliers section). */
router.get("/products/supplier-options", async (req: AuthRequest, res: Response, next) => {
  try {
    const limitRaw = parseInt(String(req.query.limit || "200"), 10);
    const limitNum = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200));
    const activeStoreOnly =
      req.query.hasActiveStore === "1" ||
      req.query.hasActiveStore === "true" ||
      req.query.hasActiveStore === "yes";
    const rawSuppliers = await Supplier.find({ status: "approved" })
      .populate("userId", "name email phone countryCode")
      .sort({ storeName: 1, appliedAt: -1 })
      .limit(activeStoreOnly ? 500 : limitNum)
      .lean();
    let list = rawSuppliers;
    if (activeStoreOnly) {
      list = (await filterSuppliersWithLiveStore(rawSuppliers)).slice(0, limitNum);
    }
    const suppliers = await enrichSuppliersWithStoreCountry(list);
    res.json({ suppliers });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/products/categorize-missing",
  requireAnySection(["products", "product_uploads"]),
  async (req: AuthRequest, res: Response, next) => {
  try {
    const fallbackCategoryRaw = String(req.body?.fallbackCategory || "").trim();
    const fallbackCategory =
      MARKETPLACE_TOP_CATEGORIES.find((c) => c.toLowerCase() === fallbackCategoryRaw.toLowerCase()) ||
      DEFAULT_PRODUCT_CATEGORY;
    const limit = Math.min(Math.max(Number(req.body?.limit || 500), 1), 5000);
    const products = await Product.find({ active: true })
      .select("_id title description categories tags")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    const ops: any[] = [];
    let updated = 0;
    for (const p of products) {
      const current = Array.isArray((p as any).categories) ? (p as any).categories : [];
      const normalized = normalizeProductCategories(current, {
        title: (p as any).title,
        description: (p as any).description,
        tags: (p as any).tags,
      });
      const before = current.map((v: any) => String(v || "").trim()).filter(Boolean);
      const finalCategory = normalized[0] || fallbackCategory;
      if (before.length === 1 && before[0].toLowerCase() === finalCategory.toLowerCase()) continue;
      ops.push({
        updateOne: {
          filter: { _id: (p as any)._id },
          update: { $set: { categories: [finalCategory] } },
        },
      });
      updated += 1;
    }
    if (ops.length > 0) await Product.bulkWrite(ops);
    res.json({ message: "Product categories normalized", scanned: products.length, updated, fallbackCategory });
  } catch (err) {
    next(err);
  }
});

router.post("/products", requireAnySection(["products", "product_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const body = req.body as {
      supplierId: string;
      title: string;
      slug?: string;
      description?: string;
      images?: string[];
      price: number;
      discountPrice?: number;
      bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
      currency?: string;
      stock?: number;
      outOfStock?: boolean;
      sku?: string;
      sizes?: string[];
      allowResell?: boolean;
      categories?: string[];
      tags?: string[];
      availableCountries?: string[];
      colors?: Array<{ name: string; hex?: string; imageIndex?: number }>;
      freeShippingEnabled?: boolean;
      freeShippingAreas?: Array<{ countryCode: string; locality: string }>;
    };
    const { supplierId, title, price } = body;
    if (!supplierId || !title || price == null) throw new AppError("supplierId, title, and price are required", 400);
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length < 1) throw new AppError("At least one product image is required (max 10).", 400);
    if (images.length > 10) throw new AppError("Maximum 10 product images allowed.", 400);
    const supplier = await Supplier.findById(supplierId);
    if (!supplier || supplier.status !== "approved") throw new AppError("Supplier not found or not approved", 400);
    const linkedStore = supplier.linkedStoreId
      ? await Store.findById(supplier.linkedStoreId).select("name").lean()
      : await Store.findOne({ supplierId, type: "supplier" }).select("name").lean();
    const warehouseFreeLocal = resolveWarehouseFreeLocalForSupplier({
      storeName: supplier.storeName,
      linkedStoreName: linkedStore?.name,
    });
    let freeShippingFields: ReturnType<typeof resolveFreeShippingFieldsForCreate>;
    try {
      freeShippingFields = resolveFreeShippingFieldsForCreate(body, warehouseFreeLocal);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "Invalid free shipping areas", 400);
    }
    let slug = (body.slug && body.slug.trim()) || slugify(title);
    let n = 1;
    while (await Product.findOne({ slug })) slug = `${slugify(title)}-${++n}`;
    const discountPrice = body.discountPrice != null ? Number(body.discountPrice) : undefined;
    const bulkTiers = Array.isArray(body.bulkTiers)
      ? body.bulkTiers
          .filter((t) => t != null && Number(t.minQty) >= 0 && Number(t.price) >= 0)
          .map((t) => {
            const minQty = Number(t.minQty);
            return {
              minQty,
              maxQty: normalizeBulkTierMaxQty(Number(t.maxQty), minQty),
              price: Number(t.price),
            };
          })
          .filter((t) => t.maxQty >= t.minQty)
      : undefined;
    const storeCurrency = await resolveSupplierStoreCurrency(supplierId);
    const coerced = coerceCreateProductCurrencyFields({
      currency: body.currency || storeCurrency,
      price: Number(price),
      ...(discountPrice != null ? { discountPrice } : {}),
      ...(bulkTiers && bulkTiers.length > 0 ? { bulkTiers } : {}),
    });
    const categories = normalizeProductCategories(body.categories, {
      title: title.trim(),
      description: body.description,
      tags: body.tags,
    });
    const topCategory = categories[0] || DEFAULT_PRODUCT_CATEGORY;
    const adminPct = adminMarkupPctForCategory(topCategory);
    const mkRule = getMarketplaceCategoryMarkup(topCategory);
    const allowResell = body.allowResell != null ? !!body.allowResell : true;
    const listPrice = coerced.price;

    const markupFields: {
      qwertymatesMarkupPct: number;
      minResalePrice?: number;
      recommendedResellerPrice?: number;
      resellerMarginPct?: number;
    } = { qwertymatesMarkupPct: adminPct };
    if (allowResell && mkRule) {
      const mid = (mkRule.resellerMinPct + mkRule.resellerMaxPct) / 2;
      markupFields.minResalePrice = Math.round(listPrice * (1 + mkRule.resellerMinPct / 100) * 100) / 100;
      markupFields.recommendedResellerPrice = Math.round(listPrice * (1 + mid / 100) * 100) / 100;
      markupFields.resellerMarginPct = Math.round(mid * 10) / 10;
    }

    const adminColors = normalizeAdminProductColors(body.colors, images.length);
    if (!adminColors || !adminColorsCoverAllImages(adminColors, images.length)) {
      throw new AppError(
        "Enter a color name for each product image (e.g. Yellow, Black, Navy). Customers choose these at checkout.",
        400
      );
    }

    const product = await Product.create({
      supplierId,
      title: title.trim(),
      slug,
      description: body.description?.trim(),
      images,
      price: coerced.price,
      ...(coerced.discountPrice != null &&
        coerced.discountPrice > 0 &&
        coerced.discountPrice < coerced.price && { discountPrice: coerced.discountPrice }),
      ...(coerced.bulkTiers && coerced.bulkTiers.length > 0 && { bulkTiers: coerced.bulkTiers }),
      currency: coerced.currency,
      stock: body.stock != null ? Number(body.stock) : 0,
      outOfStock: body.outOfStock != null ? !!body.outOfStock : false,
      sku: body.sku?.trim(),
      sizes: normalizeProductSizes(Array.isArray(body.sizes) ? body.sizes : []),
      allowResell,
      categories,
      tags: Array.isArray(body.tags) ? body.tags : [],
      availableCountries: Array.isArray(body.availableCountries) ? body.availableCountries.filter(Boolean) : [],
      ...freeShippingFields,
      active: true,
      ...markupFields,
      colors: adminColors,
      colorsManual: true,
    });
    await AuditLog.create({ action: "PRODUCT_CREATED_BY_ADMIN", user: req.user!._id, target: product._id, meta: { supplierId } });
    const { queueFacebookPostForProduct } = await import("../services/facebookMarketplacePostService");
    queueFacebookPostForProduct(String(product._id), "admin-create");
    res.status(201).json({ message: "Product created", data: product });
  } catch (err) {
    next(err);
  }
});

/** Search CJ products only (browse) – superadmin */
router.get("/dropship/search-cj", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const { q, page, size } = req.query;
    const results = await searchCJProducts((q as string) || "hoodie", {
      page: page ? parseInt(page as string) : 1,
      size: size ? parseInt(size as string) : 20,
    });
    res.json({ products: results });
  } catch (err) {
    next(err);
  }
});

function jsonImportCJResponse(
  result: NonNullable<Awaited<ReturnType<typeof importProductFromCJ>>>
) {
  const status = result.created ? "imported" : result.updated ? "updated" : "already_exists";
  const message =
    status === "imported"
      ? "Product imported"
      : status === "updated"
        ? "Product updated"
        : "Product already imported";
  return { message, status, data: result.product, created: result.created, updated: result.updated };
}

/**
 * Import from CJ — JSON body (cjProductId or pid). Keeps old/mobile clients working when they POST
 * `/dropship/import-cj` without a path segment (avoids 404 "Route ... not found").
 * Must be registered before `/:cjProductId` so the bare path matches here.
 */
router.post("/dropship/import-cj", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const raw = (req.body as { cjProductId?: string; pid?: string; productSku?: string; forceUpdate?: boolean }) || {};
    const cjProductId = String(raw.cjProductId ?? raw.pid ?? "").trim();
    if (!cjProductId) throw new AppError("cjProductId is required", 400);
    const forceUpdate = raw.forceUpdate === true || req.query.forceUpdate === "true";
    const productSku = raw.productSku ? String(raw.productSku).trim() : undefined;
    const result = await importProductFromCJ(cjProductId, { forceUpdate, productSku });
    if (!result) throw new AppError("CJ product not found or import failed", 422);
    res.json(jsonImportCJResponse(result));
  } catch (err) {
    next(err);
  }
});

/** Import product from CJ by product ID (path) */
router.post("/dropship/import-cj/:cjProductId", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const { cjProductId } = req.params;
    const forceUpdate = req.query.forceUpdate === "true";
    const bodySku = (req.body as { productSku?: string } | undefined)?.productSku;
    const productSku = bodySku ? String(bodySku).trim() : undefined;
    const result = await importProductFromCJ(decodeURIComponent(String(cjProductId)), { forceUpdate, productSku });
    if (!result) throw new AppError("CJ product not found or import failed", 422);
    res.json(jsonImportCJResponse(result));
  } catch (err) {
    next(err);
  }
});

/** Search CJ and import products by keyword */
router.post("/dropship/search-import-cj", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const { query, limit } = req.body as { query?: string; limit?: number };
    const results = await searchAndImportFromCJ(query || "hoodie", limit ?? 5);
    const imported = results.filter((r) => !!r?.created).length;
    const updated = results.filter((r) => !!r?.updated).length;
    const skipped = results.filter((r) => r && !r.created && !r.updated).length;
    res.json({ message: "Import complete", imported, updated, skipped, data: results });
  } catch (err) {
    next(err);
  }
});

/** Sync CJ product stock from CJ API (run periodically to avoid selling out-of-stock) */
router.post("/dropship/sync-cj-stock", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const result = await syncCjProductStock();
    res.json({
      message: "Stock sync complete",
      data: {
        total: result.total,
        updated: result.updated,
        failed: result.failed,
        outOfStock: result.outOfStock,
      },
    });
  } catch (err: any) {
    next(new AppError(err?.message || "CJ stock sync failed", 503));
  }
});

/** Search EPROLO products only (browse) – superadmin */
router.get("/dropship/search-eprolo", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const { q, page, size } = req.query;
    const results = await searchEproloProducts((q as string) || "", {
      page: page ? parseInt(page as string) : 1,
      size: size ? parseInt(size as string) : 20,
    });
    res.json({ products: results });
  } catch (err) {
    next(err);
  }
});

/** Import product from EPROLO by product ID */
router.post("/dropship/import-eprolo/:eproloProductId", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const eproloProductId = String(req.params.eproloProductId || "").trim().replace(/^["']|["']$/g, "");
    const forceUpdate = req.query.forceUpdate === "true";
    const result = await importProductFromEprolo(eproloProductId, { forceUpdate });
    if (!result) throw new AppError("EPROLO product not found or import failed", 404);
    const status = result.created ? "imported" : result.updated ? "updated" : "already_exists";
    const message =
      status === "imported"
        ? "Product imported"
        : status === "updated"
          ? "Product updated"
          : "Product already imported";
    res.json({ message, status, data: result.product, created: result.created, updated: result.updated });
  } catch (err) {
    next(err);
  }
});

/** Search EPROLO and import products by keyword */
router.post("/dropship/search-import-eprolo", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const { query, limit } = req.body as { query?: string; limit?: number };
    const results = await searchAndImportFromEprolo(query || "", limit ?? 5);
    const imported = results.filter((r) => !!r?.created).length;
    const updated = results.filter((r) => !!r?.updated).length;
    const skipped = results.filter((r) => r && !r.created && !r.updated).length;
    res.json({ message: "Import complete", imported, updated, skipped, data: results });
  } catch (err) {
    next(err);
  }
});

/** Sync EPROLO product stock from EPROLO API */
router.post("/dropship/sync-eprolo-stock", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const result = await syncEproloProductStock();
    res.json({
      message: "Stock sync complete",
      data: {
        total: result.total,
        updated: result.updated,
        failed: result.failed,
        outOfStock: result.outOfStock,
      },
    });
  } catch (err: any) {
    next(new AppError(err?.message || "EPROLO stock sync failed", 503));
  }
});

/** SHEIN dropship configuration status */
router.get("/dropship/shein-status", requireSuperAdminOrDropshipSections, async (_req: AuthRequest, res: Response) => {
  const configured = await isExternalSupplierConfigured("shein");
  res.json({
    configured,
    message: configured
      ? "SHEIN Open Platform keys are configured"
      : "Add SHEIN_OPEN_KEY_ID and SHEIN_OPEN_SECRET_KEY to backend .env, then run npm run seed:external-suppliers",
  });
});

/** Search SHEIN products only (browse) – superadmin */
router.get("/dropship/search-shein", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!(await isExternalSupplierConfigured("shein"))) {
      throw new AppError(
        "SHEIN Open Platform API is not configured. Add SHEIN_OPEN_KEY_ID and SHEIN_OPEN_SECRET_KEY to backend .env and run npm run seed:external-suppliers.",
        503
      );
    }
    const { q, page, size } = req.query;
    const results = await searchSheinProducts((q as string) || "", {
      page: page ? parseInt(page as string, 10) : 1,
      size: size ? parseInt(size as string, 10) : 20,
    });
    res.json({ products: results });
  } catch (err) {
    next(err);
  }
});

/** Import product from SHEIN by SPU/product ID */
router.post("/dropship/import-shein/:sheinProductId", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const sheinProductId = String(req.params.sheinProductId || "").trim().replace(/^["']|["']$/g, "");
    if (!sheinProductId) throw new AppError("SHEIN product id required", 400);
    const forceUpdate = String(req.query.forceUpdate || "").toLowerCase() === "true";
    const result = await importProductFromShein(sheinProductId, { forceUpdate });
    if (!result) throw new AppError("SHEIN import failed — check API keys and product id", 503);
    const message = result.created ? "Product imported" : result.updated ? "Product updated" : "Product already exists";
    const status = result.created ? 201 : 200;
    res.status(status).json({ message, status, data: result.product, created: result.created, updated: result.updated });
  } catch (err) {
    next(err);
  }
});

/** Search SHEIN and import products by keyword */
router.post("/dropship/search-import-shein", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const { query, limit } = req.body as { query?: string; limit?: number };
    const results = await searchAndImportFromShein(query || "", limit ?? 5);
    const imported = results.filter((r) => !!r?.created).length;
    const updated = results.filter((r) => !!r?.updated).length;
    const skipped = results.filter((r) => r && !r.created && !r.updated).length;
    res.json({ message: "Import complete", imported, updated, skipped, data: results });
  } catch (err) {
    next(err);
  }
});

/** Sync SHEIN product stock from SHEIN API */
router.post("/dropship/sync-shein-stock", requireSuperAdminOrDropshipSections, async (req: AuthRequest, res: Response, next) => {
  try {
    const result = await syncSheinProductStock();
    res.json({
      message: "Stock sync complete",
      data: {
        total: result.total,
        updated: result.updated,
        failed: result.failed,
        outOfStock: result.outOfStock,
      },
    });
  } catch (err: any) {
    next(new AppError(err?.message || "SHEIN stock sync failed", 503));
  }
});

router.get("/products/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const product = await Product.findById(req.params.id).populate("supplierId", "storeName status").lean();
    if (!product) throw new AppError("Product not found", 404);
    res.json({ data: normalizeProductCurrencyInrToZarForApi(product as Record<string, unknown>) });
  } catch (err) {
    next(err);
  }
});

router.put("/products/:id", requireAnySection(["products", "product_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new AppError("Product not found", 404);
    const wasActive = !!product.active;
    const body = req.body as Record<string, unknown>;
    const allowed = ["title", "description", "images", "price", "discountPrice", "bulkTiers", "currency", "stock", "outOfStock", "sku", "sizes", "allowResell", "categories", "tags", "active", "colors", "colorsManual"];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === "discountPrice") {
          const val = body[key];
          if (val === null || val === "") {
            (product as any).discountPrice = undefined;
          } else {
            const num = Number(val);
            const price = product.price ?? 0;
            if (num > 0 && num < price) (product as any).discountPrice = num;
          }
        } else if (key === "bulkTiers") {
          const val = body[key];
          if (!Array.isArray(val)) {
            (product as any).bulkTiers = undefined;
          } else {
            const tiers = val
              .filter((t: any) => t != null && Number(t.minQty) >= 0 && Number(t.price) >= 0)
              .map((t: any) => {
                const minQty = Number(t.minQty);
                return {
                  minQty,
                  maxQty: normalizeBulkTierMaxQty(Number(t.maxQty), minQty),
                  price: Number(t.price),
                };
              })
              .filter((t: any) => t.maxQty >= t.minQty);
            (product as any).bulkTiers = tiers.length > 0 ? tiers : undefined;
          }
        } else if (key === "categories") {
          (product as any).categories = normalizeProductCategories(body.categories, {
            title: body.title ?? product.title,
            description: body.description ?? product.description,
            tags: body.tags ?? product.tags,
          });
        } else if (key === "colors") {
          const imageCount = Array.isArray(product.images) ? product.images.length : 0;
          const adminColors = normalizeAdminProductColors(body.colors, imageCount);
          if (imageCount > 0) {
            if (!adminColors || !adminColorsCoverAllImages(adminColors, imageCount)) {
              throw new AppError(
                "Enter a color name for each product image (e.g. Yellow, Black, Navy). Customers choose these at checkout.",
                400
              );
            }
            (product as any).colors = adminColors;
            (product as any).colorsManual = true;
          } else if (adminColors?.length) {
            (product as any).colors = adminColors;
            (product as any).colorsManual = adminColorsCoverAllImages(adminColors, imageCount);
          } else if (body.colors === null || (Array.isArray(body.colors) && body.colors.length === 0)) {
            (product as any).colors = undefined;
            (product as any).colorsManual = false;
          }
        } else if (key === "colorsManual") {
          (product as any).colorsManual = !!body[key];
        } else if (key === "sizes") {
          (product as any).sizes = normalizeProductSizes(Array.isArray(body.sizes) ? (body.sizes as string[]) : []);
        } else {
          (product as any)[key] = key === "active" ? !!body[key] : key === "images" && Array.isArray(body[key]) ? body[key] : body[key];
        }
      }
    }
    if (body.title && typeof body.title === "string") {
      let slug = slugify(body.title);
      let n = 1;
      while (await Product.findOne({ slug, _id: { $ne: product._id } })) slug = `${slugify(body.title)}-${++n}`;
      product.slug = slug;
    }
    syncQwertymatesMarkupAndResellerHintsFromProductState(product as any);
    try {
      applyFreeShippingUpdate(product as unknown as Record<string, unknown>, body);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "Invalid free shipping areas", 400);
    }
    stripInrFromMongooseProductDoc(product as any);
    await product.save();
    if (!wasActive && product.active) {
      const { queueFacebookPostForProduct } = await import("../services/facebookMarketplacePostService");
      queueFacebookPostForProduct(String(product._id), "admin-activate");
    }
    if (
      body.images !== undefined &&
      body.colors === undefined &&
      !(product as any).colorsManual &&
      Array.isArray(product.images) &&
      product.images.length > 0
    ) {
      void assignProductColors(String(product._id), {
        images: product.images,
        externalData: product.externalData as Record<string, unknown> | undefined,
        force: true,
        colorsManual: false,
      }).catch(() => {});
    }
    res.json({ message: "Product updated", data: product });
  } catch (err) {
    next(err);
  }
});

router.delete("/products/:id", requireAnySection(["products", "product_uploads"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new AppError("Product not found", 404);
    await product.deleteOne();
    await AuditLog.create({ action: "PRODUCT_DELETED_BY_ADMIN", user: req.user!._id, target: product._id, meta: {} });
    res.json({ message: "Product deleted" });
  } catch (err) {
    next(err);
  }
});

// ——— Adverts (admin: create/manage platform adverts) ———

router.get("/adverts", async (req: AuthRequest, res: Response, next) => {
  try {
    const { slot } = req.query;
    const query: any = {};
    if (slot && (slot === "random" || slot === "promo")) query.slot = slot;
    const adverts = await Advert.find(query).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ data: adverts });
  } catch (err) {
    next(err);
  }
});

router.post("/adverts", async (req: AuthRequest, res: Response, next) => {
  try {
    const {
      title,
      imageUrl,
      linkUrl,
      slot,
      productId,
      active,
      startDate,
      endDate,
      order,
      advertiserName,
      advertiserAvatar,
      caption,
      description,
      ctaLabel,
      videoUrl,
      carouselCards,
    } = req.body;
    if (!title?.trim() || !imageUrl?.trim() || !slot) {
      throw new AppError("title, imageUrl, and slot (random|promo) are required", 400);
    }
    if (slot !== "random" && slot !== "promo") throw new AppError("slot must be 'random' or 'promo'", 400);
    const advert = await Advert.create({
      title: title.trim(),
      imageUrl: imageUrl.trim(),
      linkUrl: linkUrl?.trim() || undefined,
      advertiserName: advertiserName?.trim() || undefined,
      advertiserAvatar: advertiserAvatar?.trim() || undefined,
      caption: caption?.trim() || undefined,
      description: description?.trim() || undefined,
      ctaLabel: ctaLabel?.trim() || undefined,
      videoUrl: videoUrl?.trim() || undefined,
      carouselCards: Array.isArray(carouselCards)
        ? carouselCards
            .filter((c: { imageUrl?: string }) => c?.imageUrl?.trim())
            .map((c: { imageUrl: string; title?: string; description?: string; linkUrl?: string }) => ({
              imageUrl: String(c.imageUrl).trim(),
              title: c.title?.trim() || undefined,
              description: c.description?.trim() || undefined,
              linkUrl: c.linkUrl?.trim() || undefined,
            }))
        : undefined,
      slot,
      productId: productId || undefined,
      active: active !== false,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      order: order != null ? Number(order) : 0,
    });
    await AuditLog.create({ action: "ADVERT_CREATED", user: req.user!._id, target: advert._id, meta: { slot } });
    res.status(201).json({ message: "Advert created", data: advert });
  } catch (err) {
    next(err);
  }
});

router.put("/adverts/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const advert = await Advert.findById(req.params.id);
    if (!advert) throw new AppError("Advert not found", 404);
    const { title, imageUrl, linkUrl, slot, productId, active, startDate, endDate, order, advertiserName, advertiserAvatar, caption, description, ctaLabel, videoUrl, carouselCards } = req.body;
    if (title !== undefined) advert.title = title.trim();
    if (imageUrl !== undefined) advert.imageUrl = imageUrl.trim();
    if (linkUrl !== undefined) advert.linkUrl = linkUrl?.trim() || undefined;
    if (advertiserName !== undefined) advert.advertiserName = advertiserName?.trim() || undefined;
    if (advertiserAvatar !== undefined) advert.advertiserAvatar = advertiserAvatar?.trim() || undefined;
    if (caption !== undefined) advert.caption = caption?.trim() || undefined;
    if (description !== undefined) advert.description = description?.trim() || undefined;
    if (ctaLabel !== undefined) advert.ctaLabel = ctaLabel?.trim() || undefined;
    if (videoUrl !== undefined) advert.videoUrl = videoUrl?.trim() || undefined;
    if (carouselCards !== undefined) {
      advert.carouselCards = Array.isArray(carouselCards)
        ? carouselCards
            .filter((c: { imageUrl?: string }) => c?.imageUrl?.trim())
            .map((c: { imageUrl: string; title?: string; description?: string; linkUrl?: string }) => ({
              imageUrl: String(c.imageUrl).trim(),
              title: c.title?.trim() || undefined,
              description: c.description?.trim() || undefined,
              linkUrl: c.linkUrl?.trim() || undefined,
            }))
        : undefined;
    }
    if (slot === "random" || slot === "promo") advert.slot = slot;
    if (productId !== undefined) advert.productId = productId || undefined;
    if (active !== undefined) advert.active = !!active;
    if (startDate !== undefined) advert.startDate = startDate ? new Date(startDate) : undefined;
    if (endDate !== undefined) advert.endDate = endDate ? new Date(endDate) : undefined;
    if (order !== undefined) advert.order = Number(order);
    await advert.save();
    await AuditLog.create({ action: "ADVERT_UPDATED", user: req.user!._id, target: advert._id, meta: {} });
    res.json({ message: "Advert updated", data: advert });
  } catch (err) {
    next(err);
  }
});

router.delete("/adverts/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const advert = await Advert.findById(req.params.id);
    if (!advert) throw new AppError("Advert not found", 404);
    await advert.deleteOne();
    await AuditLog.create({ action: "ADVERT_DELETED", user: req.user!._id, target: advert._id, meta: {} });
    res.json({ message: "Advert deleted" });
  } catch (err) {
    next(err);
  }
});

// ——— WhatsApp pre-menu advert config (tier / fallback media when no SponsoredVideoAd) ———

const WA_PREMENU_ADVERT_SECTIONS = ["adverts", "sponsored_video", "web_advertising"] as const;

router.get(
  "/wa-premenu-advert",
  requireAnySection([...WA_PREMENU_ADVERT_SECTIONS]),
  async (_req: AuthRequest, res: Response, next) => {
    try {
      const resolved = await getWaPreMenuAdvertConfigResolved();
      const doc = await Setting.findOne({ key: WA_PREMENU_ADVERT_SETTING_KEY })
        .select("value updatedAt updatedBy")
        .populate("updatedBy", "name email")
        .lean();
      res.json({
        data: {
          ...resolved,
          campaignScripts: WA_AD_CAMPAIGN_SCRIPTS,
          bundledDefaults: {
            silverSample: publicBundledWaPremenuSampleVideoUrl(),
            acbpayA: publicBundledAcbpayVideoUrlA(),
            acbpayB: publicBundledAcbpayVideoUrlB(),
          },
          raw: (doc as any)?.value || {},
          updatedAt: (doc as any)?.updatedAt || null,
          updatedBy: (doc as any)?.updatedBy || null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  "/wa-premenu-advert",
  requireAnySection([...WA_PREMENU_ADVERT_SECTIONS]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const existingDoc = await Setting.findOne({ key: WA_PREMENU_ADVERT_SETTING_KEY }).lean();
      const merged = mergeWaPreMenuAdvertPatch((existingDoc as any)?.value, req.body || {});
      const tier = String(merged.tier || "silver").toLowerCase();
      if (!["bronze", "silver", "gold"].includes(tier)) {
        throw new AppError("tier must be bronze, silver, or gold", 400);
      }
      await Setting.findOneAndUpdate(
        { key: WA_PREMENU_ADVERT_SETTING_KEY },
        {
          $set: {
            value: merged,
            description: "WhatsApp pre-menu advert tier, campaigns, and fallback media URLs",
            updatedBy: req.user!._id,
          },
        },
        { upsert: true, new: true }
      );
      invalidateWaPreMenuAdvertConfigCache();
      const resolved = await getWaPreMenuAdvertConfigResolved();
      await AuditLog.create({
        action: "WA_PREMENU_ADVERT_UPDATED",
        user: req.user!._id,
        meta: { tier: resolved.tier, campaignMode: resolved.campaignMode },
      });
      res.json({ message: "WA pre-menu advert config updated", data: resolved });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/wa-premenu-advert/media",
  requireAnySection([...WA_PREMENU_ADVERT_SECTIONS]),
  waPremenuMediaUpload.single("media"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      if (!req.file) throw new AppError("No file uploaded", 400);
      const rel = encodeUploadsPublicPath(`/uploads/wa-adverts/${req.file.filename}`);
      const absolute = `${FRONTEND_URL}${rel.startsWith("/") ? rel : `/${rel}`}`;
      res.json({ url: absolute, path: rel });
    } catch (err) {
      next(err);
    }
  }
);

// ——— Landing backgrounds (admin: upload backgrounds for login/register pages) ———

router.get("/landing-backgrounds", async (req: AuthRequest, res: Response, next) => {
  try {
    const items = await LandingBackground.find().sort({ order: 1 }).lean();
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

router.post("/landing-backgrounds/upload", upload.single("image"), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

router.post("/landing-backgrounds", async (req: AuthRequest, res: Response, next) => {
  try {
    const { imageUrl, order } = req.body;
    if (!imageUrl?.trim()) throw new AppError("imageUrl is required", 400);
    const bg = await LandingBackground.create({
      imageUrl: imageUrl.trim(),
      order: order != null ? Number(order) : 0,
      active: true,
    });
    await AuditLog.create({ action: "LANDING_BG_CREATED", user: req.user!._id, target: bg._id, meta: {} });
    res.status(201).json({ message: "Background added", data: bg });
  } catch (err) {
    next(err);
  }
});

router.put("/landing-backgrounds/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const bg = await LandingBackground.findById(req.params.id);
    if (!bg) throw new AppError("Background not found", 404);
    const { imageUrl, order, active } = req.body;
    if (imageUrl !== undefined) bg.imageUrl = imageUrl.trim();
    if (order !== undefined) bg.order = Number(order);
    if (active !== undefined) bg.active = !!active;
    await bg.save();
    await AuditLog.create({ action: "LANDING_BG_UPDATED", user: req.user!._id, target: bg._id, meta: {} });
    res.json({ message: "Background updated", data: bg });
  } catch (err) {
    next(err);
  }
});

router.delete("/landing-backgrounds/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const bg = await LandingBackground.findById(req.params.id);
    if (!bg) throw new AppError("Background not found", 404);
    await bg.deleteOne();
    await AuditLog.create({ action: "LANDING_BG_DELETED", user: req.user!._id, target: bg._id, meta: {} });
    res.json({ message: "Background deleted" });
  } catch (err) {
    next(err);
  }
});

// ————— Super-admin: preview user by @username or email (promote flow) —————
router.get("/admins/preview-user", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const raw = String(req.query.username || req.query.email || "").trim();
    if (!raw) throw new AppError("username or email query required", 400);
    let user: { _id: unknown; name?: string; email?: string; username?: string; role?: string[] } | null = null;
    if (isProbableEmailLookup(raw)) {
      user = await User.findOne({ email: raw.toLowerCase() }).select("_id name email username role").lean();
    } else {
      const u = raw.replace(/^@/, "").toLowerCase();
      user = await User.findOne({ username: u }).select("_id name email username role").lean();
    }
    if (!user) throw new AppError("User not found", 404);
    res.json({
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        roles: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ————— Super-admin only: create admins with section permissions OR promote existing users —————
router.post("/admins", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = req.body as {
      promoteExisting?: boolean;
      mode?: string;
      username?: string;
      email?: string;
      name?: string;
      password?: string;
      sections?: string[];
      supportCategories?: string[];
    };

    const promote =
      body.promoteExisting === true || body.mode === "promote" || body.mode === "existing";

    const validSections = filterValidAdminSections(body.sections);
    const validSupportCategories: string[] = (body.supportCategories || []).filter((c: string) =>
      SUPPORT_CATEGORY_MAIN.includes(c as any)
    );

    if (validSections.length === 0) {
      throw new AppError("Select at least one section to moderate", 400);
    }

    if (promote) {
      const qEmail = String(body.email || "").trim();
      const qUser = String(body.username || "").trim();
      const tokens = [...new Set([qEmail, qUser].filter(Boolean))];
      if (tokens.length === 0) {
        throw new AppError("username or email required to grant admin to an existing user", 400);
      }

      let target = null as InstanceType<typeof User> | null;
      for (const t of tokens) {
        if (isProbableEmailLookup(t)) {
          target = await User.findOne({ email: t.toLowerCase() });
          if (target) break;
        }
      }
      if (!target) {
        for (const t of tokens) {
          const u = t.replace(/^@/, "").toLowerCase();
          if (u) {
            target = await User.findOne({ username: u });
            if (target) break;
          }
        }
      }
      if (!target) {
        for (const t of tokens) {
          if (t.includes("@")) {
            target = await User.findOne({ email: t.toLowerCase() });
            if (target) break;
          }
        }
      }
      if (!target) throw new AppError("User not found", 404);
      if (target.role?.includes("superadmin")) {
        throw new AppError("Cannot change delegated permissions for a super-admin account", 400);
      }

      const roles = Array.isArray(target.role) ? [...target.role] : ["client"];
      if (!roles.includes("admin")) {
        roles.push("admin");
        target.role = roles as ("client" | "runner" | "admin" | "superadmin")[];
        await target.save();
      }

      const supportCats = validSections.includes("support") ? validSupportCategories : [];

      let perm = await AdminPermission.findOne({ userId: target._id });
      if (perm) {
        perm.sections = validSections;
        perm.supportCategories = supportCats;
        await perm.save();
      } else {
        perm = await AdminPermission.create({
          userId: target._id,
          sections: validSections,
          supportCategories: supportCats,
          createdBy: req.user!._id,
        });
      }

      await AuditLog.create({
        action: "ADMIN_PROMOTED_OR_UPDATED",
        user: req.user!._id,
        target: target._id,
        meta: { email: target.email, username: target.username, sections: validSections, supportCategories: supportCats },
      });

      res.status(200).json({
        message: "Admin access granted or updated",
        data: {
          _id: target._id,
          email: target.email,
          name: target.name,
          username: target.username,
          sections: perm.sections,
          supportCategories: perm.supportCategories,
        },
      });
      return;
    }

    const { email, name, password, sections, supportCategories } = body;
    if (!email?.trim() || !name?.trim() || !password?.trim()) {
      throw new AppError("email, name, and password required", 400);
    }
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) throw new AppError("User with this email already exists — use “Grant to existing user” instead", 400);

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      passwordHash,
      role: ["admin"],
    });

    const validSupportCategoriesCreate: string[] = (supportCategories || []).filter((c: string) =>
      SUPPORT_CATEGORY_MAIN.includes(c as any)
    );
    await AdminPermission.create({
      userId: user._id,
      sections: validSections,
      supportCategories: validSections.includes("support") ? validSupportCategoriesCreate : [],
      createdBy: req.user!._id,
    });

    await AuditLog.create({
      action: "ADMIN_CREATED",
      user: req.user!._id,
      target: user._id,
      meta: { email: user.email, sections: validSections, supportCategories: validSupportCategoriesCreate },
    });

    res.status(201).json({
      data: {
        _id: user._id,
        email: user.email,
        name: user.name,
        sections: validSections,
        supportCategories: validSections.includes("support") ? validSupportCategoriesCreate : [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// ————— Morongwa-TV admin moderation —————
router.get("/tv/posts", requireSection("tv_posts"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status;

    const [posts, total] = await Promise.all([
      TVPost.find(query)
        .populate("creatorId", "name avatar email")
        .populate("productId", "title price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TVPost.countDocuments(query),
    ]);

    res.json({
      data: posts,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/tv/posts/:id/approve", requireSection("tv_posts"), async (req: AuthRequest, res: Response, next) => {
  try {
    const post = await TVPost.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
    if (!post) throw new AppError("Post not found", 404);
    await AuditLog.create({ action: "TV_POST_APPROVED", user: req.user!._id, target: post._id, meta: {} });
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

router.post("/tv/posts/:id/reject", requireSection("tv_posts"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body;
    const post = await TVPost.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
    if (!post) throw new AppError("Post not found", 404);
    await AuditLog.create({ action: "TV_POST_REJECTED", user: req.user!._id, target: post._id, meta: { reason } });
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

router.get("/tv/reports", requireSection("tv_reports"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const [reports, total] = await Promise.all([
      TVReport.find({ targetType: "post" })
        .populate("reporterId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TVReport.countDocuments({ targetType: "post" }),
    ]);

    res.json({
      data: reports,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/tv/reports/:id/resolve", requireSection("tv_reports"), async (req: AuthRequest, res: Response, next) => {
  try {
    const report = await TVReport.findByIdAndUpdate(
      req.params.id,
      { status: "reviewed", reviewedBy: req.user!._id, reviewedAt: new Date() },
      { new: true }
    );
    if (!report) throw new AppError("Report not found", 404);
    await AuditLog.create({ action: "TV_REPORT_RESOLVED", user: req.user!._id, target: report._id, meta: {} });
    res.json({ data: report });
  } catch (err) {
    next(err);
  }
});

// List admin permissions (super-admin only)
router.get("/admins", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const perms = await AdminPermission.find()
      .populate("userId", "name email username")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: perms });
  } catch (err) {
    next(err);
  }
});

// Update admin permissions (super-admin only) - sections and support categories
router.patch("/admins/:id", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const perm = await AdminPermission.findOne({ userId: req.params.id });
    if (!perm) throw new AppError("Admin permission not found", 404);

    const { sections, supportCategories } = req.body;
    if (sections !== undefined) {
      const next = filterValidAdminSections(sections);
      if (next.length === 0) {
        throw new AppError("Select at least one section to moderate", 400);
      }
      perm.sections = next;
    }
    if (supportCategories !== undefined) {
      perm.supportCategories = (Array.isArray(supportCategories) ? supportCategories : []).filter((c: string) =>
        SUPPORT_CATEGORY_MAIN.includes(c as any)
      );
    }
    await perm.save();

    await AuditLog.create({
      action: "ADMIN_PERMISSION_UPDATED",
      user: req.user!._id,
      target: perm.userId,
      meta: { sections: perm.sections, supportCategories: perm.supportCategories },
    });

    res.json({ data: perm });
  } catch (err) {
    next(err);
  }
});

/** Super-admin: remove delegated admin (AdminPermission + strip `admin` role). Never targets superadmin. */
router.delete("/admins/:id", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    const roles = Array.isArray(user.role) ? [...user.role] : [];
    if (roles.includes("superadmin")) {
      throw new AppError("Cannot revoke super-admin with this action", 400);
    }

    const hadPerm = !!(await AdminPermission.findOneAndDelete({ userId: user._id }));

    const nextRoles = roles.filter((r) => r !== "admin");
    if (nextRoles.length === 0) {
      user.role = ["client"];
    } else {
      user.role = nextRoles as ("client" | "runner" | "admin" | "superadmin")[];
    }
    await user.save();

    await AuditLog.create({
      action: "ADMIN_PERMISSION_REVOKED",
      user: req.user!._id,
      target: user._id,
      meta: { email: user.email, username: user.username, hadPermissionDoc: hadPerm },
    });

    res.json({
      message: "Admin access revoked. They may need to sign out and back in if still logged in.",
      data: { userId: user._id, hadPermissionDoc: hadPerm },
    });
  } catch (err) {
    next(err);
  }
});

// --- ACBPayWallet merchant agent applications ---
router.get("/merchant-agents", requireSection("merchant_agents"), async (req: AuthRequest, res: Response, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "pending";
    const filter: Record<string, unknown> =
      status === "all"
        ? { "merchantAgent.applicationStatus": { $in: ["pending", "approved", "rejected", "suspended"] } }
        : { "merchantAgent.applicationStatus": status };
    const users = await User.find(filter)
      .select("name email username phone countryCode location isVerified merchantAgent createdAt")
      .sort({ "merchantAgent.appliedAt": -1, createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agents/:userId/verify-kyc", requireSection("merchant_agents"), async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) throw new AppError("User not found", 404);
    if ((user as any).isVerified) {
      return res.json({ message: "Already KYC verified", userId: user._id, isVerified: true });
    }
    (user as any).isVerified = true;
    await user.save();
    await AuditLog.create({
      action: "USER_KYC_VERIFIED",
      user: req.user!._id,
      target: user._id,
      meta: { context: "merchant_agent" },
    });
    res.json({ message: "KYC marked verified", userId: user._id, isVerified: true });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agents/:userId/approve", requireSection("merchant_agents"), async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) throw new AppError("User not found", 404);
    const ma = (user as any).merchantAgent || {};
    if (ma.applicationStatus !== "pending") throw new AppError("Application is not pending", 400);
    if (!(user as any).isVerified) throw new AppError("User must be KYC-verified before approval", 400);

    (user as any).merchantAgent = {
      ...ma,
      applicationStatus: "approved",
      enabled: true,
      reviewedAt: new Date(),
      reviewedBy: req.user!._id,
      rejectionReason: undefined,
    };
    await user.save();
    await AuditLog.create({
      action: "MERCHANT_AGENT_APPROVED",
      user: req.user!._id,
      target: user._id,
      meta: {},
    });
    try {
      await sendMerchantAgentDecisionWhatsApp({
        phone: (user as any).phone,
        name: (user as any).name || (user as any).username,
        decision: "approved",
      });
    } catch {
      // non-blocking notification
    }
    res.json({ message: "Merchant agent approved", userId: user._id });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agents/:userId/reject", requireSection("merchant_agents"), async (req: AuthRequest, res: Response, next) => {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    const missingDocs = Array.isArray(req.body?.missingDocs)
      ? req.body.missingDocs.map((d: unknown) => String(d || "").trim()).filter(Boolean).slice(0, 6)
      : [];
    const user = await User.findById(req.params.userId);
    if (!user) throw new AppError("User not found", 404);
    const ma = (user as any).merchantAgent || {};
    if (ma.applicationStatus !== "pending") throw new AppError("Application is not pending", 400);

    (user as any).merchantAgent = {
      ...ma,
      applicationStatus: "rejected",
      enabled: false,
      rejectionReason: reason || "Not specified",
      reviewedAt: new Date(),
      reviewedBy: req.user!._id,
    };
    await user.save();
    await AuditLog.create({
      action: "MERCHANT_AGENT_REJECTED",
      user: req.user!._id,
      target: user._id,
      meta: { reason, missingDocs },
    });
    try {
      await sendMerchantAgentDecisionWhatsApp({
        phone: (user as any).phone,
        name: (user as any).name || (user as any).username,
        decision: "rejected",
        reason,
        missingDocs,
      });
    } catch {
      // non-blocking notification
    }
    res.json({ message: "Application rejected" });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agents/:userId/suspend", requireSection("merchant_agents"), async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) throw new AppError("User not found", 404);
    const ma = (user as any).merchantAgent || {};
    if (ma.applicationStatus !== "approved") throw new AppError("Only approved agents can be suspended", 400);

    (user as any).merchantAgent = {
      ...ma,
      applicationStatus: "suspended",
      enabled: false,
      reviewedAt: new Date(),
      reviewedBy: req.user!._id,
    };
    await user.save();
    await AuditLog.create({
      action: "MERCHANT_AGENT_SUSPENDED",
      user: req.user!._id,
      target: user._id,
      meta: {},
    });
    try {
      await sendMerchantAgentDecisionWhatsApp({
        phone: (user as any).phone,
        name: (user as any).name || (user as any).username,
        decision: "suspended",
      });
    } catch {
      // non-blocking notification
    }
    res.json({ message: "Merchant agent suspended" });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agents/:userId/reinstate", requireSection("merchant_agents"), async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) throw new AppError("User not found", 404);
    const ma = (user as any).merchantAgent || {};
    if (ma.applicationStatus !== "suspended") throw new AppError("Agent is not suspended", 400);

    (user as any).merchantAgent = {
      ...ma,
      applicationStatus: "approved",
      enabled: true,
      reviewedAt: new Date(),
      reviewedBy: req.user!._id,
    };
    await user.save();
    await AuditLog.create({
      action: "MERCHANT_AGENT_REINSTATED",
      user: req.user!._id,
      target: user._id,
      meta: {},
    });
    try {
      await sendMerchantAgentDecisionWhatsApp({
        phone: (user as any).phone,
        name: (user as any).name || (user as any).username,
        decision: "reinstated",
      });
    } catch {
      // non-blocking notification
    }
    res.json({ message: "Merchant agent reinstated" });
  } catch (err) {
    next(err);
  }
});

// ——— Oversight: messaging / live / marketplace enquiries ———

router.get("/messages/recent", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, q } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string, 10) : undefined,
      limit ? parseInt(limit as string, 10) : undefined
    );
    const query: Record<string, unknown> = {};
    const trimmed = String(q || "").trim();
    if (trimmed) {
      query.content = { $regex: trimmed.slice(0, 128), $options: "i" };
    }
    const [rows, total] = await Promise.all([
      DirectMessage.find(query)
        .populate("sender", "name email username")
        .populate("receiver", "name email username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DirectMessage.countDocuments(query),
    ]);
    res.json({
      data: rows,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

function parseBroadcastAudience(body: Record<string, unknown>): BroadcastAudienceInput {
  const scope = String(body.scope || "all").trim().toLowerCase();
  if (scope === "all") return { scope: "all" };
  const areaType = String(body.areaType || "").trim().toLowerCase();
  const areaValue = String(body.areaValue || "").trim();
  if (!["country", "runner_country", "runner_city"].includes(areaType) || !areaValue) {
    throw new AppError("areaType and areaValue are required when scope is area", 400);
  }
  return {
    scope: "area",
    areaType: areaType as "country" | "runner_country" | "runner_city",
    areaValue,
  };
}

router.get("/broadcast/areas", async (_req: AuthRequest, res: Response, next) => {
  try {
    const data = await listBroadcastAreaOptions();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post("/broadcast/preview", async (req: AuthRequest, res: Response, next) => {
  try {
    const audience = parseBroadcastAudience(req.body || {});
    const recipientCount = await countBroadcastRecipients(audience);
    res.json({ data: { recipientCount, audience } });
  } catch (err) {
    next(err);
  }
});

router.get("/broadcast/history", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string, 10) : undefined,
      limit ? parseInt(limit as string, 10) : undefined
    );
    const [rows, total] = await Promise.all([
      AdminBroadcast.find()
        .populate("sentBy", "name email username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AdminBroadcast.countDocuments(),
    ]);
    res.json({
      data: rows,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/broadcast/send", async (req: AuthRequest, res: Response, next) => {
  try {
    const body = req.body || {};
    const audience = parseBroadcastAudience(body);
    const message = String(body.message || "").trim();
    const subject = body.subject != null ? String(body.subject).trim() : undefined;
    const confirm = body.confirm === true || body.confirm === "true";

    const recipientCount = await countBroadcastRecipients(audience);
    if (recipientCount > 100 && !confirm) {
      throw new AppError(
        `This will reach ${recipientCount} users. Set confirm=true to send.`,
        400
      );
    }

    const result = await sendAdminUserBroadcast({
      adminId: req.user!._id,
      audience,
      message,
      subject,
    });

    await AuditLog.create({
      action: "ADMIN_USER_BROADCAST",
      user: req.user!._id,
      meta: {
        broadcastId: result.broadcastId,
        recipientCount: result.recipientCount,
        deliveredCount: result.deliveredCount,
        areaLabel: result.areaLabel,
      },
    });

    res.json({
      message: `Message sent to ${result.deliveredCount} user(s)`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/live/settings", async (_req: AuthRequest, res: Response, next) => {
  try {
    const playbackConfigured = isLivestreamPlaybackConfigured();
    const publishConfigured = isLivestreamPublishConfigured();
    const hlsBase = getHlsPublicBase();
    const rtmpHost = getRtmpPublicHost();
    const rtmpApp = getRtmpAppName();
    res.json({
      data: {
        playbackConfigured,
        publishConfigured,
        hlsPublicHostHint: publicUrlHostHint(hlsBase),
        rtmpPublishHint: rtmpHost ? `${rtmpHost}/${rtmpApp || "live"}` : null,
        /** Documented env keys (values are server-side only; not returned). */
        envKeys: [
          "LIVESTREAM_HLS_PUBLIC_BASE or HLS_PLAYBACK_BASE_URL",
          "LIVESTREAM_RTMP_PUBLIC_HOST (or derive host from RTMP_INGEST_URL)",
          "RTMP_INGEST_URL",
          "LIVESTREAM_RTMP_APP (optional)",
        ],
        notes: {
          wallGoLive:
            "Create post → Go live calls PATCH /api/users/:id/live and toggles isLive only (status badge). It does not start RTMP or allocate a stream key.",
          rtmpSession:
            "Full HLS playback uses POST /api/live/start which sets liveStreamName and returns OBS URLs when publish is configured.",
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/payment-fees", requireAnySection(["money_metrics"]), async (_req: AuthRequest, res: Response, next) => {
  try {
    const docs = await Setting.find({
      key: { $in: [PAYGATE_FLAT_FEE_SETTING_KEY, WALLET_PAYOUT_FEE_SETTING_KEY] },
    })
      .select("key value updatedAt updatedBy")
      .populate("updatedBy", "name email")
      .lean();
    const byKey = new Map(docs.map((d: any) => [String(d?.key || "").trim(), d]));
    const paygateDoc = byKey.get(PAYGATE_FLAT_FEE_SETTING_KEY) as any;
    const payoutDoc = byKey.get(WALLET_PAYOUT_FEE_SETTING_KEY) as any;
    const paygateFlatFeeZar = Number.isFinite(Number(paygateDoc?.value))
      ? Math.max(0, Math.round(Number(paygateDoc.value) * 100) / 100)
      : getPayGateFlatFeeZar();
    const walletPayoutFeeZar = Number.isFinite(Number(payoutDoc?.value))
      ? Math.max(0, Math.round(Number(payoutDoc.value) * 100) / 100)
      : getWalletPayoutFeeZar();
    const latestUpdatedAt =
      [paygateDoc?.updatedAt, payoutDoc?.updatedAt]
        .filter(Boolean)
        .map((d: unknown) => new Date(String(d)))
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    res.json({
      data: {
        paygateFlatFeeZar,
        walletPayoutFeeZar,
        envDefaults: {
          paygateFlatFeeZar: getPayGateFlatFeeZar(),
          walletPayoutFeeZar: getWalletPayoutFeeZar(),
        },
        updatedAt: latestUpdatedAt,
        updatedBy: paygateDoc?.updatedBy || payoutDoc?.updatedBy || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put("/payment-fees", requireAnySection(["money_metrics"]), async (req: AuthRequest, res: Response, next) => {
  try {
    const paygateFlatFeeZar = Number(req.body?.paygateFlatFeeZar);
    const walletPayoutFeeZar = Number(req.body?.walletPayoutFeeZar);
    if (!Number.isFinite(paygateFlatFeeZar) || paygateFlatFeeZar < 0) {
      throw new AppError("paygateFlatFeeZar must be a non-negative number", 400);
    }
    if (!Number.isFinite(walletPayoutFeeZar) || walletPayoutFeeZar < 0) {
      throw new AppError("walletPayoutFeeZar must be a non-negative number", 400);
    }
    const normalizedPaygate = Math.round(paygateFlatFeeZar * 100) / 100;
    const normalizedPayout = Math.round(walletPayoutFeeZar * 100) / 100;
    await Setting.findOneAndUpdate(
      { key: PAYGATE_FLAT_FEE_SETTING_KEY },
      {
        $set: {
          value: normalizedPaygate,
          description: "Flat PayGate fee for wallet top-up card flows (ZAR)",
          updatedBy: req.user!._id,
        },
      },
      { upsert: true, new: true }
    );
    await Setting.findOneAndUpdate(
      { key: WALLET_PAYOUT_FEE_SETTING_KEY },
      {
        $set: {
          value: normalizedPayout,
          description: "Flat wallet payout/disbursement fee (ZAR)",
          updatedBy: req.user!._id,
        },
      },
      { upsert: true, new: true }
    );
    invalidatePaymentFeeCache();
    await AuditLog.create({
      action: "ADMIN_PAYMENT_FEES_UPDATED",
      user: req.user!._id,
      meta: {
        paygateFlatFeeZar: normalizedPaygate,
        walletPayoutFeeZar: normalizedPayout,
      },
    });
    res.json({
      message: "Payment fees updated",
      data: {
        paygateFlatFeeZar: normalizedPaygate,
        walletPayoutFeeZar: normalizedPayout,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/live/broadcasters", async (_req: AuthRequest, res: Response, next) => {
  try {
    const rows = await User.find({ isLive: true })
      .select("_id name email username phone isLive liveStreamName liveStartedAt lastLiveEndedAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

router.post("/live/broadcasters/:userId/force-end", async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!mongoose.isValidObjectId(userId)) throw new AppError("Invalid user id", 400);
    const user = await User.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    (user as any).isLive = false;
    (user as any).liveStreamName = undefined;
    (user as any).liveStartedAt = undefined;
    (user as any).lastLiveEndedAt = new Date();
    await user.save();
    await AuditLog.create({
      action: "ADMIN_LIVE_FORCE_END",
      user: req.user!._id,
      target: user._id,
      meta: {},
    });
    res.json({ ok: true, message: "Live session cleared for user" });
  } catch (err) {
    next(err);
  }
});

router.get("/product-enquiries", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, q } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string, 10) : undefined,
      limit ? parseInt(limit as string, 10) : undefined
    );
    const trimmed = String(q || "").trim();
    let enquiryMatch: Record<string, unknown> = {};
    if (trimmed) {
      const products = await Product.find({ title: { $regex: trimmed.slice(0, 200), $options: "i" } })
        .select("_id")
        .lean();
      const ids = products.map((p) => p._id);
      if (ids.length === 0) {
        return res.json({
          data: [],
          pagination: { total: 0, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: 1 },
        });
      }
      enquiryMatch = { productId: { $in: ids } };
    }
    const [rows, total] = await Promise.all([
      ProductEnquiry.find(enquiryMatch)
        .populate("productId", "title images slug")
        .populate("buyerId", "name email username")
        .populate("sellerId", "name email username")
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProductEnquiry.countDocuments(enquiryMatch),
    ]);
    res.json({
      data: rows,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/fraud-registration-exceptions", async (req: AuthRequest, res: Response, next) => {
  try {
    const lim = Number((req.query as any)?.limit);
    const limit = Math.min(400, Math.max(30, Number.isFinite(lim) ? lim : 160));
    const tuckshopFlags = await TuckshopCashAgentRegistration.find({
      $or: [{ fraudRiskScore: { $gte: 10 } }, { "fraudFlags.0": { $exists: true } }],
    })
      .sort({ fraudRiskScore: -1, createdAt: -1 })
      .limit(limit)
      .populate("applicantUser", "name username phone email")
      .lean();

    const onboardingFlags = await AuditLog.find({
      action: "WA_ONBOARDING_AGENT_APPLICATION",
      $or: [{ "meta.fraudRiskScore": { $gte: 10 } }, { "meta.fraudFlags.0": { $exists: true } }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name username phone email")
      .lean();

    res.json({
      incentiveReference: listAgentRegistrationIncentiveReference(),
      tuckshopFlags,
      onboardingFlags,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/tuckshop-cash-agents/:id/rescan-fraud", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    await runTuckshopFraudScan(id);
    const row = await TuckshopCashAgentRegistration.findById(id).lean();
    if (!row) throw new AppError("Registration not found", 404);
    res.json({ ok: true, data: row });
  } catch (err) {
    next(err);
  }
});

router.post("/fraud-onboarding-applications/:auditLogId/rescan-fraud", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = String(req.params.auditLogId || "").trim();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    await runOnboardingAgentFraudScan(id);
    const row = await AuditLog.findById(id).lean();
    if (!row) throw new AppError("Audit log not found", 404);
    res.json({ ok: true, data: row });
  } catch (err) {
    next(err);
  }
});

router.get("/tuckshop-cash-agents", async (req: AuthRequest, res: Response, next) => {
  try {
    const raw = String(req.query.status || "pending").toLowerCase().trim();
    const filter: Record<string, unknown> = raw === "all" ? {} : { status: raw };
    const rows = await TuckshopCashAgentRegistration.find(filter)
      .sort({ createdAt: -1 })
      .limit(300)
      .populate("applicantUser", "name username phone email")
      .lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/tuckshop-cash-agents/:id/approve", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const row = await TuckshopCashAgentRegistration.findById(id);
    if (!row) throw new AppError("Registration not found", 404);
    if (row.status !== "pending") throw new AppError("Already reviewed", 400);
    row.status = "approved";
    row.reviewedAt = new Date();
    row.reviewedBy = req.user!._id;
    const note = String((req.body as any)?.commissionNote || "").trim().slice(0, 500);
    if (note) row.commissionNote = note;
    const amtRaw = Number((req.body as any)?.commissionAmountZar);
    const commissionAmountZar =
      Number.isFinite(amtRaw) && amtRaw >= 0 ? Math.round(amtRaw * 100) / 100 : 0;
    row.commissionAmountZar = commissionAmountZar;
    await row.save();
    await AuditLog.create({
      action: "ADMIN_TUCKSHOP_CASH_AGENT_APPROVED",
      user: req.user!._id,
      target: row.applicantUser,
      meta: {
        registrationId: String(row._id),
        tuckshopName: row.tuckshopName,
        commissionNote: note || undefined,
        commissionAmountZar,
      },
    });
    await sendTuckshopCashAgentDecisionWhatsApp({ phoneDigits: row.waPhoneDigits, approved: true });
    res.json({ ok: true, data: row });
  } catch (err) {
    next(err);
  }
});

router.post("/tuckshop-cash-agents/:id/reject", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const row = await TuckshopCashAgentRegistration.findById(id);
    if (!row) throw new AppError("Registration not found", 404);
    if (row.status !== "pending") throw new AppError("Already reviewed", 400);
    const reason = String((req.body as any)?.reason || "").trim().slice(0, 500);
    row.status = "rejected";
    row.reviewedAt = new Date();
    row.reviewedBy = req.user!._id;
    if (reason) row.rejectionReason = reason;
    await row.save();
    await AuditLog.create({
      action: "ADMIN_TUCKSHOP_CASH_AGENT_REJECTED",
      user: req.user!._id,
      target: row.applicantUser,
      meta: { registrationId: String(row._id), tuckshopName: row.tuckshopName, reason: reason || undefined },
    });
    await sendTuckshopCashAgentDecisionWhatsApp({
      phoneDigits: row.waPhoneDigits,
      approved: false,
      reason: reason || undefined,
    });
    res.json({ ok: true, data: row });
  } catch (err) {
    next(err);
  }
});

// ————— Super-admin: invalid school accounts (numeric-only names) —————

router.get("/schools/invalid-numeric", requireSuperAdmin, async (_req: AuthRequest, res: Response, next) => {
  try {
    const users = await User.find({
      $or: [{ isSchoolAccount: true }, { importedFromLegacy: true }, { email: /^legacy\+/i }],
      name: /^\d+$/,
    })
      .select("_id name username email countryCode active suspended createdAt isSchoolAccount")
      .sort({ name: 1 })
      .lean();
    const invalid = users.filter((u) =>
      isInvalidNumericSchoolAccount(
        u as { isSchoolAccount?: boolean; name?: string; email?: string; importedFromLegacy?: boolean }
      )
    );
    res.json({
      data: invalid.map((u) => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        email: u.email,
        countryCode: (u as { countryCode?: string }).countryCode,
        active: u.active,
        suspended: u.suspended,
      })),
      count: invalid.length,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/schools/purge-invalid-numeric", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dryRun === "1";
    const users = await User.find({
      $or: [{ isSchoolAccount: true }, { importedFromLegacy: true }, { email: /^legacy\+/i }],
      name: /^\d+$/,
    })
      .select("_id name username email role active isSchoolAccount importedFromLegacy")
      .lean();
    const targets = users.filter((u) =>
      isInvalidNumericSchoolAccount(
        u as { isSchoolAccount?: boolean; name?: string; email?: string; importedFromLegacy?: boolean }
      )
    );

    let deleted = 0;
    let deactivated = 0;
    const details: Array<{ _id: string; name?: string; action: string }> = [];

    for (const u of targets) {
      const oid = u._id as mongoose.Types.ObjectId;
      const roles = Array.isArray(u.role) ? u.role : [u.role];
      if (roles.some((r) => r === "admin" || r === "superadmin")) continue;

      const [postCount, orderCount, taskCount, txCount] = await Promise.all([
        TVPost.countDocuments({ creatorId: oid }),
        Order.countDocuments({ $or: [{ buyerId: oid }, { "items.resellerId": oid }] }),
        Task.countDocuments({ $or: [{ client: oid }, { runner: oid }] }),
        Transaction.countDocuments({ user: oid }),
      ]);
      const wallet = await Wallet.findOne({ user: oid }).select("balance").lean();
      const walletBalance = Number((wallet as { balance?: number } | null)?.balance ?? 0);
      const canDelete =
        postCount === 0 &&
        orderCount === 0 &&
        taskCount === 0 &&
        txCount === 0 &&
        walletBalance <= 0;

      if (dryRun) {
        details.push({
          _id: String(oid),
          name: u.name,
          action: canDelete ? "would_delete" : "would_deactivate",
        });
        if (canDelete) deleted += 1;
        else deactivated += 1;
        continue;
      }

      if (canDelete) {
        await Cart.deleteMany({ user: oid });
        await ResellerWall.deleteMany({ resellerId: oid });
        await Store.deleteMany({ userId: oid });
        await Follow.deleteMany({ $or: [{ followerId: oid }, { followingId: oid }] });
        await User.deleteOne({ _id: oid });
        deleted += 1;
        details.push({ _id: String(oid), name: u.name, action: "deleted" });
      } else {
        await User.updateOne(
          { _id: oid },
          {
            $set: {
              isSchoolAccount: false,
              active: false,
              suspended: true,
              suspendedAt: new Date(),
            },
            $unset: { schoolPageManagers: "", schoolPublicEmail: "", profileGalleryUrls: "" },
          }
        );
        deactivated += 1;
        details.push({ _id: String(oid), name: u.name, action: "deactivated" });
      }
    }

    if (!dryRun) {
      await AuditLog.create({
        action: "SCHOOL_NUMERIC_NAMES_PURGED",
        user: req.user!._id,
        meta: { deleted, deactivated, targetCount: targets.length },
      });
    }

    res.json({
      message: dryRun ? "Dry run complete" : "Invalid numeric school accounts removed",
      dryRun,
      targetCount: targets.length,
      deleted,
      deactivated,
      details,
    });
  } catch (err) {
    next(err);
  }
});

// ————— Super-admin: legacy publisher / test accounts (username labels, password reset) —————
router.get("/legacy-accounts", requireSuperAdmin, async (_req: AuthRequest, res: Response, next) => {
  try {
    const users = await User.find({
      $or: [{ importedFromLegacy: true }, { username: { $in: [...LEGACY_PUBLISHER_USERNAMES] } }],
    })
      .select("_id name username email role active suspended locked importedFromLegacy")
      .sort({ username: 1 })
      .lean();
    res.json({
      data: users.map((u) => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        email: u.email,
        role: u.role,
        active: u.active,
        suspended: u.suspended,
        locked: u.locked,
        importedFromLegacy: u.importedFromLegacy,
        displayLabel: userPublicDisplayName(u),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/legacy-accounts/:userId/reset-password", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!mongoose.isValidObjectId(userId)) throw new AppError("Invalid user id", 400);
    const user = await User.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const envPw = String(process.env.RESET_PASSWORD || "").trim();
    const tempPassword = envPw || `Sys_${crypto.randomBytes(18).toString("base64url")}!7`;
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    user.active = true;
    user.suspended = false;
    user.locked = false;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    if (user.username && isGenericDisplayName(user.name)) {
      user.name = user.username;
    }
    await user.save();

    await AuditLog.create({
      action: "LEGACY_ACCOUNT_PASSWORD_RESET",
      user: req.user!._id,
      target: user._id,
      meta: { username: user.username, email: user.email },
    });

    res.json({
      ok: true,
      data: {
        userId: String(user._id),
        username: user.username,
        email: user.email,
        displayLabel: userPublicDisplayName(user),
        tempPassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/legacy-accounts/normalize-display-names", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const users = await User.find({ username: { $exists: true, $ne: "" } })
      .select("_id name username email")
      .lean();
    let updated = 0;
    for (const u of users) {
      if (!isGenericDisplayName(u.name)) continue;
      const username = String(u.username || "").trim();
      const fallback = username || userPublicDisplayName(u);
      if (!fallback || fallback === "User") continue;
      await User.updateOne({ _id: u._id }, { $set: { name: fallback } });
      updated += 1;
    }
    await AuditLog.create({
      action: "LEGACY_ACCOUNT_DISPLAY_NAMES_NORMALIZED",
      user: req.user!._id,
      meta: { updated },
    });
    res.json({ ok: true, updated });
  } catch (err) {
    next(err);
  }
});

router.use("/facebook-ingest", adminFacebookIngestRouter);
router.use(adminTvChannelRouter);
router.use(adminCountryProfilesRouter);
router.use(adminLiveMetricsRouter);
router.use(adminMusicSoundLibraryRouter);
router.use(adminSponsoredVideoAdsRouter);
router.use("/courier", adminCourierRouter);

export default router;
