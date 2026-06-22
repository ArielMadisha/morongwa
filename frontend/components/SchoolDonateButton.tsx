'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { HeartHandshake } from 'lucide-react';
import toast from 'react-hot-toast';
import { walletAPI } from '@/lib/api';

const DONATE_PRESET_AMOUNTS_ZAR = [50, 100, 200, 500] as const;
const DONATE_COFFEE_AMOUNT_ZAR = 35;

/** School profile quick picks (wallet donation amounts in ZAR). */
const SCHOOL_DONATION_HOVER_OPTIONS: { label: string; amount: number }[] = [
  { label: 'Donate Sanitary Pads', amount: 50 },
  { label: 'Donate Stationery', amount: 100 },
  { label: 'Donate Uniform/Shoes', amount: 350 },
];

type Props = {
  recipientId: string;
  recipientName: string;
  currentUserId?: string;
  /** Smaller button for dense lists (e.g. search). */
  compact?: boolean;
  className?: string;
};

export function SchoolDonateButton({
  recipientId,
  recipientName,
  currentUserId,
  compact,
  className = '',
}: Props) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const rid = String(recipientId || '').trim();
  const cid = currentUserId ? String(currentUserId) : '';

  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState('');
  const [donateSending, setDonateSending] = useState(false);
  const [donateBalance, setDonateBalance] = useState<number | null>(null);
  const [donateBalanceLoading, setDonateBalanceLoading] = useState(false);
  const [hoverQuickOpen, setHoverQuickOpen] = useState(false);
  const [touchQuickOpen, setTouchQuickOpen] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => setCoarsePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!touchQuickOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setTouchQuickOpen(false);
    };
    document.addEventListener('click', onDoc, true);
    return () => document.removeEventListener('click', onDoc, true);
  }, [touchQuickOpen]);

  const quickMenuOpen = hoverQuickOpen || touchQuickOpen;

  useEffect(() => {
    if (!donateModalOpen || !cid) return;
    setDonateBalanceLoading(true);
    walletAPI
      .getBalance()
      .then((res) => setDonateBalance(Number(res.data?.balance ?? 0)))
      .catch(() => setDonateBalance(null))
      .finally(() => setDonateBalanceLoading(false));
  }, [donateModalOpen, cid]);

  if (!rid || rid === cid) return null;

  const startTopupAndQueueDonation = async (amount: number) => {
    const current = Math.max(0, Number(donateBalance ?? 0));
    const shortfall = Math.max(0, amount - current);
    if (shortfall <= 0) return false;
    const topupAmount = Math.max(10, Math.ceil(shortfall));
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'pending_donation',
        JSON.stringify({ recipientId: rid, amount, createdAt: Date.now() })
      );
    }
    const res = await walletAPI.topUp(topupAmount, '/wallet?pendingDonate=1');
    const paymentUrl = res.data?.paymentUrl;
    if (paymentUrl) {
      window.location.href = paymentUrl;
      return true;
    }
    return false;
  };

  const handleDonate = (mode: 'wallet' | 'topup' = 'wallet') => {
    const amount = parseFloat(donateAmount);
    if (!rid || !cid || isNaN(amount) || amount < 1) return;
    if (rid === cid) return;
    setDonateSending(true);
    (async () => {
      if (mode === 'topup') {
        const redirected = await startTopupAndQueueDonation(amount);
        if (redirected) return;
      } else if ((donateBalance ?? 0) < amount) {
        const redirected = await startTopupAndQueueDonation(amount);
        if (redirected) return;
        throw new Error('Insufficient wallet balance. Could not start PayGate checkout.');
      }
      await walletAPI.donate(amount, rid);
      setDonateBalance((prev) => Math.max(0, Number(prev ?? 0) - amount));
    })()
      .then(() => {
        toast.success('Donation sent successfully');
        setDonateModalOpen(false);
        setDonateAmount('');
      })
      .catch((e: any) =>
        toast.error(e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to send donation')
      )
      .finally(() => setDonateSending(false));
  };

  const openModalWithAmount = (amount: number) => {
    if (!cid) {
      router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
      return;
    }
    setDonateAmount(String(amount));
    setDonateModalOpen(true);
    setHoverQuickOpen(false);
    setTouchQuickOpen(false);
  };

  return (
    <>
      <div
        ref={wrapRef}
        className="relative inline-flex flex-col items-end overflow-visible"
        onMouseEnter={() => {
          if (!coarsePointer) setHoverQuickOpen(true);
        }}
        onMouseLeave={() => setHoverQuickOpen(false)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!cid) {
              router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
              return;
            }
            if (coarsePointer) {
              if (touchQuickOpen) {
                setDonateAmount('');
                setDonateModalOpen(true);
                setTouchQuickOpen(false);
              } else {
                setTouchQuickOpen(true);
              }
              return;
            }
            setDonateModalOpen(true);
          }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-white bg-rose-500 hover:bg-rose-600 shadow-sm transition-colors ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'
          } ${className}`}
          aria-haspopup="menu"
          aria-expanded={quickMenuOpen}
        >
          <HeartHandshake className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          Donate
        </button>

        {quickMenuOpen && (
          <div
            className="absolute left-auto right-0 top-full z-[130] flex flex-col items-stretch pt-1 w-max min-w-[15rem] max-w-[min(18rem,calc(100vw-1.5rem))]"
            role="menu"
            aria-label="School donation options"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="h-1 w-full shrink-0" aria-hidden />
            <div className="rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {SCHOOL_DONATION_HOVER_OPTIONS.map((opt) => (
                <button
                  key={opt.amount}
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2.5 text-sm text-slate-800 hover:bg-rose-50 transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openModalWithAmount(opt.amount);
                  }}
                >
                  {opt.label} - R{opt.amount}
                </button>
              ))}
              {coarsePointer && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 border-t border-slate-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDonateAmount('');
                    setDonateModalOpen(true);
                    setTouchQuickOpen(false);
                    setHoverQuickOpen(false);
                  }}
                >
                  Other amount…
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {donateModalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setDonateModalOpen(false);
            setDonateAmount('');
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Donate to {recipientName || 'this school'}</h2>
            <p className="text-sm text-slate-600 mb-2">Amount is deducted from your ACBPay wallet and sent to the school account.</p>
            <p className="text-xs text-slate-500 mb-4">
              {donateBalanceLoading ? 'Checking wallet balance...' : `Wallet balance: R${Number(donateBalance ?? 0).toFixed(0)}`}
            </p>
            <input
              type="number"
              min={1}
              max={50000}
              step={1}
              value={donateAmount}
              onChange={(e) => setDonateAmount(e.target.value)}
              placeholder="Enter amount (ZAR)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-2"
            />
            <div className="flex flex-wrap gap-2 mb-2">
              {DONATE_PRESET_AMOUNTS_ZAR.map((amt) => {
                const selected = parseFloat(donateAmount) === amt && !Number.isNaN(parseFloat(donateAmount));
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDonateAmount(String(amt))}
                    className={`min-w-[4.25rem] px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                      selected
                        ? 'border-sky-500 bg-sky-50 text-sky-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    R{amt}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setDonateAmount(String(DONATE_COFFEE_AMOUNT_ZAR))}
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors mb-4 ${
                parseFloat(donateAmount) === DONATE_COFFEE_AMOUNT_ZAR && !Number.isNaN(parseFloat(donateAmount))
                  ? 'border-amber-500 bg-amber-50 text-amber-950'
                  : 'border-amber-200 bg-amber-50/90 text-amber-950 hover:bg-amber-100 hover:border-amber-300'
              }`}
            >
              Buy me Coffee R{DONATE_COFFEE_AMOUNT_ZAR}
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDonateModalOpen(false);
                  setDonateAmount('');
                }}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDonate('wallet')}
                disabled={donateSending || !donateAmount || parseFloat(donateAmount) < 1}
                className="flex-1 px-4 py-2 rounded-xl bg-rose-500 text-white font-medium disabled:opacity-50 hover:bg-rose-600"
              >
                {donateSending ? 'Sending...' : 'Donate'}
              </button>
            </div>
            {!!donateAmount && parseFloat(donateAmount) > 0 && (donateBalance ?? 0) < parseFloat(donateAmount) && (
              <button
                type="button"
                onClick={() => handleDonate('topup')}
                disabled={donateSending || donateBalanceLoading}
                className="mt-3 w-full px-4 py-2 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 font-medium disabled:opacity-50 hover:bg-sky-100"
              >
                {donateSending ? 'Processing...' : 'Top up & Donate'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
