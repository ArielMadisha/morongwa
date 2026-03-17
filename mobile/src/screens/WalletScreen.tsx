import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { walletAPI } from "../lib/api";
import { WalletTransaction } from "../types";

function formatAmount(value: number) {
  return `R${Math.abs(value || 0).toFixed(2)}`;
}

export function WalletScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [topupAmount, setTopupAmount] = useState("100");
  const [topupBusy, setTopupBusy] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        walletAPI.getBalance(),
        walletAPI.getTransactions({ limit: 20 })
      ]);
      const nextBalance = Number(balRes.data?.balance ?? 0);
      const txData = txRes.data;
      setBalance(Number.isFinite(nextBalance) ? nextBalance : 0);
      setTransactions(Array.isArray(txData) ? txData : []);
    } catch {
      setBalance(0);
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#22c55e" />
      </View>
    );
  }

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
        Alert.alert("Top-up started", "Payment was initiated.");
      }
    } catch (err: any) {
      Alert.alert(
        "Top-up failed",
        err?.response?.data?.error || err?.response?.data?.message || "Could not start top-up."
      );
    } finally {
      setTopupBusy(false);
    }
  };

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item, index) => `${item.reference || item.createdAt || item.type}-${index}`}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadWallet();
          }}
          tintColor="#22c55e"
        />
      }
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          <Text style={styles.title}>ACBPay Wallet</Text>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Current balance</Text>
            <Text style={styles.balanceValue}>R{balance.toFixed(2)}</Text>
            <View style={styles.topupRow}>
              <TextInput
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="numeric"
                style={styles.topupInput}
                placeholder="Amount"
                placeholderTextColor="#64748b"
              />
              <Pressable style={styles.topUpBtn} onPress={() => void handleTopup()} disabled={topupBusy}>
                <Text style={styles.topUpText}>{topupBusy ? "Starting..." : "Top up with card"}</Text>
              </Pressable>
            </View>
            <Text style={styles.topupHint}>Uses PayGate redirect for secure card payment.</Text>
            <Pressable style={styles.refreshBtn} onPress={() => void loadWallet()}>
              <Text style={styles.refreshText}>Refresh balance</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionTitle}>Recent activity</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.emptyText}>No wallet transactions yet.</Text>}
      renderItem={({ item }) => {
        const isCredit = item.amount >= 0;
        return (
          <View style={styles.txItem}>
            <View>
              <Text style={styles.txType}>{item.type || "transaction"}</Text>
              <Text style={styles.txMeta}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown time"}
              </Text>
            </View>
            <Text style={[styles.txAmount, isCredit ? styles.txAmountCredit : styles.txAmountDebit]}>
              {isCredit ? "+" : "-"}
              {formatAmount(item.amount)}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  listContent: {
    gap: 10,
    paddingBottom: 14
  },
  headerWrap: {
    gap: 10
  },
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700"
  },
  balanceCard: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 12,
    gap: 7
  },
  balanceLabel: {
    color: "#94a3b8",
    fontSize: 12
  },
  balanceValue: {
    color: "#e2e8f0",
    fontSize: 26,
    fontWeight: "700"
  },
  topUpBtn: {
    borderWidth: 1,
    borderColor: "#0ea5e9",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  topUpText: {
    color: "#7dd3fc",
    fontWeight: "700",
    fontSize: 12
  },
  topupRow: {
    flexDirection: "row",
    gap: 8
  },
  topupInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 9,
    backgroundColor: "#0b1220",
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  topupHint: {
    color: "#94a3b8",
    fontSize: 11
  },
  refreshBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  refreshText: {
    color: "#cbd5e1",
    fontWeight: "600",
    fontSize: 12
  },
  sectionTitle: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 14
  },
  txItem: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  txType: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 13,
    textTransform: "capitalize"
  },
  txMeta: {
    color: "#94a3b8",
    fontSize: 11
  },
  txAmount: {
    fontWeight: "700",
    fontSize: 13
  },
  txAmountCredit: {
    color: "#86efac"
  },
  txAmountDebit: {
    color: "#fda4af"
  },
  emptyText: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 20
  }
});
