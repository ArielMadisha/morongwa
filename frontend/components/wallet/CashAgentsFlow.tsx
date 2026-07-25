'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote, Copy, Loader2, MapPin, Search, Ticket } from 'lucide-react';
import { walletAPI } from '@/lib/api';
import { FlowModal } from './FlowModal';
import { MerchantAgentPicker } from './MerchantAgentPicker';

type HubView = 'hub' | 'deposit' | 'withdraw' | 'agents' | 'pickup';

type Props = {
  open: boolean;
  onClose: () => void;
  balance: number;
  walletUserId: string;
  userPhone?: string;
  username?: string;
  displayName?: string;
  onRefresh?: () => void;
};

export function CashAgentsFlow({
  open,
  onClose,
  balance,
  walletUserId,
  userPhone,
  username,
  displayName,
  onRefresh,
}: Props) {
  const [view, setView] = useState<HubView>('hub');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAgentId, setWithdrawAgentId] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawRef, setWithdrawRef] = useState<string | null>(null);
  const [pickupRows, setPickupRows] = useState<Array<{ _id: string; reference: string; amount: number; agent?: { name?: string; username?: string } }>>([]);
  const [pendingDeposits, setPendingDeposits] = useState<any[]>([]);
  const [loadingPickup, setLoadingPickup] = useState(false);

  const payeeRef = username ? `@${username}` : userPhone || walletUserId;

  useEffect(() => {
    if (!open) return;
    void walletAPI
      .getMerchantAgentPending()
      .then((r) => setPendingDeposits(r.data?.asCustomer ?? []))
      .catch(() => setPendingDeposits([]));
  }, [open]);

  useEffect(() => {
    if (!open || view !== 'pickup') return;
    setLoadingPickup(true);
    void walletAPI
      .getMerchantAgentHistory(20)
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : [];
        setPickupRows(
          rows.filter(
            (h: any) =>
              h.kind === 'cash_withdrawal' &&
              String(h.customer?._id || h.customer) === String(walletUserId)
          )
        );
      })
      .catch(() => setPickupRows([]))
      .finally(() => setLoadingPickup(false));
  }, [open, view, walletUserId]);

  const handleClose = () => {
    setView('hub');
    setWithdrawAmount('');
    setWithdrawAgentId('');
    setWithdrawRef(null);
    onClose();
  };

  const copyRef = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 10) {
      toast.error('Minimum R10');
      return;
    }
    if (!withdrawAgentId) {
      toast.error('Select an agent');
      return;
    }
    if (amount > balance) {
      toast.error('Insufficient balance — top up your wallet first');
      return;
    }
    setWithdrawSubmitting(true);
    try {
      const res = await walletAPI.initiateAgentWithdrawal({ agentId: withdrawAgentId, amount });
      setWithdrawRef(res.data?.reference || null);
      toast.success('Funds sent to agent — collect cash from them. Agent was notified by SMS.');
      setWithdrawAmount('');
      onRefresh?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Withdrawal failed');
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const title =
    view === 'hub'
      ? 'Cash & Agents'
      : view === 'deposit'
        ? 'Deposit Cash'
        : view === 'withdraw'
          ? 'Withdraw Cash'
          : view === 'agents'
            ? 'Find Agent'
            : 'Pickup Codes';

  if (!open) return null;

  return (
    <FlowModal
      open={open}
      title={title}
      onClose={handleClose}
      onBack={view !== 'hub' ? () => setView('hub') : undefined}
      maxWidthClass="max-w-md"
    >
      {view === 'hub' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: 'deposit' as const, label: 'Deposit Cash', icon: Banknote, desc: 'Give agent your number' },
            { id: 'withdraw' as const, label: 'Withdraw Cash', icon: Ticket, desc: 'Cash out via agent' },
            { id: 'agents' as const, label: 'Find Agent', icon: MapPin, desc: 'Search approved agents' },
            { id: 'pickup' as const, label: 'Pickup Codes', icon: Search, desc: 'Withdrawal references' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-sky-300 hover:bg-sky-50"
            >
              <item.icon className="h-5 w-5 text-sky-600 mb-2" />
              <p className="font-semibold text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-600 mt-1">{item.desc}</p>
            </button>
          ))}
        </div>
      )}

      {view === 'deposit' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Visit a cash agent and hand over cash. Tell them:
          </p>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-800">Recharge your wallet</p>
              <p className="text-sm text-emerald-900 mt-1">Give the agent your phone or username:</p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                <span className="font-mono text-sm font-semibold text-slate-900">{payeeRef}</span>
                <button type="button" onClick={() => void copyRef(payeeRef)} className="text-emerald-700">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              {displayName ? <p className="text-xs text-emerald-800 mt-1">{displayName}</p> : null}
            </div>
            <div className="border-t border-emerald-200 pt-3">
              <p className="text-xs font-semibold uppercase text-emerald-800">Send to someone else</p>
              <p className="text-sm text-emerald-900 mt-1">
                Give the agent the <strong>payee&apos;s username or phone</strong> and the amount. They will credit that wallet after you approve in the app.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            The agent records the deposit in their wallet app. You receive an SMS link to approve — same as WhatsApp wallet flow.
          </p>
          {pendingDeposits.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900 uppercase mb-2">Pending approvals</p>
              {pendingDeposits.map((tx: any) => (
                <div key={tx._id} className="flex items-center justify-between gap-2 text-sm mb-2 last:mb-0">
                  <span>
                    {(tx.agent as any)?.name || (tx.agent as any)?.username} — R{Number(tx.amount).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await walletAPI.approveAgentDeposit(String(tx._id));
                        toast.success('Deposit approved');
                        onRefresh?.();
                        setPendingDeposits((prev) => prev.filter((p) => p._id !== tx._id));
                      } catch (e: unknown) {
                        const err = e as { response?: { data?: { message?: string } } };
                        toast.error(err?.response?.data?.message || 'Failed');
                      }
                    }}
                    className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    Approve
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {view === 'withdraw' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Choose an agent, enter the amount, and collect cash in person. The agent receives an SMS notification to verify and hand over cash.
          </p>
          <p className="text-xs text-slate-500">Balance: R{balance.toFixed(2)}</p>
          <MerchantAgentPicker currentUserId={walletUserId} value={withdrawAgentId} onChange={setWithdrawAgentId} />
          <input
            type="number"
            placeholder="Amount (ZAR, min R10)"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
          <button
            type="button"
            onClick={() => void handleWithdraw()}
            disabled={withdrawSubmitting}
            className="w-full rounded-full bg-sky-500 py-3 font-semibold text-white disabled:opacity-50"
          >
            {withdrawSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send to agent & arrange pickup'}
          </button>
          {withdrawRef ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-center">
              <p className="text-xs text-sky-800">Pickup reference</p>
              <p className="font-mono font-bold text-slate-900">{withdrawRef}</p>
              <p className="text-xs text-slate-600 mt-1">Show this to the agent when collecting cash.</p>
            </div>
          ) : null}
        </div>
      )}

      {view === 'agents' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Search for an approved cash agent near you.</p>
          <MerchantAgentPicker currentUserId={walletUserId} value={withdrawAgentId} onChange={setWithdrawAgentId} />
        </div>
      )}

      {view === 'pickup' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">References for cash withdrawals sent to agents.</p>
          {loadingPickup ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
            </div>
          ) : pickupRows.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No withdrawal references yet.</p>
          ) : (
            pickupRows.map((row) => (
              <div key={row._id} className="rounded-xl border border-slate-100 p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-semibold">{row.reference}</p>
                  <p className="text-xs text-slate-600">
                    R{Number(row.amount).toFixed(2)} — {(row.agent as any)?.name || (row.agent as any)?.username || 'Agent'}
                  </p>
                </div>
                <button type="button" onClick={() => void copyRef(row.reference)} className="text-sky-600">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </FlowModal>
  );
}
