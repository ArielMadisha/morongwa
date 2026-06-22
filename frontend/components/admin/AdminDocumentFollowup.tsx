'use client';

import { ExternalLink, Mail, MapPin, MessageCircle } from 'lucide-react';
import {
  type AdminFollowupContext,
  buildGoogleMapsUrlFromCoordinates,
  buildMailtoDocFollowupUrl,
  buildWhatsAppDocFollowupUrl,
  formatCountryHint,
} from '@/lib/adminFollowupLinks';

type BaseProps = {
  displayName: string;
  phone?: string | null;
  email?: string | null;
  countryCode?: string | null;
  /** GeoJSON Point coordinates [lng, lat] */
  coordinates?: number[] | null;
  context: AdminFollowupContext;
  /** 'table' = horizontal chips; 'stack' = labeled blocks for card headers */
  layout?: 'table' | 'stack';
};

export function AdminMessageFollowupLinks({
  displayName,
  phone,
  email,
  context,
  layout = 'table',
}: Pick<BaseProps, 'displayName' | 'phone' | 'email' | 'context' | 'layout'>) {
  const wa = buildWhatsAppDocFollowupUrl(phone, displayName, context);
  const mail = buildMailtoDocFollowupUrl(email, displayName, context);
  const chip =
    'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50';
  const inner = (
    <>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={chip} title="Open WhatsApp chat">
          <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
          WhatsApp
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </a>
      ) : null}
      {mail ? (
        <a href={mail} className={chip} title="Compose email">
          <Mail className="h-3.5 w-3.5 text-sky-600" />
          Email
        </a>
      ) : null}
      {!wa && !mail ? <span className="text-xs text-slate-400">—</span> : null}
    </>
  );
  if (layout === 'stack') {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Message</p>
        <div className="mt-1 flex flex-wrap gap-1.5">{inner}</div>
      </div>
    );
  }
  return <div className="flex flex-wrap gap-1.5">{inner}</div>;
}

export function AdminLocationFollowupLinks({
  countryCode,
  coordinates,
  layout = 'table',
}: Pick<BaseProps, 'countryCode' | 'coordinates' | 'layout'>) {
  const mapUrl = buildGoogleMapsUrlFromCoordinates(coordinates ?? null);
  const country = formatCountryHint(countryCode);
  const chip =
    'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50';
  const inner = (
    <>
      {mapUrl ? (
        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={chip} title="Open in Google Maps">
          <MapPin className="h-3.5 w-3.5 text-rose-600" />
          Map
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </a>
      ) : null}
      {country ? <span className="text-xs text-slate-600">{country}</span> : null}
      {!mapUrl && !country ? <span className="text-xs text-slate-400">—</span> : null}
    </>
  );
  if (layout === 'stack') {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Location</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">{inner}</div>
      </div>
    );
  }
  return <div className="flex flex-wrap items-center gap-2">{inner}</div>;
}

type Loc = { coordinates?: number[]; address?: string } | null | undefined;

/** Pickup / delivery pins from the task (client dashboard errand flows). */
export function AdminTaskMapLinks(props: {
  pickup?: Loc;
  delivery?: Loc;
  fallbackCountryCode?: string | null;
}) {
  const { pickup, delivery, fallbackCountryCode } = props;
  const pickupUrl = buildGoogleMapsUrlFromCoordinates(pickup?.coordinates ?? null);
  const deliveryUrl = buildGoogleMapsUrlFromCoordinates(delivery?.coordinates ?? null);
  const country = formatCountryHint(fallbackCountryCode);
  const chip =
    'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50';
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {pickupUrl ? (
          <a href={pickupUrl} target="_blank" rel="noopener noreferrer" className={chip} title="Pickup in Google Maps">
            <MapPin className="h-3.5 w-3.5 text-amber-600" />
            Pickup map
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </a>
        ) : null}
        {deliveryUrl ? (
          <a href={deliveryUrl} target="_blank" rel="noopener noreferrer" className={chip} title="Delivery in Google Maps">
            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
            Delivery map
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </a>
        ) : null}
        {!pickupUrl && !deliveryUrl && country ? <span className="text-slate-600">{country}</span> : null}
        {!pickupUrl && !deliveryUrl && !country ? <span className="text-slate-400">—</span> : null}
      </div>
      {pickup?.address ? (
        <p className="text-slate-600 line-clamp-2">
          <span className="font-medium text-slate-500">Pickup:</span> {pickup.address}
        </p>
      ) : null}
      {delivery?.address ? (
        <p className="text-slate-600 line-clamp-2">
          <span className="font-medium text-slate-500">Delivery:</span> {delivery.address}
        </p>
      ) : null}
    </div>
  );
}
