import type { PaxiCourierOption } from '@/lib/paxiDisplay';
import { PAXI_PARCEL_SPECS } from '@/lib/paxiDisplay';

export type ProgrammedPaxiOption = PaxiCourierOption & { key: string };

/** Programmed ZA PAXI — shown instantly on cart; tariffId filled from /checkout/paxi-catalog. */
export const PROGRAMMED_PAXI_ZA: ProgrammedPaxiOption[] = [
  {
    key: 'standard-economy',
    tariffId: '',
    providerName: 'PAXI',
    providerSlug: 'paxi',
    serviceLabel: 'Standard — Economy (7–9 business days)',
    zone: `Standard ${PAXI_PARCEL_SPECS}`,
    priceZar: 59.95,
    minDeliveryDays: 7,
    maxDeliveryDays: 9,
  },
  {
    key: 'standard-speed',
    tariffId: '',
    providerName: 'PAXI',
    providerSlug: 'paxi',
    serviceLabel: 'Standard — Speed (7–9 business days)',
    zone: `Standard ${PAXI_PARCEL_SPECS}`,
    priceZar: 109.95,
    minDeliveryDays: 7,
    maxDeliveryDays: 9,
  },
  {
    key: 'large-economy',
    tariffId: '',
    providerName: 'PAXI',
    providerSlug: 'paxi',
    serviceLabel: 'Large — Economy (7–9 business days)',
    zone: `Large ${PAXI_PARCEL_SPECS}`,
    priceZar: 119.95,
    minDeliveryDays: 7,
    maxDeliveryDays: 9,
  },
  {
    key: 'large-speed',
    tariffId: '',
    providerName: 'PAXI',
    providerSlug: 'paxi',
    serviceLabel: 'Large — Speed (7–9 business days)',
    zone: `Large ${PAXI_PARCEL_SPECS}`,
    priceZar: 139.95,
    minDeliveryDays: 7,
    maxDeliveryDays: 9,
  },
  {
    key: 'store-home-standard',
    tariffId: '',
    providerName: 'PAXI',
    providerSlug: 'paxi',
    serviceLabel: 'Store to Home — Standard (3–5 business days)',
    zone: `Store to Home ${PAXI_PARCEL_SPECS}`,
    priceZar: 119.95,
    minDeliveryDays: 3,
    maxDeliveryDays: 5,
  },
  {
    key: 'store-home-large',
    tariffId: '',
    providerName: 'PAXI',
    providerSlug: 'paxi',
    serviceLabel: 'Store to Home — Large (3–5 business days)',
    zone: `Store to Home ${PAXI_PARCEL_SPECS}`,
    priceZar: 149.95,
    minDeliveryDays: 3,
    maxDeliveryDays: 5,
  },
];

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

/** Attach live tariffIds from API to programmed display rows. */
export function mergeProgrammedPaxiWithApi(
  programmed: ProgrammedPaxiOption[],
  apiRows: PaxiCourierOption[]
): ProgrammedPaxiOption[] {
  const byKey = new Map(apiRows.map((r) => [paxiSortKey(r.serviceLabel), r]));
  return programmed.map((row) => {
    const live = byKey.get(row.key);
    if (!live?.tariffId) return row;
    return {
      ...row,
      tariffId: live.tariffId,
      priceZar: live.priceZar,
      serviceLabel: live.serviceLabel || row.serviceLabel,
      zone: live.zone || row.zone,
      minDeliveryDays: live.minDeliveryDays,
      maxDeliveryDays: live.maxDeliveryDays,
    };
  });
}
