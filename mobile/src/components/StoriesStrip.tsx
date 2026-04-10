import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { feedLight } from "../theme/socialTheme";
import { toAbsoluteMediaUrl } from "../lib/api";

export type StoryRingItem = {
  id: string;
  name?: string;
  avatar?: string;
  isSelf?: boolean;
};

type Props = {
  creators: StoryRingItem[];
  onPressSelf?: () => void;
  onPressCreator: (id: string, name?: string) => void;
};

/**
 * Instagram-style horizontal strip: Create + recent creators from statuses.
 */
export function StoriesStrip({ creators, onPressSelf, onPressCreator }: Props) {
  const label = (name?: string) => (name ? name.split(/\s+/)[0]?.slice(0, 12) : "Creator") || "Creator";

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Pressable
          onPress={() => onPressSelf?.()}
          style={styles.item}
          accessibilityRole="button"
          accessibilityLabel="Create — new post"
        >
          <View style={[styles.ring, styles.ringSelf]}>
            <View style={styles.avatarInner}>
              <Text style={styles.selfPlus}>＋</Text>
            </View>
          </View>
          <Text style={styles.caption} numberOfLines={1}>
            Create
          </Text>
        </Pressable>

        {creators.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onPressCreator(c.id, c.name)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={`Open ${c.name || "creator"} story`}
          >
            <View style={styles.ring}>
              {c.avatar ? (
                <Image source={{ uri: toAbsoluteMediaUrl(c.avatar) }} style={styles.avatarImg} />
              ) : (
                <View style={[styles.avatarInner, styles.avatarFallback]}>
                  <Text style={styles.fallbackLetter}>{label(c.name).slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <Text style={styles.caption} numberOfLines={1}>
              {label(c.name)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Outer diameter — keep in sync with `HomeScreen` `brandLogo` (40×40). */
const RING_OUTER = 40;
const RING_BORDER = 2;
const RING_PADDING = 2;
const RING_INNER = RING_OUTER - 2 * RING_BORDER - 2 * RING_PADDING;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 0,
    marginHorizontal: -2
  },
  scroll: {
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
    alignItems: "flex-start"
  },
  item: {
    width: 56,
    alignItems: "center",
    gap: 4
  },
  ring: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    padding: RING_PADDING,
    borderWidth: RING_BORDER,
    borderColor: "#e1306c",
    backgroundColor: feedLight.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  ringSelf: {
    borderColor: feedLight.border,
    backgroundColor: feedLight.searchBg
  },
  avatarInner: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
    backgroundColor: feedLight.skeleton,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  avatarImg: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2
  },
  avatarFallback: {
    backgroundColor: feedLight.chipActiveBg
  },
  fallbackLetter: {
    fontSize: 14,
    fontWeight: "700",
    color: feedLight.link
  },
  selfPlus: {
    fontSize: 18,
    fontWeight: "300",
    color: feedLight.textSecondary,
    marginTop: -1
  },
  caption: {
    fontSize: 10,
    fontWeight: "600",
    color: feedLight.text,
    maxWidth: 56,
    textAlign: "center"
  }
});
