import mongoose from "mongoose";
import Supplier from "../data/models/Supplier";
import Store from "../data/models/Store";
import { currencyFromCountryIso } from "./phoneCountryCurrency";

/** ISO 4217 currency for a supplier's marketplace store (from linked store country). */
export async function resolveSupplierStoreCurrency(
  supplierId: mongoose.Types.ObjectId | string
): Promise<string> {
  const sid = String(supplierId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(sid)) return "ZAR";

  const supplier = await Supplier.findById(sid).select("linkedStoreId userId").lean();
  if (!supplier) return "ZAR";

  let store = supplier.linkedStoreId
    ? await Store.findById(supplier.linkedStoreId).select("countryCode country type").lean()
    : null;
  if (!store) {
    store = await Store.findOne({ supplierId: sid, type: "supplier" })
      .select("countryCode country type")
      .lean();
  }
  const code = String((store as { countryCode?: string })?.countryCode || "").trim().toUpperCase();
  if (code) return currencyFromCountryIso(code);
  return "ZAR";
}

export function currencyLabel(code: string): string {
  const c = String(code || "ZAR").toUpperCase();
  if (c === "BWP") return "Pula (BWP)";
  if (c === "ZAR") return "Rand (ZAR)";
  if (c === "NAD") return "Namibian Dollar (NAD)";
  return c;
}
