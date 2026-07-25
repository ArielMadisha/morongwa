'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const QRCodeSVG = dynamic(() => import('qrcode.react').then((m) => m.QRCodeSVG), { ssr: false });

type Props = {
  payload: string | null;
  displayName?: string;
  phoneVerified: boolean;
  onNeedPhone: () => void;
  compact?: boolean;
};

export function WalletQrCard({ payload, displayName, phoneVerified, onNeedPhone, compact }: Props) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${compact ? 'p-4' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Wallet QR</p>
      <p className="mt-2 text-sm text-slate-600">Your personal code for others to scan and pay you.</p>
      {!phoneVerified ? (
        <button
          type="button"
          onClick={onNeedPhone}
          className="mt-6 w-full rounded-xl border-2 border-amber-300 bg-amber-50 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          Verify phone to show QR
        </button>
      ) : !payload ? (
        <div className="mt-8 flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <QRCodeSVG value={payload} size={compact ? 160 : 200} level="M" includeMargin />
          </div>
          {displayName ? <p className="text-xs font-medium text-slate-700">{displayName}</p> : null}
        </div>
      )}
    </div>
  );
}
