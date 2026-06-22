export type PublicProfileKind = 'individual' | 'school' | 'business';

export function formatPublicContactPhone(phone?: string | null): string {
  const raw = String(phone || '').replace(/\D/g, '');
  if (!raw) return '';
  if (raw.startsWith('27') && raw.length === 11) {
    return `+27 ${raw.slice(2, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`;
  }
  if (raw.startsWith('267') && raw.length === 11) {
    return `+267 ${raw.slice(3, 5)} ${raw.slice(5, 8)} ${raw.slice(8)}`;
  }
  if (raw.startsWith('256') && raw.length === 12) {
    return `+256 ${raw.slice(3, 6)} ${raw.slice(6)}`;
  }
  return raw;
}

export function publicContactPhoneFromUser(user: {
  publicContactPhone?: string | null;
  publicProfileKind?: PublicProfileKind | null;
} | null | undefined): string {
  const phone = String(user?.publicContactPhone || '').trim();
  return phone ? formatPublicContactPhone(phone) : '';
}
