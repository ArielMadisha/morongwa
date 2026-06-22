import Store from "../data/models/Store";
import type { ShippingStoreGroup } from "./checkoutShipping";
import type { SadcDeliveryScope } from "./sadcDeliveryCatalogService";

export type CheckoutSettlementCurrency = "ZAR" | "BWP";

export type CheckoutCurrencyContext = {
  settlementCurrency: CheckoutSettlementCurrency;
  /** Quote cart + local courier in settlement currency (no FX until PayGate / ZAR wallet). */
  quoteInNativeCurrency: boolean;
  suggestedDeliveryScope: SadcDeliveryScope;
  allowLocalDelivery: boolean;
  allowCrossborderDelivery: boolean;
  storeOriginCountries: string[];
};

function normCountry(code: string | undefined): string {
  return String(code || "ZA").trim().toUpperCase();
}

/** Resolve how checkout should price products and courier for this cart + destination. */
export async function resolveCheckoutCurrencyContext(params: {
  deliveryCountry: string;
  deliveryScope?: SadcDeliveryScope;
  storeGroups: ShippingStoreGroup[];
  /** When every cart product uses BWP, treat as Botswana-native checkout even if store countryCode is unset. */
  allProductsBwp?: boolean;
}): Promise<CheckoutCurrencyContext> {
  const deliveryCc = normCountry(params.deliveryCountry);
  const supplierIds = [...new Set(params.storeGroups.flatMap((g) => g.supplierIds))];
  const stores =
    supplierIds.length > 0
      ? await Store.find({ supplierId: { $in: supplierIds }, type: "supplier" })
          .select("countryCode")
          .lean()
      : [];
  const origins = [
    ...new Set(
      stores.map((s) => normCountry((s as { countryCode?: string }).countryCode || "ZA"))
    ),
  ];

  const onlyBwStore =
    (origins.length > 0 && origins.every((c) => c === "BW")) || params.allProductsBwp === true;
  const hasZaStore = origins.some((c) => c === "ZA");

  const quoteInNativeCurrency = deliveryCc === "BW" && onlyBwStore;
  const settlementCurrency: CheckoutSettlementCurrency = quoteInNativeCurrency ? "BWP" : "ZAR";

  let suggestedDeliveryScope: SadcDeliveryScope = "crossborder";
  if (deliveryCc === "BW") {
    if (onlyBwStore) suggestedDeliveryScope = "local";
    else if (hasZaStore) suggestedDeliveryScope = "crossborder";
    else suggestedDeliveryScope = params.deliveryScope === "local" ? "local" : "crossborder";
  }

  const scopeFromClient = params.deliveryScope;
  const effectiveScope: SadcDeliveryScope =
    scopeFromClient === "local" || scopeFromClient === "crossborder"
      ? scopeFromClient
      : suggestedDeliveryScope;

  return {
    settlementCurrency,
    quoteInNativeCurrency: quoteInNativeCurrency && effectiveScope === "local",
    suggestedDeliveryScope,
    allowLocalDelivery: deliveryCc === "BW" && (onlyBwStore || origins.length === 0),
    allowCrossborderDelivery:
      deliveryCc === "BW" && (hasZaStore || (!onlyBwStore && origins.length > 0)),
    storeOriginCountries: origins,
  };
}
