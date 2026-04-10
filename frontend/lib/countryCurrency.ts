/**
 * Country → display currency (EU/US → USD, India → INR, Africa etc. per phoneCountryCurrency).
 */
import { currencyFromCountryIso } from './phoneCountryCurrency';

/** @deprecated use currencyFromCountryIso — kept for older imports */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {};

export function getCurrencyForCountry(countryCode: string): string {
  return currencyFromCountryIso(countryCode);
}
