import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { feedLight, socialTheme } from "../theme/socialTheme";
import { toAbsoluteMediaUrl } from "../lib/api";
import { statusStripThumbUrl, type StatusStripItem } from "../lib/statusStripItem";

export type { StatusStripItem };

type Props = {
  items: StatusStripItem[];
  /** Current user avatar for the create control (matches web StatusesStrip). */
  selfAvatarUrl?: string | null;
  onPressSelf?: () => void;
  onPressItem: (item: StatusStripItem) => void;
};

const RING = 52;

/**
 * Web-style horizontal status tray: circular Create (avatar + plus) then circular statuses.
 */
export function StoriesStrip({ items, selfAvatarUrl, onPressSelf, onPressItem }: Props) {
  const label = (item: StatusStripItem) => {
    const name = item.name?.trim();
    if (!name) return "Creator";
    if (item.isStoreStatus) return name.slice(0, 14);
    return name.split(/\s+/).slice(0, 2).join(" ").slice(0, 16) || "Creator";
  };

  const selfUri = selfAvatarUrl ? toAbsoluteMediaUrl(selfAvatarUrl) : "";

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
          <View style={styles.createRing}>
            {selfUri ? (
              <Image source={{ uri: selfUri }} style={styles.createAvatar} />
            ) : (
              <View style={[styles.createAvatar, styles.createAvatarFallback]} />
            )}
            <View style={styles.createOverlay}>
              <Ionicons name="add" size={22} color="#ffffff" />
            </View>
          </View>
          <Text style={styles.caption} numberOfLines={1}>
            create
          </Text>
        </Pressable>

        {items.map((item) => {
          const thumb = statusStripThumbUrl(item);
          const display = label(item);
          const avatarUri = item.avatar ? toAbsoluteMediaUrl(item.avatar) : "";
          const ringUri = thumb || avatarUri;
          return (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              style={styles.item}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.name || "creator"} status`}
            >
              <View style={styles.statusGradient}>
                <View style={styles.statusInner}>
                  {ringUri ? (
                    <Image source={{ uri: ringUri }} style={styles.statusImage} />
                  ) : (
                    <View style={[styles.statusImage, styles.avatarFallback]}>
                      <Text style={styles.fallbackLetter}>{display.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.caption} numberOfLines={1}>
                {display}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 0
  },
  scroll: {
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: "flex-start"
  },
  item: {
    width: 68,
    alignItems: "center",
    gap: 4
  },
  createRing: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    overflow: "hidden",
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center"
  },
  createAvatar: {
    ...StyleSheet.absoluteFillObject,
    width: RING,
    height: RING
  },
  createAvatarFallback: {
    backgroundColor: socialTheme.brandBlue
  },
  createOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 89, 133, 0.42)",
    alignItems: "center",
    justifyContent: "center"
  },
  statusGradient: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    padding: 2,
    backgroundColor: "#a855f7",
    // Approximate web gradient with layered border colors
    borderWidth: 0
  },
  statusInner: {
    flex: 1,
    borderRadius: (RING - 4) / 2,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    padding: 2
  },
  statusImage: {
    width: "100%",
    height: "100%",
    borderRadius: (RING - 8) / 2,
    backgroundColor: feedLight.skeleton
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: feedLight.chipActiveBg
  },
  fallbackLetter: {
    fontSize: 16,
    fontWeight: "700",
    color: feedLight.link
  },
  caption: {
    fontSize: 10,
    fontWeight: "600",
    color: feedLight.text,
    maxWidth: 68,
    textAlign: "center",
    lineHeight: 12
  }
});
