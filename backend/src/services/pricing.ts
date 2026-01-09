/**
 * Morongwa Pricing Calculation Service
 * Handles quote calculations for all supported countries
 */

import { Country, PRICING_CONFIG, CountryConfig } from '../config/fees.config';

export interface QuoteParams {
  currency: Country;
  taskPrice: number;        // Task price in local currency
  distanceKm: number;       // Total distance
  weightKg: number;         // Item weight
  isPeak: boolean;          // Peak demand window
  isUrgent: boolean;        // Urgent (<2 hours)
}

export interface QuoteBreakdown {
  currency: Country;
  country: string;
  
  // Base amounts
  taskPrice: number;
  bookingFee: number;
  
  // Surcharges
  distanceSurcharge: number;
  distanceDetails: { extraKm: number; ratePerKm: number };
  heavySurcharge: number;
  peakSurcharge: number;
  urgencySurcharge: number;
  totalSurcharges: number;
  
  // Totals
  subtotal: number;          // taskPrice + surcharges
  commission: number;        // 15% of taskPrice
  clientTotal: number;       // What client pays (includes booking fee)
  runnerNet: number;         // What runner receives (taskPrice + surcharges - commission)
  platformRevenue: number;   // booking + commission
  
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

  // 1. Base amounts
  const taskPrice = round(params.taskPrice);
  const bookingFee = config.bookingFeeLocal;

  // 2. Distance surcharge (only beyond base radius)
  const extraKm = Math.max(0, params.distanceKm - config.baseRadiusKm);
  const distanceSurcharge = round(extraKm * config.perKmRateLocal);
  const distanceDetails = {
    extraKm: round(extraKm),
    ratePerKm: config.perKmRateLocal,
  };

  // 3. Heavy item surcharge (>10kg)
  const heavySurcharge = params.weightKg > 10 ? config.heavySurchargeLocal : 0;

  // 4. Peak demand surcharge (10% of task price)
  const peakSurcharge = params.isPeak 
    ? round(taskPrice * config.peakMultiplier)
    : 0;

  // 5. Urgency surcharge (<2 hours)
  const urgencySurcharge = params.isUrgent ? config.urgencyFeeLocal : 0;

  // 6. Calculate totals
  const totalSurcharges = round(
    distanceSurcharge + heavySurcharge + peakSurcharge + urgencySurcharge
  );
  const subtotal = round(taskPrice + totalSurcharges);
  const commission = round(taskPrice * config.commissionPct);
  const clientTotal = round(taskPrice + bookingFee + totalSurcharges);
  const runnerNet = round(taskPrice + totalSurcharges - commission);
  const platformRevenue = round(bookingFee + commission);

  return {
    currency: params.currency,
    country: config.country,
    taskPrice,
    bookingFee,
    distanceSurcharge,
    distanceDetails,
    heavySurcharge,
    peakSurcharge,
    urgencySurcharge,
    totalSurcharges,
    subtotal,
    commission,
    clientTotal,
    runnerNet,
    platformRevenue,
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

  if (params.taskPrice === undefined || params.taskPrice <= 0) {
    errors.push('Task price must be greater than 0');
  }

  if (params.distanceKm === undefined || params.distanceKm < 0) {
    errors.push('Distance must be 0 or greater');
  }

  if (params.weightKg === undefined || params.weightKg < 0) {
    errors.push('Weight must be 0 or greater');
  }

  return errors;
}
