export type PublicProfileLocation = {
  enabled: boolean;
  label?: string;
  lat?: number;
  lng?: number;
};

export function hasPublicProfileMapCoords(loc?: PublicProfileLocation | null): boolean {
  if (!loc?.enabled) return false;
  const lat = loc.lat;
  const lng = loc.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function googleMapsEmbedUrl(lat: number, lng: number, label?: string): string {
  const q = label?.trim()
    ? encodeURIComponent(label.trim())
    : encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps?q=${q}&ll=${lat},${lng}&z=14&output=embed`;
}

export function googleMapsOpenUrl(lat: number, lng: number, label?: string): string {
  const q = label?.trim()
    ? encodeURIComponent(label.trim())
    : encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
