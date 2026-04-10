'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { getCurrencyForCountry } from '@/lib/countryCurrency';
import { useAuth } from '@/contexts/AuthContext';

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

function readGeoCookieCountry(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|; )geo_country=([^;]*)/);
  if (!m?.[1]) return null;
  const v = decodeURIComponent(m[1]).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function intlLocaleForCurrency(currency: string): string {
  const c = currency.toUpperCase();
  if (c === 'INR') return 'en-IN';
  if (c === 'ZAR') return 'en-ZA';
  if (c === 'EUR') return 'de-DE';
  if (c === 'CAD') return 'en-CA';
  if (c === 'GBP') return 'en-GB';
  return 'en-US';
}

function browserHintCountry(): string | null {
  if (typeof window === 'undefined') return null;

  // Strong hint first: timezone (works even when CDN geo headers are absent).
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (tz === 'Africa/Johannesburg' || tz.startsWith('Africa/')) return 'ZA';

  // Secondary hint: locale region (e.g. en-ZA).
  const nav = window.navigator;
  const rawLocale = nav.language || (Array.isArray(nav.languages) ? nav.languages[0] : '') || '';
  const locale = String(rawLocale).trim();
  const parts = locale.split('-');
  const region = parts.length >= 2 ? String(parts[1]).toUpperCase() : '';
  if (/^[A-Z]{2}$/.test(region)) return region;

  return null;
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrency] = useState(getCurrencyForCountry(PLATFORM_DEFAULT));
  const [countryCode, setCountryCode] = useState(PLATFORM_DEFAULT);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [loading, setLoading] = useState(true);

  /** Logged-in: phone-derived locale from API (strict). Anonymous: geo cookie → localStorage. */
  useEffect(() => {
    const u = user as { countryCode?: string; preferredCurrency?: string } | null;
    if (u?.countryCode && u?.preferredCurrency) {
      setCountryCode(String(u.countryCode).toUpperCase());
      setCurrency(String(u.preferredCurrency).toUpperCase());
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, String(u.countryCode).toUpperCase());
      return;
    }
    const geo = readGeoCookieCountry();
    if (geo) {
      setCountryCode(geo);
      setCurrency(getCurrencyForCountry(geo));
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, geo);
      return;
    }
    const browserCountry = browserHintCountry();
    if (browserCountry) {
      setCountryCode(browserCountry);
      setCurrency(getCurrencyForCountry(browserCountry));
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, browserCountry);
      return;
    }
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored && /^[A-Z]{2}$/i.test(stored)) {
      const country = stored.toUpperCase();
      setCountryCode(country);
      setCurrency(getCurrencyForCountry(country));
    }
  }, [user]);

  useEffect(() => {
    api
      .get('/fx/rates')
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

  const convertUsd = useCallback(
    (amountUsd: number): number => {
      const rate = rates[currency] ?? rates[currency.toUpperCase()];
      if (!rate) return amountUsd;
      return Math.round(amountUsd * rate * 100) / 100;
    },
    [rates, currency]
  );

  const formatPrice = useCallback(
    (amountUsd: number): string => {
      const local = convertUsd(amountUsd);
      return new Intl.NumberFormat(intlLocaleForCurrency(currency), {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(local);
    },
    [convertUsd, currency]
  );

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
      formatPrice: (n: number) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n),
      loading: false,
    };
  }
  return ctx;
}
