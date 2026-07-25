export type FreeShippingAreaRow = {
  countryCode: string;
  locality: string;
};

/** UI grouping: one country with many towns (stored as flat area rows in API). */
export type FreeShippingCountryGroup = {
  countryCode: string;
  localities: string[];
};

export const FREE_SHIPPING_COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'ZA', label: 'South Africa' },
  { code: 'BW', label: 'Botswana' },
  { code: 'NA', label: 'Namibia' },
  { code: 'ZW', label: 'Zimbabwe' },
  { code: 'ZM', label: 'Zambia' },
  { code: 'MZ', label: 'Mozambique' },
  { code: 'LS', label: 'Lesotho' },
  { code: 'SZ', label: 'Eswatini' },
  { code: 'MW', label: 'Malawi' },
  { code: 'AO', label: 'Angola' },
];

export function emptyFreeShippingArea(defaultCountryCode = 'ZA'): FreeShippingAreaRow {
  return { countryCode: defaultCountryCode, locality: '' };
}

export function emptyFreeShippingCountryGroup(defaultCountryCode = 'ZA'): FreeShippingCountryGroup {
  return { countryCode: defaultCountryCode, localities: [''] };
}

/** Flat API rows → grouped by country (preserves town order within each country). */
export function areasToCountryGroups(areas: FreeShippingAreaRow[]): FreeShippingCountryGroup[] {
  const order: string[] = [];
  const byCountry = new Map<string, string[]>();
  for (const row of areas) {
    const cc = String(row.countryCode || '').trim().toUpperCase();
    const locality = String(row.locality || '').trim();
    if (!cc) continue;
    if (!byCountry.has(cc)) {
      byCountry.set(cc, []);
      order.push(cc);
    }
    if (locality) byCountry.get(cc)!.push(locality);
  }
  return order.map((cc) => ({
    countryCode: cc,
    localities: byCountry.get(cc)!.length > 0 ? byCountry.get(cc)! : [''],
  }));
}

/** Grouped UI state → flat rows for API / checkout. */
export function countryGroupsToAreas(groups: FreeShippingCountryGroup[]): FreeShippingAreaRow[] {
  const out: FreeShippingAreaRow[] = [];
  for (const group of groups) {
    const cc = String(group.countryCode || '').trim().toUpperCase();
    if (cc.length !== 2) continue;
    const seen = new Set<string>();
    for (const raw of group.localities) {
      const locality = String(raw || '').trim();
      if (!locality) continue;
      const key = locality.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ countryCode: cc, locality });
    }
  }
  return out;
}

export function countryLabelForCode(code: string): string {
  const cc = String(code || '').toUpperCase();
  return FREE_SHIPPING_COUNTRY_OPTIONS.find((c) => c.code === cc)?.label || cc;
}

export function freeShippingAreasFromProduct(
  product: {
    freeShippingEnabled?: boolean;
    freeShippingAreas?: FreeShippingAreaRow[];
    warehouseFreeLocalCity?: string;
    warehouseFreeLocalCountry?: string;
  } | null | undefined,
  defaultCountryCode = 'ZA'
): { enabled: boolean; areas: FreeShippingAreaRow[] } {
  if (!product) return { enabled: false, areas: [] };
  if (product.freeShippingEnabled === true && Array.isArray(product.freeShippingAreas) && product.freeShippingAreas.length > 0) {
    return {
      enabled: true,
      areas: product.freeShippingAreas.map((a) => ({
        countryCode: String(a.countryCode || defaultCountryCode).toUpperCase(),
        locality: String(a.locality || '').trim(),
      })),
    };
  }
  return { enabled: false, areas: [] };
}

export function serializeFreeShippingPayload(
  enabled: boolean,
  areas: FreeShippingAreaRow[]
): { freeShippingEnabled: boolean; freeShippingAreas?: FreeShippingAreaRow[] } {
  if (!enabled) return { freeShippingEnabled: false };
  const cleaned = areas
    .map((a) => ({
      countryCode: String(a.countryCode || '').trim().toUpperCase(),
      locality: String(a.locality || '').trim(),
    }))
    .filter((a) => a.countryCode.length === 2 && a.locality.length > 0);
  return { freeShippingEnabled: true, freeShippingAreas: cleaned };
}

/** Shown on product cards when admin enabled free shipping with at least one area. */
export const FREE_DELIVERY_PROMO_LABEL = 'Free delivery in selected areas';

export function productShowsFreeDeliveryPromo(
  product: Parameters<typeof freeShippingAreasFromProduct>[0] | null | undefined
): boolean {
  return freeShippingAreasFromProduct(product).enabled;
}
