'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';

const QRCodeSVG = dynamic(() => import('qrcode.react').then((m) => m.QRCodeSVG), { ssr: false });
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { walletAPI } from '@/lib/api';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';

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
  const [transactions, setTransactions] = useState<any[]>([]);
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
  const [acceptOtp, setAcceptOtp] = useState('');
  const [acceptPaymentRequestId, setAcceptPaymentRequestId] = useState<string | null>(null);
  const [acceptStep, setAcceptStep] = useState<'scan' | 'otp'>('scan');
  const [acceptSubmitting, setAcceptSubmitting] = useState(false);

  useEffect(() => {
    fetchWalletData();
  }, []);

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
    } catch (error) {
      toast.error('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

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
      toast.success('Request sent! They will receive a WhatsApp/SMS.');
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
      await walletAPI.payRequest(requestId);
      toast.success('Payment sent!');
      setPayRequestId(null);
      fetchWalletData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to pay');
    }
  };

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
      const res = await walletAPI.paymentFromScan(payerId, amount, acceptMerchantName.trim() || undefined);
      setAcceptPaymentRequestId(res.data?.paymentRequestId);
      setAcceptStep('otp');
      toast.success('Verification code sent to payer. Ask them for the code.');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally {
      setAcceptSubmitting(false);
    }
  };

  const handleAcceptPaymentStep2 = async () => {
    if (!acceptPaymentRequestId || !acceptOtp.trim()) {
      toast.error('Enter the verification code from the payer');
      return;
    }
    setAcceptSubmitting(true);
    try {
      await walletAPI.confirmPayment(acceptPaymentRequestId, acceptOtp.trim());
      toast.success('Payment received!');
      setShowAcceptPayment(false);
      setAcceptPayerId('');
      setAcceptAmount('');
      setAcceptMerchantName('');
      setAcceptOtp('');
      setAcceptPaymentRequestId(null);
      setAcceptStep('scan');
      fetchWalletData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Invalid code');
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
      if (paymentUrl) {
        window.location.href = paymentUrl;
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-3 sm:px-6 lg:px-8 py-1">
          <div className="flex items-center gap-2 sm:gap-3 w-full">
            <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
              <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-8 w-8 object-contain lg:hidden" />
              <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-7 w-auto object-contain hidden lg:block" />
            </Link>
            <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <Wallet className="h-5 w-5 text-sky-600" />
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">ACBPayWallet</h1>
            </div>
            <div className="flex-1 min-w-0" />
            <div className="shrink-0 flex items-center gap-2">
              <SearchButton />
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
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
          allowPageScroll
        />
        <div className="flex-1 flex gap-0 min-w-0 min-h-0 shrink-0">
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pt-0 pb-24 lg:pb-6">
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
                          if (res.data?.paymentUrl) window.location.href = res.data.paymentUrl;
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

              {/* QR code - pay at store */}
              <div className={`rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur ${!(user as any)?.phone ? 'opacity-75' : ''}`}>
                <div className="mb-4 flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Pay at store</p>
                    <h3 className="text-lg font-semibold text-slate-900">Your QR code</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">Show this at checkout. Store scans → you get SMS code → tell the teller.</p>
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
                          doc.text('Show this at checkout. Store scans → you get SMS code → tell the teller.', 105, 35, { align: 'center' });
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

              {/* Accept payment (merchant) */}
              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 sm:p-5 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-4 flex items-center gap-2">
                  <ScanLine className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Store / merchant</p>
                    <h3 className="text-lg font-semibold text-slate-900">Accept payment</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">Scan customer QR, enter amount, they get SMS code. Enter code to complete.</p>
                <p className="text-xs text-slate-500">
                  <Link href={user?._id ? '/pay/integrate' : '#'} className="text-sky-600 hover:underline">
                    Add ACBPayWallet to your e-commerce site →
                  </Link>
                </p>
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
                          placeholder="Payer ID from QR (e.g. ACBPAY:...)"
                          value={acceptPayerId}
                          onChange={(e) => setAcceptPayerId(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Amount (ZAR)"
                          value={acceptAmount}
                          onChange={(e) => setAcceptAmount(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <input
                          placeholder="Store name (optional)"
                          value={acceptMerchantName}
                          onChange={(e) => setAcceptMerchantName(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setShowAcceptPayment(false)} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>
                          <button onClick={handleAcceptPaymentStep1} disabled={acceptSubmitting} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white">
                            {acceptSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send code to payer'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-slate-600">Ask the customer for the 6-digit code from their SMS.</p>
                        <input
                          placeholder="6-digit code"
                          value={acceptOtp}
                          onChange={(e) => setAcceptOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          maxLength={6}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => { setAcceptStep('scan'); setAcceptOtp(''); }} className="rounded-lg border px-3 py-2 text-sm">Back</button>
                          <button onClick={handleAcceptPaymentStep2} disabled={acceptSubmitting || acceptOtp.length !== 6} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white">
                            {acceptSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Complete payment'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

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
                        if (res.data?.paymentUrl) window.location.href = res.data.paymentUrl;
                        else toast.error('Could not add card');
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
                      <div key={idx} className="rounded-lg border border-slate-100 bg-white/80 p-4 transition hover:shadow-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                              {getTransactionIcon(tx.type)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 capitalize">
                                {tx.reference?.startsWith('DONATE-') ? (
                                  tx.type === 'credit' ? 'Donation received' : 'Donation sent'
                                ) : tx.type === 'debit' && tx.reference?.startsWith('ORDER-') ? (
                                  <Link href={`/checkout/order/${tx.reference.replace('ORDER-', '')}`} className="hover:text-sky-600">
                                    Order
                                  </Link>
                                ) : (
                                  tx.type
                                )}
                              </p>
                              <p className="text-xs text-slate-600">{new Date(tx.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <p className={`font-bold ${getTransactionColor(tx.type)}`}>
                            {['topup', 'refund', 'credit'].includes(tx.type) ? '+' : '-'}R{Math.abs(tx.amount).toFixed(2)}
                          </p>
                        </div>
                        {tx.orderBreakdown && (
                          <div className="mt-3 pt-3 border-t border-slate-100 text-sm space-y-1 text-slate-600">
                            {tx.orderBreakdown.items?.map((item: any, i: number) => (
                              <div key={i} className="flex justify-between">
                                <span>{item.title}{item.qty > 1 ? ` ×${item.qty}` : ''}</span>
                                <span>R{((item.price ?? 0) * (item.qty ?? 1)).toFixed(0)}</span>
                              </div>
                            ))}
                            {tx.orderBreakdown.shippingBreakdown?.length > 1 ? (
                              tx.orderBreakdown.shippingBreakdown.map((s: any, i: number) => (
                                <div key={i} className="flex justify-between">
                                  <span>Shipping ({s.storeName})</span>
                                  <span>R{(s.shippingCost ?? 0).toFixed(0)}</span>
                                </div>
                              ))
                            ) : tx.orderBreakdown.shippingBreakdown?.[0] ? (
                              <div className="flex justify-between">
                                <span>Shipping Fee</span>
                                <span>R{(tx.orderBreakdown.shippingBreakdown[0].shippingCost ?? 0).toFixed(0)}</span>
                              </div>
                            ) : null}
                            <div className="flex justify-between font-medium text-slate-800 pt-1">
                              <span>Total</span>
                              <span>R{Math.abs(tx.amount).toFixed(0)}</span>
                            </div>
                          </div>
                        )}
                      </div>
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
      <WalletDashboard />
    </ProtectedRoute>
  );
}
