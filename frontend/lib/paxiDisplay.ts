export type PaxiCourierOption = {
  tariffId: string;
  providerName: string;
  providerSlug?: string;
  serviceLabel: string;
  zone?: string;
  priceZar: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
};

/** Shown on every PAXI line (matches programmed tariff spec). */
export const PAXI_PARCEL_SPECS =
  '(45cm Max. width - 37cm Max. height - 5kg Max. weight)';

/** Stable display order for the six ZA PAXI services. */
const PAXI_SORT_KEYS = [
  'standard-economy',
  'standard-speed',
  'large-economy',
  'large-speed',
  'store-home-standard',
  'store-home-large',
] as const;

function paxiSortKey(serviceLabel: string): string {
  const s = serviceLabel.toLowerCase();
  if (s.includes('store to home') && s.includes('large')) return 'store-home-large';
  if (s.includes('store to home')) return 'store-home-standard';
  if (s.includes('large') && s.includes('economy')) return 'large-economy';
  if (s.includes('large') && s.includes('speed')) return 'large-speed';
  if (s.includes('economy')) return 'standard-economy';
  if (s.includes('speed')) return 'standard-speed';
  return s;
}

/** Customer-facing line: Standard - Economy 7-9 Business Days (dims…) */
export function formatPaxiOptionTitle(opt: PaxiCourierOption): string {
  const label = opt.serviceLabel
    .replace(/\s*—\s*/g, ' - ')
    .replace(/\s*\(\d+–\d+\s+business\s+days\)/gi, '')
    .replace(/\s*\(\d+-\d+\s+business\s+days\)/gi, '')
    .trim();
  const days = `${opt.minDeliveryDays}-${opt.maxDeliveryDays} Business Days`;
  return `${label}  ${days} ${PAXI_PARCEL_SPECS}`;
}

export function isPaxiOption(opt: PaxiCourierOption): boolean {
  const slug = String(opt.providerSlug || '').toLowerCase();
  if (slug === 'paxi') return true;
  return opt.providerName.toLowerCase().includes('paxi');
}

export function filterAndSortPaxiOptions(options: PaxiCourierOption[]): PaxiCourierOption[] {
  const paxi = options.filter(isPaxiOption);
  paxi.sort((a, b) => {
    const ia = PAXI_SORT_KEYS.indexOf(paxiSortKey(a.serviceLabel) as (typeof PAXI_SORT_KEYS)[number]);
    const ib = PAXI_SORT_KEYS.indexOf(paxiSortKey(b.serviceLabel) as (typeof PAXI_SORT_KEYS)[number]);
    const ai = ia >= 0 ? ia : 99;
    const bi = ib >= 0 ? ib : 99;
    return ai - bi || a.priceZar - b.priceZar;
  });
  return paxi;
}
