import React from "react";
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { feedLight } from "../theme/socialTheme";
import { toAbsoluteMediaUrl } from "../lib/api";
import { statusStripThumbUrl, type StatusStripItem } from "../lib/statusStripItem";

export type { StatusStripItem };

type Props = {
  items: StatusStripItem[];
  onPressSelf?: () => void;
  onPressItem: (item: StatusStripItem) => void;
};

const CARD_W = 96;
const CARD_H = 128;

/**
 * Facebook-style horizontal status tray: Create + vertical preview cards.
 */
export function StoriesStrip({ items, onPressSelf, onPressItem }: Props) {
  const label = (item: StatusStripItem) => {
    const name = item.name?.trim();
    if (!name) return "Creator";
    if (item.isStoreStatus) return name.slice(0, 18);
    return name.split(/\s+/)[0]?.slice(0, 14) || "Creator";
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Pressable
          onPress={() => onPressSelf?.()}
          style={styles.createItem}
          accessibilityRole="button"
          accessibilityLabel="Create — new post"
        >
          <View style={[styles.createCard, styles.createCardEmpty]}>
            <Text style={styles.selfPlus}>＋</Text>
          </View>
          <Text style={styles.caption} numberOfLines={1}>
            Create
          </Text>
        </Pressable>

        {items.map((item) => {
          const thumb = statusStripThumbUrl(item);
          const display = label(item);
          return (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              style={styles.createItem}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.name || "creator"} status`}
            >
              {thumb ? (
                <ImageBackground source={{ uri: thumb }} style={styles.card} imageStyle={styles.cardImage}>
                  <View style={styles.cardOverlay}>
                    <View style={styles.cardAvatarRing}>
                      {item.avatar ? (
                        <Image source={{ uri: toAbsoluteMediaUrl(item.avatar) }} style={styles.cardAvatar} />
                      ) : (
                        <View style={[styles.cardAvatar, styles.avatarFallback]}>
                          <Text style={styles.fallbackLetter}>{display.slice(0, 1).toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.nameBar}>
                      <Text style={styles.cardName} numberOfLines={2}>
                        {display}
                      </Text>
                    </View>
                  </View>
                </ImageBackground>
              ) : (
                <View style={[styles.card, styles.cardFallback]}>
                  <View style={styles.cardAvatarRing}>
                    <View style={[styles.cardAvatar, styles.avatarFallback]}>
                      <Text style={styles.fallbackLetter}>{display.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.nameBar}>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {display}
                    </Text>
                  </View>
                </View>
              )}
              <Text style={styles.captionHidden} numberOfLines={1}>
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
    marginBottom: 0,
    marginHorizontal: -2
  },
  scroll: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
    alignItems: "flex-start"
  },
  createItem: {
    width: CARD_W,
    alignItems: "center"
  },
  createCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: feedLight.border
  },
  createCardEmpty: {
    backgroundColor: feedLight.searchBg,
    alignItems: "center",
    justifyContent: "center"
  },
  selfPlus: {
    fontSize: 28,
    fontWeight: "300",
    color: feedLight.textSecondary
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: feedLight.skeleton
  },
  cardImage: {
    borderRadius: 12
  },
  cardFallback: {
    justifyContent: "space-between",
    padding: 8,
    backgroundColor: feedLight.chipActiveBg
  },
  cardOverlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.08)"
  },
  cardAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    padding: 2,
    borderWidth: 2,
    borderColor: "#38bdf8",
    backgroundColor: "#fff",
    alignSelf: "flex-start"
  },
  cardAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 14
  },
  avatarFallback: {
    backgroundColor: feedLight.chipActiveBg,
    alignItems: "center",
    justifyContent: "center"
  },
  fallbackLetter: {
    fontSize: 13,
    fontWeight: "700",
    color: feedLight.link
  },
  nameBar: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  cardName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 13
  },
  caption: {
    fontSize: 10,
    fontWeight: "600",
    color: feedLight.text,
    maxWidth: CARD_W,
    textAlign: "center",
    marginTop: 4
  },
  captionHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0
  }
});
