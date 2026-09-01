'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { walletAPI } from '@/lib/api';
import { resolveWalletPeerTarget } from '@/lib/walletPeerTarget';
import { FlowModal } from './FlowModal';

type Props = {
  open: boolean;
  onClose: () => void;
  balance: number;
  pendingRequestCount?: number;
  onOpenPendingRequests?: () => void;
  onSent?: () => void;
};

export function SendMoneyFlow({
  open,
  onClose,
  balance,
  pendingRequestCount = 0,
  onOpenPendingRequests,
  onSent,
}: Props) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTo('');
    setAmount('');
    setMessage('');
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSend = async () => {
    const amt = parseFloat(amount);
    if (!to.trim()) {
      toast.error('Enter username, email, phone, or user ID');
      return;
    }
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amt > balance) {
      toast.error('Insufficient wallet balance');
      return;
    }
    const target = resolveWalletPeerTarget(to);
    if (!target.toUserId && !target.toUsername && !target.toEmail && !target.toPhone) {
      toast.error('Enter a valid recipient');
      return;
    }
    setBusy(true);
    try {
      const res = await walletAPI.sendMoney({
        ...target,
        amount: amt,
        message: message.trim() || undefined,
      });
      toast.success(res.data?.message || `Sent R${amt.toFixed(2)}`);
      onSent?.();
      handleClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } } };
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Could not send money');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <FlowModal open={open} title="Send Money" onClose={handleClose} maxWidthClass="max-w-md">
      <p className="text-sm text-slate-600 mb-1">
        Available: <strong>R{balance.toFixed(2)}</strong>
      </p>
      <p className="text-xs text-slate-500 mb-4">
        Transfer from your ACBPay wallet to another Qwertymates user by username, email, phone, or user ID.
      </p>
      {pendingRequestCount > 0 && onOpenPendingRequests ? (
        <button
          type="button"
          onClick={() => {
            handleClose();
            onOpenPendingRequests();
          }}
          className="mb-4 w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sm font-semibold text-sky-800 hover:bg-sky-100"
        >
          You have {pendingRequestCount} pending payment request{pendingRequestCount === 1 ? '' : 's'} — pay them →
        </button>
      ) : null}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="username, email, phone, or user ID"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZAR)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 100"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. For lunch"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={busy}
        className="mt-6 w-full rounded-full bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send Money'}
      </button>
    </FlowModal>
  );
}
