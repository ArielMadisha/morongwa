import { AppError } from "../middleware/errorHandler";
import { listCourierQuotesForDestination, estimateCartWeightKg } from "./courierPricingService";

/**
 * Marketplace orders with physical products must include delivery in the same
 * wallet/card charge at checkout — never a separate courier invoice later.
 */
export async function assertPhysicalOrderIncludesPrepaidDelivery(params: {
  hasProducts: boolean;
  shippingZar: number;
  /** Internal lines grouped by storefront (one delivery fee per store) */
  internalStoreGroupCount: number;
  deliveryCountry: string;
  cartItemQty: number;
  courierTariffId?: string;
  requiresCourierSelection: boolean;
  warehouseFreeLocalApplied?: boolean;
}): Promise<void> {
  if (!params.hasProducts) return;

  if (params.requiresCourierSelection || (params.internalStoreGroupCount > 0 && !params.courierTariffId)) {
    const weightKg = estimateCartWeightKg(params.cartItemQty);
    const options = await listCourierQuotesForDestination(params.deliveryCountry, weightKg);
    if (
      options.length > 0 &&
      !params.courierTariffId &&
      !params.warehouseFreeLocalApplied
    ) {
      throw new AppError(
        "Choose a delivery method at checkout. Delivery is paid together with your products in one payment — not later and not to the courier directly.",
        400
      );
    }
  }

  if (params.shippingZar <= 0 && !params.warehouseFreeLocalApplied) {
    throw new AppError(
      "Delivery must be included in your checkout payment. Qwertymates does not collect courier fees separately after you order — return to checkout, select delivery, and pay once.",
      400
    );
  }
}

export function deliveryPrepaidFlagsForOrder(
  hasProducts: boolean,
  shippingZar: number,
  warehouseFreeLocalApplied?: boolean
) {
  return {
    deliveryPrepaid: hasProducts && (shippingZar > 0 || !!warehouseFreeLocalApplied),
    deliveryCollectionPolicy: "checkout_single_payment" as const,
  };
}
