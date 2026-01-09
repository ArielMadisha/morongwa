'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Save, RefreshCw, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import toast from 'react-hot-toast';
import Link from 'next/link';

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

function PricingConfigPage() {
  const [countries, setCountries] = useState<Record<string, CountryConfig>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [editedValues, setEditedValues] = useState<Record<string, Partial<CountryConfig>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pricing/config`);
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

  const handleSave = async (currency: string) => {
    setSaving({ ...saving, [currency]: true });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pricing/config/${currency}`, {
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
                </div>
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
