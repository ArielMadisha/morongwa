'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { getCurrencyForCountry } from '@/lib/countryCurrency';

interface CurrencyContextType {
  currency: string;
  countryCode: string;
  rates: Record<string, number>;
  setCountry: (code: string) => void;
  convertUsd: (amountUsd: number) => number;
  formatPrice: (amountUsd: number) => string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const STORAGE_KEY = 'qwertymates_country';
const PLATFORM_DEFAULT = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEFAULT_COUNTRY) || 'ZA';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState(getCurrencyForCountry(PLATFORM_DEFAULT));
  const [countryCode, setCountryCode] = useState(PLATFORM_DEFAULT);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      // RSA-focused platform: don't use US – default to ZA so prices show in ZAR
      const country = stored === 'US' ? PLATFORM_DEFAULT : stored;
      setCountryCode(country);
      setCurrency(getCurrencyForCountry(country));
    }
  }, []);

  useEffect(() => {
    api.get('/fx/rates')
      .then((res) => {
        const r = res.data?.rates ?? {};
        setRates(r);
      })
      .catch(() => setRates({ USD: 1, ZAR: 18.5, EUR: 0.92 }))
      .finally(() => setLoading(false));
  }, []);

  const setCountry = useCallback((code: string) => {
    const c = (code || 'ZA').toUpperCase().trim();
    setCountryCode(c);
    setCurrency(getCurrencyForCountry(c));
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, c);
  }, []);

  const convertUsd = useCallback((amountUsd: number): number => {
    const rate = rates[currency] ?? rates[currency.toUpperCase()];
    if (!rate) return amountUsd;
    return Math.round(amountUsd * rate * 100) / 100;
  }, [rates, currency]);

  const formatPrice = useCallback((amountUsd: number): string => {
    const local = convertUsd(amountUsd);
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(local);
  }, [convertUsd, currency]);

  return (
    <CurrencyContext.Provider value={{ currency, countryCode, rates, setCountry, convertUsd, formatPrice, loading }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    return {
      currency: 'USD',
      countryCode: 'US',
      rates: { USD: 1 },
      setCountry: () => {},
      convertUsd: (n: number) => n,
      formatPrice: (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n),
      loading: false,
    };
  }
  return ctx;
}
