'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Save, RefreshCw, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { API_URL } from '@/lib/api';

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
  volumetricDivisor: number;
  parcelBandSurcharges: {
    upTo2kg: number;
    upTo5kg: number;
    upTo10kg: number;
    upTo20kg: number;
    above20kgPerKg: number;
  };
  runnerPricing?: {
    locationZones: Record<string, { name: string; distanceMultiplier: number }>;
    categories: Record<string, { name: string; baseFee: number; runnerBaseFee: number; multiplier: number }>;
    settings: {
      serviceFee: number;
      baseDistanceRate: number;
      runnerDistanceRate: number;
      surgeMultiplier: number;
      urgencyFee: number;
    };
  };
}

function PricingConfigPage() {
  const [countries, setCountries] = useState<Record<string, CountryConfig>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [editedValues, setEditedValues] = useState<Record<string, Partial<CountryConfig>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [simCurrency, setSimCurrency] = useState<string>('ZAR');
  const [simCategory, setSimCategory] = useState<'small_item' | 'groceries' | 'heavy_items' | 'document_delivery' | 'express_errand'>('small_item');
  const [simZone, setSimZone] = useState<'A' | 'B' | 'C'>('A');
  const [simDistanceKm, setSimDistanceKm] = useState<number>(6);
  const [simUrgent, setSimUrgent] = useState<boolean>(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<{
    customerPrice?: number;
    runnerPay?: number;
    adminProfit?: number;
    formulaCustomer?: number;
    formulaRunner?: number;
    categoryName?: string;
    zone?: string;
  } | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!countries[simCurrency]) {
      const first = Object.keys(countries)[0];
      if (first) setSimCurrency(first);
    }
  }, [countries, simCurrency]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/pricing/config`);
      const data = await res.json();
      if (data.success) {
        setCountries(data.data);
      }
    } catch (error) {
      toast.error('Failed to load pricing config');
      console.error(error);
    }
  };

  const handleEdit = (currency: string) => {
    setEditing({ ...editing, [currency]: true });
    setEditedValues({ ...editedValues, [currency]: { ...countries[currency] } });
  };

  const handleCancel = (currency: string) => {
    setEditing({ ...editing, [currency]: false });
    const updated = { ...editedValues };
    delete updated[currency];
    setEditedValues(updated);
  };

  const handleChange = (currency: string, field: keyof CountryConfig, value: string) => {
    setEditedValues({
      ...editedValues,
      [currency]: {
        ...editedValues[currency],
        [field]: parseFloat(value) || 0,
      },
    });
  };

  const handleBandChange = (
    currency: string,
    band: keyof CountryConfig['parcelBandSurcharges'],
    value: string
  ) => {
    setEditedValues({
      ...editedValues,
      [currency]: {
        ...editedValues[currency],
        parcelBandSurcharges: {
          ...(editedValues[currency]?.parcelBandSurcharges || countries[currency]?.parcelBandSurcharges || {}),
          [band]: parseFloat(value) || 0,
        },
      },
    });
  };

  const handleSave = async (currency: string) => {
    setSaving({ ...saving, [currency]: true });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/pricing/config/${currency}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editedValues[currency]),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`${currency} pricing updated successfully`);
        setCountries({ ...countries, [currency]: data.data });
        setEditing({ ...editing, [currency]: false });
        const updated = { ...editedValues };
        delete updated[currency];
        setEditedValues(updated);
      } else {
        toast.error(data.message || 'Update failed');
      }
    } catch (error) {
      toast.error('Failed to update pricing');
      console.error(error);
    } finally {
      setSaving({ ...saving, [currency]: false });
    }
  };

  const runPricingSimulation = async () => {
    setSimLoading(true);
    try {
      const taskType =
        simCategory === 'groceries'
          ? 'shop_send'
          : simCategory === 'heavy_items'
          ? 'transport'
          : simCategory === 'express_errand'
          ? 'collect_send'
          : 'general';

      const itemType = simCategory === 'document_delivery' ? 'document' : simCategory;
      const deliveryMethod =
        simCategory === 'express_errand' ? 'border' : simCategory === 'heavy_items' ? 'courier' : 'taxi';

      const res = await fetch(`${API_URL}/pricing/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: simCurrency,
          taskType,
          itemType,
          deliveryMethod,
          locationZone: simZone,
          urgency: simUrgent ? 'urgent' : 'normal',
          isUrgent: simUrgent,
          isPeak: false,
          distanceKm: simDistanceKm,
          itemCount: 1,
        }),
      });
      const data = await res.json();
      if (!data?.success || !data?.data) {
        toast.error(data?.message || 'Simulation failed');
        return;
      }
      setSimResult({
        customerPrice: Number(data.data.totalClientPrice || 0),
        runnerPay: Number(data.data.runnerPayout || 0),
        adminProfit: Number(data.data.adminProfit || 0),
        formulaCustomer: Number(data.data.customerPriceFormulaTotal || 0),
        formulaRunner: Number(data.data.runnerPayFormulaTotal || 0),
        categoryName: String(data.data.categoryName || simCategory),
        zone: String(data.data.locationZone || simZone),
      });
    } catch (error) {
      toast.error('Simulation request failed');
      console.error(error);
    } finally {
      setSimLoading(false);
    }
  };

  const handleRunnerPricingChange = (
    currency: string,
    section: 'settings' | 'locationZones' | 'categories',
    key: string,
    field: string,
    value: string
  ) => {
    const current = editedValues[currency]?.runnerPricing || countries[currency]?.runnerPricing;
    if (!current) return;
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    if (section === 'settings') {
      setEditedValues({
        ...editedValues,
        [currency]: {
          ...editedValues[currency],
          runnerPricing: {
            ...current,
            settings: {
              ...current.settings,
              [field]: safeValue,
            },
          },
        },
      });
      return;
    }
    setEditedValues({
      ...editedValues,
      [currency]: {
        ...editedValues[currency],
        runnerPricing: {
          ...current,
          [section]: {
            ...(current as any)[section],
            [key]: {
              ...(current as any)[section]?.[key],
              [field]: safeValue,
            },
          },
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Admin
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Pricing Configuration</h1>
              <p className="text-slate-600">Manage fees and FX rates across all countries</p>
            </div>
            <button
              onClick={fetchConfig}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-emerald-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">Pricing Simulator</h2>
            <button
              onClick={runPricingSimulation}
              disabled={simLoading}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:scale-105 transition disabled:opacity-50"
            >
              {simLoading ? 'Calculating...' : 'Run simulation'}
            </button>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Preview customer price, runner earnings, and admin profit without creating a task.
          </p>
          <div className="grid md:grid-cols-5 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Currency</label>
              <select
                value={simCurrency}
                onChange={(e) => setSimCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                {Object.keys(countries).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
              <select
                value={simCategory}
                onChange={(e) => setSimCategory(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="small_item">Small Item</option>
                <option value="groceries">Groceries</option>
                <option value="heavy_items">Heavy Items</option>
                <option value="document_delivery">Document Delivery</option>
                <option value="express_errand">Express Errand</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zone</label>
              <select
                value={simZone}
                onChange={(e) => setSimZone(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="A">Zone A</option>
                <option value="B">Zone B</option>
                <option value="C">Zone C</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Distance (km)</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={simDistanceKm}
                onChange={(e) => setSimDistanceKm(Number(e.target.value || 0))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={simUrgent}
                  onChange={(e) => setSimUrgent(e.target.checked)}
                />
                Urgent task
              </label>
            </div>
          </div>
          {simResult && (
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500 mb-1">Customer price</p>
                <p className="text-xl font-bold text-slate-900">{simResult.customerPrice?.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Formula: {simResult.formulaCustomer?.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500 mb-1">Runner earnings</p>
                <p className="text-xl font-bold text-emerald-700">{simResult.runnerPay?.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Formula: {simResult.formulaRunner?.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500 mb-1">Admin profit</p>
                <p className="text-xl font-bold text-sky-700">{simResult.adminProfit?.toFixed(2)}</p>
                <p className="text-xs text-slate-500">{simResult.categoryName} · Zone {simResult.zone}</p>
              </div>
            </div>
          )}
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <strong>Important:</strong> Changes to pricing configuration affect all new tasks immediately. 
            Existing tasks retain their original pricing. FX rates should be updated regularly.
          </div>
        </div>

        {/* Country Cards */}
        <div className="grid gap-6">
          {Object.entries(countries).map(([currency, config]) => {
            const isEditing = editing[currency];
            const values = isEditing ? editedValues[currency] : config;
            const isSaving = saving[currency];

            return (
              <div key={currency} className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-sky-100 to-cyan-100 rounded-xl flex items-center justify-center">
                      <Globe className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{config.country}</h2>
                      <p className="text-sm text-slate-500">{currency}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleCancel(currency)}
                          disabled={isSaving}
                          className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSave(currency)}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500 to-cyan-500 text-white rounded-lg hover:scale-105 transition disabled:opacity-50"
                        >
                          {isSaving ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4" />
                              Save Changes
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleEdit(currency)}
                        className="px-4 py-2 border border-sky-200 text-sky-600 rounded-lg hover:bg-sky-50 transition"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* FX Rate */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      FX per ZAR
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={values?.fxPerZAR || 0}
                        onChange={(e) => handleChange(currency, 'fxPerZAR', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{config.fxPerZAR}</div>
                    )}
                  </div>

                  {/* Commission */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Commission %
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={(values?.commissionPct || 0) * 100}
                        onChange={(e) => handleChange(currency, 'commissionPct', (parseFloat(e.target.value) / 100).toString())}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{(config.commissionPct * 100).toFixed(0)}%</div>
                    )}
                  </div>

                  {/* Peak Multiplier */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Peak Multiplier %
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={(values?.peakMultiplier || 0) * 100}
                        onChange={(e) => handleChange(currency, 'peakMultiplier', (parseFloat(e.target.value) / 100).toString())}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{(config.peakMultiplier * 100).toFixed(0)}%</div>
                    )}
                  </div>

                  {/* Base Radius */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Base Radius (km)
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.5"
                        value={values?.baseRadiusKm || 0}
                        onChange={(e) => handleChange(currency, 'baseRadiusKm', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{config.baseRadiusKm} km</div>
                    )}
                  </div>

                  {/* Booking Fee */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Booking Fee
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={values?.bookingFeeLocal || 0}
                        onChange={(e) => handleChange(currency, 'bookingFeeLocal', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{config.bookingFeeLocal}</div>
                    )}
                  </div>

                  {/* Per KM Rate */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Per KM Rate
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={values?.perKmRateLocal || 0}
                        onChange={(e) => handleChange(currency, 'perKmRateLocal', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{config.perKmRateLocal}</div>
                    )}
                  </div>

                  {/* Heavy Surcharge */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Heavy Surcharge
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={values?.heavySurchargeLocal || 0}
                        onChange={(e) => handleChange(currency, 'heavySurchargeLocal', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{config.heavySurchargeLocal}</div>
                    )}
                  </div>

                  {/* Urgency Fee */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Urgency Fee
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={values?.urgencyFeeLocal || 0}
                        onChange={(e) => handleChange(currency, 'urgencyFeeLocal', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{config.urgencyFeeLocal}</div>
                    )}
                  </div>

                  {/* Volumetric Divisor */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Volumetric Divisor
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="1"
                        value={values?.volumetricDivisor || 5000}
                        onChange={(e) => handleChange(currency, 'volumetricDivisor', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-slate-900">{config.volumetricDivisor}</div>
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Parcel weight bands surcharge</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">≤ 2kg</label>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.1"
                          value={values?.parcelBandSurcharges?.upTo2kg ?? 0}
                          onChange={(e) => handleBandChange(currency, 'upTo2kg', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                        />
                      ) : (
                        <div className="text-lg font-bold text-slate-900">{config.parcelBandSurcharges.upTo2kg}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">&gt;2kg to 5kg</label>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.1"
                          value={values?.parcelBandSurcharges?.upTo5kg ?? 0}
                          onChange={(e) => handleBandChange(currency, 'upTo5kg', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                        />
                      ) : (
                        <div className="text-lg font-bold text-slate-900">{config.parcelBandSurcharges.upTo5kg}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">&gt;5kg to 10kg</label>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.1"
                          value={values?.parcelBandSurcharges?.upTo10kg ?? 0}
                          onChange={(e) => handleBandChange(currency, 'upTo10kg', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                        />
                      ) : (
                        <div className="text-lg font-bold text-slate-900">{config.parcelBandSurcharges.upTo10kg}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">&gt;10kg to 20kg</label>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.1"
                          value={values?.parcelBandSurcharges?.upTo20kg ?? 0}
                          onChange={(e) => handleBandChange(currency, 'upTo20kg', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                        />
                      ) : (
                        <div className="text-lg font-bold text-slate-900">{config.parcelBandSurcharges.upTo20kg}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">&gt;20kg per kg</label>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.1"
                          value={values?.parcelBandSurcharges?.above20kgPerKg ?? 0}
                          onChange={(e) => handleBandChange(currency, 'above20kgPerKg', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                        />
                      ) : (
                        <div className="text-lg font-bold text-slate-900">{config.parcelBandSurcharges.above20kgPerKg}</div>
                      )}
                    </div>
                  </div>
                </div>

                {values?.runnerPricing && (
                  <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">Runner pricing engine</h3>
                    <div className="grid md:grid-cols-3 gap-3 mb-4">
                      {Object.entries(values.runnerPricing.settings || {}).map(([k, v]) => (
                        <div key={k}>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">{k}</label>
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.1"
                              value={Number(v)}
                              onChange={(e) => handleRunnerPricingChange(currency, 'settings', '', k, e.target.value)}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                            />
                          ) : (
                            <div className="text-lg font-bold text-slate-900">{Number(v)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="grid md:grid-cols-3 gap-3 mb-4">
                      {Object.entries(values.runnerPricing.locationZones || {}).map(([zone, z]) => (
                        <div key={zone} className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500 mb-1">Zone {zone}</p>
                          <p className="text-sm font-semibold text-slate-800 mb-2">{z.name}</p>
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.1"
                              value={Number(z.distanceMultiplier)}
                              onChange={(e) =>
                                handleRunnerPricingChange(currency, 'locationZones', zone, 'distanceMultiplier', e.target.value)
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                            />
                          ) : (
                            <div className="text-lg font-bold text-slate-900">{Number(z.distanceMultiplier)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(values.runnerPricing.categories || {}).map(([cat, c]) => (
                        <div key={cat} className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500 mb-1">{cat}</p>
                          <p className="text-sm font-semibold text-slate-800 mb-2">{c.name}</p>
                          <div className="space-y-2">
                            {(['baseFee', 'runnerBaseFee', 'multiplier'] as const).map((field) => (
                              <div key={field}>
                                <label className="block text-[11px] text-slate-500 mb-1">{field}</label>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={Number((c as any)[field])}
                                    onChange={(e) =>
                                      handleRunnerPricingChange(currency, 'categories', cat, field, e.target.value)
                                    }
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                  />
                                ) : (
                                  <div className="text-sm font-bold text-slate-900">{Number((c as any)[field])}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ProtectedPricingConfigPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PricingConfigPage />
    </ProtectedRoute>
  );
}
