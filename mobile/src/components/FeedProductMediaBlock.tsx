import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cartAPI, resellerAPI, toAbsoluteMediaUrl } from "../lib/api";
import { TVPost } from "../types";
import { useCachedProduct } from "./feedProductHooks";

type Props = {
  post: TVPost;
  compactUI?: boolean;
  onCartUpdated?: () => void;
  onOpenProduct?: (productId: string) => void;
};

export function FeedProductMediaBlock({ post, compactUI, onCartUpdated, onOpenProduct }: Props) {
  const catalogId =
    post.productId ||
    (String(post.type).toLowerCase() === "product_tile" ? post._id : undefined);
  const product = useCachedProduct(catalogId);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const images = useMemo(() => {
    const urls: string[] = [];
    const fromProduct = product?.images?.filter(Boolean) ?? [];
    for (const u of fromProduct) {
      const abs = toAbsoluteMediaUrl(u);
      if (abs) urls.push(abs);
    }
    if (!urls.length) {
      for (const u of post.mediaUrls ?? []) {
        const abs = toAbsoluteMediaUrl(u);
        if (abs) urls.push(abs);
      }
    }
    return urls;
  }, [product?.images, post.mediaUrls]);

  const displayUri = images[carouselIndex] || images[0] || "";
  const hasCarousel = images.length > 1;
  const showResell = !!(product && product.allowResell && !post.fromResellerWall);
  const outOfStock = !!(product && typeof product.stock === "number" && product.stock <= 0);
  const cartReady = !!product && !outOfStock;

  if (!catalogId) return null;

  const openProduct = () => {
    if (!catalogId) return;
    if (onOpenProduct) {
      onOpenProduct(String(catalogId));
      return;
    }
    Alert.alert("Product", "Open QwertyHub to view this product.");
  };

  const addCart = async () => {
    if (busy || !product || outOfStock) return;
    setBusy(true);
    try {
      await cartAPI.add(product._id, 1);
      onCartUpdated?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not add to cart.";
      Alert.alert("Cart", String(msg));
    } finally {
      setBusy(false);
    }
  };

  const doResell = async () => {
    if (busy || !product) return;
    setBusy(true);
    try {
      await resellerAPI.addProductToWall(product._id);
      Alert.alert("Resell", "Product added to your reseller wall.");
      onCartUpdated?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not add to your wall.";
      Alert.alert("Resell", String(msg));
    } finally {
      setBusy(false);
    }
  };

  const prevImage = () => {
    setCarouselIndex((i) => (i - 1 + images.length) % images.length);
  };

  const nextImage = () => {
    setCarouselIndex((i) => (i + 1) % images.length);
  };

  return (
    <View
      style={[styles.mediaWrap, compactUI && styles.mediaWrapCompact]}
      collapsable={false}
      pointerEvents="box-none"
    >
      {displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={[styles.heroImage, compactUI && styles.heroImageCompact]}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.heroImage, styles.heroPlaceholder]}>
          <ActivityIndicator color="#2563eb" />
        </View>
      )}

      <View style={styles.controlsLayer} pointerEvents="box-none" collapsable={false}>
        {hasCarousel ? (
          <>
            <Pressable
              onPress={prevImage}
              style={[styles.carouselBtn, styles.carouselBtnLeft]}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Previous product image"
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={nextImage}
              style={[styles.carouselBtn, styles.carouselBtnRight]}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Next product image"
            >
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </Pressable>
          </>
        ) : null}

        <View style={styles.topCartRow} pointerEvents="box-none">
          <Pressable
            onPress={() => void addCart()}
            disabled={busy || !cartReady}
            style={[styles.cartPill, (!cartReady || outOfStock) && styles.cartPillDisabled]}
            hitSlop={10}
          >
            <Text style={[styles.cartText, (!cartReady || outOfStock) && styles.cartTextDisabled]}>
              {!product ? "…" : busy ? "…" : "+cart-"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomActions} pointerEvents="box-none">
          <View style={styles.bottomActionsInner}>
            {showResell ? (
              <Pressable
                onPress={() => void doResell()}
                disabled={busy}
                style={styles.actionPill}
                hitSlop={8}
              >
                <Text style={styles.actionPillText}>Resell</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={openProduct} style={styles.actionPill} hitSlop={8}>
              <Text style={styles.actionPillText}>View product</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mediaWrap: {
    position: "relative",
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0f172a"
  },
  mediaWrapCompact: {
    borderRadius: 10
  },
  heroImage: {
    width: "100%",
    height: 360,
    backgroundColor: "#0f172a"
  },
  heroImageCompact: {
    height: 300
  },
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center"
  },
  controlsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    ...(Platform.OS === "android" ? { elevation: 20 } : null)
  },
  carouselBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    elevation: 12
  },
  carouselBtnLeft: {
    left: 8
  },
  carouselBtnRight: {
    right: 8
  },
  topCartRow: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 25,
    elevation: 10
  },
  cartPill: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "#2563eb",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 40,
    minWidth: 40,
    justifyContent: "center",
    alignItems: "center"
  },
  cartPillDisabled: {
    opacity: 0.5
  },
  cartText: {
    color: "#1d4ed8",
    fontWeight: "800",
    fontSize: 12
  },
  cartTextDisabled: {
    color: "#64748b"
  },
  bottomActions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 40,
    zIndex: 35,
    elevation: 14,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  bottomActionsInner: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actionPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    justifyContent: "center"
  },
  actionPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600"
  }
});
