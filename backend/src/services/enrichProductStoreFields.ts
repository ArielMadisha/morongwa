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
          .select("supplierId slug name countryCode country")
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

    const out = { ...p } as T & { storeSlug?: string; storeName?: string; storeCountryCode?: string };
    if (store?.slug) out.storeSlug = store.slug;
    if (label) out.storeName = label;
    if (store?.countryCode) out.storeCountryCode = String(store.countryCode).toUpperCase();
    const cur = String((p as { currency?: string }).currency || "").toUpperCase();
    if (store?.countryCode && (!cur || cur === "ZAR") && String(store.countryCode).toUpperCase() !== "ZA") {
      (out as { currency?: string }).currency = currencyFromCountryIso(String(store.countryCode));
    }
    if (raw && typeof raw === "object" && label) {
      (out as { supplierId?: { storeName?: string } }).supplierId = { ...raw, storeName: label };
    }
    return out;
  });
}
