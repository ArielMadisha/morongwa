/** Qwertymates-owned warehouse storefronts with free delivery inside the local town. */
export type QwertymatesWarehouseLocalZone = {
  /** Canonical display city (e.g. Hammanskraal) */
  city: string;
  /** ISO country where free local delivery applies */
  countryCode: string;
  /** Shown on checkout breakdown */
  freeDeliveryLabel: string;
  /** Normalized keys accepted in address/city fields */
  localityKeys: string[];
  /** Supplier / store name fragments (case-insensitive) */
  namePatterns: RegExp[];
};

export const QWERTYMATES_WAREHOUSE_LOCAL_ZONES: QwertymatesWarehouseLocalZone[] = [
  {
    city: "Hammanskraal",
    countryCode: "ZA",
    freeDeliveryLabel: "Free delivery within Hammanskraal",
    localityKeys: ["hammanskraal", "hammanskrall"],
    namePatterns: [/qwertymates/i, /hammanskraal|hammanskrall/i, /warehouse/i],
  },
  {
    city: "Kasane",
    countryCode: "BW",
    freeDeliveryLabel: "Free delivery within Kasane",
    localityKeys: ["kasane"],
    namePatterns: [/qwertymates/i, /kasane/i, /warehouse/i],
  },
];

export function normalizeLocalityKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function nameMatchesWarehouseZone(name: string, zone: QwertymatesWarehouseLocalZone): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  return zone.namePatterns.every((re) => re.test(n));
}

/** Resolve warehouse free-local zone from supplier or storefront display name. */
export function resolveWarehouseLocalZoneFromName(
  name?: string | null
): QwertymatesWarehouseLocalZone | null {
  const n = String(name || "").trim();
  if (!n) return null;
  for (const zone of QWERTYMATES_WAREHOUSE_LOCAL_ZONES) {
    if (nameMatchesWarehouseZone(n, zone)) return zone;
  }
  return null;
}

export function deliveryLocalityMatchesZone(params: {
  deliveryCountry: string;
  deliveryCity?: string;
  deliveryAddress?: string;
  zone: QwertymatesWarehouseLocalZone;
}): boolean {
  const country = String(params.deliveryCountry || "")
    .trim()
    .toUpperCase();
  if (country !== params.zone.countryCode) return false;

  const haystack = normalizeLocalityKey(
    [params.deliveryCity, params.deliveryAddress].filter(Boolean).join(" ")
  );
  if (!haystack) return false;

  return params.zone.localityKeys.some((key) => haystack.includes(normalizeLocalityKey(key)));
}
