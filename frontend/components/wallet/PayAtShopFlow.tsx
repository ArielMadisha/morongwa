'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, CreditCard, Loader2, Wallet } from 'lucide-react';
import { walletAPI } from '@/lib/api';
import { openPayGatePayment } from '@/lib/payGateRedirect';
import { FlowModal } from './FlowModal';

type Step = 'confirm' | 'otp' | 'success';

type PendingRow = { _id: string; amount: number; merchantName: string };

type Props = {
  open: boolean;
  onClose: () => void;
  balance: number;
  cards: Array<{ _id: string; last4: string; brand: string }>;
  initialPendingId?: string | null;
  pending?: PendingRow | null;
  onTopUp?: () => void;
  onComplete?: () => void;
};

export function PayAtShopFlow({
  open,
  onClose,
  balance,
  cards,
  initialPendingId,
  pending: pendingProp,
  onTopUp,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>('confirm');
  const [pending, setPending] = useState<PendingRow | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setStep('confirm');
    setPending(null);
    setOtp('');
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    if (pendingProp) {
      setPending(pendingProp);
      return;
    }
    if (initialPendingId) {
      void walletAPI
        .getPendingPayment(initialPendingId)
        .then((res) => {
          setPending({ _id: res.data._id, amount: res.data.amount, merchantName: res.data.merchantName });
        })
        .catch(() => toast.error('Payment request not found'));
    }
  }, [open, initialPendingId, pendingProp, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleWalletConfirm = async () => {
    if (!pending) return;
    if (balance < pending.amount) {
      toast.error('Insufficient wallet balance — top up or pay by card');
      return;
    }
    setBusy(true);
    try {
      await walletAPI.payPendingWithWallet(pending._id);
      setStep('success');
      onComplete?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  };

  const handleOtpConfirm = async () => {
    if (!pending || otp.trim().length !== 6) {
      toast.error('Enter the 6-digit SMS code');
      return;
    }
    setBusy(true);
    try {
      await walletAPI.confirmMyPayment(pending._id, otp.trim());
      setStep('success');
      onComplete?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Invalid or expired code');
    } finally {
      setBusy(false);
    }
  };

  const handleCardPay = async (cardId?: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await walletAPI.payWithCard(pending._id, cardId);
      if (res.data?.paymentUrl || res.data?.payGateRedirect) {
        openPayGatePayment({
          paymentUrl: res.data.paymentUrl,
          payGateRedirect: res.data.payGateRedirect,
        });
        handleClose();
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Could not start card payment');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  if (!pending) {
    return (
      <FlowModal open={open} title="Pay at Shop" onClose={handleClose} maxWidthClass="max-w-md">
        <p className="text-sm text-slate-600">Waiting for the merchant to scan your QR and enter the amount.</p>
        <p className="mt-2 text-xs text-slate-500">Your QR is shown on the wallet page. This screen will update when a payment request arrives.</p>
      </FlowModal>
    );
  }

  const canPayWithWallet = balance >= pending.amount;
  const shortfall = Math.max(0, pending.amount - balance);

  return (
    <FlowModal
      open={open}
      title="Confirm payment"
      onClose={handleClose}
      onBack={step === 'otp' ? () => setStep('confirm') : undefined}
      maxWidthClass="max-w-md"
    >
      {step === 'confirm' && (
        <div className="space-y-4">
          <p className="text-lg font-semibold text-slate-900">
            Pay R{pending.amount.toFixed(2)} to {pending.merchantName}?
          </p>

          {canPayWithWallet ? (
            <button
              type="button"
              onClick={() => void handleWalletConfirm()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-emerald-500 py-3 font-semibold text-white disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" />
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay with wallet (R${balance.toFixed(2)})`}
            </button>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                Your wallet has <strong>R{balance.toFixed(2)}</strong> — you need <strong>R{shortfall.toFixed(2)}</strong> more.
              </p>
              <p className="mt-1 text-xs">Top up your wallet first, or pay by card below.</p>
              {onTopUp ? (
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onTopUp();
                  }}
                  className="mt-2 text-sm font-semibold text-amber-800 underline"
                >
                  Top up wallet →
                </button>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-500">Pay using card</p>
            {cards.map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => void handleCardPay(c._id)}
                disabled={busy}
                className="w-full flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-sky-400 disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium">{c.brand} •••• {c.last4}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handleCardPay()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-full border-2 border-sky-500 py-3 font-semibold text-sky-600 hover:bg-sky-50 disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pay with card (enter details)'}
            </button>
          </div>

          <button type="button" onClick={() => setStep('otp')} className="w-full text-sm text-sky-600 font-medium">
            Use SMS verification code instead
          </button>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Enter the 6-digit code sent to your phone for R{pending.amount.toFixed(2)} at {pending.merchantName}.
          </p>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full rounded-lg border border-slate-200 px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono"
            inputMode="numeric"
          />
          <button
            type="button"
            onClick={() => void handleOtpConfirm()}
            disabled={busy}
            className="w-full rounded-full bg-sky-500 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Confirm payment'}
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="py-6 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <p className="text-lg font-semibold text-slate-900">Payment successful</p>
          <button type="button" onClick={handleClose} className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white">
            Done
          </button>
        </div>
      )}
    </FlowModal>
  );
}
