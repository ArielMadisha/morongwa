// Fee calculation engine for Morongwa escrow model
import logger from "../utils/logger";

interface FeeCalculationInput {
  taskPrice: number;
  currency: string;
  distance?: number; // kilometers
  isPeakHours?: boolean;
  weight?: number; // kilograms
  isUrgent?: boolean;
  country?: string; // ZA, BW, LS, NA, ZW, ZM
}

interface FeeCalculationOutput {
  taskPrice: number;
  bookingFee: number;
  commission: number; // 15% of task price
  distanceSurcharge: number; // R10/km or equiv
  peakSurcharge: number; // +10% of task price
  weightSurcharge: number; // R25 for >10kg or equiv
  urgencySurcharge: number; // R20 or equiv
  totalFees: number;
  totalHeld: number; // task price + booking fee (initial escrow)
  runnersNet: number; // task price + surcharges - commission
  currency: string;
  breakdown: string; // human-readable breakdown
}

class FeeCalculationService {
  /**
   * Currency exchange rates (relative to ZAR, approximate)
   * These would ideally pull from a live exchange rate API
   */
  private exchangeRates: Record<string, number> = {
    ZAR: 1.0,
    BWP: 7.3, // 1 ZAR ≈ 0.137 BWP
    LSL: 17.5, // 1 ZAR ≈ 0.057 LSL
    NAD: 17.5, // 1 ZAR ≈ 0.057 NAD
    ZWL: 3240.0, // 1 ZAR ≈ 0.000309 ZWL (highly volatile)
    ZMW: 20.5, // 1 ZAR ≈ 0.049 ZMW
  };

  /**
   * Base fees in ZAR; converted to local currency as needed
   */
  private baseFees = {
    bookingFeeZAR: 8, // R8 booking fee
    commissionRate: 0.15, // 15% of task price
    distanceSurchargePerKm: 10, // R10/km beyond base
    peakSurchargeRate: 0.1, // +10% of task price
    weightSurchargForHeavy: 25, // R25 for >10kg
    urgencySurcharge: 20, // R20
  };

  /**
   * Calculate all fees for a task
   */
  calculateFees(input: FeeCalculationInput): FeeCalculationOutput {
    const {
      taskPrice,
      currency,
      distance = 0,
      isPeakHours = false,
      weight = 0,
      isUrgent = false,
      country = "ZA",
    } = input;

    // Convert base fees from ZAR to target currency
    const exchangeRate = this.exchangeRates[currency] || 1.0;
    const bookingFee = this.convertCurrency(
      this.baseFees.bookingFeeZAR,
      "ZAR",
      currency
    );

    // Calculate surcharges
    const distanceSurcharge = this.calculateDistanceSurcharge(
      distance,
      currency
    );
    const peakSurcharge = isPeakHours
      ? this.calculatePeakSurcharge(taskPrice)
      : 0;
    const weightSurcharge =
      weight > 10 ? this.convertCurrency(25, "ZAR", currency) : 0;
    const urgencySurcharge = isUrgent
      ? this.convertCurrency(20, "ZAR", currency)
      : 0;

    // Commission is always 15% of task price (before surcharges)
    const commission = Math.round(taskPrice * this.baseFees.commissionRate * 100) / 100;

    // Total held initially = task price + booking fee (in escrow)
    const totalHeld = Math.round((taskPrice + bookingFee) * 100) / 100;

    // Total fees = booking + surcharges
    const totalFees = Math.round(
      (bookingFee + distanceSurcharge + peakSurcharge + weightSurcharge + urgencySurcharge) * 100
    ) / 100;

    // Runner's net = task price + surcharges - commission
    const runnersNet = Math.round(
      (taskPrice + distanceSurcharge + peakSurcharge + weightSurcharge + urgencySurcharge - commission) * 100
    ) / 100;

    // Morongwa revenue = booking fee + commission
    const morongwaRevenue = Math.round((bookingFee + commission) * 100) / 100;

    const breakdown = this.generateBreakdown(
      taskPrice,
      bookingFee,
      commission,
      distanceSurcharge,
      peakSurcharge,
      weightSurcharge,
      urgencySurcharge,
      runnersNet,
      morongwaRevenue,
      currency
    );

    logger.debug("Fees calculated", {
      taskPrice,
      currency,
      distance,
      isPeakHours,
      weight,
      isUrgent,
      bookingFee,
      commission,
      totalFees,
      runnersNet,
    });

    return {
      taskPrice,
      bookingFee: Math.round(bookingFee * 100) / 100,
      commission,
      distanceSurcharge: Math.round(distanceSurcharge * 100) / 100,
      peakSurcharge: Math.round(peakSurcharge * 100) / 100,
      weightSurcharge: Math.round(weightSurcharge * 100) / 100,
      urgencySurcharge: Math.round(urgencySurcharge * 100) / 100,
      totalFees,
      totalHeld,
      runnersNet,
      currency,
      breakdown,
    };
  }

  /**
   * Calculate distance surcharge (R10/km or local equivalent)
   */
  private calculateDistanceSurcharge(
    distance: number,
    currency: string
  ): number {
    if (distance <= 0) return 0;
    const surchargeZAR =
      this.baseFees.distanceSurchargePerKm * distance;
    return this.convertCurrency(surchargeZAR, "ZAR", currency);
  }

  /**
   * Calculate peak hours surcharge (+10% of task price)
   */
  private calculatePeakSurcharge(taskPrice: number): number {
    return taskPrice * this.baseFees.peakSurchargeRate;
  }

  /**
   * Convert amount from one currency to another
   */
  private convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): number {
    if (fromCurrency === toCurrency) return amount;

    const fromRate = this.exchangeRates[fromCurrency] || 1.0;
    const toRate = this.exchangeRates[toCurrency] || 1.0;

    return (amount / fromRate) * toRate;
  }

  /**
   * Generate human-readable fee breakdown
   */
  private generateBreakdown(
    taskPrice: number,
    bookingFee: number,
    commission: number,
    distanceSurcharge: number,
    peakSurcharge: number,
    weightSurcharge: number,
    urgencySurcharge: number,
    runnersNet: number,
    morongwaRevenue: number,
    currency: string
  ): string {
    const lines = [
      `═══════════════════════════════════`,
      `MORONGWA ESCROW BREAKDOWN`,
      ``,
      `Task Price:                ${taskPrice.toFixed(2)} ${currency}`,
      `Booking Fee:               ${bookingFee.toFixed(2)} ${currency}`,
      ``,
    ];

    if (distanceSurcharge > 0) {
      lines.push(
        `Distance Surcharge:        ${distanceSurcharge.toFixed(2)} ${currency}`
      );
    }
    if (peakSurcharge > 0) {
      lines.push(`Peak Hours Surcharge:      ${peakSurcharge.toFixed(2)} ${currency}`);
    }
    if (weightSurcharge > 0) {
      lines.push(`Weight Surcharge (>10kg):  ${weightSurcharge.toFixed(2)} ${currency}`);
    }
    if (urgencySurcharge > 0) {
      lines.push(`Urgency Surcharge:         ${urgencySurcharge.toFixed(2)} ${currency}`);
    }

    lines.push(``, `────────────────────────────────────`);
    lines.push(
      `Morongwa Commission (15%): ${commission.toFixed(2)} ${currency}`
    );
    lines.push(
      ``,
      `HELD IN ESCROW INITIALLY:  ${(taskPrice + bookingFee).toFixed(2)} ${currency}`,
      ``,
      `RUNNER RECEIVES (if approved):`,
      `${runnersNet.toFixed(2)} ${currency}`,
      ``,
      `MORONGWA REVENUE:          ${morongwaRevenue.toFixed(2)} ${currency}`,
      `═══════════════════════════════════`
    );

    return lines.join("\n");
  }

  /**
   * Update exchange rates (call periodically from a scheduler)
   */
  updateExchangeRates(rates: Record<string, number>): void {
    this.exchangeRates = { ...this.exchangeRates, ...rates };
    logger.info("Exchange rates updated", { rates });
  }

  /**
   * Get current exchange rates
   */
  getExchangeRates(): Record<string, number> {
    return { ...this.exchangeRates };
  }
}

export default new FeeCalculationService();
