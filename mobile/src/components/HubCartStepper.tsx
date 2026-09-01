import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cartAPI } from "../lib/api";

type Props = {
  productId: string;
  qty: number;
  outOfStock?: boolean;
  onUpdated: (nextQty: number) => void;
  onOpenCart?: () => void;
};

/** Web MarketplaceCartStepper — + / cart / − on product image top-right. */
export function HubCartStepper({ productId, qty, outOfStock, onUpdated, onOpenCart }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy || outOfStock) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        style={styles.cell}
        disabled={busy || outOfStock}
        onPress={() =>
          void run(async () => {
            await cartAPI.add(productId, 1);
            onUpdated(qty + 1);
          })
        }
        accessibilityLabel="Add one to cart"
      >
        {busy ? <ActivityIndicator size="small" color="#0284c7" /> : <Text style={styles.glyph}>+</Text>}
      </Pressable>
      <Pressable style={styles.mid} onPress={() => onOpenCart?.()} accessibilityLabel="Open cart">
        <Ionicons name="cart-outline" size={16} color="#0284c7" />
        {qty > 0 ? <Text style={styles.qty}>{qty > 99 ? "99+" : qty}</Text> : null}
      </Pressable>
      <Pressable
        style={styles.cell}
        disabled={busy || qty <= 0}
        onPress={() =>
          void run(async () => {
            if (qty <= 1) {
              await cartAPI.removeItem(productId);
              onUpdated(0);
            } else {
              await cartAPI.updateItem(productId, qty - 1);
              onUpdated(qty - 1);
            }
          })
        }
        accessibilityLabel="Remove one from cart"
      >
        <Text style={[styles.glyph, qty <= 0 && styles.glyphDisabled]}>−</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 12,
    right: 14,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#bae6fd",
    overflow: "hidden"
  },
  cell: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  mid: {
    minWidth: 36,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "#bae6fd",
    gap: 1
  },
  glyph: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0284c7",
    lineHeight: 22
  },
  glyphDisabled: { opacity: 0.35 },
  qty: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0369a1"
  }
});
