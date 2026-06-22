'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency, type CurrencyResolutionSource } from '@/contexts/CurrencyContext';

function isAdminUser(user: { role?: unknown } | null): boolean {
  if (!user?.role) return false;
  const r = Array.isArray(user.role) ? user.role : [user.role];
  return r.includes('admin') || r.includes('superadmin');
}

function longSourceLabel(s: CurrencyResolutionSource): string {
  const map: Record<CurrencyResolutionSource, string> = {
    profile: 'Account profile (country + preferred currency from API)',
    geo_cookie: 'Edge / geo_country cookie',
    prod_host_za: 'Production qwertymates host default (ZA / ZAR)',
    browser_hint: 'Browser timezone or locale region',
    local_storage: 'Saved country in localStorage',
    platform_default: 'NEXT_PUBLIC_DEFAULT_COUNTRY / platform default',
    manual_ui: 'User changed region in the currency selector',
  };
  return map[s] ?? s;
}

function shortSource(s: CurrencyResolutionSource): string {
  const map: Record<CurrencyResolutionSource, string> = {
    profile: 'profile',
    geo_cookie: 'geo',
    prod_host_za: 'prod',
    browser_hint: 'browser',
    local_storage: 'saved',
    platform_default: 'default',
    manual_ui: 'manual',
  };
  return map[s] ?? s;
}

/**
 * Fixed admin-only readout of resolved country, currency, and resolution source
 * (confirms ZA/ZAR path vs INR fallbacks in production).
 */
export function CurrencyDiagnosticsBadge() {
  const { user } = useAuth();
  const { countryCode, currency, currencySource, loading } = useCurrency();

  const admin = isAdminUser(user);
  const title = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const tz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch {
        return '';
      }
    })();
    const geo = (() => {
      const m = document.cookie.match(/(?:^|; )geo_country=([^;]*)/);
      return m?.[1] ? decodeURIComponent(m[1]) : '(none)';
    })();
    const lines = [
      `Country: ${countryCode}`,
      `Currency: ${currency}`,
      `Source: ${longSourceLabel(currencySource)}`,
      `Host: ${window.location.hostname}`,
      `Time zone: ${tz || '(unknown)'}`,
      `geo_country cookie: ${geo}`,
      loading ? 'FX rates: loading' : 'FX rates: loaded',
    ];
    return lines.join('\n');
  }, [countryCode, currency, currencySource, loading]);

  if (!admin) return null;

  return (
    <div
      className="fixed left-2 bottom-[5.5rem] sm:left-4 sm:bottom-10 z-[35] pointer-events-none max-w-[min(100%,18rem)]"
      aria-hidden
    >
      <div
        className="pointer-events-auto rounded-md border border-amber-200/90 bg-amber-50/95 px-2 py-1 text-[10px] leading-snug text-amber-950 shadow-sm font-mono tabular-nums"
        title={title}
      >
        <span className="font-semibold text-amber-900">FX</span>{' '}
        <span>
          {countryCode} · {currency} · {shortSource(currencySource)}
        </span>
      </div>
    </div>
  );
}
