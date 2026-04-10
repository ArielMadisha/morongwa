import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { cartAPI, productsAPI, toAbsoluteMediaUrl } from "../lib/api";
import { currencyForCountry, detectCountryCode, formatMoney } from "../lib/geoCurrency";
import { appTypography, socialTheme } from "../theme/socialTheme";
import { Product } from "../types";

type HubScreenProps = {
  onAddedToCart?: () => void;
  onGoToCart?: () => void;
  /** Open product detail when set (e.g. from QwertyWorld / MacGyver). */
  openProductId?: string | null;
  onConsumedOpenProductId?: () => void;
};

export function HubScreen({
  onAddedToCart,
  onGoToCart,
  openProductId,
  onConsumedOpenProductId
}: HubScreenProps) {
  const deviceCurrency = currencyForCountry(detectCountryCode());
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [addQty, setAddQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [quickCartProductId, setQuickCartProductId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await productsAPI.list({ limit: 24 });
      const next = res.data?.data;
      setProducts(Array.isArray(next) ? next : []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const addOneToCartFromGrid = async (productId: string) => {
    if (!productId || quickCartProductId) return;
    setQuickCartProductId(productId);
    try {
      await cartAPI.add(productId, 1);
      onAddedToCart?.();
    } catch (err: any) {
      Alert.alert(
        "Cart",
        err?.response?.data?.error || err?.response?.data?.message || "Could not add to cart."
      );
    } finally {
      setQuickCartProductId(null);
    }
  };

  const openProduct = async (id: string) => {
    setDetailsLoading(true);
    setDetailError("");
    setAddQty(1);
    setSelectedProduct(null);
    try {
      const res = await productsAPI.getByIdOrSlug(id);
      const p = res.data?.data;
      if (p?._id) {
        setSelectedProduct(p);
      } else {
        setDetailError("Product not found.");
      }
    } catch {
      setDetailError("Could not load product details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (!openProductId?.trim()) return;
    let cancelled = false;
    const id = openProductId.trim();
    void (async () => {
      setDetailsLoading(true);
      setDetailError("");
      setAddQty(1);
      setSelectedProduct(null);
      try {
        const res = await productsAPI.getByIdOrSlug(id);
        const p = res.data?.data;
        if (cancelled) return;
        if (p?._id) {
          setSelectedProduct(p);
        } else {
          setDetailError("Product not found.");
        }
      } catch {
        if (!cancelled) setDetailError("Could not load product details.");
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
      if (!cancelled) onConsumedOpenProductId?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [openProductId, onConsumedOpenProductId]);

  const addToCart = async () => {
    if (!selectedProduct?._id || adding || addQty < 1) return;
    setAdding(true);
    setDetailError("");
    try {
      await cartAPI.add(selectedProduct._id, addQty);
      onAddedToCart?.();
      setSelectedProduct(null);
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || err?.response?.data?.message || "Failed to add to cart.");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#22c55e" />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={products}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        numColumns={2}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadProducts();
            }}
            tintColor="#22c55e"
          />
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No products available.</Text>}
        renderItem={({ item }) => {
          const imageUrl = toAbsoluteMediaUrl(item.images?.[0]);
          const effectivePrice =
            typeof item.discountPrice === "number" &&
            item.discountPrice >= 0 &&
            item.discountPrice < item.price
              ? item.discountPrice
              : item.price;
          return (
            <Pressable style={styles.card} onPress={() => void openProduct(item._id)}>
              <View style={styles.cardBadgeRow}>
                <View style={styles.resellBadge}>
                  <Text style={styles.resellBadgeText}>RESELL</Text>
                </View>
                <Pressable
                  onPress={() => void addOneToCartFromGrid(item._id)}
                  disabled={
                    quickCartProductId !== null ||
                    (typeof item.stock === "number" && item.stock <= 0)
                  }
                  style={({ pressed }) => [
                    styles.cartChip,
                    (typeof item.stock === "number" && item.stock <= 0) && styles.cartChipDisabled,
                    pressed && quickCartProductId === null && styles.cartChipPressed
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Add one to cart"
                >
                  <Text
                    style={[
                      styles.cartChipText,
                      (typeof item.stock === "number" && item.stock <= 0) && styles.cartChipTextDisabled
                    ]}
                  >
                    {quickCartProductId === item._id ? "…" : "+Cart-"}
                  </Text>
                </Pressable>
              </View>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.productImage} />
              ) : (
                <View style={[styles.productImage, styles.imageFallback]} />
              )}
              <Text style={styles.productTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.productPrice}>{formatMoney(effectivePrice, item.currency || deviceCurrency)}</Text>
              {typeof item.stock === "number" ? (
                <Text style={styles.productStock}>{item.stock > 0 ? `Stock ${item.stock}` : "Out of stock"}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />

      <Modal
        visible={detailsLoading || !!selectedProduct || !!detailError}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!adding) {
            setSelectedProduct(null);
            setDetailsLoading(false);
            setDetailError("");
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {detailsLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color="#22c55e" />
              </View>
            ) : selectedProduct ? (
              <>
                <Text style={styles.modalTitle}>Product details</Text>
                {toAbsoluteMediaUrl(selectedProduct.images?.[0]) ? (
                  <Image source={{ uri: toAbsoluteMediaUrl(selectedProduct.images?.[0]) }} style={styles.modalImage} />
                ) : (
                  <View style={[styles.modalImage, styles.imageFallback]} />
                )}
                <Text style={styles.modalProductTitle}>{selectedProduct.title}</Text>
                {selectedProduct.description ? (
                  <Text style={styles.modalDesc}>{selectedProduct.description}</Text>
                ) : null}
                <Text style={styles.modalPrice}>
                  {formatMoney(
                    typeof selectedProduct.discountPrice === "number" &&
                      selectedProduct.discountPrice >= 0 &&
                      selectedProduct.discountPrice < selectedProduct.price
                      ? selectedProduct.discountPrice
                      : selectedProduct.price,
                    selectedProduct.currency || deviceCurrency
                  )}
                </Text>
                <View style={styles.modalCurrencyPill}>
                  <Text style={styles.modalCurrencyPillText}>{selectedProduct.currency || deviceCurrency}</Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => setAddQty((v) => Math.max(1, v - 1))}
                    style={styles.qtyBtn}
                    disabled={adding}
                  >
                    <Text style={styles.qtyBtnText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{addQty}</Text>
                  <Pressable
                    onPress={() => setAddQty((v) => v + 1)}
                    style={styles.qtyBtn}
                    disabled={adding}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
                {detailError ? <Text style={styles.errorText}>{detailError}</Text> : null}
                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.modalCancelBtn}
                    onPress={() => {
                      if (!adding) {
                        setSelectedProduct(null);
                        setDetailError("");
                      }
                    }}
                    disabled={adding}
                  >
                    <Text style={styles.modalCancelText}>Close</Text>
                  </Pressable>
                  <Pressable style={styles.modalPrimaryBtn} onPress={() => void addToCart()} disabled={adding}>
                    <Text style={styles.modalPrimaryText}>{adding ? "Adding..." : "Add to cart"}</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={styles.goCartBtn}
                  onPress={() => {
                    setSelectedProduct(null);
                    setDetailError("");
                    onGoToCart?.();
                  }}
                >
                  <Text style={styles.goCartText}>Go to cart</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Product details</Text>
                <Text style={styles.errorText}>{detailError || "Could not load details."}</Text>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setDetailError("");
                    setSelectedProduct(null);
                  }}
                >
                  <Text style={styles.modalCancelText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
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
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    fontWeight: "600"
  },
  listContent: {
    gap: 10,
    paddingTop: 4,
    paddingBottom: 14
  },
  row: {
    gap: 10
  },
  card: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 16,
    padding: 10,
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  cardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 8
  },
  resellBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.brandBlue,
    borderRadius: 999,
    backgroundColor: socialTheme.brandBlueSoft,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  resellBadgeText: {
    ...appTypography.badge,
    color: socialTheme.brandBlue
  },
  cartChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.brandBlue,
    borderRadius: 999,
    backgroundColor: socialTheme.brandBlueSoft,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  cartChipPressed: {
    opacity: 0.88
  },
  cartChipDisabled: {
    opacity: 0.45,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surfaceMuted
  },
  cartChipText: {
    ...appTypography.badge,
    color: socialTheme.brandBlue
  },
  cartChipTextDisabled: {
    color: socialTheme.textMuted
  },
  productImage: {
    width: "100%",
    height: 122,
    borderRadius: 10,
    backgroundColor: socialTheme.surfaceMuted
  },
  imageFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline
  },
  productTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary,
    minHeight: 36
  },
  productPrice: {
    ...appTypography.price,
    color: socialTheme.brandBlue
  },
  productStock: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  emptyText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    textAlign: "center",
    marginTop: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 12,
    paddingVertical: 10
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 16,
    padding: 12,
    gap: 9
  },
  modalTitle: {
    ...appTypography.titleMd,
    color: socialTheme.textPrimary
  },
  modalImage: {
    width: "100%",
    height: 190,
    borderRadius: 10,
    backgroundColor: "#f1f5f9"
  },
  modalProductTitle: {
    ...appTypography.titleMd,
    color: socialTheme.textPrimary
  },
  modalDesc: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  modalPrice: {
    ...appTypography.price,
    color: socialTheme.brandBlue
  },
  modalCurrencyPill: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.brandBlueSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  modalCurrencyPillText: {
    ...appTypography.labelSm,
    color: socialTheme.brandBlue
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    alignItems: "center",
    justifyContent: "center"
  },
  qtyBtnText: {
    ...appTypography.titleMd,
    fontSize: 18,
    lineHeight: 22,
    color: socialTheme.textPrimary
  },
  qtyValue: {
    ...appTypography.price,
    color: socialTheme.textPrimary,
    width: 30,
    textAlign: "center"
  },
  modalActions: {
    flexDirection: "row",
    gap: 8
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  modalCancelText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    fontWeight: "700"
  },
  modalPrimaryBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.brandBlue,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  modalPrimaryText: {
    ...appTypography.titleMd,
    color: socialTheme.brandBlue
  },
  goCartBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9
  },
  goCartText: {
    ...appTypography.titleMd,
    color: socialTheme.brandBlue
  },
  errorText: {
    ...appTypography.meta,
    color: "#dc2626"
  }
});
