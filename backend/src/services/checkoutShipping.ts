import Store from "../data/models/Store";
import Supplier from "../data/models/Supplier";
import {
  courierAmountForSettlement,
  estimateCartWeightKg,
  type CourierQuoteOption,
} from "./courierPricingService";
import type { SadcDeliveryScope } from "./sadcDeliveryCatalogService";
import {
  ensureCheckoutCourierOptions,
  fallbackStoreGroupsFromCart,
  inferParcelTierForStoreGroup,
} from "./courierServiceCatalog";
import {
  domesticGroupsNeedingCourierTariff,
  loadStoreBySupplierMap,
  storeGroupQualifiesForWarehouseFreeLocal,
  type DeliveryLocalityInput,
} from "./warehouseLocalDelivery";
import {
  cartHasMixedDomesticOrigins,
  groupNeedsCrossborderLane,
  listCrossborderCourierOptionsForGroups,
  resolveQuoteForStoreGroupLane,
  resolveStoreCourierLane,
} from "./storeGroupCourierLane";

export type ShippingStoreGroup = {
  /** Stable key: store:<id> or supplier:<id> when no storefront exists */
  groupKey: string;
  storeId?: string;
  storeName: string;
  supplierIds: string[];
  /** Storefront country (ZA, BW, …) — drives domestic vs crossborder courier lane */
  originCountryCode?: string;
  totalQty: number;
  lineCount: number;
};

export type StoreGroupShippingLine = {
  groupKey: string;
  storeName: string;
  shippingCostZar: number;
  providerName?: string;
  serviceLabel?: string;
  courierTariffId?: string;
  originCountryCode?: string;
  /** Internal: auto-selected PAXI bag tier for this store's parcel */
  parcelBagTier?: "standard" | "large";
};

export type InternalShippingResult = {
  /** Total ZAR for all internal (local) store groups combined */
  internalShippingZar: number;
  courierUsed: boolean;
  selectedCourier?: CourierQuoteOption;
  /** One line per store group (never per cart line / per duplicate supplier) */
  storeGroupBreakdown: StoreGroupShippingLine[];
  requiresCourierSelection: boolean;
  availableOptions: CourierQuoteOption[];
  crossborderCourierOptions?: CourierQuoteOption[];
  requiresCrossborderCourierSelection?: boolean;
  hasMixedStoreOrigins?: boolean;
  /** True when at least one store group received Qwertymates warehouse free local delivery */
  warehouseFreeLocalApplied?: boolean;
};

const DEFAULT_SHIPPING_PER_STORE = 100;

/**
 * Group internal cart lines by supplier storefront (Store), not by line item or duplicate supplier rows.
 * Items from the same store share one delivery charge at checkout.
 */
export async function buildInternalShippingStoreGroups(
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>
): Promise<ShippingStoreGroup[]> {
  const supplierIds = new Set<string>();
  for (const item of cartItems) {
    const product = productMap.get(String(item.productId ?? ""));
    if (!product) continue;
    const src = String(product.supplierSource || "internal");
    if (src !== "internal") continue;
    const sid = String(
      (product.supplierId as { _id?: unknown })?._id ?? product.supplierId ?? ""
    ).trim();
    if (sid) supplierIds.add(sid);
  }

  const stores =
    supplierIds.size > 0
      ? await Store.find({ supplierId: { $in: [...supplierIds] }, type: "supplier" })
          .select("supplierId slug name countryCode")
          .lean()
      : [];
  const storeBySupplier = new Map(stores.map((s) => [String(s.supplierId), s]));
  const countryBySupplier = new Map(
    stores.map((s) => [
      String(s.supplierId),
      String((s as { countryCode?: string }).countryCode || "ZA").trim().toUpperCase() || "ZA",
    ])
  );

  const byKey = new Map<string, ShippingStoreGroup>();
  for (const item of cartItems) {
    const product = productMap.get(String(item.productId ?? ""));
    if (!product) continue;
    const src = String(product.supplierSource || "internal");
    if (src !== "internal") continue;
    const sid = String(
      (product.supplierId as { _id?: unknown; storeName?: string })?._id ??
        product.supplierId ??
        ""
    ).trim();
    if (!sid) {
      const groupKey = "cart:internal";
      const qty = Math.max(1, Number(item.qty) || 1);
      const existing = byKey.get(groupKey);
      if (existing) {
        existing.totalQty += qty;
        existing.lineCount += 1;
      } else {
        byKey.set(groupKey, {
          groupKey,
          storeName: "Your order",
          supplierIds: [],
          originCountryCode: "ZA",
          totalQty: qty,
          lineCount: 1,
        });
      }
      continue;
    }

    const store = storeBySupplier.get(sid);
    const groupKey = store ? `store:${String(store._id)}` : `supplier:${sid}`;
    const supplierStoreName =
      (product.supplierId as { storeName?: string })?.storeName?.trim() || "";
    const storeName =
      (store?.name ? String(store.name).trim() : "") ||
      supplierStoreName ||
      "Supplier";
    const originCountryCode = countryBySupplier.get(sid) || "ZA";
    const qty = Math.max(1, Number(item.qty) || 1);

    const existing = byKey.get(groupKey);
    if (existing) {
      existing.totalQty += qty;
      existing.lineCount += 1;
      if (!existing.supplierIds.includes(sid)) existing.supplierIds.push(sid);
      if (!existing.originCountryCode) existing.originCountryCode = originCountryCode;
    } else {
      byKey.set(groupKey, {
        groupKey,
        storeId: store ? String(store._id) : undefined,
        storeName,
        supplierIds: [sid],
        originCountryCode,
        totalQty: qty,
        lineCount: 1,
      });
    }
  }

  return [...byKey.values()];
}

async function flatShippingZarForStoreGroup(
  group: ShippingStoreGroup,
  supplierMap: Map<string, { shippingCost?: number; storeName?: string }>
): Promise<number> {
  let best = DEFAULT_SHIPPING_PER_STORE;
  for (const sid of group.supplierIds) {
    const s = supplierMap.get(sid);
    const configured = Number((s as { shippingCost?: number })?.shippingCost);
    const cost = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_SHIPPING_PER_STORE;
    best = Math.max(best, cost);
  }
  return best;
}

export type ComputeInternalShippingParams = {
  deliveryCountry: string;
  storeGroups: ShippingStoreGroup[];
  courierTariffId?: string;
  crossborderCourierTariffId?: string;
  supplierMap?: Map<string, { shippingCost?: number; storeName?: string }>;
  cartItems?: Array<{ productId: unknown; qty?: number }>;
  productMap?: Map<string, Record<string, unknown>>;
};

/**
 * Local delivery: one charge per store group (different stores = different origins).
 * PAXI standard vs large bag is chosen automatically per group from volume/weight heuristics.
 */
export async function computeInternalCourierShipping(
  deliveryCountry: string,
  storeGroups: ShippingStoreGroup[],
  courierTariffId?: string,
  supplierMap?: Map<string, { shippingCost?: number; storeName?: string }>,
  cartItems: Array<{ productId: unknown; qty?: number }> = [],
  productMap: Map<string, Record<string, unknown>> = new Map(),
  opts?: {
    deliveryScope?: SadcDeliveryScope;
    settlementCurrency?: string;
    quoteInNativeCurrency?: boolean;
    crossborderCourierTariffId?: string;
    deliveryCity?: string;
    deliveryAddress?: string;
  }
): Promise<InternalShippingResult> {
  const settlementCurrency = String(opts?.settlementCurrency || "ZAR").toUpperCase();
  const deliveryLocality: DeliveryLocalityInput = {
    deliveryCountry,
    deliveryCity: opts?.deliveryCity,
    deliveryAddress: opts?.deliveryAddress,
  };
  const empty: InternalShippingResult = {
    internalShippingZar: 0,
    courierUsed: false,
    storeGroupBreakdown: [],
    requiresCourierSelection: false,
    availableOptions: [],
  };

  const groups = fallbackStoreGroupsFromCart(storeGroups, cartItems, productMap);
  if (groups.length <= 0) return empty;

  const supplierIdsForStores = [...new Set(groups.flatMap((g) => g.supplierIds))];
  const storeBySupplier = await loadStoreBySupplierMap(supplierIdsForStores);

  const hasMixedStoreOrigins = cartHasMixedDomesticOrigins(groups, deliveryCountry);
  const crossborderGroups = groups.filter((g) => groupNeedsCrossborderLane(g, deliveryCountry));
  const crossborderCourierOptions = await listCrossborderCourierOptionsForGroups(
    groups,
    deliveryCountry
  );
  const requiresCrossborderCourierSelection =
    crossborderGroups.length > 0 && crossborderCourierOptions.length > 0;

  const availableOptions = await ensureCheckoutCourierOptions(
    deliveryCountry,
    groups,
    cartItems,
    productMap,
    {
      deliveryScope: opts?.deliveryScope,
      quoteInNativeCurrency: opts?.quoteInNativeCurrency,
      crossborderCourierTariffId: opts?.crossborderCourierTariffId,
    }
  );

  if (availableOptions.length > 0) {
    const needsDomesticTariff = domesticGroupsNeedingCourierTariff(
      groups,
      deliveryCountry,
      cartItems,
      productMap,
      storeBySupplier,
      deliveryLocality
    );
    if (needsDomesticTariff && !courierTariffId) {
      return {
        ...empty,
        requiresCourierSelection: true,
        availableOptions,
        crossborderCourierOptions,
        requiresCrossborderCourierSelection,
        hasMixedStoreOrigins,
      };
    }
    if (
      requiresCrossborderCourierSelection &&
      !opts?.crossborderCourierTariffId &&
      hasMixedStoreOrigins
    ) {
      return {
        ...empty,
        requiresCourierSelection: true,
        availableOptions,
        crossborderCourierOptions,
        requiresCrossborderCourierSelection: true,
        hasMixedStoreOrigins,
      };
    }

    const laneParams = {
      deliveryCountry,
      domesticTariffId: courierTariffId,
      crossborderTariffId: opts?.crossborderCourierTariffId,
      cartItems,
      productMap,
      deliveryScope: opts?.deliveryScope,
      quoteInNativeCurrency: opts?.quoteInNativeCurrency,
    };

    const breakdown: StoreGroupShippingLine[] = [];
    let internalShippingZar = 0;
    let selectedCourier: CourierQuoteOption | undefined;
    let warehouseFreeLocalApplied = false;

    for (const group of groups) {
      const parcelBagTier = inferParcelTierForStoreGroup(group, cartItems, productMap);
      const freeLocal = storeGroupQualifiesForWarehouseFreeLocal({
        group,
        cartItems,
        productMap,
        storeBySupplier,
        delivery: deliveryLocality,
      });
      if (freeLocal.qualifies) {
        warehouseFreeLocalApplied = true;
        breakdown.push({
          groupKey: group.groupKey,
          storeName: group.storeName,
          shippingCostZar: 0,
          providerName: "Qwertymates",
          serviceLabel:
            freeLocal.freeDeliveryLabel ||
            freeLocal.zone?.freeDeliveryLabel ||
            "Free delivery",
          originCountryCode: group.originCountryCode,
          parcelBagTier,
        });
        continue;
      }
      const selected = await resolveQuoteForStoreGroupLane(group, laneParams);
      if (!selected) {
        return {
          ...empty,
          requiresCourierSelection: true,
          availableOptions,
          crossborderCourierOptions,
          requiresCrossborderCourierSelection,
          hasMixedStoreOrigins,
        };
      }
      selectedCourier = selected;
      const shipAmt = courierAmountForSettlement(selected, settlementCurrency);
      internalShippingZar += shipAmt;
      breakdown.push({
        groupKey: group.groupKey,
        storeName: group.storeName,
        shippingCostZar: shipAmt,
        providerName: selected.providerName,
        serviceLabel: selected.serviceLabel,
        courierTariffId: selected.tariffId,
        originCountryCode: group.originCountryCode,
        parcelBagTier,
      });
    }

    const displayBase =
      (courierTariffId
        ? availableOptions.find((o) => o.tariffId === courierTariffId)
        : undefined) ?? availableOptions[0];
    const displayOption = displayBase
      ? {
          ...displayBase,
          priceZar: Math.round(internalShippingZar * 100) / 100,
          checkoutCurrency: settlementCurrency,
        }
      : selectedCourier
        ? {
            ...selectedCourier,
            checkoutCurrency: settlementCurrency,
          }
        : selectedCourier;

    return {
      internalShippingZar,
      courierUsed: true,
      selectedCourier: displayOption ?? selectedCourier,
      storeGroupBreakdown: breakdown,
      requiresCourierSelection: false,
      availableOptions,
      crossborderCourierOptions,
      requiresCrossborderCourierSelection: false,
      hasMixedStoreOrigins,
      warehouseFreeLocalApplied,
    };
  }

  const suppliers =
    supplierMap ??
    (await (async () => {
      const ids = [...new Set(storeGroups.flatMap((g) => g.supplierIds))];
      if (!ids.length) return new Map();
      const rows = await Supplier.find({ _id: { $in: ids } })
        .select("shippingCost storeName")
        .lean();
      return new Map(rows.map((s) => [String(s._id), s as { shippingCost?: number; storeName?: string }]));
    })());

  const breakdown: StoreGroupShippingLine[] = [];
  let internalShippingZar = 0;
  let warehouseFreeLocalApplied = false;
  for (const group of groups) {
    const parcelBagTier = inferParcelTierForStoreGroup(group, cartItems, productMap);
    const freeLocal = storeGroupQualifiesForWarehouseFreeLocal({
      group,
      cartItems,
      productMap,
      storeBySupplier,
      delivery: deliveryLocality,
    });
    if (freeLocal.qualifies) {
      warehouseFreeLocalApplied = true;
      breakdown.push({
        groupKey: group.groupKey,
        storeName: group.storeName,
        shippingCostZar: 0,
        providerName: "Qwertymates",
        serviceLabel:
          freeLocal.freeDeliveryLabel ||
          freeLocal.zone?.freeDeliveryLabel ||
          "Free delivery",
        parcelBagTier,
      });
      internalShippingZar += 0;
      continue;
    }
    const cost = await flatShippingZarForStoreGroup(group, suppliers);
    internalShippingZar += cost;
    breakdown.push({
      groupKey: group.groupKey,
      storeName: group.storeName,
      shippingCostZar: cost,
      parcelBagTier,
    });
  }

  return {
    internalShippingZar,
    courierUsed: false,
    storeGroupBreakdown: breakdown,
    requiresCourierSelection: false,
    availableOptions: [],
    warehouseFreeLocalApplied,
  };
}

/** Validate pay when local products need an explicit courier choice. */
export async function assertCourierSelectedForPay(
  deliveryCountry: string,
  storeGroups: ShippingStoreGroup[],
  courierTariffId?: string,
  cartItems: Array<{ productId: unknown; qty?: number }> = [],
  productMap: Map<string, Record<string, unknown>> = new Map(),
  opts?: {
    deliveryScope?: SadcDeliveryScope;
    quoteInNativeCurrency?: boolean;
    crossborderCourierTariffId?: string;
    deliveryCity?: string;
    deliveryAddress?: string;
  }
): Promise<void> {
  const groups = fallbackStoreGroupsFromCart(storeGroups, cartItems, productMap);
  if (groups.length <= 0) return;
  const deliveryLocality: DeliveryLocalityInput = {
    deliveryCountry,
    deliveryCity: opts?.deliveryCity,
    deliveryAddress: opts?.deliveryAddress,
  };
  const storeBySupplier = await loadStoreBySupplierMap([...new Set(groups.flatMap((g) => g.supplierIds))]);
  const options = await ensureCheckoutCourierOptions(
    deliveryCountry,
    groups,
    cartItems,
    productMap,
    opts
  );
  const needsDomestic = domesticGroupsNeedingCourierTariff(
    groups,
    deliveryCountry,
    cartItems,
    productMap,
    storeBySupplier,
    deliveryLocality
  );
  const needsCrossborder = groups.some((g) => groupNeedsCrossborderLane(g, deliveryCountry));
  if (options.length > 0 && needsDomestic && !courierTariffId) {
    const { AppError } = await import("../middleware/errorHandler");
    throw new AppError("Please select a delivery method before paying", 400);
  }
  if (
    needsCrossborder &&
    cartHasMixedDomesticOrigins(groups, deliveryCountry) &&
    !opts?.crossborderCourierTariffId
  ) {
    const { AppError } = await import("../middleware/errorHandler");
    throw new AppError(
      "Please select an international delivery method for shops outside South Africa.",
      400
    );
  }
  const laneParams = {
    deliveryCountry,
    domesticTariffId: courierTariffId,
    crossborderTariffId: opts?.crossborderCourierTariffId,
    cartItems,
    productMap,
    deliveryScope: opts?.deliveryScope,
    quoteInNativeCurrency: opts?.quoteInNativeCurrency,
  };
  for (const group of groups) {
    const freeLocal = storeGroupQualifiesForWarehouseFreeLocal({
      group,
      cartItems,
      productMap,
      storeBySupplier,
      delivery: deliveryLocality,
    });
    if (freeLocal.qualifies) continue;
    const match = await resolveQuoteForStoreGroupLane(group, laneParams);
    if (!match) {
      const { AppError } = await import("../middleware/errorHandler");
      throw new AppError(
        "Selected delivery method is not available for this order size or address. Choose another option.",
        400
      );
    }
  }
}
