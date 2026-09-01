import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { productsAPI, toAbsoluteMediaUrl } from "../lib/api";
import type { Advert, Product } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";

type Props = {
  advert: Advert;
  onOpenProduct?: (id: string) => void;
};

type CarouselCard = {
  key: string;
  productId?: string;
  title: string;
  imageUrl: string;
};

const CARD_W = Math.min(160, Math.round(Dimensions.get("window").width * 0.42));
const HAMMANSKRAAL_WAREHOUSE_CITY = "hammanskraal";

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Expand every product gallery image into swipe cards (web AdvertTile parity). */
function productToCards(p: Product): CarouselCard[] {
  const imgs = (p.images || []).map((u) => toAbsoluteMediaUrl(u)).filter(Boolean) as string[];
  if (!imgs.length) return [];
  return imgs.map((imageUrl, i) => ({
    key: `${p._id}-${i}`,
    productId: p._id,
    title: p.title || "Product",
    imageUrl
  }));
}

/**
 * Web AdvertTile-style sponsored block: horizontal swipe of warehouse stock + Shop now.
 */
export function SponsoredProductCarousel({ advert, onOpenProduct }: Props) {
  const [cards, setCards] = useState<CarouselCard[]>([]);
  const hero = toAbsoluteMediaUrl(advert.imageUrl);
  const isHammanskraal = /hammanskraal/i.test(`${advert.title || ""}`);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await productsAPI.list({
          limit: isHammanskraal ? 24 : 16,
          random: true,
          warehouseCity: isHammanskraal ? HAMMANSKRAAL_WAREHOUSE_CITY : undefined
        });
        if (cancelled) return;
        const list = res.data?.data;
        let built = shuffle(Array.isArray(list) ? list : []).flatMap(productToCards);
        const seen = new Set<string>();
        built = built.filter((c) => {
          const key = c.imageUrl.toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (built.length < 3 && !isHammanskraal) {
          const fallback = await productsAPI.list({ random: true, limit: 12 });
          if (cancelled) return;
          const extra = shuffle(Array.isArray(fallback.data?.data) ? fallback.data!.data! : []).flatMap(
            productToCards
          );
          for (const card of extra) {
            const key = card.imageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            built.push(card);
            if (built.length >= 12) break;
          }
        }
        if (built.length > 24) built = built.slice(0, 24);
        setCards(built);
      } catch {
        if (!cancelled) setCards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [advert._id, isHammanskraal]);

  const openLink = () => {
    const url = String(advert.linkUrl || "").trim();
    if (url) void Linking.openURL(url).catch(() => null);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.adLabel}>Sponsored</Text>
      <View style={styles.headRow}>
        <View style={styles.logoPh}>
          <Text style={styles.logoQ}>Q</Text>
        </View>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={2}>
            {advert.title}
          </Text>
          <Text style={styles.meta}>Sponsored · swipe for stock</Text>
        </View>
      </View>

      {hero && cards.length === 0 ? (
        <Pressable onPress={openLink}>
          <Image source={{ uri: hero }} style={styles.hero} resizeMode="cover" />
        </Pressable>
      ) : null}

      {cards.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.track}
          decelerationRate="fast"
          snapToInterval={CARD_W + 10}
          nestedScrollEnabled
        >
          {cards.map((c) => (
            <Pressable
              key={c.key}
              style={styles.prodCard}
              onPress={() => {
                if (c.productId) onOpenProduct?.(c.productId);
                else openLink();
              }}
            >
              <Image source={{ uri: c.imageUrl }} style={styles.prodImg} resizeMode="cover" />
              <Text style={styles.prodTitle} numberOfLines={2}>
                {c.title}
              </Text>
              <View style={styles.shopBtn}>
                <Text style={styles.shopBtnText}>Shop now</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Pressable style={styles.shopNowWide} onPress={openLink}>
          <Text style={styles.shopNowWideText}>Shop now</Text>
          <Ionicons name="chevron-forward" size={16} color={socialTheme.brandBlue} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    marginHorizontal: 0
  },
  adLabel: {
    ...appTypography.badge,
    color: "#ea580c",
    fontWeight: "800",
    textTransform: "uppercase"
  },
  headRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  logoPh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center"
  },
  logoQ: { color: "#fff", fontWeight: "800", fontSize: 18 },
  headText: { flex: 1, minWidth: 0 },
  title: { ...appTypography.titleSm, color: socialTheme.textPrimary, fontWeight: "800" },
  meta: { ...appTypography.meta, color: socialTheme.textSecondary },
  hero: { width: "100%", height: 180, borderRadius: 10, backgroundColor: "#e2e8f0" },
  track: { gap: 10, paddingRight: 8, paddingVertical: 4 },
  prodCard: {
    width: CARD_W,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    backgroundColor: "#f8fafc"
  },
  prodImg: { width: "100%", height: CARD_W, backgroundColor: "#e2e8f0" },
  prodTitle: {
    ...appTypography.meta,
    color: socialTheme.textPrimary,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingTop: 8,
    minHeight: 36
  },
  shopBtn: {
    margin: 8,
    alignSelf: "flex-start",
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  shopBtnText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  shopNowWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 6
  },
  shopNowWideText: { color: socialTheme.brandBlue, fontWeight: "700" }
});
