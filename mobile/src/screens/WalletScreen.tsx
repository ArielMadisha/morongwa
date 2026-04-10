import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { walletAPI } from "../lib/api";
import { formatMoney } from "../lib/geoCurrency";
import { SITE_ORIGIN } from "../constants/site";
import { WalletTransaction } from "../types";

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

const WEB_WALLET = `${SITE_ORIGIN}/wallet`;

export function WalletScreen({ onOpenMessages, onBack }: WalletScreenProps) {
  const { user } = useAuth();
  const phone = (user as { phone?: string } | null)?.phone;

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
        await Linking.openURL(paymentUrl);
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
      Alert.alert("Missing recipient", "Enter a username or user ID.");
      return;
    }
    setReqBusy(true);
    try {
      const isId = /^[a-f0-9]{24}$/i.test(reqToUsername.trim());
      await walletAPI.requestMoney({
        ...(isId ? { toUserId: reqToUsername.trim() } : { toUsername: reqToUsername.trim() }),
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
          "Your balance is too low. Complete the card payment to top up, then pay this request from the website or here again.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open PayGate", onPress: () => void Linking.openURL(data.paymentUrl!) }
          ]
        );
        return;
      }
      if (data?.paymentUrl) {
        await Linking.openURL(data.paymentUrl);
        return;
      }
      Alert.alert("Payment sent", data?.message || "Payment completed.");
      void loadWallet();
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
      if (url) await Linking.openURL(url);
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
      Alert.alert(
        "Code sent",
        res.data?.message || "Ask the customer for the 6-digit SMS code."
      );
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

  const copyPayload = async () => {
    if (!qrPayload) return;
    await Clipboard.setStringAsync(qrPayload);
    Alert.alert("Copied", "QR payload copied to clipboard.");
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
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
        <Text style={styles.heroSub}>Same experience as {SITE_ORIGIN.replace("https://", "")} — top up, withdraw, QR, and cards.</Text>
      </View>

      <View style={styles.balanceGradient}>
        <Text style={styles.balanceKicker}>CURRENT BALANCE</Text>
        <Text style={styles.balanceHuge}>{formatMoney(balance, "ZAR")}</Text>
        <Text style={styles.balanceHint}>Keep it topped up for seamless payouts and in-store payments.</Text>
      </View>

      {!phone ? (
        <View style={styles.phoneBanner}>
          <Ionicons name="warning-outline" size={20} color="#92400e" />
          <Text style={styles.phoneBannerText}>
            Add your phone on the website profile to receive SMS codes for QR payments and money requests.
          </Text>
        </View>
      ) : null}

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
          <Pressable
            style={styles.pillBtn}
            onPress={() => setShowRequestMoney((s) => !s)}
          >
            <Text style={styles.pillBtnText}>{showRequestMoney ? "Close" : "Request money"}</Text>
          </Pressable>
        </View>
        <Text style={styles.cardBody}>Request money from someone — they get WhatsApp/SMS with a secure pay link.</Text>
        {showRequestMoney ? (
          <View style={styles.form}>
            <TextInput
              value={reqToUsername}
              onChangeText={setReqToUsername}
              placeholder="Username or user ID"
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
                    <Text style={styles.paySmallText}>
                      {payRequestBusyId === r._id ? "…" : "Pay"}
                    </Text>
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
                  <Pressable style={styles.outlineBtn} onPress={() => { setShowAcceptPayment(false); setAcceptStep("scan"); }}>
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

      <View style={styles.card}>
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

      <View style={styles.card}>
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

      <View style={styles.card}>
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

      <Pressable style={styles.webLink} onPress={() => void Linking.openURL(WEB_WALLET)}>
        <Ionicons name="open-outline" size={18} color="#0369a1" />
        <Text style={styles.webLinkText}>Open full ACBPayWallet on the website</Text>
      </Pressable>
      <Text style={styles.webHint}>Merchant agents, e-commerce integration, and PDF QR export are on the web wallet.</Text>

      <Text style={styles.sectionTitle}>Recent activity</Text>
      {transactions.length === 0 ? (
        <Text style={styles.emptyText}>No wallet transactions yet.</Text>
      ) : (
        transactions.map((item, index) => {
          const isCredit = item.amount >= 0;
          const key = `${item.reference || item.createdAt || item.type}-${index}`;
          return (
            <View key={key} style={styles.txItem}>
              <View>
                <Text style={styles.txType}>{item.type || "transaction"}</Text>
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

      {onOpenMessages ? (
        <Pressable style={styles.supportBtn} onPress={onOpenMessages}>
          <Text style={styles.supportText}>Need help? Open chat support</Text>
        </Pressable>
      ) : null}
    </ScrollView>
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
    padding: 12
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
  webLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#e0f2fe",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#7dd3fc"
  },
  webLinkText: { color: "#0369a1", fontWeight: "800", fontSize: 14, flex: 1 },
  webHint: { color: "#64748b", fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
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
  supportText: { color: "#0369a1", fontWeight: "700", fontSize: 13 }
});
