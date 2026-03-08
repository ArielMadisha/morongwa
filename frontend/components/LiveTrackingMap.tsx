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
      <div className="rounded-xl bg-white border border-slate-200 p-6 text-center text-slate-500 shadow-sm">
        Runner location not available yet
      </div>
    );
  }

  const lat = parseFloat(runnerLocation.lat);
  const lon = parseFloat(runnerLocation.lon);

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm space-y-4">
      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
        <MapPin className="text-brand-500" size={20} />
        Live Runner Location
      </h3>

      <p className="text-sm text-slate-600">
        Runner: {lat.toFixed(6)}, {lon.toFixed(6)}
      </p>

      {pickupLocation?.address && (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-brand-600">Pickup:</span> {pickupLocation.address}
        </p>
      )}

      {deliveryLocation?.address && (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-brand-600">Delivery:</span> {deliveryLocation.address}
        </p>
      )}

      <div className="flex gap-3 mt-4">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition"
        >
          <MapPin size={16} /> Open in Maps
        </a>
        {deliveryLocation?.coordinates && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${deliveryLocation.coordinates[1]},${deliveryLocation.coordinates[0]}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 transition"
          >
            <Navigation size={16} /> Directions
          </a>
        )}
      </div>

      <div className="mt-6 space-y-1 text-sm text-slate-600">
        <p className="flex items-center gap-2"><span className="text-blue-500">🔵</span> Runner position</p>
        {pickupLocation && <p className="flex items-center gap-2"><span className="text-green-500">🟢</span> Pickup location</p>}
        {deliveryLocation && <p className="flex items-center gap-2"><span className="text-red-500">🔴</span> Delivery destination</p>}
      </div>
    </div>
  );
}
