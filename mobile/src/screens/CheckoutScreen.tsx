import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { checkoutAPI, walletAPI } from "../lib/api";
import { currencyForCountry, detectCountryCode, formatMoney } from "../lib/geoCurrency";
import { openPayGateInApp } from "../lib/openPayGate";

type CheckoutScreenProps = {
  onBack: () => void;
  /** Called after a confirmed paid order — parent should leave checkout (not reopen it). */
  onPaid?: (orderId?: string) => void;
};

type QuoteData = {
  subtotal: number;
  shipping: number;
  total: number;
  currency?: string;
  foodPickup?: boolean;
  deliveryMethodHint?: string;
  totalZarForPayment?: number;
  readyForPayment?: boolean;
  requiresCourierSelection?: boolean;
  itemCount?: number;
};

type PayMethod = "wallet" | "card" | "eft";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForOrderPaid(orderId: string): Promise<"paid" | "cancelled" | "pending"> {
  const maxAttempts = 24;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await checkoutAPI.getOrder(orderId);
      const order = res.data?.data;
      const status = String(order?.status || "").toLowerCase();
      const paymentStatus = String(order?.paymentStatus || "").toLowerCase();
      if (status === "paid") return "paid";
      if (status === "cancelled" || paymentStatus === "failed") return "cancelled";
    } catch {
      /* keep polling — webhook may still land */
    }
    await sleep(2500);
  }
  return "pending";
}

export function CheckoutScreen({ onBack, onPaid }: CheckoutScreenProps) {
  const detectedCountry = detectCountryCode();
  const deviceCurrency = currencyForCountry(detectedCountry);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCountry] = useState(detectedCountry);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>("card");
  const [paymentDefaultApplied, setPaymentDefaultApplied] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [paying, setPaying] = useState(false);
  const [confirmingCard, setConfirmingCard] = useState(false);

  const foodPickup = !!quote?.foodPickup;
  const walletCompareTotal = useMemo(() => {
    if (!quote) return 0;
    if (quote.totalZarForPayment != null && Number.isFinite(quote.totalZarForPayment)) {
      return quote.totalZarForPayment;
    }
    return quote.total;
  }, [quote]);
  const canPayWallet = walletBalance != null && walletCompareTotal <= walletBalance;
  const showEftOption =
    !foodPickup &&
    (deliveryCountry === "ZA" || deliveryCountry === "BW") &&
    (quote?.currency || "ZAR") !== "BWP";

  const loadQuote = useCallback(async () => {
    setErrorText("");
    try {
      const [quoteRes, walletRes] = await Promise.all([
        checkoutAPI.quote({ deliveryCountry }),
        walletAPI.getBalance().catch(() => ({ data: { balance: 0 } }))
      ]);
      const data = quoteRes.data?.data;
      if (!data) {
        setQuote(null);
        setErrorText("Could not load checkout quote.");
      } else {
        setQuote(data);
      }
      const balRaw = (walletRes.data || {}) as { balance?: number; availableBalance?: number };
      const bal = balRaw.balance ?? balRaw.availableBalance ?? 0;
      setWalletBalance(typeof bal === "number" ? bal : 0);
    } catch (err: any) {
      setQuote(null);
      setErrorText(err?.response?.data?.error || err?.response?.data?.message || "Could not load checkout quote.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deliveryCountry]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  useEffect(() => {
    if (!foodPickup) return;
    if (paymentMethod === "eft") {
      setPaymentMethod(walletBalance != null && walletBalance > 0 && canPayWallet ? "wallet" : "card");
    }
  }, [foodPickup, paymentMethod, walletBalance, canPayWallet]);

  useEffect(() => {
    if (paymentDefaultApplied) return;
    if (walletBalance == null || !quote) return;
    if (walletBalance <= 0 || walletBalance < walletCompareTotal) {
      setPaymentMethod("card");
    } else {
      setPaymentMethod("wallet");
    }
    setPaymentDefaultApplied(true);
  }, [walletBalance, quote, paymentDefaultApplied, walletCompareTotal]);

  const finishPaid = (orderId?: string, message?: string) => {
    Alert.alert("Order paid", message || "Your order was paid successfully.", [
      {
        text: "OK",
        onPress: () => onPaid?.(orderId)
      }
    ]);
  };

  const pay = async (methodOverride?: PayMethod) => {
    if (!quote) return;
    const method = methodOverride ?? paymentMethod;
    if (methodOverride && methodOverride !== paymentMethod) {
      setPaymentMethod(methodOverride);
    }
    if (!foodPickup && !deliveryAddress.trim()) {
      Alert.alert("Address required", "Please enter a delivery address.");
      return;
    }
    if (!foodPickup && quote.requiresCourierSelection && quote.shipping <= 0 && quote.readyForPayment === false) {
      Alert.alert("Delivery", "Choose a delivery method on the website cart, or ensure shipping is quoted.");
      return;
    }
    if (method === "wallet" && !canPayWallet) {
      Alert.alert("Wallet", "Insufficient wallet balance. Top up or pay with card.");
      return;
    }

    setPaying(true);
    setErrorText("");
    try {
      const payAddress = foodPickup
        ? "Customer collection (food pickup)"
        : deliveryAddress.trim();
      const res = await checkoutAPI.pay(
        method,
        payAddress,
        foodPickup ? "ZA" : deliveryCountry,
        undefined,
        foodPickup ? "local" : "local",
        foodPickup ? "Collection" : undefined
      );
      const data = res.data?.data;

      if (data?.paymentUrl) {
        const orderId = data.orderId ? String(data.orderId) : undefined;
        setConfirmingCard(true);
        await openPayGateInApp(data.paymentUrl);
        if (orderId) {
          const outcome = await waitForOrderPaid(orderId);
          setConfirmingCard(false);
          if (outcome === "paid") {
            finishPaid(orderId, "Card payment confirmed. The store will prepare your order for collection.");
            return;
          }
          if (outcome === "cancelled") {
            setErrorText("Payment was not completed. Your cart items should still be available.");
            return;
          }
          Alert.alert(
            "Payment processing",
            "We are still confirming with the bank. Check Orders / Wallet shortly — do not pay again unless the order is cancelled.",
            [{ text: "OK", onPress: () => onPaid?.(orderId) }]
          );
          return;
        }
        setConfirmingCard(false);
        Alert.alert("Checkout", "Payment window closed. If you paid, check your orders shortly.");
        return;
      }

      if (data?.status === "paid") {
        finishPaid(
          data.orderId ? String(data.orderId) : undefined,
          foodPickup
            ? "Paid with wallet. Collect from the store when ready."
            : "Order paid successfully with wallet."
        );
        return;
      }

      if (data?.status === "pending_payment" && data?.paymentMethod === "eft" && data?.orderId) {
        Alert.alert(
          "EFT instructions sent",
          data.message || "EFT payment instructions were sent to your Messenger.",
          [{ text: "OK", onPress: () => onPaid?.(String(data.orderId)) }]
        );
        return;
      }

      Alert.alert("Checkout", data?.message || "Payment initiated.");
      onPaid?.(data?.orderId ? String(data.orderId) : undefined);
    } catch (err: any) {
      setErrorText(err?.response?.data?.error || err?.response?.data?.message || "Payment failed.");
    } finally {
      setPaying(false);
      setConfirmingCard(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#22c55e" />
        <Text style={styles.loadingText}>Loading checkout...</Text>
      </View>
    );
  }

  if (!quote) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Checkout</Text>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
        <Text style={styles.errorText}>{errorText || "Cart empty or invalid."}</Text>
      </ScrollView>
    );
  }

  const currency = quote.currency || deviceCurrency;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadQuote();
          }}
          tintColor="#22c55e"
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Checkout</Text>
          <Text style={styles.countryText}>
            {foodPickup ? "Store collection" : `Delivery country: ${deliveryCountry}`}
          </Text>
        </View>
        <Pressable onPress={onBack} style={styles.backBtn} disabled={paying || confirmingCard}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        {foodPickup ? (
          <>
            <Text style={styles.sectionTitle}>Customer collection</Text>
            <Text style={styles.collectionText}>
              Food and grocery orders are collected from the store. No delivery address needed. Pay with
              wallet or card — bank transfer is not available for fast food.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Delivery address</Text>
            <TextInput
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              placeholder="Street, suburb, city, postal code"
              placeholderTextColor="#64748b"
              style={styles.input}
              multiline
            />
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Order summary</Text>
        <View style={styles.currencyPill}>
          <Text style={styles.currencyPillText}>{currency}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Subtotal</Text>
          <Text style={styles.lineValue}>{formatMoney(quote.subtotal || 0, currency)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>{foodPickup ? "Shipping (collection)" : "Shipping"}</Text>
          <Text style={styles.lineValue}>{formatMoney(quote.shipping || 0, currency)}</Text>
        </View>
        <View style={styles.totalLine}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(quote.total || 0, currency)}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payment</Text>
        {walletBalance != null ? (
          <Text style={styles.collectionText}>
            Wallet: {formatMoney(walletBalance, "ZAR")}
            {!canPayWallet ? " (insufficient — use card or top up)" : ""}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.payBtn,
            pressed && styles.payBtnPressed,
            (paying || confirmingCard || !canPayWallet) && styles.disabledBtn
          ]}
          disabled={paying || confirmingCard || !canPayWallet}
          onPress={() => void pay("wallet")}
        >
          <Text style={styles.payBtnText}>{paying ? "Please wait…" : "Pay with wallet"}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.payBtn,
            pressed && styles.payBtnPressed,
            (paying || confirmingCard) && styles.disabledBtn
          ]}
          disabled={paying || confirmingCard}
          onPress={() => void pay("card")}
        >
          <Text style={styles.payBtnText}>
            {confirmingCard ? "Confirming card…" : paying ? "Please wait…" : "Pay with card"}
          </Text>
        </Pressable>
        {showEftOption ? (
          <Pressable
            style={({ pressed }) => [
              styles.payBtn,
              pressed && styles.payBtnPressed,
              (paying || confirmingCard) && styles.disabledBtn
            ]}
            disabled={paying || confirmingCard}
            onPress={() => void pay("eft")}
          >
            <Text style={styles.payBtnText}>{paying ? "Please wait…" : "Pay with EFT"}</Text>
          </Pressable>
        ) : null}
      </View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {confirmingCard ? (
        <View style={styles.confirmingBox}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.confirmingText}>Confirming card payment…</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8
  },
  loadingText: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "600"
  },
  content: {
    gap: 10,
    paddingBottom: 16
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2563eb",
    backgroundColor: "#1d4ed8",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  headerCopy: {
    gap: 2,
    flex: 1,
    paddingRight: 8
  },
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700"
  },
  countryText: {
    color: "#dbeafe",
    fontSize: 11,
    fontWeight: "600"
  },
  backBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  backText: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 12
  },
  card: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 14
  },
  currencyPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  currencyPillText: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "700"
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0b1220",
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 72,
    textAlignVertical: "top"
  },
  collectionText: {
    color: "#93c5fd",
    fontSize: 12,
    lineHeight: 18
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  lineLabel: {
    color: "#cbd5e1",
    fontSize: 13
  },
  lineValue: {
    color: "#e2e8f0",
    fontSize: 13
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#1f2937"
  },
  totalLabel: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "700"
  },
  totalValue: {
    color: "#86efac",
    fontSize: 15,
    fontWeight: "700"
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 12,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  /** Brand blue solid CTAs — must stay high-contrast on dark checkout cards. */
  payBtn: {
    borderWidth: 1,
    borderColor: "#1d4ed8",
    backgroundColor: "#2563eb",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 12
  },
  payBtnPressed: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1e40af"
  },
  payBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15
  },
  disabledBtn: {
    opacity: 0.55
  },
  confirmingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#1d4ed8",
    backgroundColor: "#1e3a8a",
    borderRadius: 10,
    padding: 12
  },
  confirmingText: {
    color: "#dbeafe",
    fontSize: 13,
    fontWeight: "600"
  }
});
