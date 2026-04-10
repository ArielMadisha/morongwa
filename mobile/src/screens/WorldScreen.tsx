import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { productsAPI, toAbsoluteMediaUrl, tvAPI } from "../lib/api";
import { Product, TVPost } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";

type WorldRow =
  | { kind: "post"; id: string; post: TVPost }
  | { kind: "product"; id: string; product: Product };

type WorldScreenProps = {
  onOpenProductId: (productId: string) => void;
  onGoToQwertyTv?: () => void;
};

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const TV_LIMIT = 8;
const PRODUCT_LIMIT = 8;

export function WorldScreen({ onOpenProductId, onGoToQwertyTv }: WorldScreenProps) {
  const [rows, setRows] = useState<WorldRow[]>([]);
  const [page, setPage] = useState(1);
  const [tvTotal, setTvTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewPost, setPreviewPost] = useState<TVPost | null>(null);

  const loadBatch = useCallback(async (nextPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const [tvRes, prodRes] = await Promise.all([
        tvAPI.getFeed({ page: nextPage, limit: TV_LIMIT, sort: "random" }),
        productsAPI.list({ limit: PRODUCT_LIMIT, random: true })
      ]);
      const posts = tvRes.data?.data ?? [];
      const products = prodRes.data?.data ?? [];
      const total = tvRes.data?.total ?? 0;
      setTvTotal(total);
      setPage(nextPage);
      const batch: WorldRow[] = shuffleInPlace([
        ...posts.map((p) => ({ kind: "post" as const, id: `p-${p._id}`, post: p })),
        ...products.map((p) => ({ kind: "product" as const, id: `g-${p._id}`, product: p }))
      ]);
      setRows((prev) => (append ? [...prev, ...batch] : batch));
    } catch {
      if (!append) setRows([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadBatch(1, false);
  }, [loadBatch]);

  const hasMore = tvTotal > 0 && page * TV_LIMIT < tvTotal;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBatch(1, false);
    setRefreshing(false);
  };

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    void loadBatch(page + 1, true);
  };

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={socialTheme.brandBlue} />
        <Text style={styles.hint}>Loading QwertyWorld…</Text>
      </View>
    );
  }

  const mediaUri = previewPost ? toAbsoluteMediaUrl(previewPost.mediaUrls?.[0]) : "";
  const isVideo = previewPost?.type === "video";

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={socialTheme.brandBlue} />
        }
        onEndReachedThreshold={0.35}
        onEndReached={loadMore}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={socialTheme.brandBlue} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Nothing to explore yet. Pull to refresh.</Text>
        }
        renderItem={({ item }) => {
          if (item.kind === "product") {
            const p = item.product;
            const img = toAbsoluteMediaUrl(p.images?.[0]);
            return (
              <Pressable style={styles.card} onPress={() => onOpenProductId(p._id)}>
                <Text style={styles.badge}>Product</Text>
                {img ? (
                  <Image source={{ uri: img }} style={styles.media} resizeMode="cover" />
                ) : (
                  <View style={[styles.media, styles.mediaPh]} />
                )}
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={styles.price}>
                  {p.currency || "ZAR"} {(p.discountPrice ?? p.price).toFixed(2)}
                </Text>
                <Text style={styles.openHint}>Tap to view in QwertyHub</Text>
              </Pressable>
            );
          }
          const post = item.post;
          const media = toAbsoluteMediaUrl(post.mediaUrls?.[0]);
          const title = post.heading || post.caption || post.subject || "Post";
          return (
            <Pressable style={styles.card} onPress={() => setPreviewPost(post)}>
              <Text style={styles.badge}>{post.type}</Text>
              {media ? (
                <Image source={{ uri: media }} style={styles.media} resizeMode="cover" />
              ) : (
                <View style={[styles.media, styles.mediaPh]} />
              )}
              <Text style={styles.cardTitle} numberOfLines={3}>
                {title}
              </Text>
              <Text style={styles.openHint}>Tap for details</Text>
            </Pressable>
          );
        }}
      />

      <Modal visible={!!previewPost} transparent animationType="fade" onRequestClose={() => setPreviewPost(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{previewPost?.heading || "Post"}</Text>
            {mediaUri && previewPost ? (
              isVideo ? (
                <Video
                  source={{ uri: mediaUri }}
                  style={styles.modalMedia}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                />
              ) : (
                <Image source={{ uri: mediaUri }} style={styles.modalMedia} resizeMode="contain" />
              )
            ) : (
              <View style={[styles.modalMedia, styles.mediaPh]} />
            )}
            <Text style={styles.modalBody} selectable>
              {previewPost?.caption || previewPost?.subject || ""}
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnGhost} onPress={() => setPreviewPost(null)}>
                <Text style={styles.modalBtnGhostText}>Close</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtn}
                onPress={() => {
                  setPreviewPost(null);
                  onGoToQwertyTv?.();
                }}
              >
                <Text style={styles.modalBtnText}>Open QwertyTV</Text>
              </Pressable>
            </View>
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
    gap: 10
  },
  hint: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  list: {
    paddingTop: 4,
    paddingBottom: 20,
    gap: 12
  },
  card: {
    backgroundColor: socialTheme.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    padding: 12,
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  badge: {
    ...appTypography.badge,
    color: socialTheme.brandBlueDark,
    alignSelf: "flex-start",
    backgroundColor: socialTheme.brandBlueSoft,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  media: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: socialTheme.surfaceMuted
  },
  mediaPh: {
    alignItems: "center",
    justifyContent: "center"
  },
  cardTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  price: {
    ...appTypography.price,
    color: socialTheme.textPrimary
  },
  openHint: {
    ...appTypography.meta,
    color: socialTheme.brandBlue,
    fontWeight: "700"
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center"
  },
  empty: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    textAlign: "center",
    marginTop: 24
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: socialTheme.surface,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    maxHeight: "90%"
  },
  modalTitle: {
    ...appTypography.titleMd,
    color: socialTheme.textPrimary
  },
  modalMedia: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: socialTheme.surfaceMuted
  },
  modalBody: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4
  },
  modalBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  modalBtnGhostText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    fontWeight: "700"
  },
  modalBtn: {
    backgroundColor: socialTheme.brandBlue,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12
  },
  modalBtnText: {
    ...appTypography.cta,
    color: "#ffffff"
  }
});
