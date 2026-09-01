import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  notificationsAPI,
  storesAPI,
  suppliersAPI,
  type ShopOrderReceipt,
} from "../lib/api";
import { openWebUrl } from "../lib/openWebUrl";
import { appTypography, socialTheme } from "../theme/socialTheme";

export type ErrandsHubTab = "orders" | "clients" | "runners";

type ErrandsHubScreenProps = {
  onBack: () => void;
  initialTab?: ErrandsHubTab;
  onOpenClientTasks: () => void;
  onOpenRunnerTasks: () => void;
  onOpenTshwaneBook: () => void;
};

type PrepStatus = ShopOrderReceipt["prepStatus"];

const PREP_OPTIONS: { value: PrepStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "collected", label: "Collected" },
];

type ClientRow = {
  key: string;
  name: string;
  phone?: string;
  username?: string;
  orderCount: number;
  lastOrderAt?: string | null;
};

function formatMoney(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "R 0.00";
  return `R ${v.toFixed(2)}`;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function buyerKey(buyer: ShopOrderReceipt["buyer"]): string {
  if (!buyer) return "unknown";
  const phone = String(buyer.phone || "").trim();
  const username = String(buyer.username || "").trim().toLowerCase();
  const name = String(buyer.name || "").trim().toLowerCase();
  return phone || username || name || "unknown";
}

function buyerLabel(buyer: ShopOrderReceipt["buyer"]): string {
  if (!buyer) return "Customer";
  return (
    String(buyer.name || "").trim() ||
    String(buyer.username || "").trim() ||
    String(buyer.phone || "").trim() ||
    "Customer"
  );
}

export function ErrandsHubScreen({
  onBack,
  initialTab = "orders",
  onOpenClientTasks,
  onOpenRunnerTasks,
  onOpenTshwaneBook,
}: ErrandsHubScreenProps) {
  const [tab, setTab] = useState<ErrandsHubTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<ShopOrderReceipt[]>([]);
  const [hasStore, setHasStore] = useState(false);
  const [shopUnread, setShopUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | PrepStatus>("all");
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [storesRes, ordersRes, unreadRes] = await Promise.all([
        storesAPI.getMine().catch(() => null),
        suppliersAPI.getMyOrders({ limit: 50 }).catch(() => null),
        notificationsAPI.getUnreadCount({ shopOrders: true }).catch(() => null),
      ]);
      const stores = storesRes?.data?.data;
      setHasStore(Array.isArray(stores) && stores.length > 0);
      const list = ordersRes?.data?.data;
      setOrders(Array.isArray(list) ? list : []);
      const n = Number(
        unreadRes?.data?.shopOrderUnreadCount ?? unreadRes?.data?.unreadCount ?? 0
      );
      setShopUnread(Number.isFinite(n) ? n : 0);
      if (unreadRes?.data?.isShopOwner) setHasStore(true);
    } catch {
      setOrders([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const id = setInterval(() => {
      void load({ silent: true });
    }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  };

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.prepStatus === filter);
  }, [orders, filter]);

  const clients = useMemo((): ClientRow[] => {
    const map = new Map<string, ClientRow>();
    for (const o of orders) {
      const key = buyerKey(o.buyer);
      const prev = map.get(key);
      const when = o.paidAt || o.createdAt || null;
      if (!prev) {
        map.set(key, {
          key,
          name: buyerLabel(o.buyer),
          phone: o.buyer?.phone || undefined,
          username: o.buyer?.username || undefined,
          orderCount: 1,
          lastOrderAt: when,
        });
      } else {
        prev.orderCount += 1;
        if (when && (!prev.lastOrderAt || String(when) > String(prev.lastOrderAt))) {
          prev.lastOrderAt = when;
        }
      }
    }
    return [...map.values()].sort((a, b) => b.orderCount - a.orderCount);
  }, [orders]);

  const updatePrep = async (order: ShopOrderReceipt, prepStatus: PrepStatus) => {
    const key = `${order.orderId}:${order.supplierId}`;
    setUpdatingKey(key);
    try {
      const res = await suppliersAPI.updateOrderPrepStatus(order.orderId, {
        prepStatus,
        supplierId: order.supplierId,
      });
      const updated = res.data?.data;
      setOrders((prev) =>
        prev.map((o) =>
          o.orderId === order.orderId && o.supplierId === order.supplierId
            ? { ...o, ...(updated || { prepStatus }) }
            : o
        )
      );
    } catch {
      Alert.alert("Orders", "Could not update prep status.");
    } finally {
      setUpdatingKey(null);
    }
  };

  const markShopNotificationsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead({ shopOrders: true });
      setShopUnread(0);
    } catch {
      Alert.alert("Orders", "Could not mark notifications read.");
    }
  };

  const renderOrders = () => {
    if (!hasStore && orders.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No store on this account</Text>
          <Text style={styles.hint}>
            Open a store on Qwertymates to receive shop orders here. Errand tasks are still available below.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              void openWebUrl("/store").catch(() => {
                Alert.alert("Errands", "Could not open My Store.");
              });
            }}
          >
            <Text style={styles.primaryBtnText}>Open My Store</Text>
          </Pressable>
        </View>
      );
    }

    if (loading && orders.length === 0) {
      return (
        <View style={styles.centerPad}>
          <ActivityIndicator color={socialTheme.brandBlue} />
          <Text style={styles.hint}>Loading orders…</Text>
        </View>
      );
    }

    if (orders.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.hint}>
            When a customer buys from your store, the order appears here with buyer, items, and prep actions.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.sectionGap}>
        <View style={styles.filterRow}>
          {(["all", "new", "preparing", "ready", "collected"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f === "all" ? "All" : f}
              </Text>
            </Pressable>
          ))}
        </View>
        {shopUnread > 0 ? (
          <Pressable style={styles.markReadBtn} onPress={() => void markShopNotificationsRead()}>
            <Text style={styles.markReadBtnText}>Mark order notifications read ({shopUnread})</Text>
          </Pressable>
        ) : null}
        {filteredOrders.length === 0 ? (
          <Text style={styles.hint}>No orders in this filter.</Text>
        ) : null}
        {filteredOrders.map((o) => {
          const rowKey = `${o.orderId}:${o.supplierId}`;
          const expanded = expandedId === rowKey;
          return (
            <Pressable
              key={rowKey}
              style={styles.orderCard}
              onPress={() => setExpandedId(expanded ? null : rowKey)}
            >
              <View style={styles.orderTop}>
                <Text style={styles.orderNumber}>{o.orderNumber || o.orderId.slice(-8)}</Text>
                <Text style={styles.prepBadge}>{o.prepStatus}</Text>
              </View>
              <Text style={styles.meta}>
                {buyerLabel(o.buyer)}
                {o.storeName ? ` · ${o.storeName}` : ""}
              </Text>
              <Text style={styles.meta}>
                {o.collection ? "Collection" : "Delivery"} · {formatMoney(o.customerTotalZar)} · store{" "}
                {formatMoney(o.storeCreditZar)}
              </Text>
              <Text style={styles.metaMuted}>{formatWhen(o.paidAt || o.createdAt)}</Text>
              {expanded ? (
                <View style={styles.orderDetail}>
                  {(o.items || []).map((it) => (
                    <Text key={`${it.productId}-${it.title}`} style={styles.itemLine}>
                      {it.qty}× {it.title} — {formatMoney(it.storeUnitPrice * it.qty)}
                    </Text>
                  ))}
                  {o.buyer?.phone ? <Text style={styles.meta}>Phone: {o.buyer.phone}</Text> : null}
                  <Text style={styles.sectionLabel}>Prep status</Text>
                  <View style={styles.prepRow}>
                    {PREP_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        style={[
                          styles.prepChip,
                          o.prepStatus === opt.value && styles.prepChipActive,
                          updatingKey === rowKey && styles.prepChipDisabled,
                        ]}
                        disabled={updatingKey === rowKey}
                        onPress={() => void updatePrep(o, opt.value)}
                      >
                        <Text
                          style={[
                            styles.prepChipText,
                            o.prepStatus === opt.value && styles.prepChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={styles.tapHint}>Tap for items & prep</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderClients = () => {
    if (!hasStore && clients.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Clients</Text>
          <Text style={styles.hint}>
            Customers who order from your store will appear here once you have a store and paid orders.
          </Text>
        </View>
      );
    }
    if (clients.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No clients yet</Text>
          <Text style={styles.hint}>Unique buyers from your shop orders will list here.</Text>
        </View>
      );
    }
    return (
      <View style={styles.sectionGap}>
        {clients.map((c) => (
          <View key={c.key} style={styles.orderCard}>
            <Text style={styles.orderNumber}>{c.name}</Text>
            {c.username ? <Text style={styles.meta}>@{c.username}</Text> : null}
            {c.phone ? <Text style={styles.meta}>{c.phone}</Text> : null}
            <Text style={styles.metaMuted}>
              {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
              {c.lastOrderAt ? ` · last ${formatWhen(c.lastOrderAt)}` : ""}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderRunners = () => (
    <View style={styles.sectionGap}>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Delivery runners</Text>
        <Text style={styles.hint}>
          Assigning shop deliveries to runners is coming soon. No runners are listed yet — we will not show
          placeholder people.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Errand tasks</Text>
        <Text style={styles.hint}>
          Post or accept classic Qwertymates errands (escrow tasks) using the buttons below.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={onOpenTshwaneBook}>
          <Ionicons name="location-outline" size={18} color={socialTheme.brandBlueDark} />
          <Text style={styles.secondaryBtnText}>Book (Tshwane)</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onOpenClientTasks}>
          <Ionicons name="person-outline" size={18} color={socialTheme.brandBlueDark} />
          <Text style={styles.secondaryBtnText}>Client errand tasks</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onOpenRunnerTasks}>
          <Ionicons name="walk-outline" size={18} color={socialTheme.brandBlueDark} />
          <Text style={styles.secondaryBtnText}>Runner errand tasks</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Errands</Text>
        {shopUnread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{shopUnread > 99 ? "99+" : String(shopUnread)}</Text>
          </View>
        ) : (
          <View style={styles.badgePlaceholder} />
        )}
      </View>

      <View style={styles.tabs}>
        {(
          [
            { id: "orders" as const, label: "Orders" },
            { id: "clients" as const, label: "Clients" },
            { id: "runners" as const, label: "Runners" },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        {tab === "orders" ? renderOrders() : null}
        {tab === "clients" ? renderClients() : null}
        {tab === "runners" ? renderRunners() : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: socialTheme.canvas,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 12,
    gap: 10,
    paddingBottom: 28,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backText: {
    ...appTypography.meta,
    color: socialTheme.brandBlue,
    fontWeight: "700",
  },
  title: {
    ...appTypography.titleMd,
    color: socialTheme.textPrimary,
    flex: 1,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#e11d48",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  badgePlaceholder: {
    width: 22,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: "#fff",
  },
  tabText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  tabTextActive: {
    color: socialTheme.brandBlueDark,
    fontWeight: "800",
  },
  sectionGap: {
    gap: 10,
  },
  centerPad: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: socialTheme.surface,
  },
  emptyTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary,
  },
  hint: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    lineHeight: 20,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: socialTheme.surface,
  },
  orderCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    backgroundColor: socialTheme.surface,
  },
  orderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderNumber: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary,
    flex: 1,
  },
  prepBadge: {
    ...appTypography.meta,
    fontWeight: "800",
    color: socialTheme.brandBlueDark,
    textTransform: "capitalize",
  },
  meta: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
  },
  metaMuted: {
    ...appTypography.meta,
    color: socialTheme.textMuted,
  },
  tapHint: {
    ...appTypography.meta,
    color: socialTheme.brandBlue,
    marginTop: 4,
    fontWeight: "600",
  },
  orderDetail: {
    marginTop: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: socialTheme.borderHairline,
    paddingTop: 8,
  },
  itemLine: {
    ...appTypography.meta,
    color: socialTheme.textPrimary,
  },
  sectionLabel: {
    ...appTypography.meta,
    fontWeight: "700",
    color: socialTheme.textPrimary,
    marginTop: 6,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
  },
  filterChipActive: {
    backgroundColor: socialTheme.brandBlue,
    borderColor: socialTheme.brandBlue,
  },
  filterChipText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  prepRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  prepChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: socialTheme.brandBlueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.brandBlue,
  },
  prepChipActive: {
    backgroundColor: socialTheme.brandBlue,
  },
  prepChipDisabled: {
    opacity: 0.5,
  },
  prepChipText: {
    ...appTypography.meta,
    color: socialTheme.brandBlueDark,
    fontWeight: "700",
  },
  prepChipTextActive: {
    color: "#fff",
  },
  markReadBtn: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  markReadBtnText: {
    ...appTypography.meta,
    color: socialTheme.textPrimary,
    fontWeight: "700",
  },
  primaryBtn: {
    marginTop: 4,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    ...appTypography.cta,
    color: "#fff",
  },
  secondaryBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.brandBlue,
    backgroundColor: socialTheme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    ...appTypography.meta,
    color: socialTheme.brandBlueDark,
    fontWeight: "700",
  },
});
