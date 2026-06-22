import express, { Response } from "express";
import Cart from "../data/models/Cart";
import Order from "../data/models/Order";
import Product from "../data/models/Product";
import Song from "../data/models/Song";
import Supplier from "../data/models/Supplier";
import ResellerWall from "../data/models/ResellerWall";
import Wallet from "../data/models/Wallet";
import Payment from "../data/models/Payment";
import MusicPurchase from "../data/models/MusicPurchase";
import User from "../data/models/User";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { initiatePayment } from "../services/payment";
import { notifyOrderPaid, notifyBuyerDeliveryPrepaid, notifyBuyerOrderPurchase, sendOrderPlacedEmailToOrdersInbox, sendEftPaymentInstructionsInMessenger, sendOrangeMoneyPaymentInstructionsInMessenger, formatOrderNumber } from "../services/orderNotification";
import {
  cancelOtherPendingOrdersForBuyer,
  cancelPendingOrderIfUnpaid,
  clearBuyerCartAfterOrderPaid,
  restoreCartLinesFromOrder,
} from "../services/checkoutCartLifecycle";
import { forwardOrderToExternalSupplier } from "../services/orderForwardingService";
import { getFxRates, convertUsdTo, convertBetweenCurrencies } from "../services/fxService";
import { resolveCheckoutCurrencyContext } from "../services/checkoutCurrency";
import { effectiveResellerMarkupPctFromWall } from "../config/marketplaceCategoryMarkups";
import {
  assertCourierSelectedForPay,
  buildInternalShippingStoreGroups,
  computeInternalCourierShipping,
} from "../services/checkoutShipping";
import {
  assertPhysicalOrderIncludesPrepaidDelivery,
  deliveryPrepaidFlagsForOrder,
} from "../services/checkoutDeliveryPolicy";
import { ensureCheckoutCourierOptions } from "../services/courierServiceCatalog";
import { listPaxiCatalogZa, listCourierGuyCatalogZa } from "../services/paxiCatalogService";
import {
  listSadcDeliveryCatalog,
  type SadcDeliveryScope,
} from "../services/sadcDeliveryCatalogService";
import CourierShipment from "../data/models/CourierShipment";
import { finalizeCourierOnOrderPaid } from "../services/courierOrderHooks";
import { getProductPriceForQty } from "../utils/productPricing";
import {
  buildEftPaymentMessage,
  getEftBankDetails,
  resolveEftPaymentReference,
} from "../config/eftBankDetails";
import { buildOrangeMoneyPaymentMessage, ORANGE_MONEY_BW_NUMBER } from "../config/orangeMoneyBw";
import { sheinPlatformCommissionZar } from "../config/sheinCommissionPolicy";

const MUSIC_PLATFORM_COMMISSION_PCT = 30;
const MUSIC_OWNER_SHARE_PCT = 70;

const router = express.Router();

/** Convert product price to ZAR for checkout. ACBPayWallet/PayGate require ZAR. */
async function toZAR(amount: number, currency: string): Promise<number> {
  const cur = String(currency || "ZAR").trim().toUpperCase();
  if (!cur || cur === "ZAR") return amount;
  const { rates } = await getFxRates();
  if (cur === "USD") return convertUsdTo(amount, "ZAR", rates);
  return convertBetweenCurrencies(amount, cur, "ZAR", rates);
}

// Get reseller commission % from wall, clamped to category bounds for the product
async function getResellerCommissionPct(
  resellerId: string,
  productId: string,
  categories?: string[]
): Promise<number | null> {
  const wall = await ResellerWall.findOne({ resellerId });
  if (!wall) return null;
  const wp = (wall.products as any[]).find((p) => (p.productId as any).toString() === productId);
  if (!wp) return null;
  return effectiveResellerMarkupPctFromWall(wp.resellerCommissionPct, categories);
}

/** Normalize country to ISO code (e.g. "South Africa" -> "ZA"). */
function toCountryCode(v: string | undefined): string {
  if (!v || typeof v !== "string") return "ZA";
  const u = v.trim().toUpperCase();
  if (u.length === 2) return u;
  const map: Record<string, string> = {
    "SOUTH AFRICA": "ZA", ZA: "ZA",
    "BOTSWANA": "BW", BW: "BW",
    "NAMIBIA": "NA", NA: "NA",
    "LESOTHO": "LS", LS: "LS",
    "ESWATINI": "SZ", "SWAZILAND": "SZ", SZ: "SZ",
    "ZIMBABWE": "ZW", ZW: "ZW",
    "ZAMBIA": "ZM", ZM: "ZM",
    "MOZAMBIQUE": "MZ", MZ: "MZ",
  };
  return map[u] ?? map[v.trim()] ?? "ZA";
}

// GET /api/checkout/paxi-catalog?country=ZA — fast programmed PAXI list (no cart, no seed)
router.get("/paxi-catalog", async (req, res, next) => {
  try {
    const country = toCountryCode(req.query.country as string);
    if (country !== "ZA") {
      res.json({ data: [], country });
      return;
    }
    const data = await listPaxiCatalogZa();
    res.json({ data, country });
  } catch (err) {
    next(err);
  }
});

// GET /api/checkout/courier-guy-catalog?country=ZA — The Courier Guy + Pudo (fast, no cart)
router.get("/courier-guy-catalog", async (req, res, next) => {
  try {
    const country = toCountryCode(req.query.country as string);
    if (country !== "ZA") {
      res.json({ data: [], country });
      return;
    }
    const data = await listCourierGuyCatalogZa();
    res.json({ data, country });
  } catch (err) {
    next(err);
  }
});

// GET /api/checkout/sadc-catalog?country=NA&scope=local|crossborder — non-ZA delivery options
router.get("/sadc-catalog", async (req, res, next) => {
  try {
    const country = toCountryCode(req.query.country as string);
    const rawScope = String(req.query.scope || "crossborder").toLowerCase();
    const scope: SadcDeliveryScope = rawScope === "local" ? "local" : "crossborder";
    const quoteInNative =
      req.query.quoteInNativeCurrency === "1" || req.query.quoteInNativeCurrency === "true";
    if (country === "ZA") {
      res.json({ data: [], country, scope });
      return;
    }
    const data = await listSadcDeliveryCatalog(country, scope, {
      quoteInNativeCurrency: quoteInNative && scope === "local",
    });
    res.json({ data, country, scope });
  } catch (err) {
    next(err);
  }
});

// GET /api/checkout/courier-options?country=ZA — uses current cart (per-store shipping totals)
router.get("/courier-options", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const country = toCountryCode(req.query.country as string);
    const cart = await Cart.findOne({ user: req.user!._id });
    if (!cart?.items?.length) {
      res.json({ data: [], country, storeGroupCount: 0 });
      return;
    }
    const productIds = cart.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true }).lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p as Record<string, unknown>]));
    const storeGroups = await buildInternalShippingStoreGroups(cart.items, productMap);
    const options = await ensureCheckoutCourierOptions(
      country,
      storeGroups,
      cart.items,
      productMap
    );
    res.json({ data: options, country, storeGroupCount: storeGroups.length });
  } catch (err) {
    next(err);
  }
});

// Get checkout quote from current cart (products + music)
router.post("/quote", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const deliveryCountry = toCountryCode(req.body?.deliveryCountry);
    const deliveryAddress = req.body?.deliveryAddress ? String(req.body.deliveryAddress) : undefined;
    const deliveryCity = req.body?.deliveryCity ? String(req.body.deliveryCity) : undefined;
    const courierTariffId = req.body?.courierTariffId ? String(req.body.courierTariffId) : undefined;
    const crossborderCourierTariffId = req.body?.crossborderCourierTariffId
      ? String(req.body.crossborderCourierTariffId)
      : undefined;
    const rawScope = String(req.body?.deliveryScope || "").toLowerCase();
    const deliveryScope: SadcDeliveryScope = rawScope === "local" ? "local" : "crossborder";
    const cart = await Cart.findOne({ user: req.user!._id });
    const hasProducts = cart && cart.items && cart.items.length > 0;
    const hasMusic = cart && cart.musicItems && cart.musicItems.length > 0;
    if (!cart || (!hasProducts && !hasMusic)) {
      throw new AppError("Cart is empty", 400);
    }

    const productIds = (cart.items || []).map((i) => i.productId);
    const products = productIds.length > 0
      ? await Product.find({ _id: { $in: productIds } })
          .populate("supplierId", "shippingCost storeName")
          .lean()
      : [];
    const productMap = new Map<string, Record<string, unknown>>();
    for (const p of products) {
      if (!(p as { active?: boolean }).active) continue;
      productMap.set(String((p as { _id: unknown })._id), p as Record<string, unknown>);
    }
    const missingActive = (cart.items || []).filter(
      (item) => !productMap.has(String(item.productId))
    );
    if (missingActive.length > 0) {
      throw new AppError(
        "Some cart items are no longer available. Remove them and try again.",
        400
      );
    }

    const uniqueExternalSupplierIds = new Set<string>();
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product) {
        const src = (product as any).supplierSource;
        if (src && src !== "internal") {
          const extId = (product as any).externalSupplierId?.toString();
          if (extId) uniqueExternalSupplierIds.add(extId);
        }
      }
    }

    const storeGroups = await buildInternalShippingStoreGroups(cart.items || [], productMap);
    const productCurrencies = [...productMap.values()].map((p) =>
      String((p as { currency?: string }).currency || "ZAR").toUpperCase()
    );
    const allProductsBwp =
      productCurrencies.length > 0 && productCurrencies.every((c) => c === "BWP");
    const effectiveDeliveryScope: SadcDeliveryScope =
      deliveryCountry === "BW" && allProductsBwp ? "local" : deliveryScope;
    const currencyCtx = await resolveCheckoutCurrencyContext({
      deliveryCountry,
      deliveryScope: effectiveDeliveryScope,
      storeGroups,
      allProductsBwp,
    });
    const supplierIds = [...new Set(storeGroups.flatMap((g) => g.supplierIds))];
    const suppliers = supplierIds.length > 0
      ? await Supplier.find({ _id: { $in: supplierIds } }).select("shippingCost storeName").lean()
      : [];
    const supplierMap = new Map(suppliers.map((s) => [s._id.toString(), s]));
    const externalSuppliers = uniqueExternalSupplierIds.size > 0
      ? await (await import("../data/models/ExternalSupplier")).default
          .find({ _id: { $in: Array.from(uniqueExternalSupplierIds) } })
          .select("shippingCost source")
          .lean()
      : [];
    const externalSupplierMap = new Map(externalSuppliers.map((s: any) => [s._id.toString(), s]));

    const eproloMissingShipping = (cart.items || [])
      .map((item) => {
        const product = productMap.get((item.productId as any).toString()) as any;
        if (!product) return null;
        if (String(product.supplierSource || "").toLowerCase() !== "eprolo") return null;
        const extId = String(product.externalSupplierId || "").trim();
        const ext = extId ? (externalSupplierMap.get(extId) as any) : null;
        const configured = ext && Number.isFinite(Number(ext.shippingCost)) && Number(ext.shippingCost) >= 0;
        if (configured) return null;
        return {
          productId: String(product._id || item.productId || ""),
          title: String(product.title || "Product"),
        };
      })
      .filter(Boolean) as Array<{ productId: string; title: string }>;
    if (eproloMissingShipping.length > 0) {
      const ids = eproloMissingShipping.map((p) => p.productId).join(", ");
      throw new AppError(
        `Checkout blocked: missing EPROLO shipping cost configuration. Admin action required for product ID(s): ${ids}.`,
        400
      );
    }

    // CJ products: get real freight from CJ API (no flat fallback)
    const cjProductItems: Array<{ product: any; qty: number }> = [];
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product && (product as any).supplierSource === "cj") {
        const vid = (product as any).externalData?.variants?.[0]?.vid;
        if (!vid) throw new AppError(`Product "${(product as any).title}" is missing variant data for shipping. Please contact support.`, 400);
        cjProductItems.push({ product, qty: item.qty });
      }
    }

    let internalCourier = await computeInternalCourierShipping(
      deliveryCountry,
      storeGroups,
      courierTariffId,
      supplierMap,
      cart.items || [],
      productMap,
      {
        deliveryScope: effectiveDeliveryScope,
        settlementCurrency: currencyCtx.settlementCurrency,
        quoteInNativeCurrency: currencyCtx.quoteInNativeCurrency,
        crossborderCourierTariffId,
        deliveryCity,
        deliveryAddress,
      }
    );
    let courierOptions = internalCourier.availableOptions;

    let shipping = internalCourier.internalShippingZar;
    let cjShippingZar = 0;
    if (cjProductItems.length > 0) {
      const { getCJAdapter } = await import("../services/suppliers/supplierService");
      const cjAdapter = await getCJAdapter();
      if (!cjAdapter?.getFreightQuote) {
        throw new AppError("CJ freight calculation is not available. Please try again later.", 503);
      }
      const freightReq = {
        startCountryCode: "CN",
        endCountryCode: deliveryCountry,
        products: cjProductItems.map(({ product, qty }) => ({
          vid: (product as any).externalData?.variants?.[0]?.vid,
          quantity: qty,
        })),
      };
      const freightResult = await cjAdapter.getFreightQuote(freightReq);
      if (!freightResult) {
        throw new AppError("Unable to get shipping cost for imported products. Please try again or contact support.", 503);
      }
      const { rates } = await getFxRates();
      cjShippingZar = Math.round(convertUsdTo(freightResult.logisticPrice, "ZAR", rates));
      shipping += cjShippingZar;
    }
    for (const extId of uniqueExternalSupplierIds) {
      const ext = externalSupplierMap.get(extId);
      if ((ext as any)?.source === "cj") continue; // already handled above
      const cost = (ext as any)?.shippingCost;
      if (cost != null && cost >= 0) shipping += cost;
      else throw new AppError("External supplier shipping cost not configured. Please contact support.", 400);
    }

    let subtotal = 0;
    let commissionTotal = 0;
    const breakdown: Array<{ productId?: string; songId?: string; title: string; price: number; qty: number; type?: string }> = [];

    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (!product) continue;
      const effectivePriceRaw = getProductPriceForQty(product as Parameters<typeof getProductPriceForQty>[0], item.qty);
      const productCurrency = (product as any).currency || "ZAR";
      const effectivePrice = currencyCtx.quoteInNativeCurrency
        ? effectivePriceRaw
        : await toZAR(effectivePriceRaw, productCurrency);
      let sellingPrice = effectivePrice;
      if (item.resellerId && (product as any).allowResell) {
        const resellerCommissionPct = await getResellerCommissionPct(
          (item.resellerId as any).toString(),
          (item.productId as any).toString(),
          (product as any).categories
        );
        if (resellerCommissionPct != null) {
          sellingPrice = Math.round(effectivePrice * (1 + resellerCommissionPct / 100) * 100) / 100;
          commissionTotal += (effectivePrice * resellerCommissionPct) / 100 * item.qty;
        }
      }
      const linePrice = sellingPrice * item.qty;
      subtotal += linePrice;
      breakdown.push({
        productId: (product as any)._id.toString(),
        title: (product as any).title ?? "Product",
        price: sellingPrice,
        qty: item.qty,
      });
    }

    for (const item of cart.musicItems || []) {
      const song = await Song.findById(item.songId).lean();
      if (!song || !(song as any).downloadEnabled) continue;
      const price = Number((song as any).downloadPrice ?? 10);
      const linePrice = price * item.qty;
      subtotal += linePrice;
      breakdown.push({
        songId: (song as any)._id.toString(),
        title: `${(song as any).title ?? "Song"}${(song as any).artist ? ` - ${(song as any).artist}` : ""}`,
        price,
        qty: item.qty,
        type: "music",
      });
    }

    const total = subtotal + shipping;
    const totalZarForPayment = currencyCtx.quoteInNativeCurrency
      ? await toZAR(total, currencyCtx.settlementCurrency)
      : total;
    let shippingQuoteType: "live_quote" | "configured_tariff" | "configured_courier" = cjProductItems.length > 0 ? "live_quote" : "configured_tariff";
    if (internalCourier.courierUsed) shippingQuoteType = "configured_courier";
    // Build shipping breakdown (one line per store group, not per cart line)
    const shippingBreakdown: Array<{
      supplierId: string;
      storeName: string;
      shippingCost: number;
      providerName?: string;
      serviceLabel?: string;
      courierTariffId?: string;
      originCountryCode?: string;
    }> = [];
    for (const line of internalCourier.storeGroupBreakdown) {
      const provider = line.providerName?.trim();
      const storeLabel =
        storeGroups.length > 1 && provider
          ? `${line.storeName} · ${provider}`
          : provider
            ? `${line.storeName} (${provider})`
            : line.storeName;
      shippingBreakdown.push({
        supplierId: line.groupKey,
        storeName: storeLabel,
        shippingCost: line.shippingCostZar,
        providerName: line.providerName,
        serviceLabel: line.serviceLabel,
        courierTariffId: line.courierTariffId,
        originCountryCode: line.originCountryCode,
      });
    }
    if (cjShippingZar > 0) {
      shippingBreakdown.push({ supplierId: "cj", storeName: "CJ / Dropship", shippingCost: cjShippingZar });
    }
    for (const extId of uniqueExternalSupplierIds) {
      if ((externalSupplierMap.get(extId) as any)?.source === "cj") continue;
      const ext = externalSupplierMap.get(extId);
      const cost = (ext as any)?.shippingCost ?? 0;
      shippingBreakdown.push({ supplierId: extId, storeName: "Dropship", shippingCost: cost });
    }

    const courierDeliveryZar = internalCourier.selectedCourier?.priceZar ?? 0;
    const otherShippingZar = Math.max(0, shipping - courierDeliveryZar);
    const shippingEstimateMinZar =
      internalCourier.requiresCourierSelection && courierOptions.length > 0
        ? courierOptions[0].priceZar
        : shipping > 0
          ? shipping
          : undefined;

    res.json({
      data: {
        subtotal,
        shipping,
        shippingEstimateMinZar,
        courierDeliveryZar,
        otherShippingZar,
        shippingBreakdown,
        shippingQuoteType,
        commissionTotal,
        total,
        totalZarForPayment,
        currency: currencyCtx.settlementCurrency,
        quoteInNativeCurrency: currencyCtx.quoteInNativeCurrency,
        suggestedDeliveryScope: currencyCtx.suggestedDeliveryScope,
        allowLocalDelivery: currencyCtx.allowLocalDelivery,
        allowCrossborderDelivery: currencyCtx.allowCrossborderDelivery,
        itemCount: (cart.items?.length ?? 0) + (cart.musicItems?.length ?? 0),
        paymentBreakdown: breakdown,
        courierOptions,
        crossborderCourierOptions: internalCourier.crossborderCourierOptions ?? [],
        hasMixedStoreOrigins: internalCourier.hasMixedStoreOrigins ?? false,
        requiresCrossborderCourierSelection:
          internalCourier.requiresCrossborderCourierSelection ?? false,
        selectedCourier: internalCourier.selectedCourier ?? null,
        requiresCourierSelection: internalCourier.requiresCourierSelection,
        /** Products + all shipping in one checkout charge */
        payOnceTotal: total,
        readyForPayment:
          !internalCourier.requiresCourierSelection &&
          (!hasProducts || shipping > 0 || !!internalCourier.warehouseFreeLocalApplied),
        deliveryCollectionPolicy: "checkout_single_payment",
        deliveryPrepaidAtCheckout:
          hasProducts && (shipping > 0 || !!internalCourier.warehouseFreeLocalApplied),
        warehouseFreeLocalApplied: internalCourier.warehouseFreeLocalApplied ?? false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Create order and pay (wallet or card)
router.post("/pay", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const {
      paymentMethod,
      deliveryAddress,
      deliveryCountry: rawCountry,
      courierTariffId: rawCourierTariffId,
      crossborderCourierTariffId: rawCrossborderCourierTariffId,
      deliveryScope: rawDeliveryScope,
    } = req.body;
    const deliveryCountry = toCountryCode(rawCountry);
    const courierTariffId = rawCourierTariffId ? String(rawCourierTariffId) : undefined;
    const crossborderCourierTariffId = rawCrossborderCourierTariffId
      ? String(rawCrossborderCourierTariffId)
      : undefined;
    const scopeRaw = String(rawDeliveryScope || "").toLowerCase();
    const deliveryScopePay: SadcDeliveryScope = scopeRaw === "local" ? "local" : "crossborder";
    if (!paymentMethod || !["wallet", "card", "eft", "orange_money"].includes(paymentMethod)) {
      throw new AppError("paymentMethod must be 'wallet', 'card', 'eft', or 'orange_money'", 400);
    }
    if (paymentMethod === "eft" && !["ZA", "BW"].includes(deliveryCountry)) {
      throw new AppError("EFT is only available for South African or Botswana checkout", 400);
    }
    if (paymentMethod === "orange_money" && deliveryCountry !== "BW") {
      throw new AppError("Orange Money is only available for Botswana checkout", 400);
    }
    const cart = await Cart.findOne({ user: req.user!._id });
    const hasProducts = cart && cart.items && cart.items.length > 0;
    const hasMusic = cart && cart.musicItems && cart.musicItems.length > 0;
    if (!cart || (!hasProducts && !hasMusic)) {
      throw new AppError("Cart is empty", 400);
    }
    if (hasProducts && !String(deliveryAddress || "").trim()) {
      throw new AppError("Delivery address is required", 400);
    }

    const productIds = (cart.items || []).map((i) => i.productId);
    const products = productIds.length > 0
      ? await Product.find({ _id: { $in: productIds }, active: true })
          .populate("supplierId", "userId shippingCost")
          .lean()
      : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const uniqueExternalSupplierIdsPay = new Set<string>();
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product) {
        const src = (product as any).supplierSource;
        if (src && src !== "internal") {
          const extId = (product as any).externalSupplierId?.toString();
          if (extId) uniqueExternalSupplierIdsPay.add(extId);
        }
      }
    }
    const storeGroupsPay = await buildInternalShippingStoreGroups(cart.items || [], productMap);
    const productCurrenciesPay = [...productMap.values()].map((p) =>
      String((p as { currency?: string }).currency || "ZAR").toUpperCase()
    );
    const allProductsBwpPay =
      productCurrenciesPay.length > 0 && productCurrenciesPay.every((c) => c === "BWP");
    const effectiveDeliveryScopePay: SadcDeliveryScope =
      deliveryCountry === "BW" && allProductsBwpPay ? "local" : deliveryScopePay;
    const currencyCtxPay = await resolveCheckoutCurrencyContext({
      deliveryCountry,
      deliveryScope: effectiveDeliveryScopePay,
      storeGroups: storeGroupsPay,
      allProductsBwp: allProductsBwpPay,
    });
    const supplierIdsPay = [...new Set(storeGroupsPay.flatMap((g) => g.supplierIds))];
    const suppliers = supplierIdsPay.length > 0
      ? await Supplier.find({ _id: { $in: supplierIdsPay } }).select("shippingCost storeName").lean()
      : [];
    const supplierMap = new Map(suppliers.map((s) => [s._id.toString(), s]));
    const externalSuppliersPayData = uniqueExternalSupplierIdsPay.size > 0
      ? await (await import("../data/models/ExternalSupplier")).default
          .find({ _id: { $in: Array.from(uniqueExternalSupplierIdsPay) } })
          .select("shippingCost source")
          .lean()
      : [];
    const externalSupplierMapPay = new Map(externalSuppliersPayData.map((s: any) => [s._id.toString(), s]));

    const eproloMissingShippingPay = (cart.items || [])
      .map((item) => {
        const product = productMap.get((item.productId as any).toString()) as any;
        if (!product) return null;
        if (String(product.supplierSource || "").toLowerCase() !== "eprolo") return null;
        const extId = String(product.externalSupplierId || "").trim();
        const ext = extId ? (externalSupplierMapPay.get(extId) as any) : null;
        const configured = ext && Number.isFinite(Number(ext.shippingCost)) && Number(ext.shippingCost) >= 0;
        if (configured) return null;
        return {
          productId: String(product._id || item.productId || ""),
          title: String(product.title || "Product"),
        };
      })
      .filter(Boolean) as Array<{ productId: string; title: string }>;
    const sheinMissingShippingPay = (cart.items || [])
      .map((item) => {
        const product = productMap.get((item.productId as any).toString()) as any;
        if (!product) return null;
        if (String(product.supplierSource || "").toLowerCase() !== "shein") return null;
        const extId = String(product.externalSupplierId || "").trim();
        const ext = extId ? (externalSupplierMapPay.get(extId) as any) : null;
        const configured = ext && Number.isFinite(Number(ext.shippingCost)) && Number(ext.shippingCost) >= 0;
        if (configured) return null;
        return {
          productId: String(product._id || item.productId || ""),
          title: String(product.title || "Product"),
        };
      })
      .filter(Boolean) as Array<{ productId: string; title: string }>;
    if (eproloMissingShippingPay.length > 0) {
      const ids = eproloMissingShippingPay.map((p) => p.productId).join(", ");
      throw new AppError(
        `Checkout blocked: missing EPROLO shipping cost configuration. Admin action required for product ID(s): ${ids}.`,
        400
      );
    }
    if (sheinMissingShippingPay.length > 0) {
      const ids = sheinMissingShippingPay.map((p) => p.productId).join(", ");
      throw new AppError(
        `Checkout blocked: missing SHEIN shipping cost configuration. Admin action required for product ID(s): ${ids}.`,
        400
      );
    }

    const cjProductItemsPay: Array<{ product: any; qty: number }> = [];
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product && (product as any).supplierSource === "cj") {
        const vid = (product as any).externalData?.variants?.[0]?.vid;
        if (!vid) throw new AppError(`Product "${(product as any).title}" is missing variant data for shipping. Please contact support.`, 400);
        cjProductItemsPay.push({ product, qty: item.qty });
      }
    }

    await assertCourierSelectedForPay(
      deliveryCountry,
      storeGroupsPay,
      courierTariffId,
      cart.items || [],
      productMap,
      {
        deliveryScope: effectiveDeliveryScopePay,
        quoteInNativeCurrency: currencyCtxPay.quoteInNativeCurrency,
        crossborderCourierTariffId,
        deliveryCity: req.body?.deliveryCity ? String(req.body.deliveryCity) : undefined,
        deliveryAddress: deliveryAddress ? String(deliveryAddress) : undefined,
      }
    );
    const internalCourierPay = await computeInternalCourierShipping(
      deliveryCountry,
      storeGroupsPay,
      courierTariffId,
      supplierMap,
      cart.items || [],
      productMap,
      {
        deliveryScope: effectiveDeliveryScopePay,
        settlementCurrency: currencyCtxPay.settlementCurrency,
        quoteInNativeCurrency: currencyCtxPay.quoteInNativeCurrency,
        crossborderCourierTariffId,
        deliveryCity: req.body?.deliveryCity ? String(req.body.deliveryCity) : undefined,
        deliveryAddress: deliveryAddress ? String(deliveryAddress) : undefined,
      }
    );
    if (internalCourierPay.requiresCourierSelection) {
      throw new AppError("Please select a delivery method before paying", 400);
    }

    let shipping = internalCourierPay.internalShippingZar;
    let cjShippingZarPay = 0;
    if (cjProductItemsPay.length > 0) {
      const { getCJAdapter } = await import("../services/suppliers/supplierService");
      const cjAdapter = await getCJAdapter();
      if (!cjAdapter?.getFreightQuote) {
        throw new AppError("CJ freight calculation is not available. Please try again later.", 503);
      }
      const freightReq = {
        startCountryCode: "CN",
        endCountryCode: deliveryCountry,
        products: cjProductItemsPay.map(({ product, qty }) => ({
          vid: (product as any).externalData?.variants?.[0]?.vid,
          quantity: qty,
        })),
      };
      const freightResult = await cjAdapter.getFreightQuote(freightReq);
      if (!freightResult) {
        throw new AppError("Unable to get shipping cost for imported products. Please try again or contact support.", 503);
      }
      const { rates } = await getFxRates();
      cjShippingZarPay = Math.round(convertUsdTo(freightResult.logisticPrice, "ZAR", rates));
      shipping += cjShippingZarPay;
    }
    for (const extId of uniqueExternalSupplierIdsPay) {
      const ext = externalSupplierMapPay.get(extId);
      if ((ext as any)?.source === "cj") continue;
      const cost = (ext as any)?.shippingCost;
      if (cost != null && cost >= 0) shipping += cost;
      else throw new AppError("External supplier shipping cost not configured. Please contact support.", 400);
    }

    const orderItems: Array<{
      productId: any;
      qty: number;
      price: number;
      resellerId?: any;
      selectedColor?: string;
      selectedSize?: string;
      commissionPct?: number;
      commissionValue?: number;
    }> = [];
    let subtotal = 0;
    let commissionTotal = 0;
    let platformFeeTotal = 0;
    let supplierId: any = null;
    const { rates: checkoutFxRates } = await getFxRates();

    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 400);
      const supplierSource = (product as any).supplierSource;
      if (supplierSource === "internal" || !supplierSource) {
        if ((product as any).outOfStock) {
          throw new AppError(`Product ${(product as any).title} is out of stock`, 400);
        }
        if ((product as any).stock < item.qty) {
          throw new AppError(`Insufficient stock for ${(product as any).title}`, 400);
        }
      }
      if (!supplierId) supplierId = (product as any).supplierId?._id ?? (product as any).supplierId ?? (product as any).externalSupplierId;
      const priceRaw = getProductPriceForQty(product as any, item.qty);
      const productCurrency = (product as any).currency || "ZAR";
      let price = currencyCtxPay.quoteInNativeCurrency
        ? priceRaw
        : await toZAR(priceRaw, productCurrency);
      let commissionPct: number | undefined;
      if (item.resellerId && (product as any).allowResell) {
        const pct = await getResellerCommissionPct(
          (item.resellerId as any).toString(),
          (item.productId as any).toString(),
          (product as any).categories
        );
        if (pct != null) {
          commissionPct = pct;
          price = Math.round(price * (1 + pct / 100) * 100) / 100;
        }
      }
      const lineTotal = price * item.qty;
      subtotal += lineTotal;
      let commissionValue = 0;
      if (commissionPct != null) {
        const effectiveBase = getProductPriceForQty(product as any, item.qty);
        commissionValue = (effectiveBase * item.qty * commissionPct) / 100;
        commissionTotal += commissionValue;
        if (supplierSource === "shein") {
          platformFeeTotal += sheinPlatformCommissionZar({
            lineTotalZar: lineTotal,
            supplierCostUsd: (product as any).supplierCost,
            qty: item.qty,
            hasResellerStore: true,
            rates: checkoutFxRates,
          });
        }
      } else if (supplierSource === "shein") {
        platformFeeTotal += sheinPlatformCommissionZar({
          lineTotalZar: lineTotal,
          supplierCostUsd: (product as any).supplierCost,
          qty: item.qty,
          hasResellerStore: false,
          rates: checkoutFxRates,
        });
      }
      orderItems.push({
        productId: product._id,
        qty: item.qty,
        price,
        resellerId: item.resellerId,
        ...(item.selectedColor ? { selectedColor: item.selectedColor } : {}),
        ...(item.selectedSize ? { selectedSize: item.selectedSize } : {}),
        commissionPct,
        commissionValue,
      });
    }

    let musicSubtotal = 0;
    const musicPurchaseItems: Array<{ songId: any; qty: number; price: number }> = [];
    for (const item of cart.musicItems || []) {
      const song = await Song.findById(item.songId).lean();
      if (!song) throw new AppError(`Song not found: ${item.songId}`, 400);
      if (!(song as any).downloadEnabled) throw new AppError(`Downloads not enabled for ${(song as any).title}`, 400);
      if (String((song as any).userId) === String(req.user!._id)) {
        throw new AppError(`You cannot purchase your own song: ${(song as any).title}`, 400);
      }
      const price = Number((song as any).downloadPrice ?? 10);
      musicSubtotal += price * item.qty;
      musicPurchaseItems.push({ songId: song._id, qty: item.qty, price });
    }

    const total = subtotal + musicSubtotal + shipping;
    const totalZarForPayment = currencyCtxPay.quoteInNativeCurrency
      ? await toZAR(total, currencyCtxPay.settlementCurrency)
      : total;

    const cartProductQtyPay = (cart.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);
    await assertPhysicalOrderIncludesPrepaidDelivery({
      hasProducts: orderItems.length > 0,
      shippingZar: shipping,
      internalStoreGroupCount: storeGroupsPay.length,
      deliveryCountry,
      cartItemQty: cartProductQtyPay,
      courierTariffId,
      requiresCourierSelection: internalCourierPay.requiresCourierSelection,
      warehouseFreeLocalApplied: internalCourierPay.warehouseFreeLocalApplied,
    });

    const deliveryFlags = deliveryPrepaidFlagsForOrder(
      orderItems.length > 0,
      shipping,
      internalCourierPay.warehouseFreeLocalApplied
    );

    const shippingBreakdownForOrder: Array<{
      storeName: string;
      shippingCost: number;
      providerName?: string;
      serviceLabel?: string;
      courierTariffId?: string;
      originCountryCode?: string;
    }> = [];
    for (const line of internalCourierPay.storeGroupBreakdown) {
      const provider = line.providerName?.trim();
      shippingBreakdownForOrder.push({
        storeName:
          provider && internalCourierPay.storeGroupBreakdown.length > 1
            ? `${line.storeName} · ${provider}`
            : provider
              ? `${line.storeName} (${provider})`
              : line.storeName,
        shippingCost: line.shippingCostZar,
        providerName: line.providerName,
        serviceLabel: line.serviceLabel,
        courierTariffId: line.courierTariffId,
        originCountryCode: line.originCountryCode,
      });
    }
    if (cjShippingZarPay > 0) {
      shippingBreakdownForOrder.push({ storeName: "CJ / Dropship", shippingCost: cjShippingZarPay });
    }
    for (const extId of uniqueExternalSupplierIdsPay) {
      if ((externalSupplierMapPay.get(extId) as any)?.source === "cj") continue;
      const ext = externalSupplierMapPay.get(extId);
      shippingBreakdownForOrder.push({ storeName: "Dropship", shippingCost: (ext as any)?.shippingCost ?? 0 });
    }

    const paymentBreakdownForOrder = {
      items: orderItems.map((oi) => {
        const p = productMap.get((oi.productId as any).toString());
        let title = (p as any)?.title ?? "Product";
        const variant: string[] = [];
        if (oi.selectedSize) variant.push(`Size ${oi.selectedSize}`);
        if (oi.selectedColor) variant.push(oi.selectedColor);
        if (variant.length) title = `${title} (${variant.join(", ")})`;
        return { title, price: oi.price, qty: oi.qty };
      }).concat(musicPurchaseItems.map((m) => ({
        title: "Music download",
        price: m.price,
        qty: m.qty,
      }))),
      shippingBreakdown: shippingBreakdownForOrder,
    };

    let order: any = null;
    if (orderItems.length > 0) {
    order = await Order.create({
      buyerId: req.user!._id,
      supplierId,
      status: "pending_payment",
      items: orderItems,
      musicItems: musicPurchaseItems.map((m) => ({ songId: m.songId, qty: m.qty, price: m.price })),
      amounts: {
        subtotal,
        shipping,
        commissionTotal,
        platformFee: Math.round(platformFeeTotal * 100) / 100,
        total,
        currency: currencyCtxPay.settlementCurrency,
        settlementZar: currencyCtxPay.quoteInNativeCurrency ? totalZarForPayment : undefined,
        shippingBreakdown: shippingBreakdownForOrder,
        ...deliveryFlags,
      },
      paymentBreakdown: paymentBreakdownForOrder,
      delivery: {
        method: "courier",
        address: String(deliveryAddress || "").trim(),
        countryCode: deliveryCountry,
        carrier:
          internalCourierPay.storeGroupBreakdown
            .map((l) => l.providerName)
            .filter(Boolean)
            .join(" + ") || internalCourierPay.selectedCourier?.providerName,
        courierTariffId: internalCourierPay.selectedCourier?.tariffId,
        crossborderCourierTariffId:
          internalCourierPay.storeGroupBreakdown.find((l) => l.courierTariffId && l.originCountryCode && l.originCountryCode !== deliveryCountry)
            ?.courierTariffId || crossborderCourierTariffId,
        courierProviderId: internalCourierPay.selectedCourier?.providerId,
        serviceLabel: internalCourierPay.selectedCourier?.serviceLabel,
        courierPriceZar: internalCourierPay.selectedCourier?.priceZar,
        estimatedDeliveryDaysMin: internalCourierPay.selectedCourier?.minDeliveryDays,
        estimatedDeliveryDaysMax: internalCourierPay.selectedCourier?.maxDeliveryDays,
      },
      paymentMethod,
    });
    if (order) {
      await cancelOtherPendingOrdersForBuyer(req.user!._id.toString(), order._id.toString());
    }
    }

    if (order) {
      void sendOrderPlacedEmailToOrdersInbox(order._id.toString());
    }

    if (paymentMethod === "orange_money") {
      if (!order) {
        throw new AppError("Orange Money is not available for this cart", 400);
      }
      const omReference = formatOrderNumber(order._id.toString());
      order.paymentReference = omReference;
      await order.save();

      await sendOrangeMoneyPaymentInstructionsInMessenger({
        buyerId: req.user!._id.toString(),
        orderId: order._id.toString(),
        total: Number(order.amounts?.total ?? total),
        currency: String(order.amounts?.currency || currencyCtxPay.settlementCurrency || "BWP"),
        reference: omReference,
      });

      return res.json({
        data: {
          orderId: order._id,
          status: "pending_payment",
          paymentMethod: "orange_money",
          orangeMoneyReference: omReference,
          amount: Number(order.amounts?.total ?? total),
          currency: String(order.amounts?.currency || currencyCtxPay.settlementCurrency || "BWP"),
          message: "Orange Money payment instructions sent to your Messenger.",
        },
      });
    }

    if (paymentMethod === "eft") {
      if (!order) {
        throw new AppError("EFT is not available for this cart", 400);
      }
      const eftCountry = deliveryCountry === "BW" ? "BW" : "ZA";
      if (eftCountry === "ZA" && currencyCtxPay.quoteInNativeCurrency) {
        await cancelPendingOrderIfUnpaid(order._id.toString());
        throw new AppError("EFT is only available for ZAR checkout", 400);
      }

      let eftReference: string;
      let eftAmount: number;
      let eftCurrency: string;
      if (eftCountry === "BW") {
        const buyerDoc = await User.findById(req.user!._id).select("email phone").lean();
        eftReference = resolveEftPaymentReference(buyerDoc || req.user!);
        if (!eftReference) {
          await cancelPendingOrderIfUnpaid(order._id.toString());
          throw new AppError(
            "Add an email or phone number to your profile before paying by EFT",
            400
          );
        }
        eftAmount = Number(order.amounts?.total ?? total);
        eftCurrency = String(order.amounts?.currency || currencyCtxPay.settlementCurrency || "BWP");
      } else {
        eftReference = formatOrderNumber(order._id.toString());
        eftAmount = totalZarForPayment;
        eftCurrency = "ZAR";
      }

      order.paymentReference = eftReference;
      await order.save();

      await sendEftPaymentInstructionsInMessenger({
        buyerId: req.user!._id.toString(),
        orderId: order._id.toString(),
        amount: eftAmount,
        currency: eftCurrency,
        country: eftCountry,
        reference: eftReference,
      });

      return res.json({
        data: {
          orderId: order._id,
          status: "pending_payment",
          paymentMethod: "eft",
          eftReference,
          amount: eftAmount,
          amountZar: eftCountry === "ZA" ? eftAmount : totalZarForPayment,
          currency: eftCurrency,
          message: "EFT payment instructions sent to your Messenger.",
        },
      });
    }

    if (paymentMethod === "wallet") {
      let wallet = await Wallet.findOne({ user: req.user!._id });
      if (!wallet) wallet = await Wallet.create({ user: req.user!._id });
      if (wallet.balance < totalZarForPayment) {
        if (order) await Order.findByIdAndUpdate(order._id, { status: "cancelled" });
        throw new AppError("Insufficient wallet balance", 400);
      }
      const ref = order ? `ORDER-${order._id}` : `MUSIC-${Date.now()}`;
      wallet.balance -= totalZarForPayment;
      wallet.transactions.push({
        type: "debit",
        amount: -totalZarForPayment,
        reference: ref,
        createdAt: new Date(),
      });
      await wallet.save();

      if (order) {
        order.status = "paid";
        order.paidAt = new Date();
        order.paymentReference = `WALLET-${order._id}`;
        await order.save();
        await notifyBuyerOrderPurchase({
          buyerId: req.user!._id.toString(),
          orderId: order._id.toString(),
          totalZar: Number(order.amounts?.total ?? 0),
          items: order.items.map((it: { productId: unknown; qty: number }) => ({
            productId: (it.productId as { toString(): string }).toString(),
            qty: it.qty,
          })),
        });
        await finalizeCourierOnOrderPaid(order._id.toString());
        await notifyOrderPaid({
          orderId: order._id.toString(),
          buyerId: req.user!._id.toString(),
          items: order.items.map((it: { productId: unknown; qty: number }) => ({
            productId: (it.productId as any).toString(),
            qty: it.qty,
          })),
        });
        if ((order.amounts as any)?.deliveryPrepaid) {
          await notifyBuyerDeliveryPrepaid({
            buyerId: req.user!._id.toString(),
            orderId: order._id.toString(),
            shippingZar: Number(order.amounts?.shipping ?? 0),
          });
        }
        forwardOrderToExternalSupplier(order._id.toString()).catch((err) =>
          console.error("Order forward to external supplier failed:", err)
        );
      }

      for (const m of musicPurchaseItems) {
        const song = await Song.findById(m.songId).lean();
        if (!song) continue;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminUser = adminEmail ? await User.findOne({ email: adminEmail }).select("_id") : null;
        if (!adminUser?._id) continue;
        let ownerWallet = await Wallet.findOne({ user: (song as any).userId });
        if (!ownerWallet) ownerWallet = await Wallet.create({ user: (song as any).userId });
        let adminWallet = await Wallet.findOne({ user: adminUser._id });
        if (!adminWallet) adminWallet = await Wallet.create({ user: adminUser._id });
        const adminCommission = Math.round((m.price * m.qty * MUSIC_PLATFORM_COMMISSION_PCT / 100) * 100) / 100;
        const ownerShare = Math.round((m.price * m.qty * MUSIC_OWNER_SHARE_PCT / 100) * 100) / 100;
        const reference = `MUSIC-${m.songId}-${Date.now()}`;
        ownerWallet.balance += ownerShare;
        ownerWallet.transactions.push({ type: "credit", amount: ownerShare, reference: `${reference}-OWNER`, createdAt: new Date() });
        await ownerWallet.save();
        adminWallet.balance += adminCommission;
        adminWallet.transactions.push({ type: "credit", amount: adminCommission, reference: `${reference}-ADMIN`, createdAt: new Date() });
        await adminWallet.save();
        await MusicPurchase.create({
          songId: m.songId,
          buyerId: req.user!._id,
          ownerId: (song as any).userId,
          amount: m.price * m.qty,
          adminCommission,
          ownerShare,
          reference,
        });
      }

      await clearBuyerCartAfterOrderPaid(req.user!._id.toString());

      return res.json({
        data: {
          orderId: order?._id ?? null,
          status: "paid",
          message: order ? "Order paid with wallet" : "Music purchase complete",
        },
      });
    }

    // Card: create Payment and initiate PayGate
    const mongoose = await import("mongoose");
    const reference = order ? `ORDER-${order._id}` : `MUSIC-${new mongoose.default.Types.ObjectId()}`;
    await Payment.create({
      user: req.user!._id,
      amount: totalZarForPayment,
      reference,
      status: "pending",
      ...(order ? {} : { metadata: { musicItems: musicPurchaseItems } }),
    });

    const returnOrderId = order?._id ?? reference;
    const paymentResult = await initiatePayment({
      amount: totalZarForPayment,
      reference,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/checkout/return?orderId=${returnOrderId}`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
      // Marketplace checkout must not add wallet top-up flat fee.
      skipPayGateFee: true,
    });

    if (!paymentResult.success) {
      if (order) await cancelPendingOrderIfUnpaid(order._id.toString());
      throw new AppError(paymentResult.error || "Payment initiation failed", 502);
    }

    // Cart stays until PayGate webhook confirms payment — avoids losing items on cancel.

    res.json({
      data: {
        orderId: order?._id ?? null,
        status: "pending_payment",
        paymentUrl: paymentResult.paymentUrl,
        payGateRedirect: paymentResult.payGateRedirect,
        reference,
        amount: total,
        amountZar: totalZarForPayment,
        currency: currencyCtxPay.settlementCurrency,
        paygateFeeZar: paymentResult.paygateFeeZar,
        chargedZar: paymentResult.chargedZar,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get current user's product purchase history (latest first)
router.get("/orders/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const pageRaw = parseInt(String(req.query.page || "1"), 10);
    const limitRaw = parseInt(String(req.query.limit || "20"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ buyerId: req.user!._id })
        .select("status amounts paymentBreakdown paymentMethod paymentReference paidAt createdAt")
        .populate("items.productId", "title slug images price currency")
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ buyerId: req.user!._id }),
    ]);

    res.json({
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
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
    const shipment = await CourierShipment.findOne({ orderId: order._id }).lean();
    const Payment = (await import("../data/models/Payment")).default;
    const payment = await Payment.findOne({ reference: `ORDER-${order._id}` })
      .select("status")
      .lean();
    const orderNumber = formatOrderNumber(String(order._id));
    const eftPending =
      (order as any).paymentMethod === "eft" && (order as any).status === "pending_payment";
    const orangeMoneyPending =
      (order as any).paymentMethod === "orange_money" && (order as any).status === "pending_payment";
    const totalZar =
      Number((order as any).amounts?.settlementZar) ||
      Number((order as any).amounts?.total) ||
      0;
    const orderCurrency = String((order as any).amounts?.currency || "ZAR");
    const orderTotal = Number((order as any).amounts?.total) || 0;
    const paymentReference = (order as any).paymentReference || orderNumber;
    const deliveryCountryCode = String((order as any).delivery?.countryCode || "ZA").toUpperCase();
    const eftCountry: "ZA" | "BW" = deliveryCountryCode === "BW" ? "BW" : "ZA";
    const eftBank = getEftBankDetails(eftCountry);
    res.json({
      data: {
        ...order,
        courierShipment: shipment ?? null,
        paymentStatus: (payment as { status?: string } | null)?.status ?? null,
        eftInstructions: eftPending
          ? {
              reference: paymentReference,
              amount: orderTotal,
              amountZar: totalZar,
              currency: orderCurrency,
              country: eftCountry,
              referenceHint: eftBank.referenceHint,
              bank: eftBank,
              message: buildEftPaymentMessage({
                orderNumber,
                amount: orderTotal,
                currency: orderCurrency,
                reference: paymentReference,
                country: eftCountry,
              }),
            }
          : null,
        orangeMoneyInstructions: orangeMoneyPending
          ? {
              reference: paymentReference,
              amount: orderTotal,
              currency: orderCurrency,
              orangeMoneyNumber: ORANGE_MONEY_BW_NUMBER,
              message: buildOrangeMoneyPaymentMessage({
                orderNumber,
                amount: orderTotal,
                currency: orderCurrency,
                reference: paymentReference,
              }),
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Buyer cancels an unpaid card checkout (e.g. closed PayGate without paying).
router.post("/order/:orderId/cancel-payment", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) throw new AppError("Order not found", 404);
    if (order.buyerId.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }
    if (order.status !== "pending_payment") {
      throw new AppError("This order is no longer awaiting payment", 400);
    }
    await cancelPendingOrderIfUnpaid(order._id.toString());
    await restoreCartLinesFromOrder(order);
    const Payment = (await import("../data/models/Payment")).default;
    await Payment.updateOne({ reference: `ORDER-${order._id}`, status: "pending" }, { status: "failed" });
    res.json({
      data: { orderId: order._id, status: "cancelled" },
      message: "Payment cancelled. Your cart has been restored.",
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/checkout/order/:orderId/dispute — buyer opens parcel dispute
router.post("/order/:orderId/dispute", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (!reason || reason.length < 10) throw new AppError("Please describe the issue (at least 10 characters)", 400);
    const order = await Order.findById(req.params.orderId);
    if (!order) throw new AppError("Order not found", 404);
    if (String(order.buyerId) !== String(req.user!._id)) throw new AppError("Unauthorized", 403);
    let shipment = await CourierShipment.findOne({ orderId: order._id });
    if (!shipment) {
      await finalizeCourierOnOrderPaid(order._id.toString());
      shipment = await CourierShipment.findOne({ orderId: order._id });
    }
    if (!shipment) throw new AppError("No parcel record for this order", 404);
    if (shipment.disputeStatus === "open" || shipment.disputeStatus === "investigating") {
      throw new AppError("A dispute is already open for this parcel", 400);
    }
    shipment.disputeStatus = "open";
    shipment.disputeReason = reason.slice(0, 2000);
    shipment.disputeOpenedAt = new Date();
    await shipment.save();
    res.json({ data: shipment, message: "Dispute submitted. Support will follow up." });
  } catch (err) {
    next(err);
  }
});

export default router;
