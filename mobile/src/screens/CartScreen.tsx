import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { MOBILE_API_URL } from "../config";
import { cartAPI } from "../lib/api";
import { CartItem } from "../types";

function toAbsoluteMediaUrl(url?: string) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = MOBILE_API_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/${url}`;
}

function formatPrice(price: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price || 0);
}

type CartScreenProps = {
  refreshKey?: number;
  onCheckout?: () => void;
  onCartCountChange?: (count: number) => void;
};

export function CartScreen({ refreshKey, onCheckout, onCartCountChange }: CartScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);

  const loadCart = useCallback(async () => {
    try {
      const res = await cartAPI.get();
      const payload = res.data?.data;
      const nextItems = payload?.items;
      setItems(Array.isArray(nextItems) ? nextItems : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setUpdatingId(null);
    }
  }, []);

  useEffect(() => {
    void loadCart();
  }, [loadCart, refreshKey]);

  useEffect(() => {
    const count = items.reduce((sum, item) => sum + (item.qty || 0), 0);
    onCartCountChange?.(count);
  }, [items, onCartCountChange]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.lineTotal || (item.product?.price || 0) * item.qty), 0),
    [items]
  );

  const updateQty = async (productId: string, qty: number) => {
    if (qty < 1) return;
    setUpdatingId(productId);
    try {
      await cartAPI.updateItem(productId, qty);
      await loadCart();
    } finally {
      setUpdatingId(null);
    }
  };

  const removeItem = async (productId: string) => {
    setUpdatingId(productId);
    try {
      await cartAPI.removeItem(productId);
      await loadCart();
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#22c55e" />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.productId}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadCart();
          }}
          tintColor="#22c55e"
        />
      }
      ListHeaderComponent={<Text style={styles.title}>Cart</Text>}
      ListEmptyComponent={<Text style={styles.emptyText}>Your cart is empty.</Text>}
      ListFooterComponent={
        items.length > 0 ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              Subtotal ({items.length} items): {formatPrice(subtotal, "ZAR")}
            </Text>
            <Pressable style={styles.checkoutBtn} onPress={onCheckout}>
              <Text style={styles.checkoutText}>Proceed to checkout</Text>
            </Pressable>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        const disabled = updatingId === item.productId;
        const imageUrl = toAbsoluteMediaUrl(item.product?.images?.[0]);
        return (
          <View style={styles.itemCard}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.itemImage} />
            ) : (
              <View style={[styles.itemImage, styles.imageFallback]} />
            )}
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.product?.title || "Product"}
              </Text>
              <Text style={styles.itemPrice}>
                {formatPrice(item.product?.price || 0, item.product?.currency)}
              </Text>
              <View style={styles.qtyRow}>
                <Pressable
                  style={[styles.qtyBtn, disabled && styles.disabled]}
                  disabled={disabled || item.qty <= 1}
                  onPress={() => void updateQty(item.productId, item.qty - 1)}
                >
                  <Text style={styles.qtyBtnText}>-</Text>
                </Pressable>
                <Text style={styles.qtyText}>{item.qty}</Text>
                <Pressable
                  style={[styles.qtyBtn, disabled && styles.disabled]}
                  disabled={disabled}
                  onPress={() => void updateQty(item.productId, item.qty + 1)}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
                <Pressable
                  style={[styles.removeBtn, disabled && styles.disabled]}
                  disabled={disabled}
                  onPress={() => void removeItem(item.productId)}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            </View>
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
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700"
  },
  itemCard: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    gap: 10
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#0b1220"
  },
  imageFallback: {
    borderWidth: 1,
    borderColor: "#334155"
  },
  itemBody: {
    flex: 1,
    gap: 6
  },
  itemTitle: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 13
  },
  itemPrice: {
    color: "#86efac",
    fontWeight: "700",
    fontSize: 13
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyBtnText: {
    color: "#e2e8f0",
    fontWeight: "700"
  },
  qtyText: {
    color: "#cbd5e1",
    width: 20,
    textAlign: "center",
    fontWeight: "700"
  },
  removeBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  removeText: {
    color: "#fecaca",
    fontWeight: "700",
    fontSize: 11
  },
  disabled: {
    opacity: 0.6
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  summaryText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 13
  },
  checkoutBtn: {
    borderWidth: 1,
    borderColor: "#0ea5e9",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 9
  },
  checkoutText: {
    color: "#7dd3fc",
    fontWeight: "700",
    fontSize: 12
  },
  emptyText: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 20
  }
});
