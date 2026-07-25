/** Mock cash agents until live agent locator API ships. */

export type WalletAgent = {
  id: string;
  name: string;
  area: string;
  distanceKm: number;
  phone: string;
  hours: string;
};

export const MOCK_WALLET_AGENTS: WalletAgent[] = [
  { id: 'ag-1', name: 'Sandton Cash Point', area: 'Sandton, Johannesburg', distanceKm: 1.2, phone: '+27821234567', hours: '08:00–18:00' },
  { id: 'ag-2', name: 'Rosebank Express', area: 'Rosebank, Johannesburg', distanceKm: 3.4, phone: '+27829876543', hours: '09:00–17:00' },
  { id: 'ag-3', name: 'Pretoria CBD Hub', area: 'Pretoria Central', distanceKm: 48, phone: '+27123456789', hours: '08:30–16:30' },
];

export function generateDepositCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `DEP-${n}`;
}

export function generateWithdrawCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `WDR-${n}`;
}

export function generatePickupCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `PKP-${n}`;
}
