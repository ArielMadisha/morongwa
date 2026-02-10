"use client";

import { useEffect, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

type Props = {
  value?: string;
  placeholder?: string;
  onSelect: (result: { address: string; lat: string; lon: string }) => void;
};

export default function LocationAutocomplete({ value = "", placeholder = "Search address...", onSelect }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Array<any>>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!query || query.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    
    const timer = setTimeout(async () => {
      try {
        // Add South Africa context to improve search results
        const searchQuery = query.includes('South Africa') || query.includes('SA') || query.includes('ZA') 
          ? query 
          : `${query}, South Africa`;
        
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?` + 
          `q=${encodeURIComponent(searchQuery)}` +
          `&format=json` +
          `&addressdetails=1` +
          `&limit=8` +
          `&countrycodes=za` +
          `&bounded=1` +
          `&viewbox=16.45,-34.84,32.89,-22.13`, // South Africa bounding box
          { 
            signal: controller.signal, 
            headers: { 
              'User-Agent': 'MorongwaApp/1.0',
              'Accept': 'application/json',
              'Accept-Language': 'en'
            } 
          }
        );
        
        if (!res.ok) {
          console.error('Geocoding API error:', res.status, res.statusText);
          setResults([]);
          setShow(true);
          return;
        }
        
        const data = await res.json();
        console.log('Geocoding results:', data);
        setResults(Array.isArray(data) ? data : []);
        setShow(true);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Geocoding error:', err);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setLoading(false);
    };
  }, [query]);

  const handleSelect = (result: any) => {
    const address = result.display_name || result.address || '';
    setQuery(address);
    setShow(false);
    onSelect({ 
      address, 
      lat: String(result.lat), 
      lon: String(result.lon) 
    });
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0 || query.length >= 3) setShow(true); }}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder={placeholder}
          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
        )}
      </div>
      
      {show && results.length > 0 && (
        <ul className="absolute top-full left-0 right-0 z-[100] mt-2 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {results.map((r: any) => (
            <li
              key={r.place_id || r.lat + r.lon}
              onClick={() => handleSelect(r)}
              className="cursor-pointer px-4 py-3 hover:bg-blue-50 text-sm text-slate-700 border-b border-slate-100 last:border-b-0 transition"
            >
              <div className="font-medium text-slate-900">{r.display_name?.split(',')[0] || r.address}</div>
              <div className="text-xs text-slate-500">{r.display_name?.split(',').slice(1).join(',').trim()}</div>
            </li>
          ))}
        </ul>
      )}

      {show && query.length >= 3 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 z-[100] mt-2 rounded-lg border border-slate-200 bg-white shadow-xl p-4 text-sm">
          <p className="text-slate-700 mb-2">No locations found for "<span className="font-semibold">{query}</span>"</p>
          <p className="text-xs text-slate-500 mb-3">
            Try using more specific terms like street name, suburb, or city. Example: "123 Main Road, Centurion, Gauteng"
          </p>
          <button
            onClick={() => {
              // Use the query as is
              onSelect({ 
                address: query, 
                lat: '-25.7479', // Default to Pretoria/Centurion area
                lon: '28.2293' 
              });
              setShow(false);
            }}
            className="w-full px-3 py-2 bg-sky-50 text-sky-700 rounded-lg hover:bg-sky-100 transition text-xs font-medium"
          >
            Use "{query}" anyway
          </button>
        </div>
      )}
    </div>
  );
}
