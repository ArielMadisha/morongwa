import { Product } from "../types";

/** Store label for product cards — matches web feed `storeName` / supplier populate. */
export function resolveProductStoreName(product: Product): string {
  const enriched = String(product.storeName || "").trim();
  if (enriched) return enriched;

  const supplier = product.supplierId;
  if (supplier && typeof supplier === "object") {
    const fromSupplier = String(supplier.storeName || "").trim();
    if (fromSupplier) return fromSupplier;
  }

  return "Store";
}
