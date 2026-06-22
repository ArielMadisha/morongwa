import { convertBetweenCurrencies } from "../services/fxService";

/** Store catalog currencies shown in native units; USD/INR convert to ZAR (matches web `storeProductCurrency`). */
export function isStoreNativeCatalogCurrency(code: string | undefined): boolean {
  const c = String(code || "ZAR").toUpperCase();
  return c !== "USD" && c !== "INR" && c.length === 3;
}

/**
 * Resolve source currency for WA cards.
 * External supplier feeds are primarily USD; some rows can be mislabeled as ZAR while value is still USD.
 */
export function resolveWaSourceCurrency(product: {
  currency?: string;
  supplierSource?: string;
  price?: number;
}): string {
  const raw = String(product?.currency || "").trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(raw) ? raw : "";
  const source = String(product?.supplierSource || "").trim().toLowerCase();
  const price = Number(product?.price || 0);
  const isExternal = source === "cj" || source === "spocket" || source === "eprolo";
  if (!isExternal) return currency || "USD";
  if (!currency) return "USD";
  if (currency === "ZAR" && Number.isFinite(price) && price > 0 && price < 20) return "USD";
  return currency;
}

/** Mirror web `formatCatalogAmountInZar` (USD/INR dropship → ZAR display). */
export function catalogAmountInZar(
  amount: number,
  sourceCurrency: string | undefined,
  rates: Record<string, number>
): number {
  const from = String(sourceCurrency || "ZAR").trim().toUpperCase();
  if (!Number.isFinite(amount)) return 0;
  if (from === "ZAR") return Math.round(amount * 100) / 100;

  const fromRate = Number(rates[from] ?? 0);
  const zarRate = Number(rates.ZAR ?? 0);
  if (!(fromRate > 0) || !(zarRate > 0)) {
    if (from === "USD") {
      const z = Number(rates.ZAR ?? 18.5);
      return Math.round(amount * z * 100) / 100;
    }
    if (from === "INR") {
      const inrPerUsd = 83;
      const z = Number(rates.ZAR ?? 18.5);
      return Math.round((amount / inrPerUsd) * z * 100) / 100;
    }
    return Math.round(amount * 100) / 100;
  }
  return convertBetweenCurrencies(amount, from, "ZAR", rates);
}

export type WaCatalogPriceDisplay = {
  currency: string;
  amount: number;
  /** e.g. `BWP 270.00` or `ZAR 114.70` — same catalog currency as the website */
  label: string;
};

/** Catalog price for WhatsApp product cards (no phone-country conversion). */
export function resolveWaCatalogPriceDisplay(
  product: { currency?: string; supplierSource?: string; price?: number },
  rates: Record<string, number>,
  amount: number
): WaCatalogPriceDisplay {
  const sourceCurrency = resolveWaSourceCurrency(product);
  const rounded = Math.round(Number(amount) * 100) / 100;

  if (isStoreNativeCatalogCurrency(sourceCurrency)) {
    const formatted = rounded.toFixed(2);
    return { currency: sourceCurrency, amount: rounded, label: `${sourceCurrency} ${formatted}` };
  }

  const zarAmount = catalogAmountInZar(rounded, sourceCurrency, rates);
  const formatted = zarAmount.toFixed(2);
  return { currency: "ZAR", amount: zarAmount, label: `ZAR ${formatted}` };
}
