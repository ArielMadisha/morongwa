"use client";

import { useEffect, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';

type Props = {
  runnerLocation: { lat: string; lon: string } | null;
  pickupLocation?: { coordinates?: number[]; address?: string };
  deliveryLocation?: { coordinates?: number[]; address?: string };
};

export default function LiveTrackingMap({ runnerLocation, pickupLocation, deliveryLocation }: Props) {
  const [mapUrl, setMapUrl] = useState<string>('');

  useEffect(() => {
    if (!runnerLocation) return;

    // Build static map URL for OpenStreetMap/Leaflet alternative
    // For production, consider using a proper mapping library like Leaflet or Mapbox
    const lat = parseFloat(runnerLocation.lat);
    const lon = parseFloat(runnerLocation.lon);

    // Create markers parameter for a static map service
    // Using a simple link to Google Maps for now
    let markers: string[] = [];
    
    // Runner location (blue marker)
    markers.push(`color:blue|label:R|${lat},${lon}`);
    
    // Pickup location (green marker)
    if (pickupLocation?.coordinates) {
      markers.push(`color:green|label:P|${pickupLocation.coordinates[1]},${pickupLocation.coordinates[0]}`);
    }
    
    // Delivery location (red marker)
    if (deliveryLocation?.coordinates) {
      markers.push(`color:red|label:D|${deliveryLocation.coordinates[1]},${deliveryLocation.coordinates[0]}`);
    }

    // Google Static Maps alternative - build the URL
    const center = `${lat},${lon}`;
    setMapUrl(`https://www.google.com/maps?q=${center}&z=14`);
  }, [runnerLocation, pickupLocation, deliveryLocation]);

  if (!runnerLocation) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
        <MapPin className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-3 text-sm text-slate-600">Runner location not available yet</p>
      </div>
    );
  }

  const lat = parseFloat(runnerLocation.lat);
  const lon = parseFloat(runnerLocation.lon);

  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-xl shadow-sky-50 backdrop-blur">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600 font-semibold">Live Runner Location</p>
        <Navigation className="h-4 w-4 text-sky-600 animate-pulse" />
      </div>
      
      <div className="space-y-2 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500"></div>
          <span className="text-slate-700">Runner: {lat.toFixed(6)}, {lon.toFixed(6)}</span>
        </div>
        {pickupLocation?.address && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-slate-600 text-xs">Pickup: {pickupLocation.address}</span>
          </div>
        )}
        {deliveryLocation?.address && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span className="text-slate-600 text-xs">Delivery: {deliveryLocation.address}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02]"
        >
          <MapPin className="h-4 w-4" />
          Open in Maps
        </a>
        {deliveryLocation?.coordinates && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${deliveryLocation.coordinates[1]},${deliveryLocation.coordinates[0]}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-sky-500 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
          >
            <Navigation className="h-4 w-4" />
            Directions
          </a>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p>🔵 Runner current position</p>
        {pickupLocation && <p>🟢 Pickup location</p>}
        {deliveryLocation && <p>🔴 Delivery destination</p>}
      </div>
    </div>
  );
}
