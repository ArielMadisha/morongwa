import {
  deliveryLocalityMatchesZone,
  normalizeLocalityKey,
  resolveWarehouseLocalZoneFromName,
  type QwertymatesWarehouseLocalZone,
} from "../config/qwertymatesWarehouses";
import type { DeliveryLocalityInput } from "./warehouseLocalDelivery";

export type ProductFreeShippingArea = {
  countryCode: string;
  locality: string;
};

export function normalizeFreeShippingAreas(raw: unknown): ProductFreeShippingArea[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ProductFreeShippingArea[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const countryCode = String((row as { countryCode?: string }).countryCode || "")
      .trim()
      .toUpperCase();
    const locality = String((row as { locality?: string }).locality || "").trim();
    if (countryCode.length !== 2 || !locality) continue;
    out.push({ countryCode, locality });
  }
  return out.length > 0 ? out : undefined;
}

export function productUsesExplicitFreeShipping(product: Record<string, unknown>): boolean {
  return (
    product.freeShippingEnabled === true &&
    Array.isArray(product.freeShippingAreas) &&
    product.freeShippingAreas.length > 0
  );
}

function customZoneFromFields(city: string, countryCode: string): QwertymatesWarehouseLocalZone {
  return {
    city,
    countryCode,
    freeDeliveryLabel: `Free delivery in ${city}`,
    localityKeys: [normalizeLocalityKey(city)],
    namePatterns: [],
  };
}

export function resolveProductFreeShippingZone(
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
    return customZoneFromFields(city, country);
  }

  const populatedName =
    supplierStoreName ||
    (product.supplierId as { storeName?: string } | undefined)?.storeName ||
    null;
  return resolveWarehouseLocalZoneFromName(populatedName);
}

export function deliveryMatchesProductFreeShipping(
  product: Record<string, unknown>,
  delivery: DeliveryLocalityInput
): { matches: boolean; label?: string } {
  if (productUsesExplicitFreeShipping(product)) {
    const areas = product.freeShippingAreas as ProductFreeShippingArea[];
    const country = String(delivery.deliveryCountry || "")
      .trim()
      .toUpperCase();
    const haystack = normalizeLocalityKey(
      [delivery.deliveryCity, delivery.deliveryAddress].filter(Boolean).join(" ")
    );
    if (!haystack) return { matches: false };
    const hit = areas.find((a) => {
      const cc = String(a.countryCode || "")
        .trim()
        .toUpperCase();
      const loc = normalizeLocalityKey(a.locality);
      return country === cc && loc && haystack.includes(loc);
    });
    if (!hit) return { matches: false };
    const areaLabels = areas.map((a) => `${a.locality} (${a.countryCode})`).join(", ");
    return {
      matches: true,
      label: areas.length === 1 ? `Free delivery in ${hit.locality}` : `Free delivery in ${areaLabels}`,
    };
  }

  const zone = resolveProductFreeShippingZone(product);
  if (!zone) return { matches: false };
  const matches = deliveryLocalityMatchesZone({ ...delivery, zone });
  return matches ? { matches: true, label: zone.freeDeliveryLabel } : { matches: false };
}

export function resolveFreeShippingFieldsForCreate(
  body: { freeShippingEnabled?: boolean; freeShippingAreas?: unknown },
  warehouseAuto: { warehouseFreeLocalCity: string; warehouseFreeLocalCountry: string } | null
): {
  freeShippingEnabled: boolean;
  freeShippingAreas?: ProductFreeShippingArea[];
  warehouseFreeLocalCity?: string;
  warehouseFreeLocalCountry?: string;
} {
  if (body.freeShippingEnabled === true) {
    const areas = normalizeFreeShippingAreas(body.freeShippingAreas);
    if (!areas) {
      throw new Error("At least one free shipping area is required when free shipping is enabled");
    }
    return {
      freeShippingEnabled: true,
      freeShippingAreas: areas,
      warehouseFreeLocalCity: areas[0].locality,
      warehouseFreeLocalCountry: areas[0].countryCode,
    };
  }
  if (warehouseAuto) {
    return {
      freeShippingEnabled: false,
      warehouseFreeLocalCity: warehouseAuto.warehouseFreeLocalCity,
      warehouseFreeLocalCountry: warehouseAuto.warehouseFreeLocalCountry,
    };
  }
  return { freeShippingEnabled: false };
}

export function applyFreeShippingUpdate(
  product: Record<string, unknown>,
  body: Record<string, unknown>
): void {
  if (body.freeShippingEnabled === undefined && body.freeShippingAreas === undefined) return;

  if (body.freeShippingEnabled === false) {
    product.freeShippingEnabled = false;
    product.freeShippingAreas = undefined;
    product.warehouseFreeLocalCity = undefined;
    product.warehouseFreeLocalCountry = undefined;
    return;
  }

  if (body.freeShippingEnabled === true) {
    const areas = normalizeFreeShippingAreas(body.freeShippingAreas);
    if (!areas) {
      throw new Error("At least one free shipping area is required when free shipping is enabled");
    }
    product.freeShippingEnabled = true;
    product.freeShippingAreas = areas;
    product.warehouseFreeLocalCity = areas[0].locality;
    product.warehouseFreeLocalCountry = areas[0].countryCode;
    return;
  }

  if (body.freeShippingAreas !== undefined) {
    const areas = normalizeFreeShippingAreas(body.freeShippingAreas);
    if (product.freeShippingEnabled === true && !areas) {
      throw new Error("At least one free shipping area is required when free shipping is enabled");
    }
    product.freeShippingAreas = areas;
    if (areas?.length) {
      product.warehouseFreeLocalCity = areas[0].locality;
      product.warehouseFreeLocalCountry = areas[0].countryCode;
    }
  }
}
