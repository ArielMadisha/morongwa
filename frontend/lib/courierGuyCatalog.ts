import type { PaxiCourierOption } from '@/lib/paxiDisplay';

export type DeliveryProvider = 'paxi' | 'courier-guy';

export type ProgrammedDeliveryOption = PaxiCourierOption & { key: string };

/** The Courier Guy door-to-door + Pudo locker (shown instantly; tariffId from API). */
export const PROGRAMMED_COURIER_GUY_ZA: ProgrammedDeliveryOption[] = [
  {
    key: 'door-to-door',
    tariffId: '',
    providerName: 'The Courier Guy',
    providerSlug: 'courier-guy',
    serviceLabel: 'Standard door-to-door (from R100)',
    priceZar: 100,
    minDeliveryDays: 2,
    maxDeliveryDays: 5,
  },
  {
    key: 'pudo-locker',
    tariffId: '',
    providerName: 'Pudo (The Courier Guy)',
    providerSlug: 'pudo',
    serviceLabel: 'Locker-to-locker (up to 5 kg)',
    priceZar: 60,
    minDeliveryDays: 2,
    maxDeliveryDays: 4,
  },
];

function tcgSortKey(serviceLabel: string, providerSlug?: string): string {
  const slug = String(providerSlug || '').toLowerCase();
  if (slug === 'pudo') return 'pudo-locker';
  const s = serviceLabel.toLowerCase();
  if (s.includes('locker')) return 'pudo-locker';
  return 'door-to-door';
}

export function mergeProgrammedCourierGuyWithApi(
  programmed: ProgrammedDeliveryOption[],
  apiRows: PaxiCourierOption[]
): ProgrammedDeliveryOption[] {
  const byKey = new Map(
    apiRows.map((r) => [tcgSortKey(r.serviceLabel, r.providerSlug), r])
  );
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
      providerName: live.providerName || row.providerName,
      providerSlug: live.providerSlug || row.providerSlug,
    };
  });
}

export function deliveryOptionSelectId(opt: ProgrammedDeliveryOption): string {
  return opt.tariffId || `key:${opt.key}`;
}
