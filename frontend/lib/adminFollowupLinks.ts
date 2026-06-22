/** Admin dashboard: quick links to follow up on KYC / documents (WhatsApp, email, map). */

export type AdminFollowupContext = 'merchant' | 'runner' | 'supplier' | 'task_client' | 'task_runner';

const COUNTRY_LABEL: Record<string, string> = {
  ZA: 'South Africa',
  BW: 'Botswana',
  LS: 'Lesotho',
  ZW: 'Zimbabwe',
  MZ: 'Mozambique',
  NA: 'Namibia',
  ZM: 'Zambia',
  SZ: 'Eswatini',
  MW: 'Malawi',
  KE: 'Kenya',
  NG: 'Nigeria',
  GH: 'Ghana',
  US: 'United States',
  GB: 'United Kingdom',
};

export function digitsOnlyPhone(phone: string | undefined | null): string {
  return String(phone || '').replace(/\D/g, '');
}

function docFollowupBody(displayName: string, context: AdminFollowupContext): string {
  const n = String(displayName || 'there').trim() || 'there';
  if (context === 'runner') {
    return `Hi ${n}, this is Qwertymates admin regarding your runner verification documents. Please reply with any missing files or questions. Thank you.`;
  }
  if (context === 'supplier') {
    return `Hi ${n}, this is Qwertymates admin regarding your supplier / seller application documents. Please reply with the requested files or questions. Thank you.`;
  }
  if (context === 'task_client') {
    return `Hi ${n}, this is Qwertymates admin following up on your errand task (documents or details we need). Please reply here with photos, receipts, or questions. Thank you.`;
  }
  if (context === 'task_runner') {
    return `Hi ${n}, this is Qwertymates admin regarding an errand task you are linked to. Please reply with any requested proof or updates. Thank you.`;
  }
  return `Hi ${n}, this is Qwertymates admin regarding your merchant agent application documents. Please reply with the requested files or questions. Thank you.`;
}

export function buildWhatsAppDocFollowupUrl(
  phone: string | undefined | null,
  displayName: string,
  context: AdminFollowupContext
): string | null {
  const d = digitsOnlyPhone(phone);
  if (!d) return null;
  const text = docFollowupBody(displayName, context);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function buildMailtoDocFollowupUrl(
  email: string | undefined | null,
  displayName: string,
  context: AdminFollowupContext
): string | null {
  const e = String(email || '').trim();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  const subject =
    context === 'runner'
      ? 'Qwertymates — runner documents'
      : context === 'supplier'
        ? 'Qwertymates — supplier documents'
        : context === 'task_client'
          ? 'Qwertymates — your errand task'
          : context === 'task_runner'
            ? 'Qwertymates — errand task update'
            : 'Qwertymates — merchant agent documents';
  const body = docFollowupBody(displayName, context);
  return `mailto:${e}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** GeoJSON Point: coordinates [lng, lat] */
export function buildGoogleMapsUrlFromCoordinates(coords: number[] | undefined | null): string | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return `https://www.google.com/maps?q=${lat},${lng}&z=12`;
}

export function formatCountryHint(code: string | undefined | null): string | null {
  const c = String(code || '').trim().toUpperCase();
  if (!c || c.length !== 2) return null;
  return COUNTRY_LABEL[c] || c;
}
