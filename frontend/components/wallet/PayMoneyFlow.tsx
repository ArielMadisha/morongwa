'use client';

import { Loader2 } from 'lucide-react';
import { FlowModal } from './FlowModal';

type MoneyRequest = {
  _id: string;
  amount?: number;
  message?: string;
  fromUser?: { name?: string; username?: string };
};

type Props = {
  open: boolean;
  onClose: () => void;
  balance: number;
  moneyRequests: MoneyRequest[];
  highlightRequestId?: string | null;
  onPay: (requestId: string) => void;
  payingId?: string | null;
};

export function PayMoneyFlow({
  open,
  onClose,
  balance,
  moneyRequests,
  highlightRequestId,
  onPay,
  payingId,
}: Props) {
  if (!open) return null;

  return (
    <FlowModal open={open} title="Pay" onClose={onClose} maxWidthClass="max-w-md">
      {moneyRequests.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No pending payment requests.</p>
      ) : (
        <div className="space-y-2">
          {moneyRequests.map((r) => {
            const name = r.fromUser?.name || r.fromUser?.username || 'User';
            const highlighted = highlightRequestId === r._id;
            return (
              <div
                key={r._id}
                className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${
                  highlighted ? 'border-sky-300 bg-sky-50' : 'border-slate-100 bg-slate-50/50'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {name} — R{(r.amount || 0).toFixed(2)}
                  </p>
                  {r.message ? <p className="text-xs text-slate-600 truncate">{r.message}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => onPay(r._id)}
                  disabled={payingId === r._id}
                  className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {payingId === r._id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pay'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </FlowModal>
  );
}
