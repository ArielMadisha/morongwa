'use client';

import { useState } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { confirmWalletPayment } from '@/lib/walletPaymentConfirm';

type Props = {
  amount: number;
  counterpartyName: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
};

export function WalletPaymentConfirmCard({
  amount,
  counterpartyName,
  confirmLabel = 'Confirm payment',
  onConfirm,
  onCancel,
  disabled,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const ok = await confirmWalletPayment({
        amount,
        counterpartyName,
        actionLabel: 'Pay',
      });
      if (!ok) return;
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-sky-200 bg-gradient-to-b from-white to-sky-50/80 p-5 shadow-lg">
      <p className="text-3xl font-bold text-slate-900">R{amount.toFixed(2)}</p>
      <p className="text-slate-600 mt-1">
        to <span className="font-semibold text-slate-900">{counterpartyName}</span>
      </p>
      <p className="text-xs text-slate-500 mt-2">Use Face ID, fingerprint, or tap confirm — no SMS code needed.</p>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled={disabled || submitting}
          onClick={() => void handleConfirm()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3.5 text-base font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Fingerprint className="h-5 w-5" />
          )}
          {submitting ? 'Processing…' : confirmLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
