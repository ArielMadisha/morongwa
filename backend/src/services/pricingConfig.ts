/**
 * Pricing Configuration Service
 * Manages pricing data persistence in MongoDB
 */

import { PricingConfig } from '../data/models/PricingConfig';
import { PRICING_CONFIG } from '../config/fees.config';
import { logger } from './monitoring';

/**
 * Seed pricing configurations into MongoDB
 * Runs on server startup to ensure data exists
 */
export const seedPricingConfig = async (): Promise<void> => {
  try {
    const currencies = Object.keys(PRICING_CONFIG);

    for (const currency of currencies) {
      const config = PRICING_CONFIG[currency as keyof typeof PRICING_CONFIG];
      
      await PricingConfig.findOneAndUpdate(
        { currency },
        {
          country: config.country,
          currency: config.currency,
          fxPerZAR: config.fxPerZAR,
          commissionPct: config.commissionPct,
          peakMultiplier: config.peakMultiplier,
          baseRadiusKm: config.baseRadiusKm,
          bookingFeeLocal: config.bookingFeeLocal,
          perKmRateLocal: config.perKmRateLocal,
          heavySurchargeLocal: config.heavySurchargeLocal,
          urgencyFeeLocal: config.urgencyFeeLocal,
        },
        { upsert: true, new: true }
      );
      
      logger.info(`Seeded pricing config for ${currency}`);
    }

    logger.info('✅ Pricing configurations seeded successfully');
  } catch (error) {
    logger.error('Failed to seed pricing configurations:', error);
    throw error;
  }
};

/**
 * Get all pricing configurations from MongoDB
 */
export const getAllPricingConfigs = async () => {
  return await PricingConfig.find({}).lean();
};

/**
 * Get pricing configuration for specific currency
 */
export const getPricingConfig = async (currency: string) => {
  return await PricingConfig.findOne({ currency: currency.toUpperCase() }).lean();
};

/**
 * Update pricing configuration
 */
export const updatePricingConfig = async (
  currency: string,
  updates: Partial<any>,
  userId?: string
) => {
  const updatedConfig = await PricingConfig.findOneAndUpdate(
    { currency: currency.toUpperCase() },
    { ...updates, updatedBy: userId },
    { new: true }
  );

  if (updatedConfig) {
    logger.info(`Pricing config updated for ${currency} by user ${userId}`);
  }

  return updatedConfig;
};
