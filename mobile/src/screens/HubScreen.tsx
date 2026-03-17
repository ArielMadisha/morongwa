import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { cartAPI, productsAPI, toAbsoluteMediaUrl } from "../lib/api";
import { Product } from "../types";

function formatPrice(price: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price || 0);
}

type HubScreenProps = {
  onAddedToCart?: () => void;
  onGoToCart?: () => void;
};

export function HubScreen({ onAddedToCart, onGoToCart }: HubScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [addQty, setAddQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [detailError, setDetailError] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const text = [p.title, p.slug].filter(Boolean).join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [products, query]);

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
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={filtered}
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
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>QwertyHub</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search products..."
              placeholderTextColor="#64748b"
              style={styles.searchInput}
            />
          </View>
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
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.productImage} />
              ) : (
                <View style={[styles.productImage, styles.imageFallback]} />
              )}
              <Text style={styles.productTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.productPrice}>{formatPrice(effectivePrice, item.currency)}</Text>
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
                  {formatPrice(
                    typeof selectedProduct.discountPrice === "number" &&
                      selectedProduct.discountPrice >= 0 &&
                      selectedProduct.discountPrice < selectedProduct.price
                      ? selectedProduct.discountPrice
                      : selectedProduct.price,
                    selectedProduct.currency
                  )}
                </Text>
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
    alignItems: "center"
  },
  listContent: {
    gap: 10,
    paddingBottom: 14
  },
  header: {
    gap: 8,
    marginBottom: 4
  },
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700"
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13
  },
  row: {
    gap: 10
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 9,
    gap: 7
  },
  productImage: {
    width: "100%",
    height: 122,
    borderRadius: 9,
    backgroundColor: "#0b1220"
  },
  imageFallback: {
    borderWidth: 1,
    borderColor: "#334155"
  },
  productTitle: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 13,
    minHeight: 34
  },
  productPrice: {
    color: "#86efac",
    fontSize: 13,
    fontWeight: "700"
  },
  productStock: {
    color: "#94a3b8",
    fontSize: 11
  },
  emptyText: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 20
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.8)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 12,
    gap: 9
  },
  modalTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 16
  },
  modalImage: {
    width: "100%",
    height: 190,
    borderRadius: 10,
    backgroundColor: "#0b1220"
  },
  modalProductTitle: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 15
  },
  modalDesc: {
    color: "#cbd5e1",
    fontSize: 13
  },
  modalPrice: {
    color: "#86efac",
    fontWeight: "700",
    fontSize: 14
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
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyBtnText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 16
  },
  qtyValue: {
    color: "#e2e8f0",
    width: 30,
    textAlign: "center",
    fontWeight: "700",
    fontSize: 14
  },
  modalActions: {
    flexDirection: "row",
    gap: 8
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  modalCancelText: {
    color: "#cbd5e1",
    fontWeight: "700"
  },
  modalPrimaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#0ea5e9",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  modalPrimaryText: {
    color: "#7dd3fc",
    fontWeight: "700"
  },
  goCartBtn: {
    borderWidth: 1,
    borderColor: "#22c55e",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9
  },
  goCartText: {
    color: "#86efac",
    fontWeight: "700"
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 12
  }
});
