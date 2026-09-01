'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { WalletQrScanner } from '@/components/WalletQrScanner';
import { parseAcbPayUserId } from '@/lib/walletQr';
import { walletAPI } from '@/lib/api';
import { FlowModal } from './FlowModal';

export function parseWalletQrPayload(raw: string): string | null {
  return parseAcbPayUserId(raw);
}

type Props = {
  open: boolean;
  onClose: () => void;
  phoneVerified: boolean;
  onNeedPhone: () => void;
  onPaid?: () => void;
};

export function QrScannerModal({ open, onClose, phoneVerified, onNeedPhone, onPaid }: Props) {
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');

  const reset = () => {
    setRecipientId(null);
    setAmount('');
    setManual('');
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleScan = (decoded: string) => {
    const id = parseWalletQrPayload(decoded);
    if (!id) {
      toast.error('Invalid QR — use an ACBPay wallet code');
      return;
    }
    setRecipientId(id);
  };

  const handlePay = async () => {
    if (!recipientId) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setBusy(true);
    try {
      await walletAPI.sendMoney({ amount: amt, toUserId: recipientId });
      toast.success('Money sent!');
      onPaid?.();
      handleClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  if (!phoneVerified) {
    return (
      <FlowModal open={open} title="Scan QR" onClose={handleClose}>
        <p className="text-sm text-slate-600 mb-4">Verify your phone number before scanning wallet QR codes.</p>
        <button
          type="button"
          onClick={() => {
            handleClose();
            onNeedPhone();
          }}
          className="w-full rounded-full bg-amber-500 py-3 font-semibold text-white"
        >
          Verify Now
        </button>
      </FlowModal>
    );
  }

  return (
    <FlowModal open={open} title={recipientId ? 'Send Money' : 'Scan QR'} onClose={handleClose} onBack={recipientId ? () => setRecipientId(null) : undefined}>
      {!recipientId ? (
        <div className="space-y-4">
          <WalletQrScanner active={open} onScan={handleScan} onClose={handleClose} title="Scan wallet QR" />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Or paste code / user ID</label>
            <div className="flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="ACBPAY:…"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => handleScan(manual)}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
              >
                Use
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Paying user <span className="font-mono text-xs">{recipientId}</span></p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZAR)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-semibold"
            />
          </div>
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={busy}
            className="w-full rounded-full bg-sky-500 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send payment'}
          </button>
        </div>
      )}
    </FlowModal>
  );
}
