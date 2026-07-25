'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, PhoneCall, PhoneOff } from 'lucide-react';
import type { Call } from '@twilio/voice-sdk';
import { usePathname } from 'next/navigation';
import { voiceAPI, walletAPI } from '@/lib/api';
import { AirtimeTopUpMenu } from '@/components/morongwa/AirtimeTopUpMenu';
import {
  connectMorongwaPstn,
  destroyMorongwaVoiceDevice,
  hangupMorongwaCall,
  type MorongwaCallPhase,
} from '@/lib/twilioVoiceDevice';

type Quote = {
  destination: string;
  estimate1MinZar: number;
};

const phaseLabel: Record<MorongwaCallPhase, string> = {
  idle: '',
  connecting: 'Connecting… allow microphone',
  ringing: 'Ringing…',
  connected: 'Connected — speak now',
  ended: 'Call ended',
  error: 'Call failed',
};

export function PstnCallPanel({
  onCallPlaced,
  initialTo,
  onTopUpNavigate,
}: {
  onCallPlaced?: () => void;
  initialTo?: string;
  /** Close dialer modal when user opens wallet top-up. */
  onTopUpNavigate?: () => void;
}) {
  const pathname = usePathname() || '/messages';
  const [to, setTo] = useState(initialTo || '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [airtimeBalance, setAirtimeBalance] = useState<number | null>(null);
  const [phase, setPhase] = useState<MorongwaCallPhase>('idle');
  const activeCallRef = useRef<Call | null>(null);
  const phaseRef = useRef<MorongwaCallPhase>('idle');

  const inCall = phase === 'ringing' || phase === 'connected';
  const isConnecting = phase === 'connecting';

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (initialTo) setTo(initialTo);
  }, [initialTo]);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await walletAPI.getBalance();
      const bal = Number(res.data?.balance ?? res.data?.availableBalance);
      if (Number.isFinite(bal)) setAirtimeBalance(bal);
    } catch {
      setAirtimeBalance(null);
    }
  }, []);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    return () => {
      const active = phaseRef.current === 'ringing' || phaseRef.current === 'connected';
      if (active) {
        hangupMorongwaCall(activeCallRef.current);
      }
      destroyMorongwaVoiceDevice();
    };
  }, []);

  const fetchQuote = useCallback(async () => {
    const dest = to.trim();
    if (!dest) {
      setQuote(null);
      return;
    }
    setLoadingQuote(true);
    try {
      const res = await voiceAPI.getQuote(dest);
      setQuote(res.data.quote as Quote);
    } catch (e: unknown) {
      setQuote(null);
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || 'Could not get call rate');
    } finally {
      setLoadingQuote(false);
    }
  }, [to]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (to.trim().length >= 8) fetchQuote();
      else setQuote(null);
    }, 400);
    return () => clearTimeout(id);
  }, [to, fetchQuote]);

  const hangUp = () => {
    hangupMorongwaCall(activeCallRef.current);
    activeCallRef.current = null;
    setPhase('ended');
    void refreshBalance();
    setTimeout(() => setPhase('idle'), 1200);
  };

  const placeCall = async () => {
    const dest = to.trim();
    if (!dest) {
      toast.error('Enter a phone number');
      return;
    }
    if (inCall) return;

    setPhase('connecting');
    try {
      const session = await voiceAPI.outbound({ to: dest });
      const { callId, token, quote: q } = session.data;
      const destination = String((q as Quote)?.destination || dest);

      const call = await connectMorongwaPstn({
        token,
        to: destination,
        callId,
        onPhase: setPhase,
      });
      activeCallRef.current = call;

      call.on('disconnect', () => {
        activeCallRef.current = null;
        void refreshBalance();
        onCallPlaced?.();
      });
    } catch (e: unknown) {
      setPhase('error');
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      const msg =
        err?.response?.data?.error ||
        (e as Error)?.message ||
        'Call failed — check microphone permission and wallet balance';
      toast.error(msg);
      setTimeout(() => setPhase('idle'), 1500);
    }
  };

  return (
    <section className={onCallPlaced ? '' : 'mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 sm:p-5'}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-5 w-5 text-indigo-600" />
          <h2 className="font-semibold text-slate-900">Call a phone number</h2>
        </div>
        {airtimeBalance != null ? (
          <div className="flex items-center gap-1 text-xs font-semibold text-indigo-700 whitespace-nowrap">
            <span>Airtime balance: R{airtimeBalance.toFixed(2)}</span>
            <AirtimeTopUpMenu returnTo={pathname} onNavigate={onTopUpNavigate} />
          </div>
        ) : null}
      </div>

      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="+27111222333"
        disabled={inCall}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm mb-3 disabled:opacity-60"
        aria-label="Phone number"
      />

      {loadingQuote ? (
        <p className="text-sm text-slate-500 flex items-center gap-2 mb-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Getting rate…
        </p>
      ) : quote ? (
        <p className="text-sm font-medium text-slate-700 mb-3">~R{quote.estimate1MinZar.toFixed(2)}</p>
      ) : null}

      {phase !== 'idle' && phaseLabel[phase] ? (
        <p className="text-sm font-medium text-indigo-700 mb-3">{phaseLabel[phase]}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!inCall ? (
          <button
            type="button"
            disabled={isConnecting || !to.trim()}
            onClick={() => void placeCall()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneCall className="h-4 w-4" />
            )}
            {isConnecting ? 'Connecting…' : 'Call now'}
          </button>
        ) : (
          <button
            type="button"
            onClick={hangUp}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            <PhoneOff className="h-4 w-4" />
            End call
          </button>
        )}
      </div>
    </section>
  );
}
