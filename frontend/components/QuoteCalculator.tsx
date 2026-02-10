'use client';

import { useState, useEffect } from 'react';
import { Calculator, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_URL } from '@/lib/api';

interface QuoteBreakdown {
  currency: string;
  country: string;
  taskPrice: number;
  bookingFee: number;
  distanceSurcharge: number;
  distanceDetails: { extraKm: number; ratePerKm: number };
  heavySurcharge: number;
  peakSurcharge: number;
  urgencySurcharge: number;
  totalSurcharges: number;
  subtotal: number;
  commission: number;
  clientTotal: number;
  runnerNet: number;
  platformRevenue: number;
}

interface QuoteCalculatorProps {
  currency: string;
  onQuoteChange?: (quote: QuoteBreakdown) => void;
  compact?: boolean;
}

export function QuoteCalculator({ currency, onQuoteChange, compact = false }: QuoteCalculatorProps) {
  const [taskPrice, setTaskPrice] = useState('250');
  const [distance, setDistance] = useState('12');
  const [weight, setWeight] = useState('0');
  const [isPeak, setIsPeak] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    calculateQuote();
  }, [taskPrice, distance, weight, isPeak, isUrgent, currency]);

  const calculateQuote = async () => {
    if (!taskPrice || !distance) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/pricing/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency,
          taskPrice: parseFloat(taskPrice),
          distanceKm: parseFloat(distance),
          weightKg: parseFloat(weight),
          isPeak,
          isUrgent,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setQuote(data.data);
        if (onQuoteChange) {
          onQuoteChange(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to calculate quote:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = {
      BWP: 'P',
      LSL: 'L',
      NAD: 'N$',
      ZAR: 'R',
      ZWL: 'Z$',
      ZMW: 'ZK',
    };
    return symbols[currency] || currency;
  };

  const formatAmount = (amount: number) => {
    return `${getCurrencySymbol(currency)}${amount.toFixed(2)}`;
  };

  if (compact) {
    return (
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-sky-600" />
            Price Preview
          </h3>
          {quote && (
            <div className="text-lg font-bold text-sky-600">
              {formatAmount(quote.clientTotal)}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Task Price</label>
            <input
              type="number"
              value={taskPrice}
              onChange={(e) => setTaskPrice(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Distance (km)</label>
            <input
              type="number"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
            />
          </div>

          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={isPeak}
                onChange={(e) => setIsPeak(e.target.checked)}
                className="rounded"
              />
              <span>Peak hours</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="rounded"
              />
              <span>Urgent</span>
            </label>
          </div>
        </div>

        {quote && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Task price</span>
              <span className="font-semibold">{formatAmount(quote.taskPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Surcharges</span>
              <span className="font-semibold">{formatAmount(quote.totalSurcharges)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Booking fee</span>
              <span className="font-semibold">{formatAmount(quote.bookingFee)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t text-sky-600 font-bold">
              <span>You pay</span>
              <span>{formatAmount(quote.clientTotal)}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 text-lg">Task Details</h3>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Task Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                {getCurrencySymbol(currency)}
              </span>
              <input
                type="number"
                value={taskPrice}
                onChange={(e) => setTaskPrice(e.target.value)}
                className="w-full pl-8 pr-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Distance (km)</label>
            <input
              type="number"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
            />
            <p className="text-xs text-slate-500 mt-1">First 5 km included</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Weight (kg)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
            />
            <p className="text-xs text-slate-500 mt-1">Surcharge applies for &gt;10 kg</p>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPeak}
                onChange={(e) => setIsPeak(e.target.checked)}
                className="w-5 h-5 text-sky-600 rounded"
              />
              <span className="text-sm font-medium text-slate-900">Peak hours (+10%)</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="w-5 h-5 text-sky-600 rounded"
              />
              <span className="text-sm font-medium text-slate-900">Urgent (&lt;2 hours)</span>
            </label>
          </div>
        </div>

        {/* Breakdown */}
        {quote && (
          <div className="bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 rounded-xl p-6 text-white">
            <h3 className="font-bold text-lg mb-6">Price Breakdown</h3>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-white/80">Task price</span>
                <span className="font-semibold">{formatAmount(quote.taskPrice)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/80">Booking fee</span>
                <span className="font-semibold">{formatAmount(quote.bookingFee)}</span>
              </div>

              {quote.distanceSurcharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-white/80 text-sm">
                    Distance ({quote.distanceDetails.extraKm} km)
                  </span>
                  <span className="font-semibold">{formatAmount(quote.distanceSurcharge)}</span>
                </div>
              )}

              {quote.heavySurcharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Heavy item</span>
                  <span className="font-semibold">{formatAmount(quote.heavySurcharge)}</span>
                </div>
              )}

              {quote.peakSurcharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Peak hours</span>
                  <span className="font-semibold">{formatAmount(quote.peakSurcharge)}</span>
                </div>
              )}

              {quote.urgencySurcharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Urgent delivery</span>
                  <span className="font-semibold">{formatAmount(quote.urgencySurcharge)}</span>
                </div>
              )}
            </div>

            <div className="bg-white/10 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-white/20 pb-3">
                <span className="text-sm text-white/80">You pay:</span>
                <span className="text-2xl font-bold">{formatAmount(quote.clientTotal)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-white/60">Commission (15%)</span>
                <span className="text-sm font-semibold">{formatAmount(quote.commission)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-white/60">Runner receives</span>
                <span className="text-sm font-bold">{formatAmount(quote.runnerNet)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
