'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
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
  QrCode,
  ScanLine,
  CreditCard,
  MessageCircle,
  Trash2,
  Store,
} from 'lucide-react';

const QRCodeSVG = dynamic(() => import('qrcode.react').then((m) => m.QRCodeSVG), { ssr: false });
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
import { WalletModeTabs, type WalletMode } from '@/components/wallet/WalletModeTabs';
import { useWalletPaymentSocket } from '@/lib/useWalletPaymentSocket';
import { WalletTransactionRow } from '@/components/wallet/WalletTransactionRow';
import { MerchantAgentPicker } from '@/components/wallet/MerchantAgentPicker';

function WalletDashboard() {
  const { user, logout } = useAuth();
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
  const [walletView, setWalletView] = useState<WalletMode>('pay');
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const acceptPaymentRequestIdRef = useRef<string | null>(null);

  const walletUserId = String((user as { _id?: string; id?: string })?._id || (user as { id?: string })?.id || '');

  const applyPendingPayment = useCallback(
    (p: { paymentRequestId?: string; _id?: string; amount: number; merchantName: string }, notify = false) => {
      const id = String(p.paymentRequestId || p._id || '');
      if (!id) return;
      setPendingPaymentId(id);
      setPendingPayment({ _id: id, amount: p.amount, merchantName: p.merchantName });
      setWalletView('pay');
      if (notify) {
        toast.success(`Pay R${p.amount.toFixed(2)} at ${p.merchantName}? Confirm below.`, { duration: 8000 });
      }
    },
    []
  );

  acceptPaymentRequestIdRef.current = acceptPaymentRequestId;

  const handleMainWheelCapture: React.WheelEventHandler<HTMLElement> = (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;
    if (scroller.scrollHeight <= scroller.clientHeight) return;
    scroller.scrollTop += e.deltaY;
    e.preventDefault();
  };

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
      setWalletView('sell');
      setShowAcceptPayment(true);
    }
  }, [searchParams, walletRoles.merchant]);

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
    if (pid) setPendingPaymentId(pid);
  }, [searchParams]);

  useEffect(() => {
    if (!pendingPaymentId || !user) return;
    walletAPI.getPendingPayment(pendingPaymentId)
      .then((res) => setPendingPayment(res.data))
      .catch(() => setPendingPayment(null));
  }, [pendingPaymentId, user]);

  /** Poll for in-store payment requests when socket missed (e.g. laptop buyer showing QR). */
  useEffect(() => {
    if (!walletUserId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await walletAPI.getPendingPaymentsForPayer();
        const list = Array.isArray(res.data) ? res.data : [];
        if (cancelled || list.length === 0) return;
        const latest = list[0];
        applyPendingPayment(
          { _id: String(latest._id), amount: latest.amount, merchantName: latest.merchantName },
          false
        );
      } catch {
        /* ignore */
      }
    };
    void tick();
    const interval = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [walletUserId, applyPendingPayment]);

  useEffect(() => {
    const addCard = searchParams.get('addCard');
    const cardPayment = searchParams.get('cardPayment');
    if (addCard === 'success') {
      toast.success('Card added successfully');
      fetchWalletData();
      walletAPI.getCards().then((r) => setCards(r.data ?? []));
      router.replace('/wallet', { scroll: false });
    }
    if (cardPayment === 'done') {
      toast.success('Payment completed');
      fetchWalletData();
      setPendingPayment(null);
      setPendingPaymentId(null);
      router.replace('/wallet', { scroll: false });
    }
  }, [searchParams]);

  useEffect(() => {
    const rid = searchParams.get('payRequest');
    if (rid) setPayRequestId(rid);
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
      fetchWalletData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to pay');
    }
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
      const res = await walletAPI.topUp(amount, '/wallet');
      const paymentUrl = res.data?.paymentUrl;
      const payGateRedirect = res.data?.payGateRedirect;
      if (paymentUrl || payGateRedirect) {
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
  const isAgentWallet = walletRoles.agent || maIsApproved;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
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
          <main
            className="order-2 min-w-0 w-full flex-1 px-4 pt-0 pb-24 sm:px-6 lg:order-none lg:px-8 lg:pb-6"
            onWheelCapture={handleMainWheelCapture}
          >
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
                  {balance < pendingPayment.amount && cards.length === 0 && (
                    <p className="text-sm text-slate-600">Add a card or top up your wallet to pay.</p>
                  )}
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
                  Add your phone number to use QR payments and request money. You&apos;ll receive SMS/WhatsApp verification codes.
                </p>
                <Link href="/profile" className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                  Add phone
                </Link>
              </div>
            )}
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 p-5 sm:p-6 text-white shadow-xl shadow-sky-200">
                <p className="text-xs uppercase tracking-[0.3em] opacity-90">Current balance</p>
                <h2 className="mt-2 text-5xl font-bold">R{balance.toFixed(2)}</h2>
                <p className="mt-3 text-sm opacity-80">Keep it topped up for seamless task payouts.</p>
              </div>

              <WalletModeTabs
                mode={walletView}
                showSell={isMerchantWallet}
                onChange={(m) => {
                  setWalletView(m);
                  if (m === 'sell') setShowAcceptPayment(true);
                }}
              />

              {walletView === 'pay' && (
              <>
              {/* QR code - pay at store */}
              <div className={`rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur ${!(user as any)?.phone ? 'opacity-75' : ''}`}>
                <div className="mb-4 flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Pay at store</p>
                    <h3 className="text-lg font-semibold text-slate-900">Your QR code</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">Show this at checkout. The merchant scans it; you confirm in your wallet.</p>
                {!(user as any)?.phone ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                    <p className="text-amber-800 text-sm">Add your phone number in Profile to receive verification codes.</p>
                    <Link href="/profile" className="mt-2 inline-block text-sm font-semibold text-amber-700 hover:text-amber-800">Add phone →</Link>
                  </div>
                ) : qrPayload ? (
                  <div className="space-y-3">
                    <div className="flex justify-center p-4 bg-white rounded-xl border border-slate-100">
                      <QRCodeSVG value={qrPayload} size={180} level="M" includeMargin />
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const [{ default: QRCode }, { default: jsPDF }] = await Promise.all([
                            import('qrcode'),
                            import('jspdf'),
                          ]);
                          const qrDataUrl = await QRCode.toDataURL(qrPayload!, { width: 256, margin: 2 });
                          const doc = new jsPDF('p', 'mm', 'a4');
                          doc.setFontSize(18);
                          doc.text('ACBPayWallet QR Code', 105, 25, { align: 'center' });
                          doc.setFontSize(10);
                          doc.text('Show this at checkout. Merchant scans → you confirm in your wallet.', 105, 35, { align: 'center' });
                          const qrSize = 60;
                          doc.addImage(qrDataUrl, 'PNG', (210 - qrSize) / 2, 45, qrSize, qrSize);
                          doc.setFontSize(9);
                          doc.text(`ID: ${qrPayload}`, 105, 120, { align: 'center' });
                          doc.save(`ACBPayWallet-QR-${new Date().toISOString().slice(0, 10)}.pdf`);
                          toast.success('PDF downloaded');
                        } catch (e) {
                          toast.error('Could not generate PDF');
                        }
                      }}
                      className="w-full rounded-lg border-2 border-sky-500 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50 flex items-center justify-center gap-2"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                      Download PDF
                    </button>
                  </div>
                ) : null}
              </div>
              {/* Request & Receive money */}
              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-sky-600" />
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-sky-600">P2P</p>
                      <h3 className="text-lg font-semibold text-slate-900">Request & Receive</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRequestMoney(true)}
                    className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                  >
                    Request money
                  </button>
                </div>
                <p className="text-sm text-slate-600 mb-4">Request money from anyone — they get WhatsApp/SMS with a pay link.</p>
                {payRequestId && moneyRequests.some((r: any) => r._id === payRequestId) && (
                  <div className="mb-3 rounded-lg bg-sky-100 p-3 text-sm text-sky-800">
                    You have a payment request. Pay it below.
                  </div>
                )}
                {moneyRequests.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Pending requests</p>
                    {moneyRequests.map((r: any) => (
                      <div key={r._id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <div>
                          <p className="font-semibold text-slate-900">{(r.fromUser as any)?.name || (r.fromUser as any)?.username || 'User'} — R{r.amount?.toFixed(2)}</p>
                          {r.message && <p className="text-xs text-slate-600">{r.message}</p>}
                        </div>
                        <button
                          onClick={() => handlePayRequest(r._id)}
                          disabled={balance < (r.amount || 0)}
                          className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                        >
                          Pay
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Commerce</p>
                    <h3 className="mt-1 text-2xl font-semibold text-slate-900">Product purchase history</h3>
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {orderPurchases.length} recent
                  </span>
                </div>
                {orderPurchases.length === 0 ? (
                  <p className="text-sm text-slate-600">No purchases yet.</p>
                ) : (
                  <div className="space-y-3">
                    {orderPurchases.map((o: any) => (
                      <div key={String(o._id)} className="rounded-xl border border-slate-100 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">ORDER-{String(o._id).slice(-12)}</p>
                          <p className="text-sm font-semibold text-slate-900">R{Number(o?.amounts?.total || 0).toFixed(2)}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {o?.createdAt ? new Date(o.createdAt).toLocaleString() : "—"} · {String(o?.paymentMethod || "card").toUpperCase()} · {String(o?.status || "pending").replace("_", " ")}
                        </p>
                        <div className="mt-2 text-xs text-slate-600">
                          {(Array.isArray(o?.paymentBreakdown?.items) ? o.paymentBreakdown.items : [])
                            .slice(0, 4)
                            .map((it: any, idx: number) => (
                              <p key={`${o._id}-line-${idx}`}>{it.qty} x {it.title} - R{Number(it.price || 0).toFixed(2)}</p>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
              )}

              {/* Accept payment (merchant) */}
              {walletView === 'sell' && !isMerchantWallet && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-amber-950">Tuckshop / store owner?</p>
                <p className="mt-1 text-sm text-amber-900">Apply as an approved supplier to accept QR payments at your till (Phase 1: enter total after basket).</p>
                <Link href="/supplier/apply" className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline">Apply as supplier →</Link>
              </div>
              )}

              {walletView === 'sell' && isMerchantWallet && (
              <div className="rounded-2xl border-2 border-amber-300 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-4 flex items-center gap-2">
                  <ScanLine className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Store / merchant</p>
                    <h3 className="text-lg font-semibold text-slate-900">Accept payment</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">Scan customer QR → enter amount → they confirm in their wallet (no SMS code).</p>
                {!showAcceptPayment ? (
                  <button
                    onClick={() => setShowAcceptPayment(true)}
                    className="rounded-full border-2 border-sky-500 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50"
                  >
                    Start accepting
                  </button>
                ) : (
                  <div className="space-y-3">
                    {acceptStep === 'scan' ? (
                      <>
                        <input
                          placeholder="Add Payer ID or Scan QR code below"
                          value={acceptPayerId}
                          onChange={(e) => setAcceptPayerId(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        {!showMerchantScanner ? (
                          <button
                            type="button"
                            onClick={() => setShowMerchantScanner(true)}
                            className="w-full rounded-lg border-2 border-dashed border-amber-300 py-3 text-sm font-semibold text-amber-800"
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
                          placeholder="Store name shown to buyer (e.g. Mama's Tuckshop)"
                          value={acceptMerchantName}
                          onChange={(e) => setAcceptMerchantName(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <p className="text-xs text-slate-500">
                          <Link href={user?._id ? '/pay/integrate' : '#'} className="text-sky-600 hover:underline">
                            Add ACBPayWallet to your e-commerce site →
                          </Link>
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setShowAcceptPayment(false)} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>
                          <button onClick={handleAcceptPaymentStep1} disabled={acceptSubmitting} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white">
                            {acceptSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Request payment'}
                          </button>
                        </div>
                      </>
                    ) : acceptStep === 'waiting' ? (
                      <>
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2" />
                          <p className="font-semibold text-amber-900">Waiting for customer to confirm…</p>
                        </div>
                        <button
                          onClick={() => {
                            setAcceptStep('scan');
                            setAcceptPaymentRequestId(null);
                          }}
                          className="rounded-lg border px-3 py-2 text-sm w-full mt-2"
                        >
                          Cancel
                        </button>
                      </>
                    ) : acceptStep === 'done' ? (
                      <>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center text-emerald-800 font-semibold">
                          Payment received
                        </div>
                        <button
                          onClick={() => {
                            setShowAcceptPayment(false);
                            setAcceptStep('scan');
                            setAcceptPayerId('');
                            setAcceptAmount('');
                            setAcceptPaymentRequestId(null);
                          }}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white w-full"
                        >
                          New payment
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              )}

{walletView === 'cash' && (
              <>
              {/* Merchant agent — cash-in / cash-out */}
              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-4 flex items-center gap-2">
                  <Store className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Agent network</p>
                    <h3 className="text-lg font-semibold text-slate-900">Merchant agents</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  Become an approved agent after <strong>KYC verification</strong> and <strong>admin approval</strong>. You must run an <strong>active business</strong> and keep <strong>sufficient wallet float</strong> (top up or card) to move digital funds when customers deposit cash with you. Agents only transact when their ACBPayWallet has enough balance for each transaction.
                </p>

                {maApplicationStatus === 'suspended' && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Your merchant agent access is suspended. Contact support.
                  </div>
                )}

                {maApplicationStatus === 'pending' && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <strong>Application under review.</strong> Admin will approve or reject your request. You cannot act as an agent until approved.
                  </div>
                )}

                {maApplicationStatus === 'rejected' && maRejectionReason && (
                  <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-900">
                    <strong>Previous application declined.</strong> {maRejectionReason}
                  </div>
                )}

                {maCanApply && (
                  <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 mb-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Apply to become a merchant agent</p>
                    {!(user as any)?.isVerified && (
                      <p className="text-xs text-amber-800">
                        Complete <Link href="/profile" className="underline font-medium">KYC / account verification</Link> first.
                      </p>
                    )}
                    {(user as any)?.isVerified && !(user as any)?.phone && (
                      <p className="text-xs text-amber-800">
                        Add a <Link href="/profile" className="underline font-medium">phone number</Link> on your profile.
                      </p>
                    )}
                    <input
                      placeholder="Registered business or trading name"
                      value={maBusinessName}
                      onChange={(e) => setMaBusinessName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                    />
                    <textarea
                      placeholder="Describe your active operating business (min. 20 characters)"
                      value={maBusinessDesc}
                      onChange={(e) => setMaBusinessDesc(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                    />
                    <input
                      placeholder="Public note when listed (location / hours)"
                      value={maNote}
                      onChange={(e) => setMaNote(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                    />
                    <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={maKycCheck}
                        onChange={(e) => setMaKycCheck(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <span>
                        I confirm my KYC details are accurate, I operate an active business, and I will maintain enough wallet float (by topping up) to settle cash deposits for customers.
                      </span>
                    </label>
                    <button
                      type="button"
                      disabled={
                        maApplySubmitting ||
                        !maKycCheck ||
                        maBusinessName.trim().length < 2 ||
                        maBusinessDesc.trim().length < 20 ||
                        !(user as any)?.isVerified ||
                        !(user as any)?.phone
                      }
                      onClick={async () => {
                        setMaApplySubmitting(true);
                        try {
                          await walletAPI.applyMerchantAgent({
                            businessName: maBusinessName.trim(),
                            businessDescription: maBusinessDesc.trim(),
                            publicNote: maNote.trim(),
                            kycAttestation: true,
                          });
                          toast.success('Application submitted');
                          setMaKycCheck(false);
                          loadMerchantAgent();
                        } catch (e: any) {
                          toast.error(e?.response?.data?.message || 'Could not submit');
                        } finally {
                          setMaApplySubmitting(false);
                        }
                      }}
                      className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {maApplySubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Submit application'}
                    </button>
                  </div>
                )}

                {maIsApproved && maApplicationStatus !== 'suspended' && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 mb-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={maEnabled}
                        onChange={async (e) => {
                          const v = e.target.checked;
                          setMaEnabled(v);
                          setMaSaving(true);
                          try {
                            await walletAPI.updateMerchantAgentSettings({ enabled: v, publicNote: maNote });
                            toast.success(v ? 'Listed in agent search' : 'Hidden from agent search');
                            loadMerchantAgent();
                          } catch (err: any) {
                            setMaEnabled(!v);
                            toast.error(err?.response?.data?.message || 'Could not update');
                          } finally {
                            setMaSaving(false);
                          }
                        }}
                        disabled={maSaving}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span>
                        <span className="font-semibold text-slate-900">Show me in agent search</span>
                        <span className="block text-xs text-slate-600 mt-0.5">
                          Users can find you for cash withdrawal. Keep wallet float via top-up for cash deposits.
                        </span>
                      </span>
                    </label>
                    <div className="mt-3">
                      <label className="text-xs font-semibold text-slate-600">Public note</label>
                      <input
                        value={maNote}
                        onChange={(e) => setMaNote(e.target.value)}
                        placeholder="e.g. Rosebank Mall kiosk, weekdays 9–5"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                      />
                      <button
                        type="button"
                        disabled={maSaving}
                        onClick={async () => {
                          setMaSaving(true);
                          try {
                            await walletAPI.updateMerchantAgentSettings({ enabled: maEnabled, publicNote: maNote });
                            toast.success('Saved');
                            loadMerchantAgent();
                          } catch (err: any) {
                            toast.error(err?.response?.data?.message || 'Could not save');
                          } finally {
                            setMaSaving(false);
                          }
                        }}
                        className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                      >
                        Save note
                      </button>
                    </div>
                  </div>
                )}

                {maPending && maPending.asCustomer && maPending.asCustomer.length > 0 && (
                  <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                    <p className="text-xs font-semibold text-emerald-800 uppercase mb-2">Pending deposit approvals</p>
                    <div className="space-y-2">
                      {maPending.asCustomer.map((tx: any) => (
                        <div key={tx._id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-slate-700">
                            {(tx.agent as any)?.name || (tx.agent as any)?.username} — R{Number(tx.amount).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await walletAPI.approveAgentDeposit(String(tx._id));
                                toast.success('Deposit approved');
                                fetchWalletData();
                                loadMerchantAgent();
                              } catch (e: any) {
                                toast.error(e?.response?.data?.message || 'Failed');
                              }
                            }}
                            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {maPending && maPending.asAgent && maPending.asAgent.length > 0 && (
                  <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                    <p className="text-xs font-semibold text-amber-900 uppercase mb-2">Waiting on customer (cash deposit)</p>
                    <p className="text-xs text-amber-800 mb-2">They must approve in the app after you sent the SMS link.</p>
                    <div className="space-y-1 text-sm text-slate-700">
                      {maPending.asAgent.map((tx: any) => (
                        <div key={tx._id}>
                          {(tx.customer as any)?.name || (tx.customer as any)?.username} — R{Number(tx.amount).toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`grid gap-4 ${maIsApproved ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                  {maIsApproved && (
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-sm font-semibold text-slate-900 mb-2">Agent: record cash deposit</p>
                    <p className="text-xs text-slate-600 mb-3">
                      Customer gave you cash — scan their wallet QR or enter username. They approve in the app (same as WhatsApp). Requires enough agent wallet float.
                    </p>
                    {!showAgentDepositScanner ? (
                      <button
                        type="button"
                        onClick={() => setShowAgentDepositScanner(true)}
                        className="w-full rounded-lg border-2 border-dashed border-sky-300 py-2 text-sm font-semibold text-sky-700 mb-2"
                      >
                        Scan customer QR
                      </button>
                    ) : (
                      <WalletQrScanner
                        title="Scan customer QR"
                        onClose={() => setShowAgentDepositScanner(false)}
                        onScan={(text) => {
                          const id = parseAcbPayUserId(text);
                          if (!id) {
                            toast.error('Not a valid ACBPayWallet QR');
                            return;
                          }
                          setMaDepositCustomerId(id);
                          setShowAgentDepositScanner(false);
                          toast.success('Customer scanned');
                        }}
                      />
                    )}
                    <input
                      placeholder="Or customer username"
                      value={maDepositUser}
                      onChange={(e) => setMaDepositUser(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-2"
                    />
                    <input
                      type="number"
                      placeholder="Amount (ZAR)"
                      value={maDepositAmount}
                      onChange={(e) => setMaDepositAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-2"
                    />
                    <button
                      type="button"
                      disabled={maDepositSubmitting || !maIsApproved}
                      onClick={async () => {
                        const amount = parseFloat(maDepositAmount);
                        if (!amount || amount < 10) {
                          toast.error('Minimum R10');
                          return;
                        }
                        const cid =
                          maDepositCustomerId.trim() ||
                          (parseAcbPayUserId(maDepositUser.trim()) ?? '');
                        if (!cid && !maDepositUser.trim()) {
                          toast.error('Scan QR or enter customer username');
                          return;
                        }
                        setMaDepositSubmitting(true);
                        try {
                          await walletAPI.initiateAgentDeposit({
                            ...(cid && /^[a-f0-9]{24}$/i.test(cid)
                              ? { customerUserId: cid }
                              : { customerUsername: maDepositUser.trim() }),
                            amount,
                          });
                          toast.success('SMS sent to customer');
                          setMaDepositAmount('');
                          loadMerchantAgent();
                        } catch (e: any) {
                          toast.error(e?.response?.data?.message || 'Failed');
                        } finally {
                          setMaDepositSubmitting(false);
                        }
                      }}
                      className="w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                    >
                      {maDepositSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send approval SMS'}
                    </button>
                  </div>
                  )}

                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-sm font-semibold text-slate-900 mb-2">Get cash from an agent</p>
                    <p className="text-xs text-slate-600 mb-3">Wallet balance is sent to the agent immediately — meet them to collect cash. Only use agents you trust.</p>
                    <MerchantAgentPicker
                      currentUserId={walletUserId}
                      value={maWithdrawAgentId}
                      onChange={setMaWithdrawAgentId}
                    />
                    <input
                      type="number"
                      placeholder="Amount (ZAR)"
                      value={maWithdrawAmount}
                      onChange={(e) => setMaWithdrawAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-2"
                    />
                    <button
                      type="button"
                      disabled={maWithdrawSubmitting}
                      onClick={async () => {
                        const amount = parseFloat(maWithdrawAmount);
                        if (!amount || amount < 10) {
                          toast.error('Minimum R10');
                          return;
                        }
                        if (!maWithdrawAgentId) {
                          toast.error('Select an agent');
                          return;
                        }
                        if (amount > balance) {
                          toast.error('Insufficient balance');
                          return;
                        }
                        setMaWithdrawSubmitting(true);
                        try {
                          await walletAPI.initiateAgentWithdrawal({ agentId: maWithdrawAgentId, amount });
                          toast.success('Funds sent to agent — collect cash from them');
                          setMaWithdrawAmount('');
                          fetchWalletData();
                          loadMerchantAgent();
                        } catch (e: any) {
                          toast.error(e?.response?.data?.message || 'Failed');
                        } finally {
                          setMaWithdrawSubmitting(false);
                        }
                      }}
                      className="w-full rounded-lg border-2 border-sky-500 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50 disabled:opacity-50"
                    >
                      {maWithdrawSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send to agent & arrange pickup'}
                    </button>
                  </div>
                </div>

                {maIsApproved && maHistory.some((h: any) => h.kind === 'cash_withdrawal' && String(h.agent?._id || h.agent) === String(user?._id || user?.id) && !h.handoverConfirmedAt) && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-slate-700 mb-2">Confirm cash handed out (withdrawals)</p>
                    <div className="space-y-2">
                      {maHistory
                        .filter(
                          (h: any) =>
                            h.kind === 'cash_withdrawal' &&
                            String(h.agent?._id || h.agent) === String(user?._id || user?.id) &&
                            !h.handoverConfirmedAt
                        )
                        .slice(0, 8)
                        .map((h: any) => (
                          <div key={h._id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="text-slate-600">
                              {(h.customer as any)?.name || (h.customer as any)?.username} — R{Number(h.amount).toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await walletAPI.confirmAgentHandover(String(h._id));
                                  toast.success('Recorded');
                                  loadMerchantAgent();
                                } catch (e: any) {
                                  toast.error(e?.response?.data?.message || 'Failed');
                                }
                              }}
                              className="rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
                            >
                              Cash handed
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              </>
              )}

              {/* Cards - PayGate PayVault */}
              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-sky-600" />
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Scan & Pay</p>
                      <h3 className="text-lg font-semibold text-slate-900">Your cards</h3>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setAddCardLoading(true);
                      try {
                        const res = await walletAPI.addCard();
                        if (res.data?.paymentUrl || res.data?.payGateRedirect) {
                          openPayGatePayment({
                            paymentUrl: res.data?.paymentUrl,
                            payGateRedirect: res.data?.payGateRedirect,
                          });
                        } else toast.error('Could not add card');
                      } catch (e: any) {
                        toast.error(e?.response?.data?.message || 'Could not add card');
                      } finally {
                        setAddCardLoading(false);
                      }
                    }}
                    disabled={addCardLoading}
                    className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    {addCardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add card
                  </button>
                </div>
                <p className="text-sm text-slate-600 mb-4">Store Visa/Mastercard securely. Pay at stores by scanning your QR—select a card and authorize. Like Apple Pay.</p>
                {cards.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
                    <CreditCard className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">No cards yet</p>
                    <p className="text-xs text-slate-500 mt-1">Add a card to pay at stores with one tap</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cards.map((c) => (
                      <div key={c._id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                            <CreditCard className="h-5 w-5 text-slate-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{c.brand} •••• {c.last4}</p>
                            <p className="text-xs text-slate-500">Expires {String(c.expiryMonth).padStart(2, '0')}/{c.expiryYear}</p>
                          </div>
                          {c.isDefault && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">Default</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!c.isDefault && (
                            <button
                              onClick={async () => {
                                try {
                                  await walletAPI.setDefaultCard(c._id);
                                  const r = await walletAPI.getCards();
                                  setCards(r.data ?? []);
                                } catch {
                                  toast.error('Could not set default');
                                }
                              }}
                              className="text-xs font-medium text-sky-600 hover:text-sky-700"
                            >
                              Set default
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm('Remove this card?')) return;
                              try {
                                await walletAPI.deleteCard(c._id);
                                setCards((prev) => prev.filter((x) => x._id !== c._id));
                                toast.success('Card removed');
                              } catch {
                                toast.error('Could not remove card');
                              }
                            }}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            aria-label="Remove card"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Quick topup</p>
                  <h3 className="mt-1 text-2xl font-semibold text-slate-900">Add funds now</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (ZAR)</label>
                    <input
                      type="number"
                      placeholder="Enter amount..."
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-lg font-semibold text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTopUpAmount(amt.toString())}
                        className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                      >
                        +R{amt}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleTopUp}
                    disabled={isSubmitting || !topUpAmount}
                    className="w-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-6 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:scale-[1.01] disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> : null}
                    Top up ACBPayWallet
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Withdraw</p>
                  <h3 className="mt-1 text-2xl font-semibold text-slate-900">Withdraw to bank</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (ZAR)</label>
                    <input
                      type="number"
                      placeholder="Enter amount..."
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-lg font-semibold text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <p className="text-xs text-slate-600">Min R10. Withdrawals processed within 24 hours.</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setWithdrawAmount(amt.toString())}
                        disabled={amt > balance}
                        className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        R{amt}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleWithdraw}
                    disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) < 10 || parseFloat(withdrawAmount) > balance}
                    className="w-full rounded-full border-2 border-sky-500 bg-white px-6 py-3 font-semibold text-sky-600 shadow-lg shadow-sky-100 transition hover:bg-sky-50 disabled:opacity-50"
                  >
                    {isWithdrawing ? <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> : <ArrowDownToLine className="inline h-4 w-4 mr-2" />}
                    Withdraw funds
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">History</p>
                    <h3 className="mt-1 text-2xl font-semibold text-slate-900">Recent transactions</h3>
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {transactions.length} total
                  </span>
                </div>

                {transactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-600">
                    <DollarSign className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="font-semibold text-slate-900">No transactions yet</p>
                    <p className="text-sm">Top up or complete tasks to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx, idx) => (
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

      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
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
