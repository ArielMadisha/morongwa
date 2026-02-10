"use client";

import { useEffect, useState, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";

const GOOGLE_API_KEY = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "") : (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "");

type Props = {
  value?: string;
  placeholder?: string;
  onSelect: (result: { address: string; lat: string; lon: string }) => void;
};

/** Build fallback search queries for South Africa (suburb, city, etc.) */
function buildFallbackQueries(fullQuery: string): string[] {
  const withSA = fullQuery.includes("South Africa") || fullQuery.includes("SA") || fullQuery.includes("ZA")
    ? fullQuery
    : `${fullQuery}, South Africa`;
  const parts = withSA.split(",").map((p) => p.trim()).filter(Boolean);
  const fallbacks: string[] = [withSA];

  // Remove postal code (e.g. 0154) and try again
  const withoutPostal = parts.filter((p) => !/^\d{4}$/.test(p)).join(", ");
  if (withoutPostal && withoutPostal !== withSA) fallbacks.push(withoutPostal);

  // Suburb + city + South Africa (last 2–3 parts often are city, province or suburb, city)
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

/** Fetch Nominatim with optional fallback queries */
async function fetchNominatim(
  queries: string[],
  signal: AbortSignal
): Promise<Array<{ display_name?: string; address?: string; lat: string; lon: string; place_id?: number }>> {
  const opts = { signal, headers: { "User-Agent": "MorongwaApp/1.0", Accept: "application/json", "Accept-Language": "en" } };
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

export default function LocationAutocomplete({ value = "", placeholder = "Search address...", onSelect }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Array<any>>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const googleAutocompleteRef = useRef<any>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Optional: Google Places Autocomplete (Maps-like) when API key is set
  useEffect(() => {
    if (!GOOGLE_API_KEY || typeof window === "undefined" || !inputRef.current) return;
    if (!(window as any).google?.maps?.places) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = () => initGoogleAutocomplete();
      document.head.appendChild(script);
      return;
    }
    initGoogleAutocomplete();

    function initGoogleAutocomplete() {
      if (!inputRef.current || (window as any).google?.maps?.places == null) return;
      const Autocomplete = (window as any).google.maps.places.Autocomplete;
      const autocomplete = new Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "za" },
        fields: ["formatted_address", "geometry", "name"],
      });
      googleAutocompleteRef.current = autocomplete;
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const loc = place.geometry?.location;
        if (loc && place.formatted_address) {
          const address = place.formatted_address;
          setQuery(address);
          setShow(false);
          onSelect({
            address,
            lat: String(loc.lat()),
            lon: String(loc.lng()),
          });
        }
      });
    }
    return () => {
      googleAutocompleteRef.current = null;
    };
  }, [GOOGLE_API_KEY, onSelect]);

  // Nominatim search (when not using Google)
  useEffect(() => {
    if (GOOGLE_API_KEY) return;
    if (!query || query.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const fallbacks = buildFallbackQueries(query);
        const data = await fetchNominatim(fallbacks, controller.signal);
        setResults(data);
        setShow(true);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Geocoding error:", err);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setLoading(false);
    };
  }, [query, GOOGLE_API_KEY]);

  const handleSelect = (result: any) => {
    const address = result.display_name || result.address || "";
    setQuery(address);
    setShow(false);
    onSelect({
      address,
      lat: String(result.lat),
      lon: String(result.lon),
    });
  };

  // Approximate coords for "Use anyway" (Centurion area if query mentions it, else generic SA)
  const defaultCoords = (q: string) => {
    const lower = q.toLowerCase();
    if (lower.includes("centurion") || lower.includes("rooihuiskraal") || lower.includes("0154")) {
      return { lat: "-25.8602", lon: "28.1854" }; // Centurion
    }
    if (lower.includes("johannesburg") || lower.includes("jhb")) return { lat: "-26.2041", lon: "28.0473" };
    if (lower.includes("pretoria")) return { lat: "-25.7479", lon: "28.2293" };
    if (lower.includes("cape town")) return { lat: "-33.9249", lon: "18.4241" };
    if (lower.includes("durban")) return { lat: "-29.8587", lon: "31.0218" };
    return { lat: "-25.7479", lon: "28.2293" }; // Pretoria/Centurion default
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || query.length >= 3) setShow(true);
          }}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder={placeholder}
          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin pointer-events-none" />
        )}
      </div>

      {show && results.length > 0 && (
        <ul className="absolute top-full left-0 right-0 z-[100] mt-2 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {results.map((r: any) => (
            <li
              key={r.place_id ?? `${r.lat}-${r.lon}`}
              onClick={() => handleSelect(r)}
              className="cursor-pointer px-4 py-3 hover:bg-blue-50 text-sm text-slate-700 border-b border-slate-100 last:border-b-0 transition"
            >
              <div className="font-medium text-slate-900">{r.display_name?.split(",")[0] || r.address || ""}</div>
              <div className="text-xs text-slate-500">{r.display_name?.split(",").slice(1).join(",").trim() || ""}</div>
            </li>
          ))}
        </ul>
      )}

      {show && query.length >= 3 && results.length === 0 && !loading && !GOOGLE_API_KEY && (
        <div className="absolute top-full left-0 right-0 z-[100] mt-2 rounded-lg border border-slate-200 bg-white shadow-xl p-4 text-sm">
          <p className="text-slate-700 mb-2">
            No locations found for &quot;<span className="font-semibold">{query}</span>&quot;
          </p>
          <p className="text-xs text-slate-500 mb-3">
            You can still use this address; we&apos;ll use an approximate location for the area.
          </p>
          <button
            type="button"
            onClick={() => {
              const { lat, lon } = defaultCoords(query);
              onSelect({ address: query, lat, lon });
              setShow(false);
            }}
            className="w-full px-3 py-2 bg-sky-50 text-sky-700 rounded-lg hover:bg-sky-100 transition text-xs font-medium"
          >
            Use &quot;{query}&quot; anyway
          </button>
        </div>
      )}
    </div>
  );
}
