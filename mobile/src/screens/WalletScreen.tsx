import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "../contexts/AuthContext";
import { useScrollAwareScrollHandlers } from "../components/ScrollAwareChrome";
import { usersAPI, walletAPI } from "../lib/api";
import { formatMoney } from "../lib/geoCurrency";
import { parseAcbPayUserId } from "../lib/walletQr";
import { openPayGateInApp } from "../lib/openPayGate";
import { describeWalletTransaction } from "../lib/walletTransactionLabel";
import { resolveWalletPeerTarget } from "../lib/walletPeerTarget";
import { WalletTransaction } from "../types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type WalletScreenProps = {
  onOpenMessages?: () => void;
  onBack?: () => void;
};

type MoneyReqRow = {
  _id: string;
  amount: number;
  message?: string;
  fromUser?: { name?: string; username?: string };
};

type MerchantAgentRow = {
  _id: string;
  name: string;
  username?: string;
  publicNote?: string;
  businessName?: string;
  businessDescription?: string;
  countryCode?: string;
};

type PendingShopPayment = {
  _id: string;
  amount: number;
  merchantName: string;
  expiresAt?: string;
};

type AgentPendingDeposit = {
  _id: string;
  amount: number;
  agent?: { name?: string; username?: string };
};

export function WalletScreen({ onOpenMessages, onBack }: WalletScreenProps) {
  const { user, applyUserPatch, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const phone = (user as { phone?: string } | null)?.phone;
  const username = (user as { username?: string } | null)?.username;
  const displayName = (user as { name?: string } | null)?.name;
  const walletUserId = (user as { _id?: string; id?: string } | null)?._id || (user as { id?: string } | null)?.id || "";

  const emailVerified = Boolean(
    (user as { emailVerified?: boolean; isEmailVerified?: boolean } | null)?.emailVerified ??
      (user as { isEmailVerified?: boolean } | null)?.isEmailVerified
  );

  const chromeScroll = useScrollAwareScrollHandlers();
  const scrollRef = useRef<ScrollView>(null);
  const cardsYRef = useRef(0);
  const topupYRef = useRef(0);
  const withdrawYRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrName, setQrName] = useState<string | null>(null);
  const [moneyRequests, setMoneyRequests] = useState<MoneyReqRow[]>([]);
  const [cards, setCards] = useState<
    Array<{ _id: string; last4: string; brand: string; expiryMonth: number; expiryYear: number; isDefault: boolean }>
  >([]);

  const [topupAmount, setTopupAmount] = useState("100");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const [showRequestMoney, setShowRequestMoney] = useState(false);
  const [showReceiveHub, setShowReceiveHub] = useState(false);
  const [reqToUsername, setReqToUsername] = useState("");
  const [reqAmount, setReqAmount] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [reqBusy, setReqBusy] = useState(false);

  const [showAcceptPayment, setShowAcceptPayment] = useState(false);
  const [acceptStep, setAcceptStep] = useState<"scan" | "otp">("scan");
  const [acceptPayerId, setAcceptPayerId] = useState("");
  const [acceptAmount, setAcceptAmount] = useState("");
  const [acceptMerchantName, setAcceptMerchantName] = useState("");
  const [acceptOtp, setAcceptOtp] = useState("");
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [acceptPaymentRequestId, setAcceptPaymentRequestId] = useState<string | null>(null);

  const [addCardBusy, setAddCardBusy] = useState(false);
  const [payRequestBusyId, setPayRequestBusyId] = useState<string | null>(null);

  const [showPayModal, setShowPayModal] = useState(false);
  const [showSendMoney, setShowSendMoney] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [showScanQr, setShowScanQr] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [donateRecipientId, setDonateRecipientId] = useState("");
  const [donateAmount, setDonateAmount] = useState("");
  const [donateBusy, setDonateBusy] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [showCardsModal, setShowCardsModal] = useState(false);

  const [showPayAtShop, setShowPayAtShop] = useState(false);
  const [shopStep, setShopStep] = useState<"enter" | "confirm" | "otp" | "success">("enter");
  const [shopPendingId, setShopPendingId] = useState("");
  const [shopPending, setShopPending] = useState<PendingShopPayment | null>(null);
  const [shopOtp, setShopOtp] = useState("");
  const [shopBusy, setShopBusy] = useState(false);

  const [showCashAgents, setShowCashAgents] = useState(false);
  const [cashView, setCashView] = useState<"hub" | "find" | "deposit" | "withdraw">("hub");
  const [agentQuery, setAgentQuery] = useState("");
  const [agentResults, setAgentResults] = useState<MerchantAgentRow[]>([]);
  const [agentSearchBusy, setAgentSearchBusy] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<MerchantAgentRow | null>(null);
  const [cashWithdrawAmount, setCashWithdrawAmount] = useState("");
  const [cashWithdrawBusy, setCashWithdrawBusy] = useState(false);
  const [cashWithdrawRef, setCashWithdrawRef] = useState<string | null>(null);
  const [pendingDeposits, setPendingDeposits] = useState<AgentPendingDeposit[]>([]);

  const loadWallet = useCallback(async () => {
    try {
      const [balRes, txRes, qrRes, reqRes, cardsRes] = await Promise.all([
        walletAPI.getBalance(),
        walletAPI.getTransactions({ limit: 25 }),
        walletAPI.getQrPayload().catch(() => ({ data: {} as { payload?: string; displayName?: string } })),
        walletAPI.getMoneyRequests().catch(() => ({ data: [] as unknown[] })),
        walletAPI.getCards().catch(() => ({ data: [] as typeof cards }))
      ]);

      const nextBalance = Number(balRes.data?.balance ?? 0);
      setBalance(Number.isFinite(nextBalance) ? nextBalance : 0);

      const txRaw = txRes.data as unknown;
      const txData = (txRaw as { data?: WalletTransaction[] })?.data ?? txRaw;
      setTransactions(Array.isArray(txData) ? txData : []);

      setQrPayload(qrRes.data?.payload ?? null);
      setQrName(qrRes.data?.displayName ?? null);

      const reqs = reqRes.data;
      setMoneyRequests(Array.isArray(reqs) ? (reqs as MoneyReqRow[]) : []);

      const cardList = cardsRes.data;
      setCards(Array.isArray(cardList) ? cardList : []);
    } catch {
      setBalance(0);
      setTransactions([]);
      setQrPayload(null);
      setMoneyRequests([]);
      setCards([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const openPayModal = () => {
    if (moneyRequests.length === 0) {
      Alert.alert("No pending payment requests");
      return;
    }
    setShowPayModal(true);
  };

  const openSendMoney = () => {
    setSendTo("");
    setSendAmount("");
    setSendMessage("");
    setShowSendMoney(true);
  };

  const openRequestMoney = () => {
    setShowReceiveHub(false);
    setShowRequestMoney(true);
  };

  const scrollToSection = (ref: React.MutableRefObject<number>) => {
    if (ref.current > 0) scrollRef.current?.scrollTo({ y: Math.max(0, ref.current - 12), animated: true });
  };

  const openCardsPanel = () => {
    setShowCardsModal(true);
    requestAnimationFrame(() => {
      if (cardsYRef.current > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, cardsYRef.current - 12), animated: true });
      }
    });
  };

  const resetShopFlow = () => {
    setShopStep("enter");
    setShopPendingId("");
    setShopPending(null);
    setShopOtp("");
    setShopBusy(false);
  };

  const openPayAtShop = () => {
    resetShopFlow();
    setShowPayAtShop(true);
  };

  const openCashAgents = () => {
    setCashView("hub");
    setAgentQuery("");
    setAgentResults([]);
    setSelectedAgent(null);
    setCashWithdrawAmount("");
    setCashWithdrawRef(null);
    setShowCashAgents(true);
    void walletAPI
      .getMerchantAgentPending()
      .then((r) => {
        const rows = Array.isArray(r.data?.asCustomer) ? r.data.asCustomer : [];
        setPendingDeposits(rows as AgentPendingDeposit[]);
      })
      .catch(() => setPendingDeposits([]));
  };

  const handleTopup = async () => {
    if (topupBusy) return;
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount < 10) {
      Alert.alert("Invalid amount", "Minimum top-up amount is R10.");
      return;
    }
    setTopupBusy(true);
    try {
      const res = await walletAPI.topUp(amount, "/wallet");
      const paymentUrl = res.data?.paymentUrl;
      if (paymentUrl) {
        await openPayGateInApp(paymentUrl);
      } else {
        Alert.alert("Top-up started", res.data?.message || "Payment was initiated.");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      Alert.alert(
        "Top-up failed",
        e?.response?.data?.error || e?.response?.data?.message || "Could not start top-up."
      );
    } finally {
      setTopupBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (withdrawBusy) return;
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 10) {
      Alert.alert("Invalid amount", "Minimum withdrawal is R10.");
      return;
    }
    if (amount > balance) {
      Alert.alert("Insufficient balance", "Enter an amount up to your current balance.");
      return;
    }
    setWithdrawBusy(true);
    try {
      const res = await walletAPI.withdraw(amount);
      const next = res.data?.balance;
      if (typeof next === "number") setBalance(next);
      else void loadWallet();
      setWithdrawAmount("");
      Alert.alert("Payout requested", res.data?.message || "Your payout request was submitted.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Withdrawal failed", e?.response?.data?.message || "Could not submit payout.");
    } finally {
      setWithdrawBusy(false);
    }
  };

  const handleRequestMoney = async () => {
    if (reqBusy) return;
    const amount = Number(reqAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount.");
      return;
    }
    if (!reqToUsername.trim()) {
      Alert.alert("Missing recipient", "Enter username, email, phone, or user ID.");
      return;
    }
    const target = resolveWalletPeerTarget(reqToUsername);
    if (!target.toUserId && !target.toUsername && !target.toEmail && !target.toPhone) {
      Alert.alert("Invalid recipient", "Enter a valid username, email, phone, or user ID.");
      return;
    }
    setReqBusy(true);
    try {
      await walletAPI.requestMoney({
        ...target,
        amount,
        message: reqMessage.trim() || undefined
      });
      setShowRequestMoney(false);
      setReqToUsername("");
      setReqAmount("");
      setReqMessage("");
      Alert.alert("Request sent", "The payee will receive a WhatsApp/SMS link to pay.");
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Request failed", e?.response?.data?.message || "Could not send request.");
    } finally {
      setReqBusy(false);
    }
  };

  const handleSendMoney = async () => {
    if (sendBusy) return;
    const amount = Number(sendAmount);
    if (!sendTo.trim()) {
      Alert.alert("Missing recipient", "Enter username, email, phone, or user ID.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 1) {
      Alert.alert("Invalid amount", "Enter a valid amount.");
      return;
    }
    if (amount > balance) {
      Alert.alert("Insufficient balance", "Enter an amount up to your available balance.");
      return;
    }
    const target = resolveWalletPeerTarget(sendTo);
    if (!target.toUserId && !target.toUsername && !target.toEmail && !target.toPhone) {
      Alert.alert("Invalid recipient", "Enter a valid username, email, phone, or user ID.");
      return;
    }
    setSendBusy(true);
    try {
      const res = await walletAPI.sendMoney({
        ...target,
        amount,
        message: sendMessage.trim() || undefined
      });
      if (typeof res.data?.balance === "number") setBalance(res.data.balance);
      setShowSendMoney(false);
      setSendTo("");
      setSendAmount("");
      setSendMessage("");
      Alert.alert("Sent", res.data?.message || "Money sent successfully.");
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Send failed", e?.response?.data?.message || "Could not send money.");
    } finally {
      setSendBusy(false);
    }
  };

  const handlePayRequest = async (requestId: string) => {
    if (payRequestBusyId) return;
    setPayRequestBusyId(requestId);
    try {
      const res = await walletAPI.payRequest(requestId);
      const data = res.data as {
        message?: string;
        code?: string;
        paymentUrl?: string;
        shortfall?: number;
      };
      if (data?.code === "TOPUP_REQUIRED" && data?.paymentUrl) {
        Alert.alert(
          "Top up required",
          "Your balance is too low. Complete the card payment to top up, then pay this request again.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open PayGate", onPress: () => void openPayGateInApp(data.paymentUrl!) }
          ]
        );
        return;
      }
      if (data?.paymentUrl) {
        await openPayGateInApp(data.paymentUrl);
        return;
      }
      Alert.alert("Payment sent", data?.message || "Payment completed.");
      void loadWallet();
      setShowPayModal(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Payment failed", e?.response?.data?.message || "Could not pay request.");
    } finally {
      setPayRequestBusyId(null);
    }
  };

  const handleAddCard = async () => {
    if (addCardBusy) return;
    setAddCardBusy(true);
    try {
      const res = await walletAPI.addCard();
      const url = res.data?.paymentUrl;
      if (url) await openPayGateInApp(url);
      else Alert.alert("Add card", res.data?.message || "Could not start add-card flow.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Add card failed", e?.response?.data?.message || "Card storage may be unavailable.");
    } finally {
      setAddCardBusy(false);
    }
  };

  const handleDeleteCard = (cardId: string, last4: string) => {
    Alert.alert("Remove card", `Remove card ending in ${last4}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await walletAPI.deleteCard(cardId);
              void loadWallet();
            } catch (err: unknown) {
              const e = err as { response?: { data?: { message?: string } } };
              Alert.alert("Error", e?.response?.data?.message || "Could not remove card.");
            }
          })();
        }
      }
    ]);
  };

  const handleSetDefaultCard = async (cardId: string) => {
    try {
      await walletAPI.setDefaultCard(cardId);
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Error", e?.response?.data?.message || "Could not update default card.");
    }
  };

  const handleAcceptStep1 = async () => {
    const amount = Number(acceptAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount.");
      return;
    }
    const payerId = acceptPayerId.trim().replace(/^ACBPAY:/i, "");
    if (!payerId) {
      Alert.alert("Missing payer", "Enter the payer ID from their QR (e.g. ACBPAY:…).");
      return;
    }
    setAcceptBusy(true);
    try {
      const res = await walletAPI.paymentFromScan(payerId, amount, acceptMerchantName.trim() || undefined);
      setAcceptPaymentRequestId(res.data?.paymentRequestId ?? null);
      setAcceptStep("otp");
      setAcceptOtp("");
      Alert.alert("Code sent", res.data?.message || "Ask the customer for the 6-digit SMS code.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Failed", e?.response?.data?.message || "Could not send code to payer.");
    } finally {
      setAcceptBusy(false);
    }
  };

  const handleAcceptStep2 = async () => {
    if (!acceptPaymentRequestId || acceptOtp.trim().length !== 6) {
      Alert.alert("Invalid code", "Enter the 6-digit code from the payer.");
      return;
    }
    setAcceptBusy(true);
    try {
      await walletAPI.confirmPayment(acceptPaymentRequestId, acceptOtp.trim());
      setShowAcceptPayment(false);
      setAcceptStep("scan");
      setAcceptPayerId("");
      setAcceptAmount("");
      setAcceptMerchantName("");
      setAcceptOtp("");
      setAcceptPaymentRequestId(null);
      Alert.alert("Success", "Payment received.");
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Failed", e?.response?.data?.message || "Invalid or expired code.");
    } finally {
      setAcceptBusy(false);
    }
  };

  const handleScanSubmit = async () => {
    if (scanBusy) return;
    const raw = scanInput.trim();
    if (!raw) {
      Alert.alert("Missing code", "Paste or type a QR payload, ACBPAY:userId, or payment id.");
      return;
    }
    setScanBusy(true);
    try {
      const userId = parseAcbPayUserId(raw);
      // Web Scan QR = P2P donate to the scanned wallet (not merchant accept).
      if (userId) {
        setShowScanQr(false);
        setScanInput("");
        setDonateRecipientId(userId);
        setDonateAmount("");
        setShowDonate(true);
        return;
      }

      const asPaymentId = raw.replace(/^ACBPAY:/i, "").trim();
      try {
        const pendingRes = await walletAPI.getPendingPayment(asPaymentId);
        if (pendingRes.data?._id) {
          setShowScanQr(false);
          setScanInput("");
          setShopPending({
            _id: pendingRes.data._id,
            amount: pendingRes.data.amount,
            merchantName: pendingRes.data.merchantName,
            expiresAt: pendingRes.data.expiresAt
          });
          setShopPendingId(pendingRes.data._id);
          setShopStep("confirm");
          setShowPayAtShop(true);
          return;
        }
      } catch {
        /* fall through */
      }

      Alert.alert("Invalid QR", "Use an ACBPay wallet code (ACBPAY:…) or a pending payment id.");
    } finally {
      setScanBusy(false);
    }
  };

  const handleDonateSubmit = async () => {
    if (donateBusy) return;
    const amount = Number(donateAmount);
    if (!donateRecipientId || !Number.isFinite(amount) || amount < 1) {
      Alert.alert("Invalid amount", "Enter at least R1 to send.");
      return;
    }
    setDonateBusy(true);
    try {
      const res = await walletAPI.sendMoney({ amount, toUserId: donateRecipientId });
      if (typeof res.data?.balance === "number") setBalance(res.data.balance);
      else void loadWallet();
      setShowDonate(false);
      setDonateAmount("");
      setDonateRecipientId("");
      Alert.alert("Sent", res.data?.message || "Money sent.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Could not send", e?.response?.data?.message || "Try again.");
    } finally {
      setDonateBusy(false);
    }
  };

  const handlePhoneVerify = async () => {
    if (phoneBusy) return;
    const id = String(user?._id || user?.id || "").trim();
    const phone = phoneDraft.replace(/\D/g, "");
    if (!id) {
      Alert.alert("Sign in", "Sign in again to update your phone.");
      return;
    }
    if (phone.length < 9) {
      Alert.alert("Invalid phone", "Enter a valid mobile number (digits, with country code if needed).");
      return;
    }
    setPhoneBusy(true);
    try {
      const res = await usersAPI.updateProfile(id, { phone });
      const nextPhone = res.data?.user?.phone || phone;
      await applyUserPatch({ phone: nextPhone });
      await refreshUser();
      setShowPhoneVerify(false);
      Alert.alert("Phone saved", "Your number is on file for ACBPay SMS codes.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Could not save", e?.response?.data?.message || "Try again.");
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleShopLookup = async () => {
    const id = shopPendingId.trim();
    if (!id) {
      Alert.alert("Missing ID", "Enter the pending payment ID from the merchant.");
      return;
    }
    setShopBusy(true);
    try {
      const res = await walletAPI.getPendingPayment(id);
      setShopPending({
        _id: res.data._id,
        amount: res.data.amount,
        merchantName: res.data.merchantName,
        expiresAt: res.data.expiresAt
      });
      setShopStep("confirm");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Not found", e?.response?.data?.message || "Payment request not found.");
    } finally {
      setShopBusy(false);
    }
  };

  const handleShopWalletPay = async () => {
    if (!shopPending || shopBusy) return;
    if (balance < shopPending.amount) {
      Alert.alert("Insufficient balance", "Top up your wallet or pay by card.");
      return;
    }
    setShopBusy(true);
    try {
      await walletAPI.payPendingWithWallet(shopPending._id);
      setShopStep("success");
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Payment failed", e?.response?.data?.message || "Could not pay with wallet.");
    } finally {
      setShopBusy(false);
    }
  };

  const handleShopCardPay = async (cardId?: string) => {
    if (!shopPending || shopBusy) return;
    setShopBusy(true);
    try {
      const res = await walletAPI.payWithCard(shopPending._id, cardId);
      const url = res.data?.paymentUrl;
      if (url) {
        await openPayGateInApp(url);
        setShowPayAtShop(false);
        resetShopFlow();
      } else {
        Alert.alert("Card payment", res.data?.message || "Could not start card payment.");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Card payment failed", e?.response?.data?.message || "Could not start card payment.");
    } finally {
      setShopBusy(false);
    }
  };

  const handleShopOtpConfirm = async () => {
    if (!shopPending || shopOtp.trim().length !== 6) {
      Alert.alert("Invalid code", "Enter the 6-digit SMS code.");
      return;
    }
    setShopBusy(true);
    try {
      await walletAPI.confirmMyPayment(shopPending._id, shopOtp.trim());
      setShopStep("success");
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Failed", e?.response?.data?.message || "Invalid or expired code.");
    } finally {
      setShopBusy(false);
    }
  };

  const handleSearchAgents = async () => {
    const q = agentQuery.trim();
    if (!q) {
      Alert.alert("Enter code", "Type an agent username, business name, or code to search.");
      return;
    }
    setAgentSearchBusy(true);
    try {
      const res = await walletAPI.searchMerchantAgents({ q });
      const rows = Array.isArray(res.data) ? res.data : [];
      setAgentResults(rows.filter((a) => String(a._id) !== String(walletUserId)));
      if (rows.length === 0) Alert.alert("No agents", "No matching cash agents found.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Search failed", e?.response?.data?.message || "Could not search agents.");
      setAgentResults([]);
    } finally {
      setAgentSearchBusy(false);
    }
  };

  const handleCashWithdraw = async () => {
    if (cashWithdrawBusy) return;
    const amount = Number(cashWithdrawAmount);
    if (!Number.isFinite(amount) || amount < 10) {
      Alert.alert("Invalid amount", "Minimum R10.");
      return;
    }
    if (!selectedAgent) {
      Alert.alert("Select agent", "Find and select an agent first.");
      return;
    }
    if (amount > balance) {
      Alert.alert("Insufficient balance", "Top up your wallet first.");
      return;
    }
    setCashWithdrawBusy(true);
    try {
      const res = await walletAPI.initiateAgentWithdrawal({ agentId: selectedAgent._id, amount });
      setCashWithdrawRef(res.data?.reference || null);
      Alert.alert(
        "Sent to agent",
        res.data?.message || "Funds sent to agent — collect cash from them. Agent was notified by SMS."
      );
      setCashWithdrawAmount("");
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Withdrawal failed", e?.response?.data?.message || "Could not start cash withdrawal.");
    } finally {
      setCashWithdrawBusy(false);
    }
  };

  const handleApproveDeposit = async (txId: string) => {
    try {
      await walletAPI.approveAgentDeposit(txId);
      Alert.alert("Approved", "Deposit credited to your wallet.");
      setPendingDeposits((prev) => prev.filter((p) => p._id !== txId));
      void loadWallet();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert("Failed", e?.response?.data?.message || "Could not approve deposit.");
    }
  };

  const copyPayload = async () => {
    if (!qrPayload) return;
    await Clipboard.setStringAsync(qrPayload);
    Alert.alert("Copied", "QR payload copied to clipboard.");
  };

  const payeeRef = username ? `@${username}` : phone || walletUserId;

  const renderCardsList = () => (
    <>
      {cards.length === 0 ? (
        <Text style={styles.muted}>No saved cards yet. Adding a card opens PayGate in the browser.</Text>
      ) : (
        cards.map((c) => (
          <View key={c._id} style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardRowTitle}>
                {c.brand} •••• {c.last4}
                {c.isDefault ? <Text style={styles.defaultBadge}> Default</Text> : null}
              </Text>
              <Text style={styles.mutedSmall}>
                Exp {String(c.expiryMonth).padStart(2, "0")}/{c.expiryYear}
              </Text>
            </View>
            {!c.isDefault ? (
              <Pressable onPress={() => void handleSetDefaultCard(c._id)}>
                <Text style={styles.link}>Default</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => handleDeleteCard(c._id, c.last4)}>
              <Text style={styles.linkDanger}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
      <Pressable style={[styles.primaryBtn, addCardBusy && styles.btnDisabled]} onPress={() => void handleAddCard()} disabled={addCardBusy}>
        <Text style={styles.primaryBtnText}>{addCardBusy ? "…" : "Add card"}</Text>
      </Pressable>
    </>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={chromeScroll.scrollEventThrottle}
        onScroll={chromeScroll.onScroll}
        onContentSizeChange={chromeScroll.onContentSizeChange}
        onLayout={chromeScroll.onLayout}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadWallet();
            }}
            tintColor="#0ea5e9"
          />
        }
      >
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color="#0369a1" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}

        <View style={styles.hero}>
          <Text style={styles.heroKicker}>ACBPayWallet</Text>
          <Text style={styles.heroTitle}>Wallet & payouts</Text>
          <Text style={styles.heroSub}>
            Top up, withdraw, QR, and cards — all inside the app.
          </Text>
        </View>

        <View style={styles.balanceGradient}>
          <Text style={styles.balanceKicker}>WALLET BALANCE</Text>
          <Text style={styles.balanceHuge}>{formatMoney(balance, "ZAR")}</Text>
          <Text style={styles.balanceHint}>Available balance</Text>
          <View style={styles.balanceActions}>
            <Pressable
              style={styles.balanceBtnPrimary}
              onPress={() => scrollToSection(topupYRef)}
              accessibilityRole="button"
              accessibilityLabel="Add funds"
            >
              <Ionicons name="add" size={16} color="#0369a1" />
              <Text style={styles.balanceBtnPrimaryText}>Add Funds</Text>
            </Pressable>
            <Pressable
              style={styles.balanceBtnSecondary}
              onPress={() => scrollToSection(withdrawYRef)}
              accessibilityRole="button"
              accessibilityLabel="Withdraw"
            >
              <Ionicons name="arrow-down-outline" size={16} color="#fff" />
              <Text style={styles.balanceBtnSecondaryText}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>ACCOUNT STATUS</Text>
          <View style={styles.statusRow}>
            <Ionicons
              name={emailVerified ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={emailVerified ? "#059669" : "#f59e0b"}
            />
            <Text style={styles.statusText}>{emailVerified ? "Email verified" : "Email not verified"}</Text>
          </View>
          <Pressable
            style={styles.statusRow}
            onPress={() => {
              if (phone) return;
              setPhoneDraft(String(user?.phone || ""));
              setShowPhoneVerify(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={phone ? "Phone verified" : "Verify phone"}
          >
            <Ionicons
              name={phone ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={phone ? "#059669" : "#f59e0b"}
            />
            <Text style={[styles.statusText, !phone && styles.statusTextWarn]}>
              {phone ? "Phone verified" : "Verify phone"}
            </Text>
          </Pressable>
        </View>

        {!phone ? (
          <View style={styles.phoneBanner}>
            <Ionicons name="warning-outline" size={20} color="#92400e" />
            <Text style={styles.phoneBannerText}>
              Add your phone for SMS codes on QR and in-store payments.
            </Text>
            <Pressable
              onPress={() => {
                setPhoneDraft(String(user?.phone || ""));
                setShowPhoneVerify(true);
              }}
              style={styles.verifyLink}
            >
              <Text style={styles.verifyLinkText}>Verify Now</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            <Pressable style={styles.quickTile} onPress={openSendMoney}>
              <Ionicons name="send-outline" size={22} color="#0284c7" />
              <Text style={styles.quickLabel}>Send Money</Text>
            </Pressable>
            <Pressable style={styles.quickTile} onPress={openRequestMoney}>
              <Ionicons name="download-outline" size={22} color="#059669" />
              <Text style={styles.quickLabel}>Request Money</Text>
            </Pressable>
            <Pressable
              style={styles.quickTile}
              onPress={() => {
                setScanInput("");
                setShowScanQr(true);
              }}
            >
              <Ionicons name="scan-outline" size={22} color="#7c3aed" />
              <Text style={styles.quickLabel}>Scan QR</Text>
            </Pressable>
            <Pressable style={styles.quickTile} onPress={openCardsPanel}>
              <Ionicons name="card-outline" size={22} color="#334155" />
              <Text style={styles.quickLabel}>Cards</Text>
            </Pressable>
          </View>
          <View style={styles.servicesRow}>
            <Pressable style={styles.serviceTile} onPress={openPayAtShop}>
              <Ionicons name="storefront-outline" size={20} color="#0284c7" />
              <Text style={styles.serviceText}>Pay at Shop</Text>
            </Pressable>
            <Pressable style={styles.serviceTile} onPress={openCashAgents}>
              <Ionicons name="cash-outline" size={20} color="#059669" />
              <Text style={styles.serviceText}>Cash & Agents</Text>
            </Pressable>
            <Pressable
              style={styles.serviceTile}
              onPress={() => {
                setAcceptStep("scan");
                setShowAcceptPayment(true);
              }}
            >
              <Ionicons name="scan-circle-outline" size={20} color="#0284c7" />
              <Text style={styles.serviceText}>Accept payment</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="qr-code-outline" size={22} color="#0284c7" />
            <View>
              <Text style={styles.cardKicker}>Pay at store</Text>
              <Text style={styles.cardTitle}>Your QR code</Text>
            </View>
          </View>
          <Text style={styles.cardBody}>
            Show this at checkout. The store scans → you get an SMS code → tell the teller.
          </Text>
          {phone && qrPayload ? (
            <View style={styles.qrBox}>
              <QRCode value={qrPayload} size={180} />
              {qrName ? <Text style={styles.qrName}>{qrName}</Text> : null}
              <Pressable style={styles.secondaryBtn} onPress={() => void copyPayload()}>
                <Text style={styles.secondaryBtnText}>Copy ID</Text>
              </Pressable>
            </View>
          ) : !phone ? (
            <Text style={styles.muted}>Add a phone number in your profile on the site to use QR checkout.</Text>
          ) : (
            <Text style={styles.muted}>Could not load QR payload.</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.cardHead}>
              <Ionicons name="chatbubbles-outline" size={22} color="#0284c7" />
              <View>
                <Text style={styles.cardKicker}>P2P</Text>
                <Text style={styles.cardTitle}>Request & receive</Text>
              </View>
            </View>
            <Pressable style={styles.pillBtn} onPress={() => setShowRequestMoney((s) => !s)}>
              <Text style={styles.pillBtnText}>{showRequestMoney ? "Close" : "Request money"}</Text>
            </Pressable>
          </View>
          <Text style={styles.cardBody}>Request money from someone — they get WhatsApp/SMS with a secure pay link.</Text>
          {showRequestMoney ? (
            <View style={styles.form}>
              <TextInput
                value={reqToUsername}
                onChangeText={setReqToUsername}
                placeholder="Username, email, phone, or user ID"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                autoCapitalize="none"
              />
              <TextInput
                value={reqAmount}
                onChangeText={setReqAmount}
                placeholder="Amount (ZAR)"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <TextInput
                value={reqMessage}
                onChangeText={setReqMessage}
                placeholder="Message (optional)"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
              <Pressable
                style={[styles.primaryBtn, reqBusy && styles.btnDisabled]}
                onPress={() => void handleRequestMoney()}
                disabled={reqBusy}
              >
                <Text style={styles.primaryBtnText}>{reqBusy ? "Sending…" : "Send request"}</Text>
              </Pressable>
            </View>
          ) : null}
          {moneyRequests.length > 0 ? (
            <View style={styles.mrList}>
              <Text style={styles.sectionLabel}>Pending requests</Text>
              {moneyRequests.map((r) => {
                const from = r.fromUser?.name || r.fromUser?.username || "User";
                const disabled = balance < (r.amount || 0);
                return (
                  <View key={r._id} style={styles.mrRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mrTitle}>
                        {from} — {formatMoney(r.amount, "ZAR")}
                      </Text>
                      {r.message ? <Text style={styles.mrMsg}>{r.message}</Text> : null}
                    </View>
                    <Pressable
                      style={[styles.paySmall, disabled && styles.btnDisabled]}
                      onPress={() => void handlePayRequest(r._id)}
                      disabled={disabled || payRequestBusyId === r._id}
                    >
                      <Text style={styles.paySmallText}>{payRequestBusyId === r._id ? "…" : "Pay"}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="scan-outline" size={22} color="#0284c7" />
            <View>
              <Text style={styles.cardKicker}>Store / merchant</Text>
              <Text style={styles.cardTitle}>Accept payment</Text>
            </View>
          </View>
          <Text style={styles.cardBody}>
            Enter the customer&apos;s payer ID from their QR, then amount. They receive an SMS code — enter it to complete.
          </Text>
          {!showAcceptPayment ? (
            <Pressable style={styles.outlineBtn} onPress={() => setShowAcceptPayment(true)}>
              <Text style={styles.outlineBtnText}>Start accepting</Text>
            </Pressable>
          ) : (
            <View style={styles.form}>
              {acceptStep === "scan" ? (
                <>
                  <TextInput
                    value={acceptPayerId}
                    onChangeText={setAcceptPayerId}
                    placeholder="Payer ID (e.g. ACBPAY:…)"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <TextInput
                    value={acceptAmount}
                    onChangeText={setAcceptAmount}
                    placeholder="Amount (ZAR)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                  <TextInput
                    value={acceptMerchantName}
                    onChangeText={setAcceptMerchantName}
                    placeholder="Store name (optional)"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                  <View style={styles.rowGap}>
                    <Pressable
                      style={styles.outlineBtn}
                      onPress={() => {
                        setShowAcceptPayment(false);
                        setAcceptStep("scan");
                      }}
                    >
                      <Text style={styles.outlineBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primaryBtn, acceptBusy && styles.btnDisabled]}
                      onPress={() => void handleAcceptStep1()}
                      disabled={acceptBusy}
                    >
                      <Text style={styles.primaryBtnText}>{acceptBusy ? "…" : "Send code to payer"}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.cardBody}>Ask the customer for the 6-digit SMS code.</Text>
                  <TextInput
                    value={acceptOtp}
                    onChangeText={(t) => setAcceptOtp(t.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[styles.input, styles.mono]}
                  />
                  <View style={styles.rowGap}>
                    <Pressable
                      style={styles.outlineBtn}
                      onPress={() => {
                        setAcceptStep("scan");
                        setAcceptOtp("");
                        setAcceptPaymentRequestId(null);
                      }}
                    >
                      <Text style={styles.outlineBtnText}>Back</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primaryBtn, (acceptBusy || acceptOtp.length !== 6) && styles.btnDisabled]}
                      onPress={() => void handleAcceptStep2()}
                      disabled={acceptBusy || acceptOtp.length !== 6}
                    >
                      <Text style={styles.primaryBtnText}>{acceptBusy ? "…" : "Complete payment"}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        <View
          style={styles.card}
          onLayout={(e) => {
            withdrawYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.cardKicker}>Cash out</Text>
          <Text style={styles.cardTitle}>Withdraw</Text>
          <Text style={styles.cardBody}>Submit a payout from your wallet balance (min R10).</Text>
          <View style={styles.rowGap}>
            <TextInput
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              placeholder="Amount (ZAR)"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable
              style={[styles.primaryBtn, withdrawBusy && styles.btnDisabled]}
              onPress={() => void handleWithdraw()}
              disabled={withdrawBusy}
            >
              <Text style={styles.primaryBtnText}>{withdrawBusy ? "…" : "Withdraw"}</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={styles.card}
          onLayout={(e) => {
            topupYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.cardKicker}>Top up</Text>
          <Text style={styles.cardTitle}>Add funds</Text>
          <Text style={styles.cardBody}>PayGate secure card redirect (min R10).</Text>
          <View style={styles.rowGap}>
            <TextInput
              value={topupAmount}
              onChangeText={setTopupAmount}
              keyboardType="numeric"
              style={[styles.input, { flex: 1 }]}
              placeholder="Amount"
              placeholderTextColor="#94a3b8"
            />
            <Pressable style={[styles.primaryBtn, topupBusy && styles.btnDisabled]} onPress={() => void handleTopup()} disabled={topupBusy}>
              <Text style={styles.primaryBtnText}>{topupBusy ? "…" : "Top up"}</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={styles.card}
          onLayout={(e) => {
            cardsYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.rowBetween}>
            <View style={styles.cardHead}>
              <Ionicons name="card-outline" size={22} color="#0284c7" />
              <View>
                <Text style={styles.cardKicker}>Saved cards</Text>
                <Text style={styles.cardTitle}>PayGate</Text>
              </View>
            </View>
            <Pressable style={styles.pillBtn} onPress={() => void handleAddCard()} disabled={addCardBusy}>
              <Text style={styles.pillBtnText}>{addCardBusy ? "…" : "Add card"}</Text>
            </Pressable>
          </View>
          {cards.length === 0 ? (
            <Text style={styles.muted}>No saved cards yet. Adding a card opens PayGate in the browser.</Text>
          ) : (
            cards.map((c) => (
              <View key={c._id} style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardRowTitle}>
                    {c.brand} •••• {c.last4}
                    {c.isDefault ? <Text style={styles.defaultBadge}> Default</Text> : null}
                  </Text>
                  <Text style={styles.mutedSmall}>
                    Exp {String(c.expiryMonth).padStart(2, "0")}/{c.expiryYear}
                  </Text>
                </View>
                {!c.isDefault ? (
                  <Pressable onPress={() => void handleSetDefaultCard(c._id)}>
                    <Text style={styles.link}>Default</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => handleDeleteCard(c._id, c.last4)}>
                  <Text style={styles.linkDanger}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>Recent activity</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No wallet transactions yet.</Text>
        ) : (
          transactions.map((item, index) => {
            const isCredit = item.amount >= 0 || String(item.type || "").toLowerCase() === "credit";
            const desc = describeWalletTransaction(item);
            const key = `${item.reference || item.createdAt || item.type}-${index}`;
            return (
              <View key={key} style={styles.txItem}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.txType} numberOfLines={2}>
                    {desc.title}
                  </Text>
                  {desc.subtitle ? (
                    <Text style={styles.txMeta} numberOfLines={1}>
                      {desc.subtitle}
                    </Text>
                  ) : null}
                  <Text style={styles.txMeta}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown time"}
                  </Text>
                </View>
                <Text style={[styles.txAmount, isCredit ? styles.txAmountCredit : styles.txAmountDebit]}>
                  {isCredit ? "+" : "-"}
                  {formatMoney(Math.abs(item.amount), "ZAR")}
                </Text>
              </View>
            );
          })
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoKicker}>QUICK INFO</Text>
          <Text style={styles.infoTitle}>Wallet tips</Text>
          <Text style={styles.infoBody}>
            Top up before checkout. Use Scan QR to pay another wallet. Pay at Shop for in-store payments. Cash & Agents
            for deposits and withdrawals near you.
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoKicker}>SECURITY</Text>
          <Text style={styles.infoTitle}>Your funds are protected</Text>
          <Text style={styles.infoBody}>
            Never share SMS OTP codes. Qwertymates staff will not ask for your password. Report suspicious requests in
            chat support.
          </Text>
        </View>

        {onOpenMessages ? (
          <Pressable style={styles.supportBtn} onPress={onOpenMessages}>
            <Text style={styles.supportText}>Need help? Open chat support</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Send Money — P2P transfer */}
      <Modal visible={showSendMoney} animationType="slide" transparent onRequestClose={() => setShowSendMoney(false)}>
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Send Money</Text>
              <Pressable onPress={() => setShowSendMoney(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.cardBody}>
              Available {formatMoney(balance, "ZAR")}. Transfer to another user by username, email, phone, or ID.
            </Text>
            {moneyRequests.length > 0 ? (
              <Pressable
                style={styles.hubTile}
                onPress={() => {
                  setShowSendMoney(false);
                  openPayModal();
                }}
              >
                <Ionicons name="list-outline" size={22} color="#0284c7" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    Pay {moneyRequests.length} pending request{moneyRequests.length === 1 ? "" : "s"}
                  </Text>
                  <Text style={styles.cardBody}>Someone asked you to pay</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </Pressable>
            ) : null}
            <TextInput
              value={sendTo}
              onChangeText={setSendTo}
              placeholder="Username, email, phone, or user ID"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              value={sendAmount}
              onChangeText={setSendAmount}
              placeholder="Amount (ZAR)"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput
              value={sendMessage}
              onChangeText={setSendMessage}
              placeholder="Note (optional)"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
            <Pressable
              style={[styles.primaryBtn, sendBusy && styles.btnDisabled]}
              onPress={() => void handleSendMoney()}
              disabled={sendBusy}
            >
              <Text style={styles.primaryBtnText}>{sendBusy ? "…" : "Send Money"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Pay — all pending money requests */}
      <Modal visible={showPayModal} animationType="slide" transparent onRequestClose={() => setShowPayModal(false)}>
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Pay requests</Text>
              <Pressable onPress={() => setShowPayModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {moneyRequests.map((r) => {
                const from = r.fromUser?.name || r.fromUser?.username || "User";
                return (
                  <View key={r._id} style={styles.mrRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mrTitle}>
                        {from} — {formatMoney(r.amount, "ZAR")}
                      </Text>
                      {r.message ? <Text style={styles.mrMsg}>{r.message}</Text> : null}
                    </View>
                    <Pressable
                      style={[styles.paySmall, payRequestBusyId === r._id && styles.btnDisabled]}
                      onPress={() => void handlePayRequest(r._id)}
                      disabled={payRequestBusyId === r._id}
                    >
                      <Text style={styles.paySmallText}>{payRequestBusyId === r._id ? "…" : "Pay"}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Receive hub — web parity: Request money or Accept in-store */}
      <Modal
        visible={showReceiveHub}
        animationType="fade"
        transparent
        onRequestClose={() => setShowReceiveHub(false)}
      >
        <View
          style={[
            styles.modalBackdrop,
            { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }
          ]}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Request Money</Text>
              <Pressable onPress={() => setShowReceiveHub(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.cardBody}>Choose how you want to request or accept funds.</Text>
            <Pressable
              style={styles.hubTile}
              onPress={() => {
                setShowReceiveHub(false);
                setShowRequestMoney(true);
              }}
            >
              <Ionicons name="person-add-outline" size={22} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Request money</Text>
                <Text style={styles.cardBody}>Ask someone by username, email, phone, or ID</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
            <Pressable
              style={styles.hubTile}
              onPress={() => {
                setShowReceiveHub(false);
                setAcceptStep("scan");
                setShowAcceptPayment(true);
              }}
            >
              <Ionicons name="storefront-outline" size={22} color="#0284c7" />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Accept in-store payment</Text>
                <Text style={styles.cardBody}>Customer shows QR → you confirm with SMS code</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Scan QR — paste ACBPAY payload (camera scanner can be added later; web semantics = donate) */}
      <Modal visible={showScanQr} animationType="slide" transparent onRequestClose={() => setShowScanQr(false)}>
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Scan QR</Text>
              <Pressable onPress={() => setShowScanQr(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.cardBody}>
              Paste an ACBPay wallet code to send money (same as web Scan QR), or a pending shop payment id.
            </Text>
            <TextInput
              value={scanInput}
              onChangeText={setScanInput}
              placeholder="ACBPAY:… or payment id"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.primaryBtn, scanBusy && styles.btnDisabled]}
              onPress={() => void handleScanSubmit()}
              disabled={scanBusy}
            >
              <Text style={styles.primaryBtnText}>{scanBusy ? "…" : "Continue"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showDonate} animationType="slide" transparent onRequestClose={() => setShowDonate(false)}>
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Send money</Text>
              <Pressable onPress={() => setShowDonate(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.cardBody}>Pay to wallet {donateRecipientId}</Text>
            <TextInput
              value={donateAmount}
              onChangeText={setDonateAmount}
              placeholder="Amount (ZAR)"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Pressable
              style={[styles.primaryBtn, donateBusy && styles.btnDisabled]}
              onPress={() => void handleDonateSubmit()}
              disabled={donateBusy}
            >
              <Text style={styles.primaryBtnText}>{donateBusy ? "…" : "Send"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPhoneVerify}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPhoneVerify(false)}
      >
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Verify phone</Text>
              <Pressable onPress={() => setShowPhoneVerify(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.cardBody}>
              Save your mobile number in-app for ACBPay SMS codes (QR and pay-at-shop).
            </Text>
            <TextInput
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              placeholder="e.g. 27821234567"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Pressable
              style={[styles.primaryBtn, phoneBusy && styles.btnDisabled]}
              onPress={() => void handlePhoneVerify()}
              disabled={phoneBusy}
            >
              <Text style={styles.primaryBtnText}>{phoneBusy ? "…" : "Save phone"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Cards modal */}
      <Modal visible={showCardsModal} animationType="slide" transparent onRequestClose={() => setShowCardsModal(false)}>
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Cards</Text>
              <Pressable onPress={() => setShowCardsModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>{renderCardsList()}</ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pay at Shop */}
      <Modal
        visible={showPayAtShop}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowPayAtShop(false);
          resetShopFlow();
        }}
      >
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {shopStep === "success" ? "Payment successful" : shopStep === "confirm" ? "Confirm payment" : shopStep === "otp" ? "SMS code" : "Pay at Shop"}
              </Text>
              <Pressable
                onPress={() => {
                  setShowPayAtShop(false);
                  resetShopFlow();
                }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {shopStep === "enter" ? (
                <View style={styles.form}>
                  <Text style={styles.cardBody}>Enter the pending payment ID from the merchant.</Text>
                  <TextInput
                    value={shopPendingId}
                    onChangeText={setShopPendingId}
                    placeholder="Payment request ID"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={[styles.primaryBtn, shopBusy && styles.btnDisabled]}
                    onPress={() => void handleShopLookup()}
                    disabled={shopBusy}
                  >
                    <Text style={styles.primaryBtnText}>{shopBusy ? "…" : "Look up"}</Text>
                  </Pressable>
                </View>
              ) : null}

              {shopStep === "confirm" && shopPending ? (
                <View style={styles.form}>
                  <Text style={styles.mrTitle}>
                    Pay {formatMoney(shopPending.amount, "ZAR")} to {shopPending.merchantName}?
                  </Text>
                  {balance >= shopPending.amount ? (
                    <Pressable
                      style={[styles.primaryBtn, shopBusy && styles.btnDisabled]}
                      onPress={() => void handleShopWalletPay()}
                      disabled={shopBusy}
                    >
                      <Text style={styles.primaryBtnText}>
                        {shopBusy ? "…" : `Pay with wallet (${formatMoney(balance, "ZAR")})`}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.muted}>
                      Wallet has {formatMoney(balance, "ZAR")} — need {formatMoney(shopPending.amount - balance, "ZAR")} more. Top up or pay by card.
                    </Text>
                  )}
                  {cards.length > 0 ? (
                    <>
                      <Text style={styles.sectionLabel}>Pay using card</Text>
                      {cards.map((c) => (
                        <Pressable
                          key={c._id}
                          style={[styles.outlineBtnFull, shopBusy && styles.btnDisabled]}
                          onPress={() => void handleShopCardPay(c._id)}
                          disabled={shopBusy}
                        >
                          <Text style={styles.outlineBtnText}>
                            {c.brand} •••• {c.last4}
                          </Text>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <Pressable
                      style={[styles.outlineBtnFull, shopBusy && styles.btnDisabled]}
                      onPress={() => void handleShopCardPay()}
                      disabled={shopBusy}
                    >
                      <Text style={styles.outlineBtnText}>Pay with card</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setShopStep("otp")}>
                    <Text style={styles.link}>Use SMS verification code instead</Text>
                  </Pressable>
                </View>
              ) : null}

              {shopStep === "otp" && shopPending ? (
                <View style={styles.form}>
                  <Text style={styles.cardBody}>
                    Enter the 6-digit code for {formatMoney(shopPending.amount, "ZAR")} at {shopPending.merchantName}.
                  </Text>
                  <TextInput
                    value={shopOtp}
                    onChangeText={(t) => setShopOtp(t.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[styles.input, styles.mono]}
                  />
                  <View style={styles.rowGap}>
                    <Pressable style={styles.outlineBtn} onPress={() => setShopStep("confirm")}>
                      <Text style={styles.outlineBtnText}>Back</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primaryBtn, (shopBusy || shopOtp.length !== 6) && styles.btnDisabled]}
                      onPress={() => void handleShopOtpConfirm()}
                      disabled={shopBusy || shopOtp.length !== 6}
                    >
                      <Text style={styles.primaryBtnText}>{shopBusy ? "…" : "Confirm"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {shopStep === "success" ? (
                <View style={styles.form}>
                  <Ionicons name="checkmark-circle" size={48} color="#059669" style={{ alignSelf: "center" }} />
                  <Text style={[styles.mrTitle, { textAlign: "center" }]}>Payment successful</Text>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => {
                      setShowPayAtShop(false);
                      resetShopFlow();
                    }}
                  >
                    <Text style={styles.primaryBtnText}>Done</Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cash & Agents */}
      <Modal
        visible={showCashAgents}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCashAgents(false)}
      >
        <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                {cashView !== "hub" ? (
                  <Pressable onPress={() => setCashView("hub")}>
                    <Ionicons name="chevron-back" size={22} color="#0369a1" />
                  </Pressable>
                ) : null}
                <Text style={styles.modalTitle}>
                  {cashView === "hub"
                    ? "Cash & Agents"
                    : cashView === "find"
                      ? "Find agent"
                      : cashView === "deposit"
                        ? "Deposit cash"
                        : "Withdraw cash"}
                </Text>
              </View>
              <Pressable onPress={() => setShowCashAgents(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {cashView === "hub" ? (
                <View style={styles.form}>
                  <Pressable style={styles.hubTile} onPress={() => setCashView("find")}>
                    <Ionicons name="search-outline" size={20} color="#0284c7" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mrTitle}>Find agent</Text>
                      <Text style={styles.mutedSmall}>Search by username, business, or code</Text>
                    </View>
                  </Pressable>
                  <Pressable style={styles.hubTile} onPress={() => setCashView("deposit")}>
                    <Ionicons name="cash-outline" size={20} color="#059669" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mrTitle}>Deposit cash</Text>
                      <Text style={styles.mutedSmall}>Give agent your number / username</Text>
                    </View>
                  </Pressable>
                  <Pressable style={styles.hubTile} onPress={() => setCashView("withdraw")}>
                    <Ionicons name="ticket-outline" size={20} color="#7c3aed" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mrTitle}>Withdraw cash</Text>
                      <Text style={styles.mutedSmall}>Send funds to agent & collect</Text>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              {cashView === "find" ? (
                <View style={styles.form}>
                  <TextInput
                    value={agentQuery}
                    onChangeText={setAgentQuery}
                    placeholder="Agent code, username, or business"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={[styles.primaryBtn, agentSearchBusy && styles.btnDisabled]}
                    onPress={() => void handleSearchAgents()}
                    disabled={agentSearchBusy}
                  >
                    <Text style={styles.primaryBtnText}>{agentSearchBusy ? "…" : "Search"}</Text>
                  </Pressable>
                  {agentResults.map((a) => {
                    const label = a.businessName?.trim() || a.name || a.username || "Agent";
                    const selected = selectedAgent?._id === a._id;
                    return (
                      <Pressable
                        key={a._id}
                        style={[styles.hubTile, selected && styles.hubTileSelected]}
                        onPress={() => setSelectedAgent(a)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mrTitle}>{label}</Text>
                          <Text style={styles.mutedSmall}>
                            {[a.name, a.username ? `@${a.username}` : null].filter(Boolean).join(" · ")}
                          </Text>
                          {a.publicNote || a.businessDescription ? (
                            <Text style={styles.mutedSmall}>{a.publicNote || a.businessDescription}</Text>
                          ) : null}
                        </View>
                        {selected ? <Ionicons name="checkmark-circle" size={22} color="#059669" /> : null}
                      </Pressable>
                    );
                  })}
                  {selectedAgent ? (
                    <Pressable style={styles.primaryBtn} onPress={() => setCashView("withdraw")}>
                      <Text style={styles.primaryBtnText}>Withdraw via this agent</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {cashView === "deposit" ? (
                <View style={styles.form}>
                  <Text style={styles.cardBody}>
                    Visit a cash agent and hand over cash. Tell them your phone or username:
                  </Text>
                  <View style={styles.refBox}>
                    <Text style={styles.mono}>{payeeRef || "—"}</Text>
                    {payeeRef ? (
                      <Pressable
                        onPress={() => {
                          void Clipboard.setStringAsync(payeeRef).then(() => Alert.alert("Copied", payeeRef));
                        }}
                      >
                        <Ionicons name="copy-outline" size={20} color="#0284c7" />
                      </Pressable>
                    ) : null}
                  </View>
                  {displayName ? <Text style={styles.mutedSmall}>{displayName}</Text> : null}
                  <Text style={styles.muted}>
                    The agent records the deposit. You receive an SMS link to approve — same as the ACBPay wallet flow.
                  </Text>
                  {pendingDeposits.length > 0 ? (
                    <View style={styles.mrList}>
                      <Text style={styles.sectionLabel}>Pending approvals</Text>
                      {pendingDeposits.map((tx) => (
                        <View key={tx._id} style={styles.mrRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.mrTitle}>
                              {tx.agent?.name || tx.agent?.username || "Agent"} — {formatMoney(Number(tx.amount), "ZAR")}
                            </Text>
                          </View>
                          <Pressable style={styles.paySmall} onPress={() => void handleApproveDeposit(tx._id)}>
                            <Text style={styles.paySmallText}>Approve</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {cashView === "withdraw" ? (
                <View style={styles.form}>
                  <Text style={styles.cardBody}>
                    Choose an agent, enter the amount, and collect cash in person. Balance: {formatMoney(balance, "ZAR")}
                  </Text>
                  {selectedAgent ? (
                    <View style={styles.hubTile}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mrTitle}>
                          {selectedAgent.businessName || selectedAgent.name || selectedAgent.username}
                        </Text>
                        <Text style={styles.mutedSmall}>
                          {selectedAgent.username ? `@${selectedAgent.username}` : selectedAgent._id}
                        </Text>
                      </View>
                      <Pressable onPress={() => setCashView("find")}>
                        <Text style={styles.link}>Change</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.outlineBtnFull} onPress={() => setCashView("find")}>
                      <Text style={styles.outlineBtnText}>Find agent first</Text>
                    </Pressable>
                  )}
                  <TextInput
                    value={cashWithdrawAmount}
                    onChangeText={setCashWithdrawAmount}
                    placeholder="Amount (ZAR, min R10)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                  <Pressable
                    style={[styles.primaryBtn, cashWithdrawBusy && styles.btnDisabled]}
                    onPress={() => void handleCashWithdraw()}
                    disabled={cashWithdrawBusy || !selectedAgent}
                  >
                    <Text style={styles.primaryBtnText}>
                      {cashWithdrawBusy ? "…" : "Send to agent & arrange pickup"}
                    </Text>
                  </Pressable>
                  {cashWithdrawRef ? (
                    <View style={styles.refBox}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mutedSmall}>Pickup reference</Text>
                        <Text style={styles.mono}>{cashWithdrawRef}</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          void Clipboard.setStringAsync(cashWithdrawRef).then(() =>
                            Alert.alert("Copied", cashWithdrawRef)
                          );
                        }}
                      >
                        <Ionicons name="copy-outline" size={20} color="#0284c7" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#f0f9ff" },
  scrollContent: { padding: 14, paddingBottom: 28, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f0f9ff" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  backText: { color: "#0369a1", fontWeight: "700", fontSize: 16 },
  hero: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#0369a1",
    borderWidth: 1,
    borderColor: "#0ea5e9"
  },
  heroKicker: { color: "#bae6fd", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  heroTitle: { color: "#f8fafc", fontSize: 20, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "#e0f2fe", fontSize: 12, marginTop: 4, lineHeight: 18 },
  balanceGradient: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "#0ea5e9",
    borderWidth: 1,
    borderColor: "#bae6fd",
    shadowColor: "#0284c7",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  balanceKicker: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  balanceHuge: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 6 },
  balanceHint: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 8, lineHeight: 18 },
  balanceActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  balanceBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  balanceBtnPrimaryText: { color: "#0369a1", fontWeight: "800", fontSize: 13 },
  balanceBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  balanceBtnSecondaryText: { color: "#ffffff", fontWeight: "800", fontSize: 13 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  statusText: { color: "#0f172a", fontSize: 14, fontWeight: "600" },
  statusTextWarn: { color: "#b45309" },
  phoneBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 12,
    padding: 12
  },
  phoneBannerText: { flex: 1, color: "#92400e", fontSize: 13, lineHeight: 18 },
  verifyLink: { marginTop: 8, alignSelf: "flex-start" },
  verifyLinkText: { color: "#b45309", fontWeight: "800", fontSize: 13 },
  quickActions: { gap: 10, marginBottom: 4 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickTile: {
    width: "23%",
    minWidth: 72,
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc"
  },
  quickLabel: { marginTop: 4, fontSize: 11, fontWeight: "700", color: "#0f172a" },
  servicesRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  serviceTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff"
  },
  serviceText: { fontWeight: "700", fontSize: 13, color: "#0f172a", flexShrink: 1 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e0f2fe",
    gap: 8
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardKicker: { color: "#0284c7", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  cardTitle: { color: "#0f172a", fontSize: 17, fontWeight: "800" },
  cardBody: { color: "#475569", fontSize: 13, lineHeight: 19 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  qrBox: { alignItems: "center", gap: 10, marginTop: 8 },
  qrName: { color: "#0f172a", fontWeight: "700", fontSize: 15 },
  form: { gap: 10, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc"
  },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  primaryBtn: {
    backgroundColor: "#0284c7",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center"
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  secondaryBtn: {
    borderWidth: 2,
    borderColor: "#0284c7",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  secondaryBtnText: { color: "#0284c7", fontWeight: "800", fontSize: 13 },
  outlineBtn: {
    borderWidth: 2,
    borderColor: "#0284c7",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    flex: 1
  },
  outlineBtnFull: {
    borderWidth: 2,
    borderColor: "#0284c7",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  outlineBtnText: { color: "#0284c7", fontWeight: "800", fontSize: 13 },
  pillBtn: {
    backgroundColor: "#0284c7",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  pillBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  rowGap: { flexDirection: "row", gap: 8, alignItems: "center" },
  btnDisabled: { opacity: 0.55 },
  muted: { color: "#64748b", fontSize: 13 },
  mutedSmall: { color: "#94a3b8", fontSize: 12 },
  mrList: { marginTop: 8, gap: 8 },
  sectionLabel: { color: "#64748b", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  mrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8
  },
  mrTitle: { color: "#0f172a", fontWeight: "700", fontSize: 14 },
  mrMsg: { color: "#64748b", fontSize: 12, marginTop: 2 },
  paySmall: {
    backgroundColor: "#0284c7",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  paySmallText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9"
  },
  cardRowTitle: { color: "#0f172a", fontWeight: "700", fontSize: 14 },
  defaultBadge: { color: "#059669", fontWeight: "700", fontSize: 12 },
  link: { color: "#0284c7", fontWeight: "700", fontSize: 13 },
  linkDanger: { color: "#dc2626", fontWeight: "700", fontSize: 13 },
  sectionTitle: { color: "#0f172a", fontWeight: "800", fontSize: 15, marginTop: 4 },
  emptyText: { color: "#64748b", textAlign: "center", marginTop: 8 },
  txItem: {
    borderWidth: 1,
    borderColor: "#e0f2fe",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  txType: { color: "#1e293b", fontWeight: "600", fontSize: 13, textTransform: "capitalize" },
  txMeta: { color: "#64748b", fontSize: 11 },
  txAmount: { fontWeight: "700", fontSize: 13 },
  txAmountCredit: { color: "#0f766e" },
  txAmountDebit: { color: "#dc2626" },
  supportBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8
  },
  supportText: { color: "#0369a1", fontWeight: "700", fontSize: 13 },
  infoCard: {
    borderWidth: 1,
    borderColor: "#e0f2fe",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 14,
    gap: 4,
    marginTop: 8
  },
  infoKicker: {
    color: "#0284c7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6
  },
  infoTitle: { color: "#0f172a", fontWeight: "800", fontSize: 15 },
  infoBody: { color: "#64748b", fontSize: 13, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    maxHeight: "82%",
    gap: 10,
    width: "100%",
    alignSelf: "center"
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4
  },
  modalTitle: { color: "#0f172a", fontSize: 18, fontWeight: "800" },
  modalScroll: { maxHeight: 480 },
  hubTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12
  },
  hubTileSelected: { borderColor: "#0ea5e9", backgroundColor: "#f0f9ff" },
  refBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#ecfdf5",
    borderRadius: 12,
    padding: 12
  }
});
