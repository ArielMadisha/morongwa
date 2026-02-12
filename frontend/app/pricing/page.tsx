'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calculator, Globe, Shield, Clock, Package, Zap, CheckCircle, ArrowRight, Info, AlertCircle } from 'lucide-react';
import { API_URL } from '@/lib/api';
import SiteHeader from '@/components/SiteHeader';

interface CountryConfig {
  country: string;
  currency: string;
  fxPerZAR: number;
  commissionPct: number;
  peakMultiplier: number;
  baseRadiusKm: number;
  bookingFeeLocal: number;
  perKmRateLocal: number;
  heavySurchargeLocal: number;
  urgencyFeeLocal: number;
}

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

export default function PricingPage() {
  const [selectedCountry, setSelectedCountry] = useState<string>('ZAR');
  const [countries, setCountries] = useState<Record<string, CountryConfig>>({});
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  
  // Fallback when backend is down (e.g. dev without backend)
  const DEFAULT_COUNTRIES: Record<string, CountryConfig> = {
    ZAR: {
      country: 'South Africa',
      currency: 'ZAR',
      fxPerZAR: 1,
      commissionPct: 15,
      peakMultiplier: 1.1,
      baseRadiusKm: 5,
      bookingFeeLocal: 8,
      perKmRateLocal: 4,
      heavySurchargeLocal: 15,
      urgencyFeeLocal: 25,
    },
  };
  
  // Calculator inputs
  const [taskPrice, setTaskPrice] = useState('250');
  const [distance, setDistance] = useState('12');
  const [weight, setWeight] = useState('8');
  const [isPeak, setIsPeak] = useState(true);
  const [isUrgent, setIsUrgent] = useState(true);

  useEffect(() => {
    fetchCountries();
  }, []);

  useEffect(() => {
    if (Object.keys(countries).length > 0) {
      calculateQuote();
    }
  }, [selectedCountry, taskPrice, distance, weight, isPeak, isUrgent, countries]);

  const fetchCountries = async () => {
    try {
      setApiUnavailable(false);
      const res = await fetch(`${API_URL}/pricing/config`);
      const data = await res.json();
      if (data.success) {
        setCountries(data.data);
      } else {
        setCountries(DEFAULT_COUNTRIES);
      }
    } catch {
      setApiUnavailable(true);
      setCountries(DEFAULT_COUNTRIES);
    }
  };

  const calculateQuote = async () => {
    if (!taskPrice || !distance || !weight) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/pricing/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: selectedCountry,
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
      }
    } catch {
      setQuote(null);
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

  const formatAmount = (amount: number, currency: string) => {
    return `${getCurrencySymbol(currency)}${amount.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100">
      <SiteHeader />

      {apiUnavailable && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>API server is not running. Start the backend (<code className="bg-amber-100 px-1 rounded">cd backend && npm run dev</code>) for live pricing and quotes.</span>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-slate-900 mb-4">
              Transparent Pricing
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Simple, fair fees across 6 countries. No hidden charges—see exactly what you pay.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full text-sm text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Effective: 08 Jan 2026
            </div>
          </div>

          {/* Supported Countries */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-12">
            {Object.entries(countries).map(([currency, config]) => (
              <button
                key={currency}
                onClick={() => setSelectedCountry(currency)}
                className={`p-4 rounded-xl border-2 transition ${
                  selectedCountry === currency
                    ? 'border-sky-500 bg-sky-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <Globe className={`h-6 w-6 ${selectedCountry === currency ? 'text-sky-600' : 'text-slate-400'}`} />
                  <div className="text-sm font-semibold text-slate-900">{config.country}</div>
                  <div className="text-xs text-slate-500">{currency}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live Calculator */}
      <section className="py-12 px-4 bg-white/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2 flex items-center justify-center gap-2">
              <Calculator className="h-8 w-8 text-sky-600" />
              Live Price Calculator
            </h2>
            <p className="text-slate-600">Adjust the parameters to see real-time pricing</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Input Panel */}
            <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Task Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    {getCurrencySymbol(selectedCountry)}
                  </span>
                  <input
                    type="number"
                    value={taskPrice}
                    onChange={(e) => setTaskPrice(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                    placeholder="250"
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
                  placeholder="12"
                />
                <p className="mt-1 text-xs text-slate-500">First 5 km included</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Weight (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                  placeholder="8"
                />
                <p className="mt-1 text-xs text-slate-500">Heavy surcharge applies for &gt;10 kg</p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPeak}
                    onChange={(e) => setIsPeak(e.target.checked)}
                    className="w-5 h-5 text-sky-600 border-slate-300 rounded focus:ring-sky-100"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">Peak hours (+10%)</div>
                    <div className="text-xs text-slate-500">High demand periods</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    className="w-5 h-5 text-sky-600 border-slate-300 rounded focus:ring-sky-100"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">Urgent (&lt;2 hours)</div>
                    <div className="text-xs text-slate-500">Rush delivery</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Results Panel */}
            <div className="bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 rounded-2xl shadow-2xl p-8 text-white">
              {quote ? (
                <div className="space-y-6">
                  <div className="text-center pb-6 border-b border-white/20">
                    <div className="text-sm font-semibold opacity-90 mb-1">{quote.country}</div>
                    <div className="text-4xl font-bold">{formatAmount(quote.clientTotal, quote.currency)}</div>
                    <div className="text-sm opacity-75 mt-1">Total client payment</div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/80">Task price</span>
                      <span className="font-semibold">{formatAmount(quote.taskPrice, quote.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/80">Booking fee</span>
                      <span className="font-semibold">{formatAmount(quote.bookingFee, quote.currency)}</span>
                    </div>

                    {quote.distanceSurcharge > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/80 text-sm">
                          Distance ({quote.distanceDetails.extraKm} km × {formatAmount(quote.distanceDetails.ratePerKm, quote.currency)})
                        </span>
                        <span className="font-semibold">{formatAmount(quote.distanceSurcharge, quote.currency)}</span>
                      </div>
                    )}

                    {quote.heavySurcharge > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/80 text-sm">Heavy item</span>
                        <span className="font-semibold">{formatAmount(quote.heavySurcharge, quote.currency)}</span>
                      </div>
                    )}

                    {quote.peakSurcharge > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/80 text-sm">Peak hours</span>
                        <span className="font-semibold">{formatAmount(quote.peakSurcharge, quote.currency)}</span>
                      </div>
                    )}

                    {quote.urgencySurcharge > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/80 text-sm">Urgent delivery</span>
                        <span className="font-semibold">{formatAmount(quote.urgencySurcharge, quote.currency)}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-white/20 space-y-3">
                    <div className="bg-white/10 rounded-lg p-4">
                      <div className="text-sm text-white/80 mb-1">Runner receives</div>
                      <div className="text-2xl font-bold">{formatAmount(quote.runnerNet, quote.currency)}</div>
                      <div className="text-xs text-white/60 mt-1">After 15% commission</div>
                    </div>

                    <div className="text-xs text-white/60 space-y-1">
                      <div>• Commission: {formatAmount(quote.commission, quote.currency)} (15%)</div>
                      <div>• Platform revenue: {formatAmount(quote.platformRevenue, quote.currency)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Calculator className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-white/80">Enter values to see pricing</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Fee Breakdown Section */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">How Fees Work</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-sky-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">15% Commission</h3>
              <p className="text-slate-600 text-sm">
                Success fee on task price, deducted at completion. Industry-standard rate.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-cyan-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Booking Fee</h3>
              <p className="text-slate-600 text-sm">
                R8 (ZAR) service fee at task creation. Covers processing and support.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Dynamic Surcharges</h3>
              <p className="text-slate-600 text-sm">
                Distance, weight, peak hours, urgency. All shown before confirmation.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
                <Package className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Escrow Protected</h3>
              <p className="text-slate-600 text-sm">
                Funds held safely until task completion and review. Full protection.
              </p>
            </div>
          </div>

          {/* Principles */}
          <div className="bg-gradient-to-r from-sky-50 to-cyan-50 rounded-2xl p-8 mb-12">
            <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Info className="h-6 w-6 text-sky-600" />
              Core Principles
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">Transparent & Predictable</div>
                  <div className="text-sm text-slate-600">Simple breakdown at checkout, no surprises</div>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">Fair Compensation</div>
                  <div className="text-sm text-slate-600">Runners keep 85% + surcharges</div>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">Escrow Protection</div>
                  <div className="text-sm text-slate-600">Funds held until completion & review</div>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">Industry Standards</div>
                  <div className="text-sm text-slate-600">Benchmarked against Uber, TaskRabbit, Airbnb</div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:scale-105 transition shadow-xl">
              Get Started Now
              <ArrowRight className="h-5 w-5" />
            </Link>
            <p className="text-sm text-slate-500 mt-4">
              No credit card required • Free to join • Start earning today
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-8 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-slate-400 text-sm">
            © 2026 Morongwa. Transparent pricing across Southern Africa.
          </p>
        </div>
      </footer>
    </div>
  );
}
