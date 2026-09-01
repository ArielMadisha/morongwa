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
  useWindowDimensions,
  View
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { productsAPI, toAbsoluteMediaUrl, tvAPI } from "../lib/api";
import { resolvePostDisplayTitle } from "../lib/postDisplayTitle";
import { resolveProductStoreName } from "../lib/productStoreLabel";
import { Product, TVPost } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";
import { allowTvPostOnThisPlatform } from "../lib/iosStoreCompliance";
import { useScrollAwareScrollHandlers } from "../components/ScrollAwareChrome";

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

const TV_LIMIT = 10;
const PRODUCT_LIMIT = 10;

export function WorldScreen({ onOpenProductId, onGoToQwertyTv }: WorldScreenProps) {
  const chromeScroll = useScrollAwareScrollHandlers();
  const { width } = useWindowDimensions();
  const gap = 8;
  const pad = 8;
  const colW = Math.floor((width - pad * 2 - gap) / 2);

  const [rows, setRows] = useState<WorldRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
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
        productsAPI.list({ limit: PRODUCT_LIMIT, page: nextPage, random: true })
      ]);
      const posts = (tvRes.data?.data ?? []).filter(allowTvPostOnThisPlatform);
      const products = prodRes.data?.data ?? [];
      const total = tvRes.data?.total ?? 0;
      const prodHasMore =
        typeof prodRes.data?.hasMore === "boolean"
          ? prodRes.data.hasMore
          : products.length >= PRODUCT_LIMIT;
      const tvHasMore = total > 0 ? nextPage * TV_LIMIT < total : posts.length >= TV_LIMIT;
      setHasMore(tvHasMore || prodHasMore);
      setPage(nextPage);
      const batch: WorldRow[] = shuffleInPlace([
        ...posts.map((p) => ({ kind: "post" as const, id: `p-${p._id}-${nextPage}`, post: p })),
        ...products.map((p) => ({ kind: "product" as const, id: `g-${p._id}-${nextPage}`, product: p }))
      ]);
      setRows((prev) => (append ? [...prev, ...batch] : batch));
    } catch {
      if (!append) setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadBatch(1, false);
  }, [loadBatch]);

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
  const previewTitle = previewPost
    ? resolvePostDisplayTitle({
        heading: previewPost.heading,
        caption: previewPost.caption,
        subject: previewPost.subject,
        type: previewPost.type
      })
    : "Post";

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={[styles.row, { gap, paddingHorizontal: pad }]}
        contentContainerStyle={styles.list}
        scrollEventThrottle={chromeScroll.scrollEventThrottle}
        onScroll={chromeScroll.onScroll}
        onContentSizeChange={chromeScroll.onContentSizeChange}
        onLayout={chromeScroll.onLayout}
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
            const title = String(p.title || "").trim() || "Product";
            return (
              <Pressable
                style={[styles.card, { width: colW }]}
                onPress={() => onOpenProductId(p._id)}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.media} resizeMode="cover" />
                ) : (
                  <View style={[styles.media, styles.mediaPh]} />
                )}
                <Text style={styles.badge} numberOfLines={1}>
                  {resolveProductStoreName(p)}
                </Text>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {title}
                </Text>
                <Text style={styles.price}>
                  {p.currency || "ZAR"} {(p.discountPrice ?? p.price).toFixed(2)}
                </Text>
              </Pressable>
            );
          }
          const post = item.post;
          const media = toAbsoluteMediaUrl(post.mediaUrls?.[0]);
          const title = resolvePostDisplayTitle({
            heading: post.heading,
            caption: post.caption,
            subject: post.subject,
            type: post.type
          });
          return (
            <Pressable style={[styles.card, { width: colW }]} onPress={() => setPreviewPost(post)}>
              {media ? (
                <Image source={{ uri: media }} style={styles.media} resizeMode="cover" />
              ) : (
                <View style={[styles.media, styles.mediaPh]} />
              )}
              <Text style={styles.badge}>{post.type || "post"}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {title}
              </Text>
            </Pressable>
          );
        }}
      />

      <Modal visible={!!previewPost} transparent animationType="fade" onRequestClose={() => setPreviewPost(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{previewTitle}</Text>
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
    paddingBottom: 20
  },
  row: {
    marginBottom: 8
  },
  card: {
    backgroundColor: socialTheme.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    overflow: "hidden",
    paddingBottom: 10,
    gap: 6
  },
  badge: {
    ...appTypography.badge,
    color: socialTheme.brandBlueDark,
    alignSelf: "flex-start",
    backgroundColor: socialTheme.brandBlueSoft,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: "92%",
    marginHorizontal: 8,
    marginTop: 6
  },
  media: {
    width: "100%",
    height: 168,
    backgroundColor: socialTheme.surfaceMuted
  },
  mediaPh: {
    alignItems: "center",
    justifyContent: "center"
  },
  cardTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary,
    paddingHorizontal: 8
  },
  price: {
    ...appTypography.price,
    color: socialTheme.brandBlueDark,
    paddingHorizontal: 8
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
