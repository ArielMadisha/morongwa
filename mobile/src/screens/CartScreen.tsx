import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { cartAPI, storesAPI, toAbsoluteMediaUrl } from "../lib/api";
import { currencyForCountry, detectCountryCode, formatMoney } from "../lib/geoCurrency";
import { CartItem, StoreSummary } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";

type CartScreenProps = {
  refreshKey?: number;
  onCheckout?: () => void;
  onContinueShopping?: () => void;
  onCartCountChange?: (count: number) => void;
};

type Segment = "cart" | "store";

export function CartScreen({ refreshKey, onCheckout, onContinueShopping, onCartCountChange }: CartScreenProps) {
  const deviceCurrency = currencyForCountry(detectCountryCode());
  const [segment, setSegment] = useState<Segment>("cart");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesRefreshing, setStoresRefreshing] = useState(false);

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

  const loadStores = useCallback(async () => {
    setStoresLoading(true);
    try {
      const res = await storesAPI.getMine();
      const data = res.data?.data;
      setStores(Array.isArray(data) ? data : []);
    } catch {
      setStores([]);
    } finally {
      setStoresLoading(false);
      setStoresRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCart();
  }, [loadCart, refreshKey]);

  useEffect(() => {
    if (segment === "store") void loadStores();
  }, [segment, loadStores]);

  useEffect(() => {
    const count = items.reduce((sum, item) => sum + (item.qty || 0), 0);
    onCartCountChange?.(count);
  }, [items, onCartCountChange]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.lineTotal || (item.product?.price || 0) * item.qty), 0),
    [items]
  );
  const subtotalCurrency = items[0]?.product?.currency || deviceCurrency;

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

  return (
    <View style={styles.shell}>
      <View style={styles.segmentRow}>
        <Pressable
          onPress={() => setSegment("cart")}
          style={[styles.segmentBtn, segment === "cart" && styles.segmentBtnOn]}
        >
          <Text style={[styles.segmentText, segment === "cart" && styles.segmentTextOn]}>Cart</Text>
        </Pressable>
        <Pressable
          onPress={() => setSegment("store")}
          style={[styles.segmentBtn, segment === "store" && styles.segmentBtnOn]}
        >
          <Text style={[styles.segmentText, segment === "store" && styles.segmentTextOn]}>My store</Text>
        </Pressable>
      </View>

      {loading && segment === "cart" ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={socialTheme.brandBlue} />
          <Text style={styles.loadingText}>Loading cart...</Text>
        </View>
      ) : segment === "store" ? (
        storesLoading && stores.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={socialTheme.brandBlue} />
            <Text style={styles.loadingText}>Loading your stores…</Text>
          </View>
        ) : (
          <FlatList
            data={stores}
            keyExtractor={(s) => s._id}
            contentContainerStyle={styles.storeList}
            refreshControl={
              <RefreshControl
                refreshing={storesRefreshing}
                onRefresh={() => {
                  setStoresRefreshing(true);
                  void loadStores();
                }}
                tintColor={socialTheme.brandBlue}
              />
            }
            ListHeaderComponent={
              <View style={styles.storeHero}>
                <Text style={styles.storeHeroTitle}>My store</Text>
                <Text style={styles.storeHeroSub}>Your seller storefronts on Qwertymates (native).</Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.storeEmpty}>No store linked to this account yet.</Text>
            }
            renderItem={({ item: s }) => (
              <View style={styles.storeCard}>
                <Text style={styles.storeName}>{s.name}</Text>
                {s.slug ? (
                  <Text style={styles.storeSlug} selectable>
                    /{s.slug}
                  </Text>
                ) : null}
                <View style={styles.storeMeta}>
                  {s.email ? <Text style={styles.storeLine}>{s.email}</Text> : null}
                  {s.cellphone ? <Text style={styles.storeLine}>{s.cellphone}</Text> : null}
                  {s.whatsapp ? <Text style={styles.storeLine}>WhatsApp: {s.whatsapp}</Text> : null}
                  {s.address ? <Text style={styles.storeLine}>{s.address}</Text> : null}
                  {s.supplierId?.storeName ? (
                    <Text style={styles.storeSupplier}>Supplier: {s.supplierId.storeName}</Text>
                  ) : null}
                </View>
                {s.stripBackgroundPic ? (
                  <Image
                    source={{ uri: toAbsoluteMediaUrl(s.stripBackgroundPic) }}
                    style={styles.storeStrip}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            )}
          />
        )
      ) : (
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
              tintColor={socialTheme.brandBlue}
            />
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <Text style={styles.title}>Cart</Text>
              <Text style={styles.heroSub}>Checkout summary</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>Your cart is empty.</Text>}
          ListFooterComponent={
            items.length > 0 ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryPill}>
                  <Text style={styles.summaryPillText}>{subtotalCurrency}</Text>
                </View>
                <Text style={styles.summaryText}>
                  Subtotal ({items.length} items): {formatMoney(subtotal, subtotalCurrency)}
                </Text>
                <Pressable style={styles.checkoutBtn} onPress={onCheckout}>
                  <Text style={styles.checkoutText}>Proceed to checkout</Text>
                </Pressable>
                <Pressable style={styles.continueBtn} onPress={onContinueShopping}>
                  <Text style={styles.continueText}>Continue shopping</Text>
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
                    {formatMoney(item.product?.price || 0, item.product?.currency || deviceCurrency)}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: socialTheme.canvas
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2
  },
  segmentBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: "center"
  },
  segmentBtnOn: {
    borderColor: socialTheme.brandBlue,
    backgroundColor: socialTheme.brandBlueSoft
  },
  segmentText: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary
  },
  segmentTextOn: {
    color: socialTheme.brandBlueDark,
    fontWeight: "800"
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8
  },
  loadingText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  listContent: {
    gap: 10,
    paddingBottom: 14
  },
  storeList: {
    gap: 12,
    paddingBottom: 20
  },
  storeHero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 14,
    padding: 12,
    gap: 4,
    marginBottom: 8
  },
  storeHeroTitle: {
    ...appTypography.headline,
    color: socialTheme.textPrimary
  },
  storeHeroSub: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  storeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 14,
    padding: 12,
    gap: 8
  },
  storeName: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  storeSlug: {
    ...appTypography.meta,
    color: socialTheme.brandBlue
  },
  storeMeta: {
    gap: 4
  },
  storeLine: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  storeSupplier: {
    ...appTypography.meta,
    color: socialTheme.textMuted
  },
  storeStrip: {
    width: "100%",
    height: 96,
    borderRadius: 12,
    backgroundColor: socialTheme.surfaceMuted
  },
  storeEmpty: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    textAlign: "center",
    marginTop: 24
  },
  hero: {
    borderWidth: 1,
    borderColor: "#3b82f6",
    backgroundColor: "#1d4ed8",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
    marginBottom: 8
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700"
  },
  heroSub: {
    color: "#e0ecff",
    fontSize: 12,
    fontWeight: "500"
  },
  itemCard: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    gap: 10
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#f1f5f9"
  },
  imageFallback: {
    borderWidth: 1,
    borderColor: "#dbeafe"
  },
  itemBody: {
    flex: 1,
    gap: 6
  },
  itemTitle: {
    color: "#1e293b",
    fontWeight: "600",
    fontSize: 13
  },
  itemPrice: {
    color: "#1d4ed8",
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
    borderColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyBtnText: {
    color: "#1e293b",
    fontWeight: "700"
  },
  qtyText: {
    color: "#1e293b",
    width: 20,
    textAlign: "center",
    fontWeight: "700"
  },
  removeBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  removeText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 11
  },
  disabled: {
    opacity: 0.6
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  summaryPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  summaryPillText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "700"
  },
  summaryText: {
    color: "#1e293b",
    fontWeight: "700",
    fontSize: 13
  },
  checkoutBtn: {
    borderWidth: 1,
    borderColor: "#1d4ed8",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 9
  },
  checkoutText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 12
  },
  continueBtn: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 9,
    backgroundColor: "#eff6ff"
  },
  continueText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 12
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingVertical: 10
  }
});
