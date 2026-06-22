import type { User } from '@/lib/types';
import { getCitiesForCountry, RUNNER_SERVICE_COUNTRIES } from '@/lib/runnerServiceAreas';
import { storeCountryLabel } from '@/lib/storeCountries';

export function runnerCityLabel(cityId?: string | null, countryCode?: string | null): string {
  const id = String(cityId || '').trim().toLowerCase();
  if (!id) return '';
  const code = String(countryCode || '').trim().toUpperCase();
  const cities = code ? getCitiesForCountry(code) : RUNNER_SERVICE_COUNTRIES.flatMap((c) => c.cities);
  const hit = cities.find((c) => c.id === id);
  if (hit) return hit.name;
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Country + town for admin user tables and broadcast area context. */
export function formatUserAreaTown(
  user: Pick<User, 'countryCode' | 'runnerServiceCountry' | 'runnerServiceCity'>
): { country: string; town: string; line: string } {
  const code = user.runnerServiceCountry || user.countryCode;
  const country = storeCountryLabel(code);
  const town = runnerCityLabel(user.runnerServiceCity, code);
  const line =
    country !== '—' && town ? `${country} · ${town}` : country !== '—' ? country : town || '—';
  return { country: country !== '—' ? country : '—', town: town || '—', line };
}

function townFromAddress(addr?: string | null): string {
  const raw = String(addr || '').trim();
  if (!raw) return '';
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!;
  return '';
}

/** Country + town for admin supplier rows (user profile, store, or pickup address). */
export function formatSupplierAreaTown(sup: {
  userId?: Pick<User, 'countryCode' | 'runnerServiceCountry' | 'runnerServiceCity'>;
  country?: string | null;
  countryCode?: string | null;
  pickupAddress?: string | null;
  storeAddress?: string | null;
}): { country: string; town: string; line: string } {
  const userArea = formatUserAreaTown({
    countryCode: sup.userId?.countryCode || sup.countryCode || undefined,
    runnerServiceCountry: sup.userId?.runnerServiceCountry,
    runnerServiceCity: sup.userId?.runnerServiceCity,
  });

  let country = userArea.country;
  if (country === '—' && sup.country?.trim()) {
    country = sup.country.trim();
  }

  let town = userArea.town;
  if (town === '—') {
    const fromAddr = townFromAddress(sup.pickupAddress) || townFromAddress(sup.storeAddress);
    town = fromAddr || '—';
  }

  const line =
    country !== '—' && town !== '—' ? `${country} · ${town}` : country !== '—' ? country : town !== '—' ? town : '—';

  return { country, town, line };
}
