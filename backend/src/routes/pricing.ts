/**
 * Morongwa Pricing API Routes
 * Endpoints for quote calculation and pricing configuration
 */

import { Router } from 'express';
import { calculateQuote, validateQuoteParams, QuoteParams } from '../services/pricing';
import { PRICING_CONFIG, Country } from '../config/fees.config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { geocodeSuggestHandler, geocodeSuggestLimiter } from '../services/geocodeSuggestService';

const router = Router();

/** GET /api/pricing/address-suggest — SA address hints (Photon + Nominatim); public */
router.get('/address-suggest', geocodeSuggestLimiter, geocodeSuggestHandler);

/**
 * POST /api/pricing/quote
 * Calculate a task quote with fee breakdown
 * Public endpoint (no auth required)
 */
router.post('/quote', async (req, res) => {
  try {
    const params: Partial<QuoteParams> = {
      currency: req.body.currency,
      distanceKm: parseFloat(req.body.distanceKm),
      taskType: req.body.taskType,
      deliveryMethod: req.body.deliveryMethod,
      itemType: req.body.itemType,
      vehicleType: req.body.vehicleType,
      urgency: req.body.urgency,
      itemCount: req.body.itemCount != null ? parseFloat(req.body.itemCount) : undefined,
      waitingRequired: req.body.waitingRequired === true || req.body.waitingRequired === 'true',
      locationZone: req.body.locationZone,
      taskPrice: req.body.taskPrice != null ? parseFloat(req.body.taskPrice) : undefined,
      weightKg: req.body.weightKg != null ? parseFloat(req.body.weightKg) : undefined,
      actualWeightKg: req.body.actualWeightKg != null ? parseFloat(req.body.actualWeightKg) : undefined,
      lengthCm: req.body.lengthCm != null ? parseFloat(req.body.lengthCm) : undefined,
      widthCm: req.body.widthCm != null ? parseFloat(req.body.widthCm) : undefined,
      heightCm: req.body.heightCm != null ? parseFloat(req.body.heightCm) : undefined,
      isPeak: req.body.isPeak === true || req.body.isPeak === 'true',
      isUrgent: req.body.isUrgent === true || req.body.isUrgent === 'true',
    };

    // Validate parameters
    const validationErrors = validateQuoteParams(params);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors,
      });
    }

    // Calculate quote
    const quote = calculateQuote(params as QuoteParams);

    res.json({
      success: true,
      data: quote,
    });
  } catch (error: any) {
    console.error('Quote calculation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate quote',
    });
  }
});

/**
 * GET /api/pricing/config
 * Get pricing configuration for all countries
 * Public endpoint
 */
router.get('/config', async (req, res) => {
  try {
    res.json({
      success: true,
      data: PRICING_CONFIG,
    });
  } catch (error: any) {
    console.error('Config fetch error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch pricing config',
    });
  }
});

/**
 * GET /api/pricing/config/:currency
 * Get pricing configuration for specific country
 * Public endpoint
 */
router.get('/config/:currency', async (req, res) => {
  try {
    const currency = req.params.currency.toUpperCase() as Country;
    const config = PRICING_CONFIG[currency];

    if (!config) {
      return res.status(404).json({
        success: false,
        message: `Unsupported currency: ${currency}`,
      });
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    console.error('Config fetch error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch pricing config',
    });
  }
});

/**
 * PUT /api/pricing/config/:currency
 * Update pricing configuration for specific country
 * Admin only
 */
router.put('/config/:currency', authenticate, async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    const isAdmin = (r: any) => Array.isArray(r) ? r.includes('admin') : r === 'admin';
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const currency = req.params.currency.toUpperCase() as Country;
    
    if (!PRICING_CONFIG[currency]) {
      return res.status(404).json({
        success: false,
        message: `Unsupported currency: ${currency}`,
      });
    }

    // Update configuration (in production, save to database)
    const updates = req.body;
    const allowedFields = [
      'fxPerZAR',
      'commissionPct',
      'peakMultiplier',
      'baseRadiusKm',
      'bookingFeeLocal',
      'perKmRateLocal',
      'heavySurchargeLocal',
      'urgencyFeeLocal',
      'volumetricDivisor',
      'parcelBandSurcharges',
      'pricingV2',
      'runnerPricing',
    ];

    Object.keys(updates).forEach((key) => {
      if (!allowedFields.includes(key)) return;
      if (key === 'parcelBandSurcharges') {
        const incoming = updates[key] || {};
        const current = PRICING_CONFIG[currency].parcelBandSurcharges;
        (PRICING_CONFIG[currency] as any).parcelBandSurcharges = {
          upTo2kg: Number.isFinite(Number(incoming.upTo2kg)) ? Number(incoming.upTo2kg) : current.upTo2kg,
          upTo5kg: Number.isFinite(Number(incoming.upTo5kg)) ? Number(incoming.upTo5kg) : current.upTo5kg,
          upTo10kg: Number.isFinite(Number(incoming.upTo10kg)) ? Number(incoming.upTo10kg) : current.upTo10kg,
          upTo20kg: Number.isFinite(Number(incoming.upTo20kg)) ? Number(incoming.upTo20kg) : current.upTo20kg,
          above20kgPerKg: Number.isFinite(Number(incoming.above20kgPerKg))
            ? Number(incoming.above20kgPerKg)
            : current.above20kgPerKg,
        };
        return;
      }
      if (key === 'pricingV2') {
        const current = PRICING_CONFIG[currency].pricingV2 || ({} as any);
        const incoming = updates[key] || {};
        (PRICING_CONFIG[currency] as any).pricingV2 = {
          ...current,
          ...incoming,
          deliveryFees: {
            ...(current as any).deliveryFees,
            ...(incoming.deliveryFees || {}),
          },
        };
        return;
      }
      if (key === 'runnerPricing') {
        const current = (PRICING_CONFIG[currency] as any).runnerPricing || {};
        const incoming = updates[key] || {};
        (PRICING_CONFIG[currency] as any).runnerPricing = {
          ...current,
          ...incoming,
          locationZones: {
            ...(current.locationZones || {}),
            ...(incoming.locationZones || {}),
          },
          categories: {
            ...(current.categories || {}),
            ...(incoming.categories || {}),
          },
          settings: {
            ...(current.settings || {}),
            ...(incoming.settings || {}),
          },
        };
        return;
      }
      const n = Number(updates[key]);
      if (Number.isFinite(n)) {
        (PRICING_CONFIG[currency] as any)[key] = n;
      }
    });

    res.json({
      success: true,
      message: `Pricing config updated for ${currency}`,
      data: PRICING_CONFIG[currency],
    });
  } catch (error: any) {
    console.error('Config update error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update pricing config',
    });
  }
});

/**
 * POST /api/pricing/examples
 * Get example calculations for all countries
 * Useful for pricing page display
 */
router.post('/examples', async (req, res) => {
  try {
    const examples: Record<Country, any> = {} as any;

    Object.keys(PRICING_CONFIG).forEach((currency) => {
      const config = PRICING_CONFIG[currency as Country];
      // Convert base ZAR price to local currency
      const baseZAR = 250;
      const localPrice = Math.round(baseZAR * config.fxPerZAR * 100) / 100;
      
      examples[currency as Country] = calculateQuote({
        currency: currency as Country,
        distanceKm: 12,
        taskType: 'general',
        taskPrice: localPrice,
        weightKg: 8,
        isPeak: true,
        isUrgent: true,
      });
    });

    res.json({
      success: true,
      data: examples,
    });
  } catch (error: any) {
    console.error('Examples calculation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate examples',
    });
  }
});

export default router;
