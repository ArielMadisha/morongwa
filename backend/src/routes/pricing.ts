/**
 * Morongwa Pricing API Routes
 * Endpoints for quote calculation and pricing configuration
 */

import { Router } from 'express';
import { calculateQuote, validateQuoteParams, QuoteParams } from '../services/pricing';
import { PRICING_CONFIG, Country } from '../config/fees.config';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /api/pricing/quote
 * Calculate a task quote with fee breakdown
 * Public endpoint (no auth required)
 */
router.post('/quote', async (req, res) => {
  try {
    const params: Partial<QuoteParams> = {
      currency: req.body.currency,
      taskPrice: parseFloat(req.body.taskPrice),
      distanceKm: parseFloat(req.body.distanceKm),
      weightKg: parseFloat(req.body.weightKg),
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
    ];

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
        (PRICING_CONFIG[currency] as any)[key] = parseFloat(updates[key]);
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
        taskPrice: localPrice,
        distanceKm: 12,
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
