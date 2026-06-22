import Store from "../data/models/Store";
import {
  deliveryLocalityMatchesZone,
  resolveWarehouseLocalZoneFromName,
  type QwertymatesWarehouseLocalZone,
} from "../config/qwertymatesWarehouses";
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
  const city = String(product.warehouseFreeLocalCity || "").trim();
  const country = String(product.warehouseFreeLocalCountry || "")
    .trim()
    .toUpperCase();
  if (city && country) {
    const fromFields = resolveWarehouseLocalZoneFromName(
      `Qwertymates - ${city} Warehouse (${country})`
    );
    if (fromFields && fromFields.city === city && fromFields.countryCode === country) {
      return fromFields;
    }
  }

  const populatedName =
    supplierStoreName ||
    (product.supplierId as { storeName?: string } | undefined)?.storeName ||
    null;
  return resolveWarehouseLocalZoneFromName(populatedName);
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
}): { qualifies: boolean; zone?: QwertymatesWarehouseLocalZone } {
  const itemsInGroup = params.cartItems.filter(
    (item) =>
      cartItemGroupKey(item, params.productMap, params.storeBySupplier) === params.group.groupKey
  );
  if (itemsInGroup.length === 0) return { qualifies: false };

  let zone: QwertymatesWarehouseLocalZone | null = null;
  for (const item of itemsInGroup) {
    const product = params.productMap.get(String(item.productId ?? ""));
    if (!product) return { qualifies: false };
    const productZone = resolveProductWarehouseFreeLocal(product);
    if (!productZone) return { qualifies: false };
    if (!zone) zone = productZone;
    else if (zone.city !== productZone.city || zone.countryCode !== productZone.countryCode) {
      return { qualifies: false };
    }
  }

  if (!zone) return { qualifies: false };
  const origin = String(params.group.originCountryCode || zone.countryCode).toUpperCase();
  if (origin !== zone.countryCode) return { qualifies: false };

  const qualifies = deliveryLocalityMatchesZone({
    deliveryCountry: params.delivery.deliveryCountry,
    deliveryCity: params.delivery.deliveryCity,
    deliveryAddress: params.delivery.deliveryAddress,
    zone,
  });
  return qualifies ? { qualifies: true, zone } : { qualifies: false };
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
