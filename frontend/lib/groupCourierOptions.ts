import type { CourierOption } from '@/components/CourierDeliveryPicker';

/** Matches backend PAXI zone labels (courierSeed.ts). */
export const PAXI_STANDARD_ZONE =
  'Standard (45 cm max width · 37 cm max height · 5 kg max weight)';
export const PAXI_LARGE_ZONE =
  'Large (45 cm max width · 37 cm max height · 5 kg max weight)';
export const PAXI_STORE_TO_HOME_ZONE =
  'Store to Home (45 cm max width · 37 cm max height · 5 kg max weight)';

export type CourierDisplaySubsection = {
  title?: string;
  options: CourierOption[];
};

export type CourierDisplayGroup = {
  id: string;
  title: string;
  subsections: CourierDisplaySubsection[];
};

function resolveProviderSlug(opt: CourierOption): string {
  const slug = String(opt.providerSlug || '').toLowerCase();
  if (slug) return slug;
  const name = opt.providerName.toLowerCase();
  if (name.includes('paxi')) return 'paxi';
  if (name.includes('pudo')) return 'pudo';
  if (name.includes('courier guy')) return 'courier-guy';
  return 'other';
}

function displayGroupId(opt: CourierOption): 'paxi' | 'courier-guy' | 'other' {
  const slug = resolveProviderSlug(opt);
  if (slug === 'paxi') return 'paxi';
  if (slug === 'courier-guy' || slug === 'pudo') return 'courier-guy';
  return 'other';
}

function normalizePaxiZone(zone?: string): string {
  const z = String(zone || '').trim();
  if (!z) return 'Other PAXI options';
  const lower = z.toLowerCase();
  if (lower.includes('store to home')) return PAXI_STORE_TO_HOME_ZONE;
  if (lower.startsWith('large')) return PAXI_LARGE_ZONE;
  if (lower.includes('standard')) return PAXI_STANDARD_ZONE;
  return z;
}

function sortOptions(opts: CourierOption[], sort: 'price' | 'speed'): CourierOption[] {
  const copy = [...opts];
  if (sort === 'speed') {
    copy.sort((a, b) => a.minDeliveryDays - b.minDeliveryDays || a.priceZar - b.priceZar);
  } else {
    copy.sort((a, b) => a.priceZar - b.priceZar || a.minDeliveryDays - b.minDeliveryDays);
  }
  return copy;
}

/** Group PAXI by Standard / Large / Store to Home with dimension headers. */
export function buildCourierDisplayGroups(
  options: CourierOption[],
  sort: 'price' | 'speed'
): CourierDisplayGroup[] {
  const paxi: CourierOption[] = [];
  const tcgDoor: CourierOption[] = [];
  const tcgPudo: CourierOption[] = [];
  const other: CourierOption[] = [];

  for (const opt of options) {
    const slug = resolveProviderSlug(opt);
    const group = displayGroupId(opt);
    if (group === 'paxi') paxi.push(opt);
    else if (slug === 'pudo') tcgPudo.push(opt);
    else if (group === 'courier-guy') tcgDoor.push(opt);
    else other.push(opt);
  }

  const groups: CourierDisplayGroup[] = [];

  if (paxi.length) {
    const byZone = new Map<string, CourierOption[]>();
    for (const opt of paxi) {
      const zone = normalizePaxiZone(opt.zone);
      if (!byZone.has(zone)) byZone.set(zone, []);
      byZone.get(zone)!.push(opt);
    }
    const zoneOrder = [PAXI_STANDARD_ZONE, PAXI_LARGE_ZONE, PAXI_STORE_TO_HOME_ZONE];
    const subsections: CourierDisplaySubsection[] = [];
    for (const zoneTitle of zoneOrder) {
      const opts = byZone.get(zoneTitle);
      if (opts?.length) {
        subsections.push({ title: zoneTitle, options: sortOptions(opts, sort) });
        byZone.delete(zoneTitle);
      }
    }
    for (const [title, opts] of byZone) {
      subsections.push({ title, options: sortOptions(opts, sort) });
    }
    groups.push({ id: 'paxi', title: '1. PAXI', subsections });
  }

  if (tcgDoor.length || tcgPudo.length) {
    const subsections: CourierDisplaySubsection[] = [];
    if (tcgDoor.length) {
      subsections.push({
        title: 'Local standard door-to-door (from R100)',
        options: sortOptions(tcgDoor, sort),
      });
    }
    if (tcgPudo.length) {
      subsections.push({
        title: 'Pudo (by The Courier Guy) — from R60',
        options: sortOptions(tcgPudo, sort),
      });
    }
    groups.push({ id: 'courier-guy', title: '2. The Courier Guy', subsections });
  }

  if (other.length) {
    groups.push({
      id: 'other',
      title: 'Other couriers',
      subsections: [{ options: sortOptions(other, sort) }],
    });
  }

  return groups;
}
