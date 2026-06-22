/**
 * Morongwa Pricing Calculation Service
 * Handles quote calculations for all supported countries
 */

import { Country, PRICING_CONFIG, CountryConfig } from '../config/fees.config';

export interface QuoteParams {
  currency: Country;
  taskPrice?: number;       // Optional manual override input (validated in task create)
  distanceKm: number;       // Total distance
  weightKg?: number;        // Chargeable weight fallback (kg)
  actualWeightKg?: number;  // Actual scale weight (kg)
  lengthCm?: number;        // Parcel length (cm)
  widthCm?: number;         // Parcel width (cm)
  heightCm?: number;        // Parcel height (cm)
  taskType: 'cross_border_collection' | 'shop_and_send' | 'large_transport' | 'general' | 'collect_send' | 'shop_send' | 'transport';
  deliveryMethod?: 'taxi' | 'bus' | 'border' | 'courier' | 'custom';
  itemType?: 'large_item' | 'fridge' | 'couch' | 'drums' | 'oil' | 'custom' | string;
  vehicleType?: 'bakkie' | 'small_truck' | string;
  urgency?: 'normal' | 'urgent';
  itemCount?: number;
  waitingRequired?: boolean;
  locationZone?: 'A' | 'B' | 'C';
  isPeak: boolean;          // Peak demand window
  isUrgent: boolean;        // Urgent (<2 hours)
}

export interface QuoteBreakdown {
  currency: Country;
  country: string;
  
  // Base amounts
  taskPrice: number;
  bookingFee: number;
  baseFee: number;
  deliveryFee: number;
  complexityFee: number;
  taskAdjustment: number;
  
  // Surcharges
  distanceSurcharge: number;
  distanceDetails: { extraKm: number; ratePerKm: number };
  heavySurcharge: number;    // legacy alias for parcelSurcharge
  parcelSurcharge: number;
  parcelBand: string;
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  peakSurcharge: number;
  urgencySurcharge: number;
  totalSurcharges: number;
  
  // Totals
  subtotal: number;          // taskPrice + surcharges
  commission: number;        // 15% of taskPrice
  totalClientPrice: number;
  runnerPayout: number;
  platformFee: number;
  clientTotal: number;       // What client pays (includes booking fee)
  runnerNet: number;         // What runner receives (taskPrice + surcharges - commission)
  platformRevenue: number;   // booking + commission
  locationZone: 'A' | 'B' | 'C';
  categoryKey: 'small_item' | 'groceries' | 'heavy_items' | 'document_delivery' | 'express_errand';
  categoryName: string;
  zoneDistanceMultiplier: number;
  customerPriceFormulaTotal: number;
  runnerPayFormulaTotal: number;
  adminProfit: number;
  
  // Metadata
  config: CountryConfig;
}

/**
 * Calculate comprehensive quote with fee breakdown
 */
export function calculateQuote(params: QuoteParams): QuoteBreakdown {
  const config = PRICING_CONFIG[params.currency];
  
  if (!config) {
    throw new Error(`Unsupported currency: ${params.currency}`);
  }

  // Helper to round to 2 decimal places
  const round = (value: number) => Math.round(value * 100) / 100;
  const v2 = config.pricingV2;
  const runnerPricing = config.runnerPricing;
  if (!v2) {
    throw new Error('pricingV2 is not configured');
  }
  if (!runnerPricing) {
    throw new Error('runnerPricing is not configured');
  }

  const normalizedTaskType =
    params.taskType === 'collect_send'
      ? 'cross_border_collection'
      : params.taskType === 'shop_send'
      ? 'shop_and_send'
      : params.taskType === 'transport'
      ? 'large_transport'
      : params.taskType;
  const inferredZone: 'A' | 'B' | 'C' =
    params.locationZone || (params.distanceKm > 25 ? 'C' : params.distanceKm > 10 ? 'B' : 'A');
  const zoneConfig = runnerPricing.locationZones[inferredZone] || runnerPricing.locationZones.A;
  const zoneDistanceMultiplier = Number(zoneConfig.distanceMultiplier || 1);
  const categoryKey: QuoteBreakdown['categoryKey'] =
    normalizedTaskType === 'shop_and_send'
      ? 'groceries'
      : normalizedTaskType === 'large_transport'
      ? 'heavy_items'
      : normalizedTaskType === 'cross_border_collection'
      ? 'express_errand'
      : (params.itemType || '').toLowerCase().includes('document')
      ? 'document_delivery'
      : 'small_item';
  const category = runnerPricing.categories[categoryKey];

  // 1) Base Fee
  const baseFee =
    normalizedTaskType === 'large_transport'
      ? v2.baseFeeLarge
      : params.distanceKm < 5
      ? v2.baseFeeShort
      : v2.baseFeeStandard;

  // 2) Distance cost
  const perKmRate =
    (normalizedTaskType === 'large_transport' ? v2.ratePerKmHeavy : v2.ratePerKmStandard) *
    zoneDistanceMultiplier;
  const distanceCost = round(Math.max(0, params.distanceKm) * perKmRate);
  const distanceSurcharge = distanceCost;
  const extraKm = Math.max(0, params.distanceKm);
  const distanceDetails = {
    extraKm: round(extraKm),
    ratePerKm: perKmRate,
  };

  // 3) Task Type Adjustment
  const typeMultiplier = category.multiplier || 1.0;
  const beforeAdjustment = round(distanceCost + baseFee);
  const taskAdjustedCost = round(beforeAdjustment * typeMultiplier);
  const taskAdjustment = round(taskAdjustedCost - beforeAdjustment);

  // 4) Delivery Method Fee
  const deliveryFee = params.deliveryMethod ? round(v2.deliveryFees[params.deliveryMethod] ?? 0) : 0;

  // 5) Complexity Adjustment
  const actualWeightKg = Math.max(0, Number(params.actualWeightKg ?? params.weightKg ?? 0));
  const hasDims =
    Number(params.lengthCm) > 0 && Number(params.widthCm) > 0 && Number(params.heightCm) > 0;
  const volumetricWeightKg = hasDims
    ? round((Number(params.lengthCm) * Number(params.widthCm) * Number(params.heightCm)) / config.volumetricDivisor)
    : 0;
  const chargeableWeightKg = round(Math.max(actualWeightKg, volumetricWeightKg, Number(params.weightKg || 0)));
  const bands = config.parcelBandSurcharges;
  let parcelBand = '≤2kg';
  let parcelSurcharge = 0;
  if (chargeableWeightKg <= 2) {
    parcelBand = '≤2kg';
    parcelSurcharge = bands.upTo2kg;
  } else if (chargeableWeightKg <= 5) {
    parcelBand = '>2kg to 5kg';
    parcelSurcharge = bands.upTo5kg;
  } else if (chargeableWeightKg <= 10) {
    parcelBand = '>5kg to 10kg';
    parcelSurcharge = bands.upTo10kg;
  } else if (chargeableWeightKg <= 20) {
    parcelBand = '>10kg to 20kg';
    parcelSurcharge = bands.upTo20kg;
  } else {
    parcelBand = '>20kg';
    const extraKg = Math.max(0, chargeableWeightKg - 20);
    parcelSurcharge = bands.upTo20kg + extraKg * bands.above20kgPerKg;
  }
  parcelSurcharge = round(parcelSurcharge);
  const heavySurcharge = parcelSurcharge;
  let complexityFee = 0;
  const looksLargeItem =
    params.itemType === 'large_item' ||
    params.itemType === 'fridge' ||
    params.itemType === 'couch' ||
    params.itemType === 'drums' ||
    params.itemType === 'oil' ||
    normalizedTaskType === 'large_transport';
  if (looksLargeItem) {
    complexityFee += chargeableWeightKg > 20 ? v2.largeItemComplexityFeeMax : v2.largeItemComplexityFeeMin;
  }
  if ((params.itemCount || 0) > 1) {
    complexityFee += Math.max(0, Number(params.itemCount || 0)) * v2.itemCountFee;
  }
  if (params.waitingRequired) {
    complexityFee += v2.waitingRequiredFee;
  }
  complexityFee += parcelSurcharge;
  complexityFee = round(complexityFee);

  // Keep legacy surcharge fields for compatibility
  const peakSurcharge = params.isPeak ? round(taskAdjustedCost * config.peakMultiplier) : 0;
  const urgencyRequested = params.urgency === 'urgent' || params.isUrgent;
  const urgencySurcharge = urgencyRequested ? round(taskAdjustedCost * (v2.urgentMultiplier - 1)) : 0;

  // 6) Unified configurable runner/customer formula engine
  const baseDistanceCost = round(Math.max(0, params.distanceKm) * runnerPricing.settings.baseDistanceRate * zoneDistanceMultiplier);
  const categoryBaseFee = round(category.baseFee);
  const categoryMultiplierAdjustment = round((categoryBaseFee + baseDistanceCost) * Math.max(0, (category.multiplier || 1) - 1));
  const formulaUrgencyFee = urgencyRequested ? round(runnerPricing.settings.urgencyFee) : 0;
  const platformServiceFee = round(runnerPricing.settings.serviceFee);
  const customerPriceFormulaTotal = round(
    categoryBaseFee + baseDistanceCost + categoryMultiplierAdjustment + formulaUrgencyFee + platformServiceFee
  );
  const runnerDistanceCost = round(
    Math.max(0, params.distanceKm) * runnerPricing.settings.runnerDistanceRate * zoneDistanceMultiplier
  );
  const surgeBonus = params.isPeak ? round(runnerDistanceCost * Math.max(0, runnerPricing.settings.surgeMultiplier - 1)) : 0;
  const runnerPayFormulaTotal = round(category.runnerBaseFee + runnerDistanceCost + surgeBonus);

  // Keep previous structure but ensure price reflects formula + existing extras
  let taskPrice = round(Math.max(customerPriceFormulaTotal, taskAdjustedCost + deliveryFee + complexityFee));
  if (urgencyRequested) taskPrice = round(taskPrice + formulaUrgencyFee);
  taskPrice = Math.max(taskPrice, v2.minTaskAmount, customerPriceFormulaTotal);
  const bookingFee = config.bookingFeeLocal;

  // 7) Totals + Commission
  const totalSurcharges = round(taskAdjustment + deliveryFee + complexityFee + urgencySurcharge + peakSurcharge);
  const subtotal = round(taskPrice);
  const platformFee = round(taskPrice * v2.commissionRate);
  const runnerPayout = round(Math.max(runnerPayFormulaTotal, taskPrice - platformFee));
  const commission = platformFee;
  const totalClientPrice = round(taskPrice + bookingFee);
  const clientTotal = totalClientPrice;
  const runnerNet = runnerPayout;
  const platformRevenue = round(bookingFee + platformFee);
  const adminProfit = round(Math.max(0, totalClientPrice - runnerPayout));

  return {
    currency: params.currency,
    country: config.country,
    taskPrice,
    bookingFee,
    baseFee,
    deliveryFee,
    complexityFee,
    taskAdjustment,
    distanceSurcharge,
    distanceDetails,
    heavySurcharge,
    parcelSurcharge,
    parcelBand,
    actualWeightKg,
    volumetricWeightKg,
    chargeableWeightKg,
    peakSurcharge,
    urgencySurcharge,
    totalSurcharges,
    subtotal,
    commission,
    totalClientPrice,
    runnerPayout,
    platformFee,
    clientTotal,
    runnerNet,
    platformRevenue,
    locationZone: inferredZone,
    categoryKey,
    categoryName: category.name,
    zoneDistanceMultiplier,
    customerPriceFormulaTotal,
    runnerPayFormulaTotal,
    adminProfit,
    config,
  };
}

/**
 * Format currency with proper symbol
 */
export function formatCurrency(amount: number, currency: Country): string {
  const symbols: Record<Country, string> = {
    BWP: 'P',
    LSL: 'L',
    NAD: 'N$',
    ZAR: 'R',
    ZWL: 'Z$',
    ZMW: 'ZK',
  };

  return `${symbols[currency]}${amount.toFixed(2)}`;
}

/**
 * Validate quote parameters
 */
export function validateQuoteParams(params: Partial<QuoteParams>): string[] {
  const errors: string[] = [];

  if (!params.currency) {
    errors.push('Currency is required');
  } else if (!PRICING_CONFIG[params.currency]) {
    errors.push(`Unsupported currency: ${params.currency}`);
  }

  if (params.distanceKm === undefined || params.distanceKm < 0) {
    errors.push('Distance must be 0 or greater');
  }

  if (!params.taskType) {
    errors.push('Task type is required');
  }

  if (params.weightKg !== undefined && params.weightKg < 0) {
    errors.push('Weight must be 0 or greater');
  }
  if (params.lengthCm !== undefined && params.lengthCm < 0) {
    errors.push('Length must be 0 or greater');
  }
  if (params.widthCm !== undefined && params.widthCm < 0) {
    errors.push('Width must be 0 or greater');
  }
  if (params.heightCm !== undefined && params.heightCm < 0) {
    errors.push('Height must be 0 or greater');
  }

  return errors;
}
