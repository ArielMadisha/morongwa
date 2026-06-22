/**
 * Morongwa Pricing & Fees Configuration
 * Effective: 08 Jan 2026
 * Multi-country support: BWP, LSL, NAD, ZAR, ZWL, ZMW
 */

export type Country = 'BWP' | 'LSL' | 'NAD' | 'ZAR' | 'ZWL' | 'ZMW';

export interface CountryConfig {
  country: string;
  currency: Country;
  fxPerZAR: number;           // FX rate relative to ZAR
  commissionPct: number;       // 0.15 = 15%
  peakMultiplier: number;      // 0.10 = 10% surge
  baseRadiusKm: number;        // Free distance before per-km charges
  bookingFeeLocal: number;     // Booking/service fee in local currency
  perKmRateLocal: number;      // Per-km rate beyond base radius
  heavySurchargeLocal: number; // For items >10kg
  urgencyFeeLocal: number;     // For tasks <2 hours deadline
  volumetricDivisor: number;   // cm³ divisor for volumetric weight (Courier-style)
  parcelBandSurcharges: {
    upTo2kg: number;
    upTo5kg: number;
    upTo10kg: number;
    upTo20kg: number;
    above20kgPerKg: number;
  };
  pricingV2?: {
    baseFeeStandard: number;
    baseFeeShort: number;
    baseFeeLarge: number;
    ratePerKmStandard: number;
    ratePerKmHeavy: number;
    minTaskAmount: number;
    commissionRate: number;
    deliveryFees: { taxi: number; bus: number; border: number; courier: number; custom: number };
    largeItemComplexityFeeMin: number;
    largeItemComplexityFeeMax: number;
    itemCountFee: number;
    waitingRequiredFee: number;
    urgentMultiplier: number;
  };
  runnerPricing?: {
    locationZones: Record<
      "A" | "B" | "C",
      {
        name: string;
        distanceMultiplier: number;
      }
    >;
    categories: Record<
      "small_item" | "groceries" | "heavy_items" | "document_delivery" | "express_errand",
      {
        name: string;
        baseFee: number;
        runnerBaseFee: number;
        multiplier: number;
      }
    >;
    settings: {
      serviceFee: number;
      baseDistanceRate: number;
      runnerDistanceRate: number;
      surgeMultiplier: number;
      urgencyFee: number;
    };
  };
}

// Default policy values (loaded from CSV data)
export const PRICING_CONFIG: Record<Country, CountryConfig> = {
  BWP: {
    country: 'Botswana',
    currency: 'BWP',
    fxPerZAR: 0.7,
    commissionPct: 0.15,
    peakMultiplier: 0.1,
    baseRadiusKm: 5,
    bookingFeeLocal: 5.6,
    perKmRateLocal: 7.0,
    heavySurchargeLocal: 17.5,
    urgencyFeeLocal: 14.0,
    volumetricDivisor: 5000,
    parcelBandSurcharges: {
      upTo2kg: 0,
      upTo5kg: 10.5,
      upTo10kg: 24.5,
      upTo20kg: 45.5,
      above20kgPerKg: 4.2,
    },
  },
  LSL: {
    country: 'Lesotho',
    currency: 'LSL',
    fxPerZAR: 1.0,
    commissionPct: 0.15,
    peakMultiplier: 0.1,
    baseRadiusKm: 5,
    bookingFeeLocal: 8.0,
    perKmRateLocal: 10.0,
    heavySurchargeLocal: 25.0,
    urgencyFeeLocal: 20.0,
    volumetricDivisor: 5000,
    parcelBandSurcharges: {
      upTo2kg: 0,
      upTo5kg: 15.0,
      upTo10kg: 35.0,
      upTo20kg: 65.0,
      above20kgPerKg: 6.0,
    },
  },
  NAD: {
    country: 'Namibia',
    currency: 'NAD',
    fxPerZAR: 1.0,
    commissionPct: 0.15,
    peakMultiplier: 0.1,
    baseRadiusKm: 5,
    bookingFeeLocal: 8.0,
    perKmRateLocal: 10.0,
    heavySurchargeLocal: 25.0,
    urgencyFeeLocal: 20.0,
    volumetricDivisor: 5000,
    parcelBandSurcharges: {
      upTo2kg: 0,
      upTo5kg: 15.0,
      upTo10kg: 35.0,
      upTo20kg: 65.0,
      above20kgPerKg: 6.0,
    },
  },
  ZAR: {
    country: 'South Africa',
    currency: 'ZAR',
    fxPerZAR: 1.0,
    commissionPct: 0.15,
    peakMultiplier: 0.1,
    baseRadiusKm: 5,
    bookingFeeLocal: 8.0,
    perKmRateLocal: 10.0,
    heavySurchargeLocal: 25.0,
    urgencyFeeLocal: 20.0,
    volumetricDivisor: 5000,
    parcelBandSurcharges: {
      upTo2kg: 0,
      upTo5kg: 15.0,
      upTo10kg: 35.0,
      upTo20kg: 65.0,
      above20kgPerKg: 6.0,
    },
  },
  ZWL: {
    country: 'Zimbabwe',
    currency: 'ZWL',
    fxPerZAR: 30.0,
    commissionPct: 0.15,
    peakMultiplier: 0.1,
    baseRadiusKm: 5,
    bookingFeeLocal: 240.0,
    perKmRateLocal: 300.0,
    heavySurchargeLocal: 750.0,
    urgencyFeeLocal: 600.0,
    volumetricDivisor: 5000,
    parcelBandSurcharges: {
      upTo2kg: 0,
      upTo5kg: 450.0,
      upTo10kg: 1050.0,
      upTo20kg: 1950.0,
      above20kgPerKg: 180.0,
    },
  },
  ZMW: {
    country: 'Zambia',
    currency: 'ZMW',
    fxPerZAR: 1.3,
    commissionPct: 0.15,
    peakMultiplier: 0.1,
    baseRadiusKm: 5,
    bookingFeeLocal: 10.4,
    perKmRateLocal: 13.0,
    heavySurchargeLocal: 32.5,
    urgencyFeeLocal: 26.0,
    volumetricDivisor: 5000,
    parcelBandSurcharges: {
      upTo2kg: 0,
      upTo5kg: 19.5,
      upTo10kg: 45.5,
      upTo20kg: 84.5,
      above20kgPerKg: 7.8,
    },
  },
};

const DEFAULT_PRICING_V2 = {
  baseFeeStandard: 80,
  baseFeeShort: 50,
  baseFeeLarge: 100,
  ratePerKmStandard: 10,
  ratePerKmHeavy: 12,
  minTaskAmount: 100,
  commissionRate: 0.15,
  deliveryFees: {
    taxi: 30,
    bus: 40,
    border: 50,
    courier: 60,
    custom: 60,
  },
  largeItemComplexityFeeMin: 150,
  largeItemComplexityFeeMax: 300,
  itemCountFee: 30,
  waitingRequiredFee: 50,
  urgentMultiplier: 1.2,
};

const DEFAULT_RUNNER_PRICING = {
  locationZones: {
    A: { name: "CBD / Urban", distanceMultiplier: 1.0 },
    B: { name: "Suburban", distanceMultiplier: 1.2 },
    C: { name: "Rural / Far", distanceMultiplier: 1.5 },
  },
  categories: {
    small_item: { name: "Small Item", baseFee: 20, runnerBaseFee: 15, multiplier: 1.0 },
    groceries: { name: "Groceries", baseFee: 30, runnerBaseFee: 20, multiplier: 1.2 },
    heavy_items: { name: "Heavy Items", baseFee: 50, runnerBaseFee: 35, multiplier: 1.5 },
    document_delivery: { name: "Document Delivery", baseFee: 25, runnerBaseFee: 20, multiplier: 1.0 },
    express_errand: { name: "Express Errand", baseFee: 40, runnerBaseFee: 30, multiplier: 1.8 },
  },
  settings: {
    serviceFee: 20,
    baseDistanceRate: 5,
    runnerDistanceRate: 4,
    surgeMultiplier: 1.2,
    urgencyFee: 15,
  },
};

Object.keys(PRICING_CONFIG).forEach((currency) => {
  (PRICING_CONFIG[currency as Country] as CountryConfig).pricingV2 = { ...DEFAULT_PRICING_V2 };
  (PRICING_CONFIG[currency as Country] as CountryConfig).runnerPricing = JSON.parse(
    JSON.stringify(DEFAULT_RUNNER_PRICING)
  );
});

// Default platform commission rate (15%) for tasks
export const DEFAULT_COMMISSION_RATE = 0.15;

// Admin/product commission: Manufacturer/Supplier pays 7.5% on successful sale
export const ADMIN_PRODUCT_COMMISSION_PCT = 0.075;

// Enterprise subscription (monthly fee per country)
export const ENTERPRISE_FEE_ZAR = 750;
export const ENTERPRISE_COMMISSION_PCT = 0.12; // Reduced from 0.15
