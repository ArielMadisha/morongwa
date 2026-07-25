'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersAPI } from '@/lib/api';
import { FlowModal } from './FlowModal';

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function PhoneVerifyModal({ open, userId, onClose, onSaved }: Props) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmed = phone.trim();
    if (!trimmed || trimmed.length < 8) {
      toast.error('Enter a valid mobile number');
      return;
    }
    setBusy(true);
    try {
      await usersAPI.updateProfile(userId, { phone: trimmed });
      toast.success('Phone number saved');
      onSaved();
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Could not save phone number');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlowModal open={open} title="Verify phone" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-4">
        Add your mobile number to use Show QR, Scan QR, and in-store payments. You&apos;ll stay on this wallet page.
      </p>
      <label className="block text-sm font-medium text-slate-700 mb-1">Mobile number</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="e.g. +27821234567"
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 mb-4"
        autoComplete="tel"
      />
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy}
        className="w-full rounded-full bg-sky-500 py-3 font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Save & continue'}
      </button>
    </FlowModal>
  );
}
