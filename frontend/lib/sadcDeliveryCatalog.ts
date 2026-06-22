import type { PaxiCourierOption } from '@/lib/paxiDisplay';

export type SadcDeliveryScope = 'local' | 'crossborder';

export type ProgrammedSadcOption = PaxiCourierOption & { key: string };

type SeedRow = {
  key: string;
  providerSlug: string;
  providerName: string;
  serviceLabel: string;
  zone?: string;
  priceZar: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
};

/** Approximate ZAR display until /checkout/sadc-catalog hydrates live tariffIds. */
const CROSSBORDER_BY_COUNTRY: Record<string, SeedRow[]> = {
  BW: [
    { key: 'ic-bw', providerSlug: 'icexpress', providerName: 'ICExpress', serviceLabel: 'Road freight (0–5 kg)', priceZar: 420, minDeliveryDays: 5, maxDeliveryDays: 10 },
    { key: 'bex-bw', providerSlug: 'bex-express', providerName: 'BEX Express', serviceLabel: 'Express road (0–5 kg)', priceZar: 360, minDeliveryDays: 1, maxDeliveryDays: 3 },
    { key: 'tri-bw', providerSlug: 'triton-express', providerName: 'Triton Express', serviceLabel: 'Regional (0–5 kg)', priceZar: 380, minDeliveryDays: 1, maxDeliveryDays: 3 },
  ],
  NA: [
    { key: 'ic-na', providerSlug: 'icexpress', providerName: 'ICExpress', serviceLabel: 'Road freight (0–5 kg)', priceZar: 450, minDeliveryDays: 5, maxDeliveryDays: 10 },
    { key: 'bex-na', providerSlug: 'bex-express', providerName: 'BEX Express', serviceLabel: 'Express road (0–5 kg)', priceZar: 390, minDeliveryDays: 2, maxDeliveryDays: 3 },
    { key: 'tri-na', providerSlug: 'triton-express', providerName: 'Triton Express', serviceLabel: 'Regional (0–5 kg)', priceZar: 400, minDeliveryDays: 2, maxDeliveryDays: 4 },
  ],
  LS: [
    { key: 'ic-ls', providerSlug: 'icexpress', providerName: 'ICExpress', serviceLabel: 'Road freight (0–5 kg)', priceZar: 380, minDeliveryDays: 5, maxDeliveryDays: 9 },
    { key: 'bex-ls', providerSlug: 'bex-express', providerName: 'BEX Express', serviceLabel: 'Express road (0–5 kg)', priceZar: 340, minDeliveryDays: 1, maxDeliveryDays: 3 },
    { key: 'tri-ls', providerSlug: 'triton-express', providerName: 'Triton Express', serviceLabel: 'Regional (0–5 kg)', priceZar: 360, minDeliveryDays: 1, maxDeliveryDays: 3 },
  ],
  SZ: [
    { key: 'bex-sz', providerSlug: 'bex-express', providerName: 'BEX Express', serviceLabel: 'Express road (0–5 kg)', priceZar: 350, minDeliveryDays: 2, maxDeliveryDays: 3 },
  ],
  ZW: [
    { key: 'ic-zw', providerSlug: 'icexpress', providerName: 'ICExpress', serviceLabel: 'Road freight (0–5 kg)', priceZar: 480, minDeliveryDays: 6, maxDeliveryDays: 10 },
    { key: 'tri-zw', providerSlug: 'triton-express', providerName: 'Triton Express', serviceLabel: 'Regional (0–10 kg)', priceZar: 450, minDeliveryDays: 3, maxDeliveryDays: 7 },
  ],
  ZM: [
    { key: 'ic-zm', providerSlug: 'icexpress', providerName: 'ICExpress', serviceLabel: 'Road freight (0–5 kg)', priceZar: 500, minDeliveryDays: 6, maxDeliveryDays: 10 },
  ],
  MZ: [
    { key: 'ic-mz', providerSlug: 'icexpress', providerName: 'ICExpress', serviceLabel: 'Road freight (0–5 kg)', priceZar: 520, minDeliveryDays: 7, maxDeliveryDays: 12 },
    { key: 'tri-mz', providerSlug: 'triton-express', providerName: 'Triton Express', serviceLabel: 'Regional (0–10 kg)', priceZar: 470, minDeliveryDays: 4, maxDeliveryDays: 8 },
  ],
};

const LOCAL_BW: SeedRow[] = [
  { key: 'bp-0-1', providerSlug: 'botswanapost', providerName: 'BotswanaPost', serviceLabel: '0–1 kg', zone: 'National', priceZar: 47, minDeliveryDays: 3, maxDeliveryDays: 7 },
  { key: 'bp-5-10', providerSlug: 'botswanapost', providerName: 'BotswanaPost', serviceLabel: '5–10 kg', zone: 'National', priceZar: 223, minDeliveryDays: 3, maxDeliveryDays: 7 },
  { key: 'bp-20-50', providerSlug: 'botswanapost', providerName: 'BotswanaPost', serviceLabel: '20–50 kg', zone: 'National', priceZar: 493, minDeliveryDays: 4, maxDeliveryDays: 8 },
  { key: 'dil-gab-0-1', providerSlug: 'dilwana', providerName: 'Dilwana Courier', serviceLabel: '0–1 kg', zone: 'Gaborone local', priceZar: 47, minDeliveryDays: 1, maxDeliveryDays: 3 },
  { key: 'dil-gab-5-10', providerSlug: 'dilwana', providerName: 'Dilwana Courier', serviceLabel: '5–10 kg', zone: 'Gaborone local', priceZar: 81, minDeliveryDays: 1, maxDeliveryDays: 3 },
  { key: 'dil-ft-0-5', providerSlug: 'dilwana', providerName: 'Dilwana Courier', serviceLabel: '0–5 kg', zone: 'Francistown', priceZar: 223, minDeliveryDays: 2, maxDeliveryDays: 5 },
  { key: 'dil-ft-20-50', providerSlug: 'dilwana', providerName: 'Dilwana Courier', serviceLabel: '20–50 kg', zone: 'Francistown', priceZar: 493, minDeliveryDays: 3, maxDeliveryDays: 6 },
];

function rowsToOptions(rows: SeedRow[]): ProgrammedSadcOption[] {
  return rows.map((r) => ({
    key: r.key,
    tariffId: '',
    providerSlug: r.providerSlug,
    providerName: r.providerName,
    serviceLabel: r.serviceLabel,
    zone: r.zone,
    priceZar: r.priceZar,
    minDeliveryDays: r.minDeliveryDays,
    maxDeliveryDays: r.maxDeliveryDays,
  }));
}

export function countryHasLocalDelivery(country: string): boolean {
  return String(country || '').trim().toUpperCase() === 'BW';
}

export function getProgrammedSadcOptions(
  country: string,
  scope: SadcDeliveryScope
): ProgrammedSadcOption[] {
  const cc = String(country || '').trim().toUpperCase();
  if (!cc || cc === 'ZA') return [];
  if (scope === 'local') {
    if (cc === 'BW') return rowsToOptions(LOCAL_BW);
    return [];
  }
  return rowsToOptions(CROSSBORDER_BY_COUNTRY[cc] || []);
}

function matchKey(row: ProgrammedSadcOption, api: PaxiCourierOption): boolean {
  if (row.providerSlug && api.providerSlug && row.providerSlug === api.providerSlug) {
    if (row.serviceLabel === api.serviceLabel) {
      const rz = (row.zone || '').trim();
      const az = (api.zone || '').trim();
      return !rz || !az || rz === az;
    }
  }
  return false;
}

export function mergeProgrammedSadcWithApi(
  programmed: ProgrammedSadcOption[],
  apiRows: PaxiCourierOption[]
): ProgrammedSadcOption[] {
  const used = new Set<string>();
  const merged = programmed.map((row) => {
    const live = apiRows.find((r) => matchKey(row, r) && !used.has(r.tariffId));
    if (!live?.tariffId) return row;
    used.add(live.tariffId);
    const cur = String((live as { checkoutCurrency?: string }).checkoutCurrency || '').toUpperCase();
    return {
      ...row,
      tariffId: live.tariffId,
      priceZar: live.priceZar,
      checkoutCurrency: cur || (row as { checkoutCurrency?: string }).checkoutCurrency,
      serviceLabel: live.serviceLabel || row.serviceLabel,
      zone: live.zone || row.zone,
      minDeliveryDays: live.minDeliveryDays,
      maxDeliveryDays: live.maxDeliveryDays,
      providerName: live.providerName || row.providerName,
      providerSlug: live.providerSlug || row.providerSlug,
    };
  });

  for (const r of apiRows) {
    if (used.has(r.tariffId)) continue;
    merged.push({
      key: `api:${r.tariffId}`,
      tariffId: r.tariffId,
      providerSlug: r.providerSlug,
      providerName: r.providerName,
      serviceLabel: r.serviceLabel,
      zone: r.zone,
      priceZar: r.priceZar,
      minDeliveryDays: r.minDeliveryDays,
      maxDeliveryDays: r.maxDeliveryDays,
    });
  }

  return merged.sort((a, b) => a.priceZar - b.priceZar);
}

export function sadcOptionSelectId(opt: ProgrammedSadcOption): string {
  return opt.tariffId || `key:${opt.key}`;
}
