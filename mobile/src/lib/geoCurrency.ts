const COUNTRY_TO_CURRENCY: Record<string, string> = {
  ZA: "ZAR",
  LS: "LSL",
  BW: "BWP",
  NA: "NAD",
  SZ: "SZL",
  ZW: "USD",
  US: "USD",
  GB: "GBP",
  IN: "INR",
  EU: "EUR"
};

function safeLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-ZA";
  } catch {
    return "en-ZA";
  }
}

export function detectCountryCode(): string {
  const locale = safeLocale().trim();
  const parts = locale.split("-");
  if (parts.length >= 2) {
    const region = String(parts[parts.length - 1]).toUpperCase();
    if (/^[A-Z]{2}$/.test(region)) return region;
  }
  return "ZA";
}

export function currencyForCountry(countryCode?: string): string {
  const code = String(countryCode || "ZA").toUpperCase();
  return COUNTRY_TO_CURRENCY[code] || "USD";
}

export function formatMoney(price: number, currency?: string): string {
  const amount = Number.isFinite(price) ? price : 0;
  const locale = safeLocale();
  const resolvedCurrency = currency || currencyForCountry(detectCountryCode());
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: resolvedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}
