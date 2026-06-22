/**
 * Country → display currency (EU/US → USD, Africa etc. per phoneCountryCurrency; INR is not used).
 */
import { currencyFromCountryIso } from './phoneCountryCurrency';

/** @deprecated use currencyFromCountryIso — kept for older imports */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {};

export function getCurrencyForCountry(countryCode: string): string {
  return currencyFromCountryIso(countryCode);
}
