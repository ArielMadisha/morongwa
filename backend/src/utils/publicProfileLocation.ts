export type PublicProfileLocation = {
  enabled: boolean;
  label?: string;
  lat?: number;
  lng?: number;
};

function isValidCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function hasPublicProfileMapCoords(loc?: PublicProfileLocation | null): boolean {
  if (!loc?.enabled) return false;
  const lat = loc.lat;
  const lng = loc.lng;
  if (!isValidCoord(lat) || !isValidCoord(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function parsePublicProfileLocationUpdate(raw: unknown): PublicProfileLocation | null {
  if (raw === null) {
    return { enabled: false };
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true;
  const label =
    typeof o.label === "string" ? o.label.trim().slice(0, 200) : undefined;
  let lat: number | undefined;
  let lng: number | undefined;
  if (o.lat !== undefined && o.lat !== null) {
    const n = Number(o.lat);
    if (!isValidCoord(n) || n < -90 || n > 90) throw new Error("Invalid latitude");
    lat = Math.round(n * 1e6) / 1e6;
  }
  if (o.lng !== undefined && o.lng !== null) {
    const n = Number(o.lng);
    if (!isValidCoord(n) || n < -180 || n > 180) throw new Error("Invalid longitude");
    lng = Math.round(n * 1e6) / 1e6;
  }
  return {
    enabled,
    label: label || undefined,
    lat,
    lng,
  };
}

/** Visitors only see location when enabled and coordinates are set. Editors see stored values for settings UI. */
export function publicProfileLocationForViewer(
  loc: PublicProfileLocation | undefined | null,
  canEdit: boolean
): PublicProfileLocation | undefined {
  if (!loc) return undefined;
  if (canEdit) {
    return {
      enabled: !!loc.enabled,
      label: loc.label,
      lat: loc.lat,
      lng: loc.lng,
    };
  }
  if (!hasPublicProfileMapCoords(loc)) return undefined;
  return {
    enabled: true,
    label: loc.label,
    lat: loc.lat,
    lng: loc.lng,
  };
}

export async function geocodePlaceLabel(
  label: string
): Promise<{ lat: number; lng: number } | null> {
  const q = label.trim();
  if (q.length < 3) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Qwertymates/1.0 (profile-location)" },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const hit = rows?.[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!isValidCoord(lat) || !isValidCoord(lng)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
