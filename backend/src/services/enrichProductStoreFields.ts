import Store from "../data/models/Store";
import { currencyFromCountryIso } from "../utils/phoneCountryCurrency";

/** Attach supplier storeName (from Supplier) and storefront slug for product API / feed tiles. */
export async function enrichProductsWithStoreFields<T extends Record<string, unknown>>(
  products: T[]
): Promise<Array<T & { storeSlug?: string; storeName?: string }>> {
  if (!products.length) return products;

  const supplierIds = [
    ...new Set(
      products
        .map((p) => {
          const sid = (p as { supplierId?: { _id?: unknown } | unknown }).supplierId;
          if (sid && typeof sid === "object" && (sid as { _id?: unknown })._id) {
            return String((sid as { _id: unknown })._id);
          }
          if (sid) return String(sid);
          return "";
        })
        .filter(Boolean)
    ),
  ];

  const stores =
    supplierIds.length > 0
      ? await Store.find({ supplierId: { $in: supplierIds }, type: "supplier" })
          .select("supplierId slug name countryCode country address mapsUrl latitude longitude")
          .lean()
      : [];
  const storeBySupplier = new Map(stores.map((s) => [String(s.supplierId), s]));

  return products.map((p) => {
    const raw = (p as { supplierId?: { _id?: unknown; storeName?: string } | string }).supplierId;
    const supplierOid =
      raw && typeof raw === "object" && raw._id ? String(raw._id) : raw ? String(raw) : "";
    const store = supplierOid ? storeBySupplier.get(supplierOid) : undefined;
    const supplierStoreName =
      raw && typeof raw === "object" && raw.storeName ? String(raw.storeName).trim() : "";
    const label = supplierStoreName || (store?.name ? String(store.name).trim() : "") || undefined;

    const out = { ...p } as T & {
      storeSlug?: string;
      storeName?: string;
      storeCountryCode?: string;
      store?: {
        _id?: string;
        name?: string;
        slug?: string;
        address?: string;
        mapsUrl?: string;
        latitude?: number;
        longitude?: number;
      };
    };
    if (store?.slug) out.storeSlug = store.slug;
    if (label) out.storeName = label;
    if (store?.countryCode) out.storeCountryCode = String(store.countryCode).toUpperCase();
    if (store) {
      out.store = {
        _id: String((store as { _id?: unknown })._id || ""),
        name: store.name ? String(store.name) : label,
        slug: store.slug ? String(store.slug) : undefined,
        address: store.address ? String(store.address) : undefined,
        mapsUrl: store.mapsUrl ? String(store.mapsUrl) : undefined,
        latitude: typeof store.latitude === "number" ? store.latitude : undefined,
        longitude: typeof store.longitude === "number" ? store.longitude : undefined,
      };
    }
    const cur = String((p as { currency?: string }).currency || "").toUpperCase();
    if (store?.countryCode && (!cur || cur === "ZAR") && String(store.countryCode).toUpperCase() !== "ZA") {
      (out as { currency?: string }).currency = currencyFromCountryIso(String(store.countryCode));
    }
    if (raw && typeof raw === "object" && label) {
      const oid =
        raw && typeof raw === "object" && (raw as { _id?: unknown })._id != null
          ? (raw as { _id: unknown })._id
          : raw;
      // Never spread a bare ObjectId — that drops the id and breaks downstream lookups.
      if (oid && typeof oid === "object" && !(oid as { _id?: unknown })._id && typeof (oid as { toHexString?: unknown }).toHexString === "function") {
        (out as { supplierId?: { _id: unknown; storeName?: string } }).supplierId = {
          _id: oid,
          storeName: label,
        };
      } else if (raw && typeof raw === "object" && (raw as { _id?: unknown })._id != null) {
        (out as { supplierId?: { _id: unknown; storeName?: string } }).supplierId = {
          ...(raw as object),
          _id: (raw as { _id: unknown })._id,
          storeName: label,
        };
      }
    }
    return out;
  });
}
