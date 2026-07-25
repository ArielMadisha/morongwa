import Store from "../data/models/Store";
import {
  resolveWarehouseLocalZoneFromName,
  type QwertymatesWarehouseLocalZone,
} from "../config/qwertymatesWarehouses";
import {
  deliveryMatchesProductFreeShipping,
  productUsesExplicitFreeShipping,
  resolveProductFreeShippingZone,
} from "./productFreeShipping";
import type { ShippingStoreGroup } from "./checkoutShipping";
import { resolveStoreCourierLane } from "./storeGroupCourierLane";

export type DeliveryLocalityInput = {
  deliveryCountry: string;
  deliveryCity?: string;
  deliveryAddress?: string;
};

export type WarehouseFreeLocalFields = {
  warehouseFreeLocalCity: string;
  warehouseFreeLocalCountry: string;
};

export function warehouseFreeLocalFieldsFromZone(
  zone: QwertymatesWarehouseLocalZone
): WarehouseFreeLocalFields {
  return {
    warehouseFreeLocalCity: zone.city,
    warehouseFreeLocalCountry: zone.countryCode,
  };
}

export function resolveWarehouseFreeLocalForSupplier(params: {
  storeName?: string | null;
  linkedStoreName?: string | null;
}): WarehouseFreeLocalFields | null {
  const zone =
    resolveWarehouseLocalZoneFromName(params.storeName) ||
    resolveWarehouseLocalZoneFromName(params.linkedStoreName);
  return zone ? warehouseFreeLocalFieldsFromZone(zone) : null;
}

export function resolveProductWarehouseFreeLocal(
  product: Record<string, unknown>,
  supplierStoreName?: string | null
): QwertymatesWarehouseLocalZone | null {
  return resolveProductFreeShippingZone(product, supplierStoreName);
}

function cartItemGroupKey(
  item: { productId: unknown },
  productMap: Map<string, Record<string, unknown>>,
  storeBySupplier: Map<string, { _id: unknown; name?: string }>
): string | null {
  const product = productMap.get(String(item.productId ?? ""));
  if (!product) return null;
  if (String(product.supplierSource || "internal") !== "internal") return null;
  const sid = String(
    (product.supplierId as { _id?: unknown })?._id ?? product.supplierId ?? ""
  ).trim();
  if (!sid) return "cart:internal";
  const store = storeBySupplier.get(sid);
  return store ? `store:${String(store._id)}` : `supplier:${sid}`;
}

export function storeGroupQualifiesForWarehouseFreeLocal(params: {
  group: ShippingStoreGroup;
  cartItems: Array<{ productId: unknown; qty?: number }>;
  productMap: Map<string, Record<string, unknown>>;
  storeBySupplier: Map<string, { _id: unknown; name?: string }>;
  delivery: DeliveryLocalityInput;
}): { qualifies: boolean; zone?: QwertymatesWarehouseLocalZone; freeDeliveryLabel?: string } {
  const itemsInGroup = params.cartItems.filter(
    (item) =>
      cartItemGroupKey(item, params.productMap, params.storeBySupplier) === params.group.groupKey
  );
  if (itemsInGroup.length === 0) return { qualifies: false };

  let zone: QwertymatesWarehouseLocalZone | null = null;
  let freeDeliveryLabel: string | undefined;
  let usesExplicit = false;

  for (const item of itemsInGroup) {
    const product = params.productMap.get(String(item.productId ?? ""));
    if (!product) return { qualifies: false };

    const match = deliveryMatchesProductFreeShipping(product, params.delivery);
    if (!match.matches) return { qualifies: false };
    if (!freeDeliveryLabel && match.label) freeDeliveryLabel = match.label;

    if (productUsesExplicitFreeShipping(product)) {
      usesExplicit = true;
      continue;
    }

    const productZone = resolveProductWarehouseFreeLocal(product);
    if (!productZone) return { qualifies: false };
    if (!zone) zone = productZone;
    else if (zone.city !== productZone.city || zone.countryCode !== productZone.countryCode) {
      return { qualifies: false };
    }
  }

  if (usesExplicit && !zone) {
    const origin = String(params.group.originCountryCode || "").toUpperCase();
    const allSameOrigin = itemsInGroup.every((item) => {
      const product = params.productMap.get(String(item.productId ?? ""));
      if (!product || !Array.isArray(product.freeShippingAreas)) return false;
      return (product.freeShippingAreas as Array<{ countryCode: string }>).some(
        (a) => String(a.countryCode || "").toUpperCase() === origin
      );
    });
    if (!allSameOrigin) return { qualifies: false };
    return {
      qualifies: true,
      freeDeliveryLabel: freeDeliveryLabel || "Free delivery",
    };
  }

  if (!zone) return { qualifies: false };
  const origin = String(params.group.originCountryCode || zone.countryCode).toUpperCase();
  if (origin !== zone.countryCode) return { qualifies: false };

  return {
    qualifies: true,
    zone,
    freeDeliveryLabel: freeDeliveryLabel || zone.freeDeliveryLabel,
  };
}

export async function loadStoreBySupplierMap(
  supplierIds: string[]
): Promise<Map<string, { _id: unknown; name?: string }>> {
  if (supplierIds.length === 0) return new Map();
  const stores = await Store.find({ supplierId: { $in: supplierIds }, type: "supplier" })
    .select("supplierId name")
    .lean();
  return new Map(stores.map((s) => [String(s.supplierId), s as { _id: unknown; name?: string }]));
}

export function domesticGroupsNeedingCourierTariff(
  groups: ShippingStoreGroup[],
  deliveryCountry: string,
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>,
  storeBySupplier: Map<string, { _id: unknown; name?: string }>,
  delivery: DeliveryLocalityInput
): boolean {
  return groups.some((group) => {
    if (resolveStoreCourierLane(group.originCountryCode, deliveryCountry).kind !== "domestic_za") {
      return false;
    }
    const free = storeGroupQualifiesForWarehouseFreeLocal({
      group,
      cartItems,
      productMap,
      storeBySupplier,
      delivery,
    });
    return !free.qualifies;
  });
}
