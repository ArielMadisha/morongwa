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
  },
};

// Default platform commission rate (15%) for tasks
export const DEFAULT_COMMISSION_RATE = 0.15;

// Admin/product commission: Manufacturer/Supplier pays 7.5% on successful sale
export const ADMIN_PRODUCT_COMMISSION_PCT = 0.075;

// Enterprise subscription (monthly fee per country)
export const ENTERPRISE_FEE_ZAR = 750;
export const ENTERPRISE_COMMISSION_PCT = 0.12; // Reduced from 0.15
