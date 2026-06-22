"use client";

import { useEffect, useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { MapPin, Loader2, History } from "lucide-react";
import { API_URL } from "@/lib/api";

/** Inlined at build time; must be a non-empty string to enable Google prediction API */
const GOOGLE_API_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();

const RECENT_STORAGE_KEY = "qwertymates.locationAutocomplete.recent";
const MAX_RECENTS = 8;

let googlePlacesLoadPromise: Promise<void> | null = null;

function ensureGooglePlacesLoaded(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (googlePlacesLoadPromise) return googlePlacesLoadPromise;
  googlePlacesLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-qm-google-places="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => {
          googlePlacesLoadPromise = null;
          reject(new Error("Google Maps script failed"));
        },
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.dataset.qmGooglePlaces = "1";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googlePlacesLoadPromise = null;
      reject(new Error("Google Maps script failed"));
    };
    document.head.appendChild(script);
  });
  return googlePlacesLoadPromise;
}

type Props = {
  value?: string;
  placeholder?: string;
  /** Fires on every keystroke so parents can mirror the draft text (coords usually come from {@link onSelect}). */
  onAddressTextChange?: (text: string) => void;
  onSelect: (result: { address: string; lat: string; lon: string }) => void;
};

export type LocationSuggestion = {
  place_id?: number | string;
  primaryLine: string;
  secondaryLine: string;
  display_name: string;
  lat: string;
  lon: string;
  isRecent?: boolean;
  /** When set, resolve lat/lon with Places Details (legacy Autocomplete on controlled inputs is unreliable). */
  googlePlaceId?: string;
};

type MenuRect = { top: number; left: number; width: number; maxHeight: number };

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s,]+/g, " ")
    .trim();
}

function suggestionKey(r: LocationSuggestion): string {
  if (r.googlePlaceId) return `g:${r.googlePlaceId}`;
  return `${normalizeForMatch(r.display_name)}|${r.lat}|${r.lon}`;
}

/** Helps OSM/Photon with typos like "204witchhazel" or "204 witchhazel" */
function expandQueryVariants(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const out = new Set<string>();
  out.add(t);
  // "204Witch" -> "204 Witch"
  const afterDigit = t.replace(/^(\d+)([A-Za-z])/, "$1 $2");
  if (afterDigit !== t) out.add(afterDigit);
  // common run-together: "witchhazel" -> "witch hazel" (heuristic: long lowercase token)
  const spaced = afterDigit.replace(/([a-z])([A-Z])/g, "$1 $2");
  if (spaced !== afterDigit) out.add(spaced);
  const witch = afterDigit.replace(/witchhazel/gi, "witch hazel");
  if (witch !== afterDigit) out.add(witch);
  // Partial "204 witch" → common street stem (OSM / Nominatim match better with "hazel")
  if (/^\d+\s+witch$/i.test(afterDigit.trim())) {
    const b = afterDigit.trim();
    out.add(`${b} hazel`);
    out.add(`${b} hazel avenue`);
    out.add(`${b} hazel, South Africa`);
  }
  if (t.length <= 3) {
    for (const c of [
      "Pretoria",
      "Johannesburg",
      "Centurion",
      "Cape Town",
      "Durban",
      "Sandton",
      "Midrand",
    ]) {
      out.add(`${t} ${c}`);
    }
    if (/^\d{1,4}$/.test(t)) {
      out.add(`${t} street`);
      out.add(`${t} avenue`);
    }
    if (/^[a-zA-Z]$/.test(t)) {
      out.add(`${t} street`);
      out.add(`${t} road`);
    }
  }
  return [...out];
}

/** Prefer lines that actually start with what the user typed (house no. or street prefix). */
function rankSuggestions(list: LocationSuggestion[], rawQ: string): LocationSuggestion[] {
  const q = normalizeForMatch(rawQ);
  if (!q || list.length === 0) return list;
  const score = (s: LocationSuggestion): number => {
    const primary = normalizeForMatch(s.primaryLine);
    const full = normalizeForMatch(s.display_name);
    let sc = 0;
    if (primary.startsWith(q)) sc += 120;
    if (full.startsWith(q)) sc += 90;
    if (/^\d+$/.test(q)) {
      const firstTok = primary.split(" ")[0] || "";
      if (firstTok === q || firstTok.startsWith(q)) sc += 100;
    }
    if (/^[a-z]$/i.test(q)) {
      const words = `${primary} ${full}`.split(" ").filter(Boolean);
      for (const w of words) {
        if (w.startsWith(q)) sc += 35;
      }
    }
    if (full.includes(q)) sc += 15;
    return sc;
  };
  return [...list].sort((a, b) => score(b) - score(a));
}

function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(address: string) {
  if (typeof window === "undefined" || !address.trim()) return;
  const prev = loadRecents();
  const next = [address.trim(), ...prev.filter((a) => normalizeForMatch(a) !== normalizeForMatch(address))].slice(
    0,
    MAX_RECENTS
  );
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function markRecentFlags(results: LocationSuggestion[]): LocationSuggestion[] {
  const recents = loadRecents();
  if (recents.length === 0) return results.map((r) => ({ ...r, isRecent: false }));
  return results.map((r) => {
    const n = normalizeForMatch(r.display_name);
    const hit = recents.some(
      (rc) =>
        n === normalizeForMatch(rc) ||
        n.startsWith(normalizeForMatch(rc)) ||
        normalizeForMatch(rc).startsWith(n)
    );
    return { ...r, isRecent: hit };
  });
}

function buildFallbackQueries(fullQuery: string): string[] {
  const withSA =
    fullQuery.includes("South Africa") || fullQuery.includes("SA") || fullQuery.includes("ZA")
      ? fullQuery
      : `${fullQuery}, South Africa`;
  const parts = withSA
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const fallbacks: string[] = [withSA];

  const withoutPostal = parts.filter((p) => !/^\d{4}$/.test(p)).join(", ");
  if (withoutPostal && withoutPostal !== withSA) fallbacks.push(withoutPostal);

  if (parts.length >= 2) {
    const suburbCity = parts.slice(-3).join(", ");
    if (suburbCity && !fallbacks.includes(suburbCity)) fallbacks.push(suburbCity);
  }
  if (parts.length >= 1) {
    const cityOnly = parts[parts.length - 1];
    if (cityOnly && cityOnly !== "South Africa" && !fallbacks.some((f) => f === cityOnly)) {
      fallbacks.push(`${cityOnly}, Gauteng, South Africa`);
      fallbacks.push(`${cityOnly}, South Africa`);
    }
  }
  return fallbacks;
}

function joinAddressParts(parts: Array<string | undefined>): string {
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join(", ");
}

function uniqueTail(parts: string[]): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join(", ");
}

function suggestionFromNominatim(raw: any): LocationSuggestion | null {
  const lat = raw?.lat;
  const lon = raw?.lon;
  if (lat == null || lon == null) return null;
  const addr = raw.address || {};
  const house = [addr.house_number, addr.house_name].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
  const thoroughfare = String(addr.road || addr.pedestrian || addr.residential || "").trim();

  let primary = [house, thoroughfare].filter(Boolean).join(" ").trim();
  if (!primary) {
    primary = String(addr.amenity || addr.building || addr.shop || raw.name || "").trim();
  }
  if (!primary && raw.display_name) {
    primary = String(raw.display_name).split(",")[0].trim();
  }

  const secondary = uniqueTail([
    addr.suburb || addr.city_district,
    addr.neighbourhood || addr.quarter,
    addr.hamlet || addr.village || addr.town || addr.city || addr.municipality,
    addr.county,
    addr.state || addr.region,
    addr.postcode,
    addr.country,
  ]);

  const display_name = String(raw.display_name || joinAddressParts([primary, secondary])).trim();

  return {
    place_id: raw.place_id,
    primaryLine: primary || display_name.split(",")[0].trim() || display_name,
    secondaryLine: secondary,
    display_name,
    lat: String(lat),
    lon: String(lon),
  };
}

function suggestionFromPhotonFeature(f: any): LocationSuggestion | null {
  const p = f?.properties || {};
  const coords = f?.geometry?.coordinates;
  const lon = Array.isArray(coords) ? coords[0] : null;
  const lat = Array.isArray(coords) ? coords[1] : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const houseStreet = [p.housenumber, p.street].map((x) => String(x || "").trim()).filter(Boolean).join(" ").trim();
  const primary = houseStreet || String(p.name || "").trim();
  const secondary = uniqueTail([
    String(p.district || p.locality || "").trim(),
    String(p.city || p.county || "").trim(),
    String(p.state || "").trim(),
    String(p.country || "").trim(),
  ]);

  const display_name = joinAddressParts([primary, secondary]) || primary || String(p.name || "");

  return {
    place_id: p.osm_id || p.osm_key || `${lat}-${lon}`,
    primaryLine: primary || display_name.split(",")[0].trim(),
    secondaryLine: secondary,
    display_name,
    lat: String(lat),
    lon: String(lon),
  };
}

async function fetchNominatimRaw(queries: string[], signal: AbortSignal): Promise<any[]> {
  const opts = {
    signal,
    headers: {
      "User-Agent": "QwertymatesApp/1.0",
      Accept: "application/json",
      "Accept-Language": "en",
    },
  };
  for (const q of queries) {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=8&countrycodes=za`;
    const res = await fetch(url, opts);
    if (!res.ok) continue;
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    if (list.length > 0) return list;
  }
  return [];
}

async function fetchPhoton(query: string, signal: AbortSignal, limit = 8): Promise<LocationSuggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}&lang=en&lat=-26.2041&lon=28.0473`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = await res.json();
  const features = Array.isArray(json?.features) ? json.features : [];
  const zaFeatures = features.filter((f: any) => {
    const cc = String(f?.properties?.countrycode || "").toLowerCase();
    const cname = String(f?.properties?.country || "").toLowerCase();
    return cc === "za" || cname.includes("south africa");
  });
  const source = zaFeatures.length > 0 ? zaFeatures : features;
  const mapped = source.map(suggestionFromPhotonFeature).filter(Boolean) as LocationSuggestion[];

  const seen = new Set<string>();
  return mapped.filter((m) => {
    const key = suggestionKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchGooglePredictions(input: string): Promise<LocationSuggestion[]> {
  if (!GOOGLE_API_KEY || typeof window === "undefined") return [];
  try {
    await ensureGooglePlacesLoaded(GOOGLE_API_KEY);
  } catch {
    return [];
  }
  const g = (window as any).google;
  if (!g?.maps?.places?.AutocompleteService) return [];

  const service = new g.maps.places.AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: "za" },
      },
      (predictions: any[] | null, status: string) => {
        const OK = g.maps.places.PlacesServiceStatus.OK;
        if (status !== OK || !predictions?.length) {
          resolve([]);
          return;
        }
        const out: LocationSuggestion[] = predictions.slice(0, 8).map((p) => {
          const main = p.structured_formatting?.main_text || String(p.description || "").split(",")[0] || "";
          const sec = p.structured_formatting?.secondary_text || "";
          return {
            place_id: p.place_id,
            googlePlaceId: p.place_id,
            primaryLine: main,
            secondaryLine: sec,
            display_name: p.description || main,
            lat: "",
            lon: "",
          };
        });
        resolve(out);
      }
    );
  });
}

function mergeSuggestions(
  google: LocationSuggestion[],
  photonLists: LocationSuggestion[][],
  nominatimRaw: any[]
): LocationSuggestion[] {
  const nominatim = nominatimRaw.map(suggestionFromNominatim).filter(Boolean) as LocationSuggestion[];
  const seen = new Set<string>();
  const out: LocationSuggestion[] = [];

  for (const r of google) {
    const k = suggestionKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  for (const list of photonLists) {
    for (const r of list) {
      const k = suggestionKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
  }
  for (const r of nominatim) {
    const k = suggestionKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export default function LocationAutocomplete({
  value = "",
  placeholder = "Search address...",
  onAddressTextChange,
  onSelect,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<LocationSuggestion[]>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  const onAddressTextChangeRef = useRef(onAddressTextChange);
  onSelectRef.current = onSelect;
  onAddressTextChangeRef.current = onAddressTextChange;

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const updateMenuRect = useCallback(() => {
    const el = inputRef.current;
    if (!el || !show) {
      setMenuRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const maxHeight = Math.min(288, Math.max(120, window.innerHeight - r.bottom - 16));
    setMenuRect({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(200, r.width),
      maxHeight,
    });
  }, [show]);

  useLayoutEffect(() => {
    if (!show) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    const onScrollOrResize = () => updateMenuRect();
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("scroll", onScrollOrResize, true);
    const ro =
      typeof ResizeObserver !== "undefined" && inputRef.current
        ? new ResizeObserver(onScrollOrResize)
        : null;
    if (ro && inputRef.current) ro.observe(inputRef.current);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("scroll", onScrollOrResize, true);
      ro?.disconnect();
    };
  }, [show, updateMenuRect, results, loading, query]);

  // Unified: Google predictions (API) + Photon + Nominatim — works with React controlled inputs (no legacy Autocomplete attach)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setResolveError(null);

    const timer = setTimeout(async () => {
      try {
        let raw: any[] = [];
        const photonLists: LocationSuggestion[][] = [];

        try {
          const url = `${API_URL}/pricing/address-suggest?${new URLSearchParams({ q: trimmed }).toString()}`;
          const apiRes = await fetch(url, { signal: controller.signal });
          if (apiRes.ok) {
            const j = await apiRes.json();
            if (j?.success) {
              raw = Array.isArray(j.nominatim) ? j.nominatim : [];
              const phFeats = Array.isArray(j.photon) ? j.photon : [];
              const phMapped = phFeats.map(suggestionFromPhotonFeature).filter(Boolean) as LocationSuggestion[];
              if (phMapped.length) photonLists.push(phMapped);
            }
          }
        } catch {
          /* offline / API unreachable — fall back to direct OSM below */
        }

        if (raw.length === 0 && photonLists.length === 0) {
          const variants = expandQueryVariants(trimmed);
          const nominatimQueries = variants.flatMap((v) => buildFallbackQueries(v));
          const uniqueNom = [...new Set(nominatimQueries)];
          const phLimit = trimmed.length <= 3 ? 18 : 8;
          const cap = trimmed.length <= 3 ? 10 : 6;
          const photonTasks = variants.slice(0, cap).map((v) => fetchPhoton(v, controller.signal, phLimit));
          const [rawFallback, ...pl] = await Promise.all([
            fetchNominatimRaw(uniqueNom, controller.signal),
            ...photonTasks,
          ]);
          raw = rawFallback;
          for (const p of pl as LocationSuggestion[][]) {
            if (p.length) photonLists.push(p);
          }
        }

        let googleList: LocationSuggestion[] = [];
        if (GOOGLE_API_KEY && trimmed.length >= 2) {
          try {
            googleList = await fetchGooglePredictions(expandQueryVariants(trimmed)[0] || trimmed);
          } catch {
            googleList = [];
          }
        }

        const merged = rankSuggestions(mergeSuggestions(googleList, photonLists, raw), trimmed);
        setResults(markRecentFlags(merged));
        setShow(true);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Geocoding error:", err);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setLoading(false);
    };
  }, [query]);

  const resolveGooglePlace = useCallback((placeId: string): Promise<{ address: string; lat: string; lon: string } | null> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !GOOGLE_API_KEY) {
        resolve(null);
        return;
      }
      const g = (window as any).google;
      if (!g?.maps?.places?.PlacesService) {
        resolve(null);
        return;
      }
      const svc = new g.maps.places.PlacesService(document.createElement("div"));
      svc.getDetails(
        { placeId, fields: ["formatted_address", "geometry", "name"] },
        (place: any, status: string) => {
          const OK = g.maps.places.PlacesServiceStatus.OK;
          if (status !== OK || !place?.geometry?.location) {
            resolve(null);
            return;
          }
          const loc = place.geometry.location;
          resolve({
            address: place.formatted_address || place.name || "",
            lat: String(loc.lat()),
            lon: String(loc.lng()),
          });
        }
      );
    });
  }, []);

  const handleSelect = useCallback(
    async (result: LocationSuggestion) => {
      setResolveError(null);
      if (result.googlePlaceId) {
        const resolved = await resolveGooglePlace(result.googlePlaceId);
        if (!resolved?.address) {
          setResolveError("Could not load that place. Try another suggestion.");
          return;
        }
        setQuery(resolved.address);
        setShow(false);
        pushRecent(resolved.address);
        onSelect(resolved);
        return;
      }
      const address = result.display_name || joinAddressParts([result.primaryLine, result.secondaryLine]);
      setQuery(address);
      setShow(false);
      pushRecent(address);
      onSelect({
        address,
        lat: String(result.lat),
        lon: String(result.lon),
      });
    },
    [onSelect, resolveGooglePlace]
  );

  const defaultCoords = (q: string) => {
    const lower = q.toLowerCase();
    if (lower.includes("centurion") || lower.includes("rooihuiskraal") || lower.includes("0154")) {
      return { lat: "-25.8602", lon: "28.1854" };
    }
    if (lower.includes("johannesburg") || lower.includes("jhb")) return { lat: "-26.2041", lon: "28.0473" };
    if (lower.includes("pretoria")) return { lat: "-25.7479", lon: "28.2293" };
    if (lower.includes("cape town")) return { lat: "-33.9249", lon: "18.4241" };
    if (lower.includes("durban")) return { lat: "-29.8587", lon: "31.0218" };
    return { lat: "-25.7479", lon: "28.2293" };
  };

  const qTrim = query.trim();
  const showSuggestionsPanel = show && (results.length > 0 || (qTrim.length >= 1 && !loading));

  const dropdownPortal =
    mounted &&
    typeof document !== "undefined" &&
    menuRect &&
    showSuggestionsPanel &&
    createPortal(
      <div
        className="fixed z-[10050] rounded-lg border border-slate-200 bg-white py-1 shadow-2xl overflow-auto"
        style={{
          top: menuRect.top,
          left: menuRect.left,
          width: menuRect.width,
          maxHeight: menuRect.maxHeight,
        }}
        role="listbox"
        aria-label="Address suggestions"
      >
        {results.length > 0 ? (
          <ul className="m-0 list-none p-0">
            {results.map((r) => (
              <li key={r.googlePlaceId ?? r.place_id ?? `${r.lat}-${r.lon}-${r.primaryLine}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleSelect(r)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-slate-400">
                    {r.isRecent ? <History className="h-4 w-4" aria-hidden /> : <MapPin className="h-4 w-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-nowrap sm:items-baseline sm:gap-1">
                      <span className="shrink-0 text-[15px] font-semibold leading-snug text-slate-900 sm:max-w-[55%] sm:truncate">
                        {r.primaryLine}
                      </span>
                      {r.secondaryLine ? (
                        <span className="min-w-0 text-[13px] font-normal leading-snug text-slate-500 sm:truncate">
                          {r.secondaryLine}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-sm">
            <p className="text-slate-700 mb-2">
              No map match yet for &quot;<span className="font-semibold">{qTrim}</span>&quot;
            </p>
            <p className="text-xs text-slate-500 mb-3">
              Short inputs still match many real streets — try one more letter (e.g. &quot;14 M&quot; or &quot;Wi&quot;) or add a
              suburb. You can also use the button below for an approximate pin.
            </p>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const { lat, lon } = defaultCoords(qTrim);
                pushRecent(qTrim);
                onSelect({ address: qTrim, lat, lon });
                setShow(false);
              }}
              className="w-full px-3 py-2 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 transition text-xs font-medium"
            >
              Use &quot;{qTrim}&quot; anyway
            </button>
          </div>
        )}
      </div>,
      document.body
    );

  return (
    <div className="relative w-full">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setResolveError(null);
            onAddressTextChangeRef.current?.(v);
          }}
          onFocus={() => {
            if (results.length > 0 || query.trim().length >= 1) setShow(true);
          }}
          onBlur={() => setTimeout(() => setShow(false), 250)}
          placeholder={placeholder}
          className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin pointer-events-none" />
        )}
      </div>
      {resolveError && <p className="mt-1 text-xs text-amber-700">{resolveError}</p>}

      {dropdownPortal}
    </div>
  );
}
