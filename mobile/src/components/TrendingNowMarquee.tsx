import React, { useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tvAPI } from "../lib/api";
import { socialTheme } from "../theme/socialTheme";

type Trend = { tag: string; count: number };

type Props = {
  onPressTag?: (tag: string) => void;
};

/**
 * Trending hashtags — finger-draggable horizontal chips (web AdvertSlot parity).
 * Soft auto-nudge when idle; user scroll always wins.
 */
export function TrendingNowMarquee({ onPressTag }: Props) {
  const [items, setItems] = useState<Trend[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const xRef = useRef(0);
  const contentW = useRef(0);
  const viewW = useRef(0);
  const userTouching = useRef(false);
  const nudgeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void tvAPI
      .getTrendingHashtags(16, 7, "popular")
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.data ?? [];
        setItems(
          Array.isArray(rows)
            ? rows
                .map((r) => ({
                  tag: String(r.tag || "")
                    .replace(/^#/, "")
                    .trim(),
                  count: Number(r.count || 0)
                }))
                .filter((r) => r.tag)
            : []
        );
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (nudgeTimer.current) clearInterval(nudgeTimer.current);
    if (items.length < 2) return;
    nudgeTimer.current = setInterval(() => {
      if (userTouching.current) return;
      const max = Math.max(0, contentW.current - viewW.current);
      if (max <= 8) return;
      let next = xRef.current + 28;
      if (next >= max) next = 0;
      xRef.current = next;
      scrollRef.current?.scrollTo({ x: next, animated: true });
    }, 2200);
    return () => {
      if (nudgeTimer.current) clearInterval(nudgeTimer.current);
    };
  }, [items.length]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    xRef.current = e.nativeEvent.contentOffset.x;
  };

  if (!items.length) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>Trending now</Text>
        <Text style={styles.empty}>No trends yet</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        viewW.current = e.nativeEvent.layout.width;
      }}
    >
      <View style={styles.labelRow}>
        <Ionicons name="trending-up" size={12} color={socialTheme.brandBlue} />
        <Text style={styles.label}>Trending now</Text>
        <Text style={styles.hint}>Swipe</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          userTouching.current = true;
        }}
        onScrollEndDrag={() => {
          userTouching.current = false;
        }}
        onMomentumScrollEnd={() => {
          userTouching.current = false;
        }}
        contentContainerStyle={styles.track}
        onContentSizeChange={(w) => {
          contentW.current = w;
        }}
      >
        {items.map((h) => (
          <Pressable
            key={h.tag}
            onPress={() => onPressTag?.(h.tag)}
            style={styles.chip}
            accessibilityRole="button"
            accessibilityLabel={`Trending hashtag ${h.tag}`}
          >
            <Text style={styles.chipText}>#{h.tag}</Text>
            {h.count > 0 ? <Text style={styles.count}> {h.count}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: "#ffffff"
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: socialTheme.brandBlue,
    flex: 1
  },
  hint: {
    fontSize: 10,
    color: socialTheme.textMuted,
    fontWeight: "600"
  },
  empty: {
    fontSize: 12,
    color: socialTheme.textSecondary,
    paddingVertical: 4
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingRight: 16
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0369a1"
  },
  count: {
    fontSize: 12,
    color: "#0284c7",
    fontWeight: "500"
  }
});
