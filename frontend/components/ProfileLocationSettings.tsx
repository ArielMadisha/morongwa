'use client';

import { useEffect, useState } from 'react';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersAPI } from '@/lib/api';
import {
  hasPublicProfileMapCoords,
  type PublicProfileLocation,
} from '@/lib/publicProfileLocation';

type Props = {
  userId: string;
  initial?: PublicProfileLocation | null;
  onSaved?: (loc: PublicProfileLocation | undefined) => void;
};

export function ProfileLocationSettings({ userId, initial, onSaved }: Props) {
  const [enabled, setEnabled] = useState(!!initial?.enabled);
  const [label, setLabel] = useState(initial?.label || '');
  const [lat, setLat] = useState<number | undefined>(initial?.lat);
  const [lng, setLng] = useState<number | undefined>(initial?.lng);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setEnabled(!!initial?.enabled);
    setLabel(initial?.label || '');
    setLat(initial?.lat);
    setLng(initial?.lng);
  }, [initial?.enabled, initial?.label, initial?.lat, initial?.lng]);

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported on this device');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Math.round(pos.coords.latitude * 1e6) / 1e6);
        setLng(Math.round(pos.coords.longitude * 1e6) / 1e6);
        setLocating(false);
        toast.success('Device location captured');
      },
      () => {
        setLocating(false);
        toast.error('Could not get your location. Check browser permissions.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: PublicProfileLocation = {
        enabled,
        label: label.trim() || undefined,
        lat,
        lng,
      };
      const res = await usersAPI.updateProfile(userId, { publicProfileLocation: payload });
      const saved = (res.data?.user?.publicProfileLocation ?? payload) as PublicProfileLocation;
      setEnabled(!!saved.enabled);
      setLabel(saved.label || '');
      setLat(saved.lat);
      setLng(saved.lng);
      onSaved?.(saved);
      toast.success(enabled ? 'Profile location updated' : 'Profile location hidden');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } } };
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Could not save location'
      );
    } finally {
      setSaving(false);
    }
  };

  const draft: PublicProfileLocation = { enabled, label, lat, lng };
  const mapReady = hasPublicProfileMapCoords({ ...draft, enabled: true });

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <MapPin className="h-4 w-4 text-sky-600" />
          Show location on my public profile
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded text-sky-600"
        />
      </label>
      <p className="text-xs text-slate-500">
        When enabled, visitors see a Location button on your profile with a Google Map of your area.
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Area or address</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Gaborone, Botswana"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        />
      </div>
      <button
        type="button"
        onClick={useDeviceLocation}
        disabled={locating}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {locating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Navigation className="h-4 w-4 text-sky-600" />
        )}
        Use my current location
      </button>
      {lat != null && lng != null ? (
        <p className="text-xs text-slate-500 tabular-nums">
          Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)}
          {mapReady ? ' · ready for map' : ''}
        </p>
      ) : (
        <p className="text-xs text-amber-800">Add an area name or use device location before enabling.</p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-sky-600 text-white text-sm px-4 py-2 font-medium hover:bg-sky-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save location settings'}
      </button>
    </div>
  );
}
