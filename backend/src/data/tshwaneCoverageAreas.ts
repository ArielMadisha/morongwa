/**
 * City of Tshwane coverage for WhatsApp errands (Pretoria & Centurion metro).
 * Coordinates are approximate centroids for runner matching / map hints (not survey-grade).
 */

export type TshwaneRegionId =
  | "pretoria_central"
  | "pretoria_east"
  | "pretoria_north"
  | "northern_zone"
  | "centurion"
  | "eastern_rural"
  | "far_east";

export interface TshwaneTownship {
  id: string;
  name: string;
  regionId: TshwaneRegionId;
  /** WGS84 */
  lat: number;
  lng: number;
}

export const TSHWANE_REGION_ORDER: { id: TshwaneRegionId; label: string }[] = [
  { id: "pretoria_central", label: "Pretoria Central" },
  { id: "pretoria_east", label: "Pretoria East" },
  { id: "pretoria_north", label: "Pretoria North" },
  { id: "northern_zone", label: "Northern Zone" },
  { id: "centurion", label: "Centurion" },
  { id: "eastern_rural", label: "Eastern Rural" },
  { id: "far_east", label: "Far East" },
];

export const TSHWANE_TOWNSHIPS: TshwaneTownship[] = [
  // Pretoria Central
  { id: "pc_cbd", name: "CBD", regionId: "pretoria_central", lat: -25.7479, lng: 28.2293 },
  { id: "pc_sunnyside", name: "Sunnyside", regionId: "pretoria_central", lat: -25.7446, lng: 28.2134 },
  { id: "pc_arcadia", name: "Arcadia", regionId: "pretoria_central", lat: -25.7421, lng: 28.221 },
  { id: "pc_pretoria_west", name: "Pretoria West", regionId: "pretoria_central", lat: -25.7615, lng: 28.1675 },
  { id: "pc_hatfield", name: "Hatfield", regionId: "pretoria_central", lat: -25.7487, lng: 28.2384 },
  { id: "pc_brooklyn", name: "Brooklyn", regionId: "pretoria_central", lat: -25.7654, lng: 28.246 },
  // Pretoria East
  { id: "pe_mamelodi", name: "Mamelodi", regionId: "pretoria_east", lat: -25.7097, lng: 28.3514 },
  { id: "pe_nellmapius", name: "Nellmapius", regionId: "pretoria_east", lat: -25.7284, lng: 28.3785 },
  { id: "pe_eersterust", name: "Eersterust", regionId: "pretoria_east", lat: -25.6986, lng: 28.292 },
  { id: "pe_silver_lakes", name: "Silver Lakes", regionId: "pretoria_east", lat: -25.6518, lng: 28.318 },
  { id: "pe_moreleta_park", name: "Moreleta Park", regionId: "pretoria_east", lat: -25.831, lng: 28.305 },
  // Pretoria North
  { id: "pn_soshanguve", name: "Soshanguve", regionId: "pretoria_north", lat: -25.5136, lng: 28.0968 },
  { id: "pn_mabopane", name: "Mabopane", regionId: "pretoria_north", lat: -25.4968, lng: 28.098 },
  { id: "pn_winterveld", name: "Winterveld", regionId: "pretoria_north", lat: -25.482, lng: 28.082 },
  { id: "pn_ga_rankuwa", name: "Ga-Rankuwa", regionId: "pretoria_north", lat: -25.593, lng: 28.005 },
  { id: "pn_akasia", name: "Akasia", regionId: "pretoria_north", lat: -25.629, lng: 28.098 },
  { id: "pn_rosslyn", name: "Rosslyn", regionId: "pretoria_north", lat: -25.657, lng: 28.118 },
  // Northern Zone
  { id: "nz_hammanskraal", name: "Hammanskraal", regionId: "northern_zone", lat: -25.4086, lng: 28.2964 },
  { id: "nz_temba", name: "Temba", regionId: "northern_zone", lat: -25.362, lng: 28.268 },
  { id: "nz_kudube", name: "Kudube", regionId: "northern_zone", lat: -25.42, lng: 28.25 },
  { id: "nz_stinkwater", name: "Stinkwater", regionId: "northern_zone", lat: -25.38, lng: 28.22 },
  { id: "nz_suurman", name: "Suurman", regionId: "northern_zone", lat: -25.35, lng: 28.31 },
  // Centurion
  { id: "cen_cbd", name: "Centurion CBD", regionId: "centurion", lat: -25.8609, lng: 28.1895 },
  { id: "cen_olievenhoutbosch", name: "Olievenhoutbosch", regionId: "centurion", lat: -25.918, lng: 28.124 },
  { id: "cen_irene", name: "Irene", regionId: "centurion", lat: -25.887, lng: 28.225 },
  { id: "cen_lyttelton", name: "Lyttelton", regionId: "centurion", lat: -25.832, lng: 28.207 },
  { id: "cen_the_reeds", name: "The Reeds", regionId: "centurion", lat: -25.868, lng: 28.158 },
  // Eastern Rural
  { id: "er_cullinan", name: "Cullinan", regionId: "eastern_rural", lat: -25.6709, lng: 28.5236 },
  { id: "er_rayton", name: "Rayton", regionId: "eastern_rural", lat: -25.722, lng: 28.598 },
  { id: "er_refilwe", name: "Refilwe", regionId: "eastern_rural", lat: -25.698, lng: 28.56 },
  { id: "er_roodeplaat", name: "Roodeplaat", regionId: "eastern_rural", lat: -25.648, lng: 28.412 },
  // Far East
  { id: "fe_bronkhorstspruit", name: "Bronkhorstspruit", regionId: "far_east", lat: -25.8106, lng: 28.7417 },
  { id: "fe_zithobeni", name: "Zithobeni", regionId: "far_east", lat: -25.792, lng: 28.782 },
  { id: "fe_ekangala", name: "Ekangala", regionId: "far_east", lat: -25.698, lng: 28.682 },
];

const byId = new Map<string, TshwaneTownship>();
for (const t of TSHWANE_TOWNSHIPS) byId.set(t.id, t);

export function getTshwaneTownshipById(id: string): TshwaneTownship | undefined {
  return byId.get(String(id || "").trim());
}

export function listTshwaneTownshipsForRegion(regionId: TshwaneRegionId): TshwaneTownship[] {
  return TSHWANE_TOWNSHIPS.filter((t) => t.regionId === regionId);
}

export function resolveTshwaneRegionFromMenuDigit(digit: string): TshwaneRegionId | null {
  const n = Number(String(digit || "").trim());
  if (!Number.isFinite(n) || n < 1 || n > TSHWANE_REGION_ORDER.length) return null;
  return TSHWANE_REGION_ORDER[n - 1]!.id;
}

export function resolveTshwaneTownshipFromRegionIndex(regionId: TshwaneRegionId, menuIndex1Based: number): TshwaneTownship | null {
  const list = listTshwaneTownshipsForRegion(regionId);
  const idx = Number(menuIndex1Based);
  if (!Number.isFinite(idx) || idx < 1 || idx > list.length) return null;
  return list[idx - 1] || null;
}

export function buildTshwaneRegionPickerMessage(title: string): string {
  const lines = [
    title,
    "",
    ...TSHWANE_REGION_ORDER.map((r, i) => `${i + 1}️⃣ ${r.label}`),
    "",
    "0️⃣ Cancel",
  ];
  return lines.join("\n");
}

export function buildTshwaneTownshipPickerMessage(regionId: TshwaneRegionId, title: string): string {
  const list = listTshwaneTownshipsForRegion(regionId);
  const lines = [
    title,
    "",
    ...list.map((t, i) => `${i + 1}️⃣ ${t.name}`),
    "",
    "Reply with the number for your area.",
    "",
    "0️⃣ Cancel",
  ];
  return lines.join("\n");
}
