import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { checkoutAPI } from "../lib/api";
import { currencyForCountry, detectCountryCode, formatMoney } from "../lib/geoCurrency";

type CheckoutScreenProps = {
  onBack: () => void;
  onPaid?: () => void;
};

type QuoteData = {
  subtotal: number;
  shipping: number;
  total: number;
  currency?: string;
};

export function CheckoutScreen({ onBack, onPaid }: CheckoutScreenProps) {
  const detectedCountry = detectCountryCode();
  const deviceCurrency = currencyForCountry(detectedCountry);
  const [fulfillment, setFulfillment] = useState<"delivery" | "collection">("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCountry] = useState(detectedCountry);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [errorText, setErrorText] = useState("");
  const [payingMethod, setPayingMethod] = useState<"wallet" | "card" | null>(null);

  const loadQuote = useCallback(async () => {
    setErrorText("");
    try {
      const res = await checkoutAPI.quote({ deliveryCountry });
      const data = res.data?.data;
      if (!data) {
        setQuote(null);
        setErrorText("Could not load checkout quote.");
      } else {
        setQuote(data);
      }
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

  const pay = async (method: "wallet" | "card") => {
    if (!deliveryAddress.trim()) {
      Alert.alert("Address required", "Please enter delivery address.");
      return;
    }
    setPayingMethod(method);
    setErrorText("");
    try {
      const res = await checkoutAPI.pay(method, deliveryAddress.trim(), deliveryCountry);
      const data = res.data?.data;
      if (data?.paymentUrl) {
        await Linking.openURL(data.paymentUrl);
        return;
      }
      if (data?.status === "paid") {
        Alert.alert("Success", "Order paid successfully with wallet.");
        onPaid?.();
        return;
      }
      Alert.alert("Checkout", data?.message || "Payment initiated.");
      onPaid?.();
    } catch (err: any) {
      setErrorText(err?.response?.data?.error || err?.response?.data?.message || "Payment failed.");
    } finally {
      setPayingMethod(null);
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
          <Text style={styles.countryText}>Delivery country: {deliveryCountry}</Text>
        </View>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Delivery</Text>
        <TextInput
          value={deliveryAddress}
          onChangeText={setDeliveryAddress}
          placeholder="Delivery address (street, suburb, city, postal code)"
          placeholderTextColor="#64748b"
          style={styles.input}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Order summary</Text>
        <View style={styles.currencyPill}>
          <Text style={styles.currencyPillText}>{quote?.currency || deviceCurrency}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Subtotal</Text>
          <Text style={styles.lineValue}>{formatMoney(quote?.subtotal || 0, quote?.currency || deviceCurrency)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Shipping</Text>
          <Text style={styles.lineValue}>{formatMoney(quote?.shipping || 0, quote?.currency || deviceCurrency)}</Text>
        </View>
        <View style={styles.totalLine}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(quote?.total || 0, quote?.currency || deviceCurrency)}</Text>
        </View>
      </View>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      <View style={styles.payRow}>
        <Pressable
          style={[styles.payBtn, payingMethod && payingMethod !== "wallet" && styles.disabledBtn]}
          disabled={!!payingMethod}
          onPress={() => void pay("wallet")}
        >
          <Text style={styles.payBtnText}>{payingMethod === "wallet" ? "Paying..." : "Pay with wallet"}</Text>
        </Pressable>
        <Pressable
          style={[styles.payBtn, styles.payBtnCard, payingMethod && payingMethod !== "card" && styles.disabledBtn]}
          disabled={!!payingMethod}
          onPress={() => void pay("card")}
        >
          <Text style={styles.payBtnText}>{payingMethod === "card" ? "Redirecting..." : "Pay with card"}</Text>
        </Pressable>
      </View>
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
    gap: 2
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
  segmentRow: {
    flexDirection: "row",
    gap: 8
  },
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center"
  },
  segmentBtnActive: {
    borderColor: "#22c55e",
    backgroundColor: "#052e16"
  },
  segmentText: {
    color: "#cbd5e1",
    fontWeight: "600",
    fontSize: 12
  },
  segmentTextActive: {
    color: "#86efac"
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0b1220",
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  collectionText: {
    color: "#93c5fd",
    fontSize: 12
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
  payRow: {
    flexDirection: "row",
    gap: 8
  },
  payBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#22c55e",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  payBtnCard: {
    borderColor: "#0ea5e9"
  },
  payBtnText: {
    color: "#d1fae5",
    fontWeight: "700",
    fontSize: 12
  },
  disabledBtn: {
    opacity: 0.6
  }
});
