'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Plus,
  TrendingUp,
  Loader2,
  Send,
  Wallet,
  ArrowDownToLine,
  ScanLine,
  CreditCard,
  Store,
  Bell,
  Check,
  X,
  Inbox,
} from 'lucide-react';

import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { paymentsAPI, walletAPI, suppliersAPI, checkoutAPI } from '@/lib/api';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { openPayGatePayment } from '@/lib/payGateRedirect';
import { WalletQrScanner } from '@/components/WalletQrScanner';
import { parseAcbPayUserId } from '@/lib/walletQr';
import { useWalletPaymentSocket } from '@/lib/useWalletPaymentSocket';
import { FlowModal } from '@/components/wallet/FlowModal';
import { WalletTransactionRow } from '@/components/wallet/WalletTransactionRow';
import { WalletQrCard } from '@/components/wallet/WalletQrCard';
import { QrScannerModal } from '@/components/wallet/QrScannerModal';
import { PhoneVerifyModal } from '@/components/wallet/PhoneVerifyModal';
import { PayAtShopFlow } from '@/components/wallet/PayAtShopFlow';
import { PayMoneyFlow } from '@/components/wallet/PayMoneyFlow';
import { CashAgentsFlow } from '@/components/wallet/CashAgentsFlow';

function WalletDashboard() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const handleLogout = () => {
    logout();
    router.push('/');
  };
  const [balance, setBalance] = useState(0);
  const [walletRoles, setWalletRoles] = useState({ user: true, merchant: false, runner: false, agent: false });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [orderPurchases, setOrderPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // QR & payment
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [showRequestMoney, setShowRequestMoney] = useState(false);
  const [showAcceptPayment, setShowAcceptPayment] = useState(false);
  const [moneyRequests, setMoneyRequests] = useState<any[]>([]);
  const [payRequestId, setPayRequestId] = useState<string | null>(searchParams.get('payRequest'));
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(searchParams.get('pendingPayment'));
  const [pendingPayment, setPendingPayment] = useState<{ _id: string; amount: number; merchantName: string } | null>(null);
  const [cards, setCards] = useState<Array<{ _id: string; last4: string; brand: string; expiryMonth: number; expiryYear: number; isDefault: boolean }>>([]);
  const [addCardLoading, setAddCardLoading] = useState(false);
  const [payWithCardLoading, setPayWithCardLoading] = useState<string | null>(null);

  // Request money form
  const [reqToUsername, setReqToUsername] = useState('');
  const [reqAmount, setReqAmount] = useState('');
  const [reqMessage, setReqMessage] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);

  // Accept payment (merchant) form
  const [acceptPayerId, setAcceptPayerId] = useState('');
  const [acceptAmount, setAcceptAmount] = useState('');
  const [acceptMerchantName, setAcceptMerchantName] = useState('');
  const [showMerchantScanner, setShowMerchantScanner] = useState(false);
  const [acceptPaymentRequestId, setAcceptPaymentRequestId] = useState<string | null>(null);
  const [acceptStep, setAcceptStep] = useState<'scan' | 'waiting' | 'done'>('scan');
  const [acceptSubmitting, setAcceptSubmitting] = useState(false);

  // Merchant agent (cash-in / cash-out)
  const [maEnabled, setMaEnabled] = useState(false);
  const [maNote, setMaNote] = useState('');
  const [maSaving, setMaSaving] = useState(false);
  const [maDepositUser, setMaDepositUser] = useState('');
  const [maDepositCustomerId, setMaDepositCustomerId] = useState('');
  const [showAgentDepositScanner, setShowAgentDepositScanner] = useState(false);
  const [maDepositAmount, setMaDepositAmount] = useState('');
  const [maDepositSubmitting, setMaDepositSubmitting] = useState(false);
  const [maWithdrawAmount, setMaWithdrawAmount] = useState('');
  const [maWithdrawAgentId, setMaWithdrawAgentId] = useState('');
  const [maWithdrawSubmitting, setMaWithdrawSubmitting] = useState(false);
  const [maPending, setMaPending] = useState<{ asCustomer: any[]; asAgent: any[] } | null>(null);
  const [maUrlTx, setMaUrlTx] = useState<any | null>(null);
  const [maApproveSubmitting, setMaApproveSubmitting] = useState(false);
  const [maHistory, setMaHistory] = useState<any[]>([]);
  const [maApplicationStatus, setMaApplicationStatus] = useState<string>('none');
  const [maBusinessName, setMaBusinessName] = useState('');
  const [maBusinessDesc, setMaBusinessDesc] = useState('');
  const [maRejectionReason, setMaRejectionReason] = useState('');
  const [maCanApply, setMaCanApply] = useState(false);
  const [maIsApproved, setMaIsApproved] = useState(false);
  const [maApplySubmitting, setMaApplySubmitting] = useState(false);
  const [maKycCheck, setMaKycCheck] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [showScanQr, setShowScanQr] = useState(false);
  const [showPayAtShop, setShowPayAtShop] = useState(false);
  const [showPayMoney, setShowPayMoney] = useState(false);
  const [showCashAgents, setShowCashAgents] = useState(false);
  const [showCardsModal, setShowCardsModal] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [payingRequestId, setPayingRequestId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const acceptPaymentRequestIdRef = useRef<string | null>(null);

  const walletUserId = String((user as { _id?: string; id?: string })?._id || (user as { id?: string })?.id || '');
  const walletReturnTo = (searchParams.get('returnTo') || '').trim();
  const phoneVerified = Boolean((user as { phone?: string })?.phone?.trim());
  const qrDisplayName = (user as { name?: string; username?: string })?.name || (user as { username?: string })?.username;

  const clearWalletQueryParams = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    ['addCard', 'cardPayment', 'pendingPayment', 'payRequest', 'pgType', 'pgRef'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const applyPendingPayment = useCallback(
    (p: { paymentRequestId?: string; _id?: string; amount: number; merchantName: string }, notify = false) => {
      const id = String(p.paymentRequestId || p._id || '');
      if (!id) return;
      setPendingPaymentId(id);
      setPendingPayment({ _id: id, amount: p.amount, merchantName: p.merchantName });
      setShowPayAtShop(true);
      if (notify) {
        toast.success(`Pay R${p.amount.toFixed(2)} at ${p.merchantName}? Confirm below.`, { duration: 8000 });
      }
    },
    []
  );

  acceptPaymentRequestIdRef.current = acceptPaymentRequestId;

  useEffect(() => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (scroller.scrollHeight <= scroller.clientHeight) return;
      scroller.scrollTop += e.deltaY;
      e.preventDefault();
    };
    scroller.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => scroller.removeEventListener('wheel', onWheel, { capture: true });
  }, [loading]);

  useEffect(() => {
    fetchWalletData();
  }, []);

  useEffect(() => {
    if (!user) return;
  suppliersAPI
      .getMe()
      .then((res) => {
        const sn = (res.data as { data?: { storeName?: string } })?.data?.storeName;
        if (sn?.trim()) setAcceptMerchantName(sn.trim());
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (maBusinessName?.trim() && !acceptMerchantName.trim()) {
      setAcceptMerchantName(maBusinessName.trim());
    }
  }, [maBusinessName]);

  useEffect(() => {
    const wantSell = searchParams.get('accept') === '1' || searchParams.get('merchant') === '1';
    if (wantSell && walletRoles.merchant) {
      setShowAcceptPayment(true);
    }
  }, [searchParams, walletRoles.merchant]);

  useEffect(() => {
    const topup = searchParams.get('topup');
    if (topup === 'wallet' || topup === 'card') {
      setShowAddFunds(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        const [qrRes, reqRes, cardsRes] = await Promise.all([
          walletAPI.getQrPayload(),
          walletAPI.getMoneyRequests(),
          walletAPI.getCards().catch(() => ({ data: [] })),
        ]);
        setQrPayload(qrRes.data?.payload ?? null);
        setMoneyRequests(reqRes.data ?? []);
        setCards(cardsRes.data ?? []);
      } catch {
        // ignore
      }
    };
    if (user) void load();
  }, [user]);

  useEffect(() => {
    const pid = searchParams.get('pendingPayment');
    if (pid) {
      setPendingPaymentId(pid);
      setShowPayAtShop(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!pendingPaymentId || !user) return;
    walletAPI.getPendingPayment(pendingPaymentId)
      .then((res) => setPendingPayment(res.data))
      .catch(() => setPendingPayment(null));
  }, [pendingPaymentId, user]);

  /** Fallback poll when socket missed (e.g. laptop buyer showing QR). Socket is primary — keep interval gentle. */
  useEffect(() => {
    if (!walletUserId || pendingPaymentId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delayMs = 30_000;

    const schedule = () => {
      timer = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled || pendingPaymentId || (typeof document !== 'undefined' && document.hidden)) {
        if (!cancelled) schedule();
        return;
      }
      try {
        const res = await walletAPI.getPendingPaymentsForPayer();
        const list = Array.isArray(res.data) ? res.data : [];
        if (!cancelled && list.length > 0) {
          const latest = list[0];
          applyPendingPayment(
            { _id: String(latest._id), amount: latest.amount, merchantName: latest.merchantName },
            false
          );
          return;
        }
        delayMs = 30_000;
      } catch (err: unknown) {
        const status = Number((err as { response?: { status?: number } })?.response?.status || 0);
        if (status === 429) delayMs = Math.min(delayMs * 2, 120_000);
      }
      if (!cancelled) schedule();
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [walletUserId, pendingPaymentId, applyPendingPayment]);

  useEffect(() => {
    const addCard = searchParams.get('addCard');
    const cardPayment = searchParams.get('cardPayment');
    if (addCard === 'success') {
      toast.success('Card added successfully');
      fetchWalletData();
      walletAPI.getCards().then((r) => setCards(r.data ?? []));
      clearWalletQueryParams();
    }
    if (cardPayment === 'done') {
      toast.success('Payment completed');
      fetchWalletData();
      setPendingPayment(null);
      setPendingPaymentId(null);
      clearWalletQueryParams();
    }
  }, [searchParams, clearWalletQueryParams]);

  useEffect(() => {
    const rid = searchParams.get('payRequest');
    if (rid) {
      setPayRequestId(rid);
      setShowPayMoney(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const pgType = searchParams.get('pgType');
    const pgRef = searchParams.get('pgRef');
    if (pgType !== 'topup' || !pgRef) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 14;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await paymentsAPI.getStatus(pgRef);
        const status = String(res.data?.payment?.status || '');
        if (status === 'successful') {
          if (!cancelled) {
            toast.success('Top-up completed');
            await fetchWalletData();
            router.replace('/wallet', { scroll: false });
          }
          return;
        }
      } catch {
        // keep polling briefly; webhook might still be processing
      }
      if (!cancelled && attempts < maxAttempts) {
        setTimeout(poll, 2500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const loadMerchantAgent = async () => {
    if (!user) return;
    try {
      const [settings, pending, hist] = await Promise.all([
        walletAPI.getMerchantAgentSettings(),
        walletAPI.getMerchantAgentPending(),
        walletAPI.getMerchantAgentHistory(15).catch(() => ({ data: [] as any[] })),
      ]);
      const s = settings.data;
      setMaEnabled(!!s?.enabled);
      setMaNote(s?.publicNote ?? '');
      setMaApplicationStatus(s?.applicationStatus ?? 'none');
      setMaBusinessName(s?.businessName ?? '');
      setMaBusinessDesc(s?.businessDescription ?? '');
      setMaRejectionReason(s?.rejectionReason ?? '');
      setMaCanApply(!!s?.canApply);
      setMaIsApproved(!!s?.isApproved);
      setMaPending(pending.data ?? null);
      setMaHistory(Array.isArray(hist.data) ? hist.data : []);
    } catch {
      // optional
    }
  };

  useEffect(() => {
    if (user) void loadMerchantAgent();
  }, [user]);

  useEffect(() => {
    const txId = searchParams.get('agentCashTx');
    if (!txId || !user) {
      setMaUrlTx(null);
      return;
    }
    walletAPI
      .getMerchantAgentTx(txId)
      .then((r) => setMaUrlTx(r.data))
      .catch(() => setMaUrlTx(null));
  }, [searchParams, user]);

  useEffect(() => {
    if (searchParams.get('pendingDonate') !== '1') return;
    const run = async () => {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('pending_donation') : null;
        if (!raw) return;
        const parsed = JSON.parse(raw) as { recipientId?: string; amount?: number; createdAt?: number };
        if (!parsed?.recipientId || !parsed?.amount) return;
        if (parsed.createdAt && Date.now() - parsed.createdAt > 30 * 60 * 1000) {
          localStorage.removeItem('pending_donation');
          return;
        }
        const balRes = await walletAPI.getBalance();
        const balanceNow = Number(balRes.data?.balance ?? 0);
        if (balanceNow < Number(parsed.amount)) {
          toast.error('Top-up is still processing. Donation will be available once wallet is credited.');
          return;
        }
        await walletAPI.donate(Number(parsed.amount), String(parsed.recipientId));
        localStorage.removeItem('pending_donation');
        toast.success('Donation sent successfully');
        fetchWalletData();
      } catch (error: any) {
        toast.error(error?.response?.data?.error || error?.response?.data?.message || 'Could not complete pending donation');
      }
    };
    void run();
  }, [searchParams]);

  const fetchWalletData = async () => {
    try {
      const [balanceRes, transRes, reqRes] = await Promise.all([
        walletAPI.getBalance(),
        walletAPI.getTransactions({ limit: 20 }),
        walletAPI.getMoneyRequests(),
      ]);
      setBalance(balanceRes.data.balance || 0);
      setTransactions(transRes.data || []);
      setMoneyRequests(reqRes.data ?? []);
      checkoutAPI.getMyOrders({ page: 1, limit: 10 }).then((r) => {
        const rows = r.data?.data ?? [];
        setOrderPurchases(Array.isArray(rows) ? rows : []);
      }).catch(() => setOrderPurchases([]));
    } catch (error) {
      toast.error('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  useWalletPaymentSocket(walletUserId || undefined, {
    onPendingPayment: (payload) => applyPendingPayment(payload, true),
    onMoneyRequest: (payload) => {
      toast(`Send R${payload.amount.toFixed(2)} to ${payload.requesterName}? See Request & Receive.`, { duration: 6000 });
      void fetchWalletData();
    },
    onPaymentCompleted: (payload) => {
      if (acceptPaymentRequestIdRef.current && payload.paymentRequestId === acceptPaymentRequestIdRef.current) {
        setAcceptStep('done');
        toast.success('Payment received!');
        void fetchWalletData();
      }
    },
    onRefreshBalance: () => void fetchWalletData(),
  });

  const handleRequestMoney = async () => {
    const amount = parseFloat(reqAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!reqToUsername.trim()) {
      toast.error('Enter username or user ID');
      return;
    }
    setReqSubmitting(true);
    try {
      const isId = /^[a-f0-9]{24}$/i.test(reqToUsername.trim());
      await walletAPI.requestMoney({
        ...(isId ? { toUserId: reqToUsername.trim() } : { toUsername: reqToUsername.trim() }),
        amount,
        message: reqMessage.trim() || undefined,
      });
      toast.success('Payment request sent successfully.');
      setShowRequestMoney(false);
      setReqToUsername('');
      setReqAmount('');
      setReqMessage('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to send request');
    } finally {
      setReqSubmitting(false);
    }
  };

  const handlePayRequest = async (requestId: string) => {
    setPayingRequestId(requestId);
    try {
      const res = await walletAPI.payRequest(requestId);
      const data = res.data as {
        message?: string;
        code?: string;
        paymentUrl?: string;
        payGateRedirect?: { processUrl: string; payRequestId: string; checksum: string };
        shortfall?: number;
      };
      if (data?.code === 'TOPUP_REQUIRED' && (data?.paymentUrl || data?.payGateRedirect)) {
        const ok = window.confirm(
          'Your balance is too low. Complete the card payment to top up, then pay this request again. Open PayGate now?'
        );
        if (ok) openPayGatePayment({ paymentUrl: data.paymentUrl, payGateRedirect: data.payGateRedirect });
        return;
      }
      if (data?.paymentUrl || data?.payGateRedirect) {
        openPayGatePayment({ paymentUrl: data.paymentUrl, payGateRedirect: data.payGateRedirect });
        return;
      }
      toast.success(data?.message || 'Payment sent!');
      setPayRequestId(null);
      setShowPayMoney(false);
      fetchWalletData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to pay');
    } finally {
      setPayingRequestId(null);
    }
  };

  const openWalletTopUp = () => {
    setShowAddFunds(true);
  };


  useEffect(() => {
    if (acceptStep !== 'waiting' || !acceptPaymentRequestId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await walletAPI.getPaymentRequestStatus(acceptPaymentRequestId);
        const st = res.data?.status;
        if (st === 'completed') {
          setAcceptStep('done');
          toast.success('Payment received!');
          fetchWalletData();
          return;
        }
        if (st === 'expired' || st === 'cancelled') {
          toast.error('Payment request expired');
          setAcceptStep('scan');
          setAcceptPaymentRequestId(null);
          return;
        }
      } catch { /* ignore */ }
      if (!cancelled) setTimeout(poll, 2500);
    };
    void poll();
    return () => { cancelled = true; };
  }, [acceptStep, acceptPaymentRequestId]);
  const handleAcceptPaymentStep1 = async () => {
    const amount = parseFloat(acceptAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    const payerId = acceptPayerId.trim().replace(/^ACBPAY:/, '');
    if (!payerId) {
      toast.error('Enter payer ID from scanned QR');
      return;
    }
    setAcceptSubmitting(true);
    try {
      const fromRaw = acceptPayerId.trim().startsWith('ACBPAY:') ? acceptPayerId.trim() : `ACBPAY:${payerId}`;
      const storeLabel = acceptMerchantName.trim() || (user as { name?: string })?.name || 'Store';
      const res = await walletAPI.paymentFromScan(fromRaw, amount, storeLabel);
      setAcceptPaymentRequestId(res.data?.paymentRequestId);
      setAcceptStep('waiting');
      toast.success('Waiting for customer to confirm in their wallet');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally {
      setAcceptSubmitting(false);
    }
  };



  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await walletAPI.topUp(amount, walletReturnTo || '/wallet');
      const paymentUrl = res.data?.paymentUrl;
      const payGateRedirect = res.data?.payGateRedirect;
      if (paymentUrl || payGateRedirect) {
        setShowAddFunds(false);
        openPayGatePayment({ paymentUrl, payGateRedirect });
        return;
      }
      toast.success('Top-up initiated');
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Top-up failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 10) {
      toast.error('Minimum withdrawal is R10');
      return;
    }
    if (amount > balance) {
      toast.error('Insufficient balance');
      return;
    }

    setIsWithdrawing(true);
    try {
      await walletAPI.withdraw(amount);
      toast.success(`R${amount.toFixed(2)} withdrawal requested. Processed within 24 hours.`);
      setWithdrawAmount('');
      setShowWithdraw(false);
      fetchWalletData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'topup':
        return <Plus className="h-5 w-5 text-emerald-600" />;
      case 'payout':
        return <ArrowDownLeft className="h-5 w-5 text-sky-600" />;
      case 'credit':
        return <ArrowUpRight className="h-5 w-5 text-emerald-600" />;
      case 'debit':
        return <ArrowDownLeft className="h-5 w-5 text-rose-600" />;
      case 'escrow':
        return <Send className="h-5 w-5 text-purple-600" />;
      case 'refund':
        return <ArrowUpRight className="h-5 w-5 text-cyan-600" />;
      default:
        return <TrendingUp className="h-5 w-5 text-slate-400" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'topup':
      case 'refund':
      case 'credit':
        return 'text-emerald-700';
      case 'payout':
        return 'text-sky-700';
      case 'debit':
        return 'text-rose-700';
      case 'escrow':
        return 'text-purple-700';
      default:
        return 'text-slate-700';
    }
  };

  const roleRaw = (user as { role?: string | string[] })?.role;
  const roles = Array.isArray(roleRaw) ? roleRaw : roleRaw ? [roleRaw] : [];
  const isMerchantWallet = walletRoles.merchant || roles.includes('admin') || roles.includes('superadmin');

  const monthlyTransactions = transactions.filter((tx) => {
    const d = new Date(tx.createdAt || tx.date || 0);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyFundsIn = monthlyTransactions
    .filter((tx) => ['topup', 'refund', 'credit'].includes(String(tx.type)))
    .reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0);
  const monthlyFundsOut = monthlyTransactions
    .filter((tx) => ['debit', 'payout', 'escrow'].includes(String(tx.type)))
    .reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0);
  const emailVerified = Boolean((user as { isVerified?: boolean })?.isVerified);

  return (
    <div
      data-wallet-page="true"
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900"
    >
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <>
            <Wallet className="h-5 w-5 text-sky-600 shrink-0" />
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 min-w-0 break-words sm:truncate">ACBPayWallet</h1>
          </>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />

      <div className="flex min-h-0 min-w-0 w-full flex-1">
        <AppSidebar
          variant="wall"
          userName={user?.name}
          userAvatar={(user as any)?.avatar}
          userId={user?._id || user?.id}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          hideLogo
          belowHeader
        />
        <div
          ref={scrollContainerRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-x-hidden overflow-y-auto overscroll-y-contain lg:flex-row"
        >
          <main className="order-2 min-w-0 w-full flex-1 px-4 pt-0 pb-24 sm:px-6 lg:order-none lg:px-8 lg:pb-6">
          <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : (
          <div className="grid gap-3 lg:grid-cols-1">
            {pendingPayment && (
              <div className="lg:col-span-3 rounded-xl border-2 border-sky-200 bg-sky-50 p-3">
                <p className="font-semibold text-sky-900">Pay R{pendingPayment.amount.toFixed(2)} at {pendingPayment.merchantName}</p>
                <p className="text-sm text-sky-700 mt-1">Choose how to pay:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {balance >= pendingPayment.amount && (
                    <button
                      onClick={async () => {
                        try {
                          await walletAPI.payPendingWithWallet(pendingPayment._id);
                          toast.success('Payment sent!');
                          fetchWalletData();
                          setPendingPayment(null);
                          setPendingPaymentId(null);
                          router.replace('/wallet', { scroll: false });
                        } catch (e: any) {
                          toast.error(e?.response?.data?.message || 'Payment failed');
                        }
                      }}
                      className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                    >
                      Pay with wallet
                    </button>
                  )}
                  {cards.map((c) => (
                    <button
                      key={c._id}
                      onClick={async () => {
                        setPayWithCardLoading(c._id);
                        try {
                          const res = await walletAPI.payWithCard(pendingPayment._id, c._id);
                          if (res.data?.paymentUrl || res.data?.payGateRedirect) {
                            openPayGatePayment({
                              paymentUrl: res.data?.paymentUrl,
                              payGateRedirect: res.data?.payGateRedirect,
                            });
                          }
                        } catch (e: any) {
                          toast.error(e?.response?.data?.message || 'Could not start payment');
                        } finally {
                          setPayWithCardLoading(null);
                        }
                      }}
                      disabled={!!payWithCardLoading}
                      className="rounded-lg border-2 border-sky-500 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50 disabled:opacity-50"
                    >
                      {payWithCardLoading === c._id ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
                      {c.brand} •••• {c.last4}
                    </button>
                  ))}
                  <button
                    onClick={async () => {
                      setPayWithCardLoading('new');
                      try {
                        const res = await walletAPI.payWithCard(pendingPayment._id);
                        if (res.data?.paymentUrl || res.data?.payGateRedirect) {
                          openPayGatePayment({
                            paymentUrl: res.data.paymentUrl,
                            payGateRedirect: res.data.payGateRedirect,
                          });
                        }
                      } catch (e: any) {
                        toast.error(e?.response?.data?.message || 'Could not start payment');
                      } finally {
                        setPayWithCardLoading(null);
                      }
                    }}
                    disabled={!!payWithCardLoading}
                    className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    {payWithCardLoading === 'new' ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
                    Pay with card
                  </button>
                  {balance < pendingPayment.amount && (
                    <button
                      type="button"
                      onClick={openWalletTopUp}
                      className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      Top up wallet first
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPayAtShop(true)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                  >
                    Open confirm screen
                  </button>
                </div>
              </div>
            )}
            {maUrlTx && maUrlTx.status === 'pending_customer' && maUrlTx.kind === 'cash_deposit' && user && String(maUrlTx.customer?._id || maUrlTx.customer) === String(user._id || user.id) && (
              <div className="lg:col-span-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">Approve cash deposit</p>
                <p className="text-sm text-emerald-800 mt-1">
                  {(maUrlTx.agent as any)?.name || (maUrlTx.agent as any)?.username || 'Agent'} requests to credit{' '}
                  <strong>R{Number(maUrlTx.amount).toFixed(2)}</strong> to your wallet (you paid them cash).
                </p>
                <button
                  type="button"
                  disabled={maApproveSubmitting}
                  onClick={async () => {
                    setMaApproveSubmitting(true);
                    try {
                      await walletAPI.approveAgentDeposit(String(maUrlTx._id));
                      toast.success('Wallet credited');
                      setMaUrlTx(null);
                      router.replace('/wallet', { scroll: false });
                      fetchWalletData();
                      loadMerchantAgent();
                    } catch (e: any) {
                      toast.error(e?.response?.data?.message || 'Could not approve');
                    } finally {
                      setMaApproveSubmitting(false);
                    }
                  }}
                  className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {maApproveSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Approve deposit'}
                </button>
              </div>
            )}
            {!(user as any)?.phone && (
              <div className="lg:col-span-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
                <p className="text-amber-800 text-sm font-medium">
                  Verify your phone to use Show QR, Scan QR, and in-store payments.
                </p>
                <button
                  type="button"
                  onClick={() => setShowPhoneVerify(true)}
                  className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Verify Now
                </button>
              </div>
            )}
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">ACBPay Wallet</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Manage payments, transfers, QR payments and cash services.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4 text-sky-600" />
                  <span className="hidden sm:inline">Notifications</span>
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-600 p-5 text-white shadow-lg shadow-sky-200">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Wallet balance</p>
                  <p className="mt-2 text-4xl font-bold sm:text-5xl">R {balance.toFixed(2).replace('.', ',')}</p>
                  <p className="mt-1 text-sm text-white/80">Available balance</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddFunds(true)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-white/90"
                    >
                      <Plus className="h-4 w-4" />
                      Add Funds
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowWithdraw(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                      Withdraw
                    </button>
                  </div>
                  {walletReturnTo && walletReturnTo.startsWith('/') ? (
                    <Link
                      href={walletReturnTo}
                      className="mt-3 inline-flex rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
                    >
                      ← Back
                    </Link>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Account status</p>
                  <ul className="mt-4 space-y-3 text-sm text-slate-700">
                    <li className="flex items-center gap-2">
                      {emailVerified ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" />
                          Email verified
                        </>
                      ) : (
                        <>
                          <span className="h-4 w-4 rounded-full border-2 border-amber-500" />
                          Email not verified
                        </>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      {phoneVerified ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" />
                          Phone verified
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowPhoneVerify(true)}
                          className="flex items-center gap-2 text-amber-700 hover:text-amber-800"
                        >
                          <span className="h-4 w-4 rounded-full border-2 border-amber-500" />
                          Verify phone
                        </button>
                      )}
                    </li>
                  </ul>
                </div>
              </div>

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quick actions</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Pay', icon: Send, onClick: () => setShowPayMoney(true) },
                    { label: 'Receive', icon: Inbox, onClick: () => setShowReceive(true) },
                    {
                      label: 'Scan QR',
                      icon: ScanLine,
                      onClick: () => (phoneVerified ? setShowScanQr(true) : setShowPhoneVerify(true)),
                    },
                    { label: 'Cards', icon: CreditCard, onClick: () => setShowCardsModal(true) },
                  ].map(({ label, icon: Icon, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-sm hover:border-sky-200 hover:bg-sky-50/40"
                    >
                      <Icon className="h-6 w-6 text-sky-600" />
                      <span className="text-sm font-semibold text-slate-900">{label}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Services</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setShowPayAtShop(true)}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-sky-200"
                  >
                    <Store className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                    <div>
                      <p className="font-semibold text-slate-900">Pay at Shop</p>
                      <p className="mt-0.5 text-xs text-slate-500">Use QR at checkout</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCashAgents(true)}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-sky-200"
                  >
                    <DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-semibold text-slate-900">Cash &amp; Agents</p>
                      <p className="mt-0.5 text-xs text-slate-500">Deposit / withdraw cash</p>
                    </div>
                  </button>
                </div>
              </section>


              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent transactions</p>
                  {transactions.length === 0 ? (
                    <p className="mt-10 text-center text-sm text-slate-500">No transactions yet</p>
                  ) : (
                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                      {transactions.slice(0, 10).map((tx, idx) => (
                        <WalletTransactionRow
                          key={tx.reference ? `${tx.reference}-${idx}` : idx}
                          tx={tx}
                          icon={getTransactionIcon(tx.type)}
                          amountClassName={getTransactionColor(tx.type)}
                          amountPrefix={['topup', 'refund', 'credit'].includes(tx.type) ? '+' : '-'}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Linked cards</p>
                  {cards.length === 0 ? (
                    <div className="mt-6">
                      <p className="font-semibold text-slate-900">No cards linked</p>
                      <p className="mt-1 text-sm text-slate-500">Add a debit/credit card for faster transactions.</p>
                      <button
                        type="button"
                        onClick={() => setShowCardsModal(true)}
                        className="mt-4 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                      >
                        Link Card
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {cards.map((c) => (
                        <div key={c._id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm">
                          <span className="font-medium text-slate-900">
                            {c.brand} •••• {c.last4}
                          </span>
                          {c.isDefault ? <span className="text-xs font-semibold text-sky-600">Default</span> : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowCardsModal(true)}
                        className="mt-2 text-sm font-semibold text-sky-600 hover:text-sky-700"
                      >
                        Manage cards
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div id="wallet-qr-card" className="scroll-mt-24">
                  <WalletQrCard
                    payload={qrPayload}
                    displayName={qrDisplayName}
                    phoneVerified={phoneVerified}
                    onNeedPhone={() => setShowPhoneVerify(true)}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Monthly summary</p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Funds In</dt>
                      <dd className="font-semibold text-emerald-600">R {monthlyFundsIn.toFixed(0)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Funds Out</dt>
                      <dd className="font-semibold text-slate-900">R {monthlyFundsOut.toFixed(0)}</dd>
                    </div>
                    <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                      <dt className="font-semibold text-slate-900">Balance</dt>
                      <dd className="text-lg font-bold text-sky-600">R {balance.toFixed(0)}</dd>
                    </div>
                  </dl>
                </div>
              </div>

            </div>
          </div>
          )}
          </div>
          </main>
          <AdvertSlot
            belowHeader
            scrollWithPage
            bottomContent={
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-sky-600">Quick info</p>
                      <h3 className="text-sm font-semibold text-slate-900">Wallet tips</h3>
                    </div>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-600">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                      <span>Top up anytime for instant payouts.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
                      <span>Escrow funds are held securely during tasks.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500 flex-shrink-0" />
                      <span>Withdrawals processed within 24 hours.</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 p-3 text-white shadow-sm">
                  <p className="text-[10px] uppercase tracking-wider text-white/80">Security</p>
                  <h3 className="mt-1 text-sm font-semibold">Your funds are protected</h3>
                  <p className="mt-1 text-xs text-white/80">All transactions are encrypted and verified. Need help? Contact support.</p>
                  <Link
                    href="/support?category=wallet:other"
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition hover:bg-white/20"
                  >
                    Get help
                  </Link>
                </div>
              </>
            }
          />
        </div>
      </div>
      {/* Request money modal */}
      {showRequestMoney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Request money</h3>
            <p className="text-sm text-slate-600 mb-4">Enter their username or user ID. They will receive a WhatsApp/SMS with a pay link.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username or User ID</label>
                <input
                  value={reqToUsername}
                  onChange={(e) => setReqToUsername(e.target.value)}
                  placeholder="e.g. johndoe or 64abc..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZAR)</label>
                <input
                  type="number"
                  value={reqAmount}
                  onChange={(e) => setReqAmount(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message (optional)</label>
                <input
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                  placeholder="e.g. For lunch"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowRequestMoney(false)} className="flex-1 rounded-lg border py-2 font-semibold">Cancel</button>
              <button onClick={handleRequestMoney} disabled={reqSubmitting} className="flex-1 rounded-lg bg-sky-500 py-2 font-semibold text-white">
                {reqSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PhoneVerifyModal
        open={showPhoneVerify}
        userId={walletUserId}
        onClose={() => setShowPhoneVerify(false)}
        onSaved={() => void refreshUser()}
      />
      <QrScannerModal
        open={showScanQr}
        onClose={() => setShowScanQr(false)}
        phoneVerified={phoneVerified}
        onNeedPhone={() => setShowPhoneVerify(true)}
        onPaid={() => void fetchWalletData()}
      />
      <PayAtShopFlow
        open={showPayAtShop}
        onClose={() => setShowPayAtShop(false)}
        balance={balance}
        cards={cards}
        initialPendingId={pendingPaymentId}
        pending={pendingPayment}
        onTopUp={openWalletTopUp}
        onComplete={() => {
          void fetchWalletData();
          setPendingPayment(null);
          setPendingPaymentId(null);
          clearWalletQueryParams();
        }}
      />
      <PayMoneyFlow
        open={showPayMoney}
        onClose={() => setShowPayMoney(false)}
        balance={balance}
        moneyRequests={moneyRequests}
        highlightRequestId={payRequestId}
        onPay={(id) => void handlePayRequest(id)}
        payingId={payingRequestId}
      />
      <CashAgentsFlow
        open={showCashAgents}
        onClose={() => setShowCashAgents(false)}
        balance={balance}
        walletUserId={walletUserId}
        userPhone={(user as { phone?: string })?.phone}
        username={(user as { username?: string })?.username}
        displayName={qrDisplayName}
        onRefresh={() => {
          void fetchWalletData();
          void loadMerchantAgent();
        }}
      />

      <FlowModal open={showAddFunds} title="Add Funds" onClose={() => setShowAddFunds(false)} maxWidthClass="max-w-md">
        <p className="text-sm text-slate-600 mb-4">Top up your wallet securely via PayGate.</p>
        <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZAR)</label>
        <input
          type="number"
          value={topUpAmount}
          onChange={(e) => setTopUpAmount(e.target.value)}
          placeholder="e.g. 100"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 mb-4"
        />
        <button
          type="button"
          onClick={() => void handleTopUp()}
          disabled={isSubmitting}
          className="w-full rounded-full bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Continue to payment'}
        </button>
      </FlowModal>

      <FlowModal open={showWithdraw} title="Withdraw" onClose={() => setShowWithdraw(false)} maxWidthClass="max-w-md">
        <p className="text-sm text-slate-600 mb-1">
          Available: <strong>R{balance.toFixed(2)}</strong>
        </p>
        <p className="text-xs text-slate-500 mb-4">Minimum withdrawal R10. Processed within 24 hours.</p>
        <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZAR)</label>
        <input
          type="number"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          placeholder="e.g. 50"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 mb-4"
        />
        <button
          type="button"
          onClick={() => void handleWithdraw()}
          disabled={isWithdrawing}
          className="w-full rounded-full bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {isWithdrawing ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Request withdrawal'}
        </button>
      </FlowModal>

      <FlowModal open={showReceive} title="Receive" onClose={() => setShowReceive(false)} maxWidthClass="max-w-md">
        <button
          type="button"
          onClick={() => {
            setShowReceive(false);
            setShowRequestMoney(true);
          }}
          className="mb-6 text-sm font-semibold text-sky-600 hover:text-sky-700"
        >
          Request money from someone →
        </button>
        {isMerchantWallet ? (
          <button
            type="button"
            onClick={() => {
              setShowReceive(false);
              setShowAcceptPayment(true);
              setAcceptStep('scan');
            }}
            className="w-full rounded-full bg-sky-600 py-3.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Accept in-store payment
          </button>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Store owner?</p>
            <p className="mt-1">Apply as an approved supplier to accept in-store QR payments.</p>
            <Link href="/supplier/apply" className="mt-2 inline-block font-semibold text-sky-700 hover:underline">
              Apply as supplier →
            </Link>
          </div>
        )}
      </FlowModal>

      {showAcceptPayment && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="w-full max-w-md max-h-[92dvh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl flex flex-col">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="flex-1 text-lg font-semibold text-slate-900 truncate">Accept payment</h2>
              <button
                type="button"
                onClick={() => {
                  setShowAcceptPayment(false);
                  setAcceptStep('scan');
                  setAcceptPaymentRequestId(null);
                  setShowMerchantScanner(false);
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-slate-600 mb-4">
                Scan customer QR → enter amount → they confirm in their wallet.
              </p>
              {acceptStep === 'scan' ? (
                <div className="space-y-3">
                  <input
                    placeholder="Payer ID from QR (e.g. ACBPAY:...)"
                    value={acceptPayerId}
                    onChange={(e) => setAcceptPayerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  {!showMerchantScanner ? (
                    <button
                      type="button"
                      onClick={() => setShowMerchantScanner(true)}
                      className="w-full rounded-lg border-2 border-dashed border-sky-300 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                    >
                      Scan customer QR
                    </button>
                  ) : (
                    <WalletQrScanner
                      title="Scan customer QR"
                      onClose={() => setShowMerchantScanner(false)}
                      onScan={(text) => {
                        const id = parseAcbPayUserId(text);
                        if (!id) {
                          toast.error('Not a valid ACBPayWallet QR');
                          return;
                        }
                        setAcceptPayerId(`ACBPAY:${id}`);
                        setShowMerchantScanner(false);
                      }}
                    />
                  )}
                  <input
                    type="number"
                    placeholder="Amount (ZAR)"
                    value={acceptAmount}
                    onChange={(e) => setAcceptAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Store name shown to buyer"
                    value={acceptMerchantName}
                    onChange={(e) => setAcceptMerchantName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAcceptPayment(false)}
                      className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAcceptPaymentStep1()}
                      disabled={acceptSubmitting}
                      className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {acceptSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Request payment'}
                    </button>
                  </div>
                </div>
              ) : acceptStep === 'waiting' ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                    <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-amber-600" />
                    <p className="font-semibold text-amber-900">Waiting for customer to confirm…</p>
                    <p className="mt-2 text-xs text-amber-800">Customer confirms in their wallet app.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAcceptStep('scan');
                      setAcceptPaymentRequestId(null);
                    }}
                    className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center font-semibold text-emerald-800">
                    Payment received
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAcceptStep('scan');
                      setAcceptPayerId('');
                      setAcceptAmount('');
                      setAcceptPaymentRequestId(null);
                    }}
                    className="w-full rounded-full bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    New payment
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCardsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900">Linked cards</h3>
              <button type="button" onClick={() => setShowCardsModal(false)} className="text-slate-500">Close</button>
            </div>
            {cards.length === 0 ? (
              <p className="text-sm text-slate-600 mb-4">No cards linked yet.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {cards.map((c) => (
                  <div key={c._id} className="flex justify-between rounded-lg border p-3 text-sm">
                    <span>{c.brand} •••• {c.last4}</span>
                    {c.isDefault ? <span className="text-sky-600 font-medium">Default</span> : null}
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={async () => {
                setAddCardLoading(true);
                try {
                  const res = await walletAPI.addCard();
                  if (res.data?.paymentUrl || res.data?.payGateRedirect) {
                    openPayGatePayment({ paymentUrl: res.data.paymentUrl, payGateRedirect: res.data.payGateRedirect });
                  }
                } catch {
                  toast.error('Could not add card');
                } finally {
                  setAddCardLoading(false);
                }
              }}
              disabled={addCardLoading}
              className="w-full rounded-full bg-sky-500 py-3 font-semibold text-white disabled:opacity-50"
            >
              {addCardLoading ? 'Starting…' : 'Link new card'}
            </button>
          </div>
        </div>
      )}

      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
      <style jsx global>{`
        [data-wallet-page] button:not(:disabled),
        [data-wallet-page] a[href],
        [data-wallet-page] [role='button']:not([aria-disabled='true']),
        [data-wallet-page] input[type='button']:not(:disabled),
        [data-wallet-page] input[type='submit']:not(:disabled),
        [data-wallet-page] input[type='reset']:not(:disabled),
        [data-wallet-page] summary {
          cursor: pointer;
        }

        [data-wallet-page] button:disabled,
        [data-wallet-page] input:disabled,
        [data-wallet-page] select:disabled,
        [data-wallet-page] textarea:disabled {
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

export default function WalletPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white" />}>
        <WalletDashboard />
      </Suspense>
    </ProtectedRoute>
  );
}
