import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toAbsoluteMediaUrl } from "../lib/api";
import { looksLikeVideoUrl } from "../lib/tvMedia";
import type { TVPost } from "../types";

type Props = {
  visible: boolean;
  post: TVPost | null;
  loading?: boolean;
  creatorName?: string;
  creatorAvatar?: string;
  /** Product id when this status segment is a marketplace product */
  productId?: string | null;
  onOpenProduct?: (productId: string) => void;
  /** Total segments for this user's status (multi-image school galleries). */
  segmentCount?: number;
  postIndex?: number;
  onNextPost?: () => void;
  onPrevPost?: () => void;
  onClose: () => void;
};

function displayName(post: TVPost | null, fallback?: string): string {
  const c = post?.creatorId;
  if (c && typeof c === "object" && c.name) return c.name;
  return fallback || "User";
}

function captionFontSize(length: number): number {
  if (length > 1400) return 11;
  if (length > 700) return 12;
  if (length > 280) return 13;
  return 14;
}

function primaryMediaUrl(post: TVPost | null): string | undefined {
  if (!post?.mediaUrls?.length) return undefined;
  return post.mediaUrls.find(Boolean);
}

export function StatusStoryViewer({
  visible,
  post,
  loading,
  creatorName,
  creatorAvatar,
  productId,
  onOpenProduct,
  segmentCount = 1,
  postIndex = 0,
  onNextPost,
  onPrevPost,
  onClose
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const videoRef = useRef<Video>(null);
  const [muted, setMuted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (!visible) {
      setVideoReady(false);
      void videoRef.current?.stopAsync().catch(() => undefined);
    }
  }, [visible]);

  useEffect(() => {
    setVideoReady(false);
  }, [post?._id]);

  const name = displayName(post, creatorName);
  const avatar = creatorAvatar || (typeof post?.creatorId === "object" ? post.creatorId?.avatar : undefined);
  const mediaUrl = primaryMediaUrl(post);
  const absMedia = mediaUrl ? toAbsoluteMediaUrl(mediaUrl) : "";
  const isVideo =
    post?.type === "video" || (absMedia ? looksLikeVideoUrl(absMedia) : false);
  const viewerH = Math.min(height * 0.78, 640);
  const viewerW = Math.min(width * 0.88, 420);
  const segments = Math.max(1, segmentCount);
  const canOpenProduct = !!(productId && onOpenProduct);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.viewer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
          {segments > 1 ? (
            <View style={styles.progressRow}>
              {Array.from({ length: segments }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressTrack,
                    i < postIndex ? styles.progressDone : i === postIndex ? styles.progressActive : null
                  ]}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.topBar}>
            <View style={styles.userRow}>
              {avatar ? (
                <Image source={{ uri: toAbsoluteMediaUrl(avatar) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{(name || "?")[0]?.toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.userName} numberOfLines={1}>
                {name}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>

          <View style={[styles.mediaFrame, { width: viewerW, height: viewerH }]}>
            <Pressable
              style={styles.tapPrev}
              onPress={onPrevPost}
              disabled={!onPrevPost || postIndex <= 0}
              accessibilityRole="button"
              accessibilityLabel="Previous status"
            />
            <Pressable
              style={styles.tapNext}
              onPress={onNextPost}
              disabled={!onNextPost}
              accessibilityRole="button"
              accessibilityLabel="Next status"
            />

            {loading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : !post ? (
              <Text style={styles.emptyText}>This status could not be loaded.</Text>
            ) : post.type === "text" || (!absMedia && post.type !== "video") ? (
              <ScrollView
                style={styles.textScroll}
                contentContainerStyle={styles.textScrollContent}
                showsVerticalScrollIndicator
              >
                <Text style={styles.textHeading}>{post.heading || name}</Text>
                {post.caption ? (
                  <Text style={[styles.textCaption, { fontSize: captionFontSize(post.caption.length) }]}>
                    {post.caption}
                  </Text>
                ) : null}
              </ScrollView>
            ) : isVideo && absMedia ? (
              <>
                {!videoReady ? <ActivityIndicator size="large" color="#fff" style={styles.mediaLoader} /> : null}
                <Video
                  ref={videoRef}
                  source={{ uri: absMedia }}
                  style={styles.mediaFill}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping
                  isMuted={muted}
                  useNativeControls={false}
                  onPlaybackStatusUpdate={(s: AVPlaybackStatus) => {
                    if (s.isLoaded && s.isPlaying) setVideoReady(true);
                  }}
                  onError={() => setVideoReady(true)}
                />
                <Pressable
                  style={styles.muteBtn}
                  onPress={() => setMuted((m) => !m)}
                  accessibilityRole="button"
                  accessibilityLabel={muted ? "Unmute" : "Mute"}
                >
                  <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color="#fff" />
                </Pressable>
              </>
            ) : absMedia ? (
              <Pressable
                style={styles.mediaPressable}
                disabled={!canOpenProduct}
                onPress={() => {
                  if (productId && onOpenProduct) onOpenProduct(productId);
                }}
                accessibilityRole={canOpenProduct ? "button" : undefined}
                accessibilityLabel={canOpenProduct ? "View product" : undefined}
              >
                <Image source={{ uri: absMedia }} style={styles.mediaFill} resizeMode="contain" />
                {canOpenProduct ? (
                  <View style={styles.viewProductPill} pointerEvents="none">
                    <Ionicons name="bag-handle-outline" size={16} color="#fff" />
                    <Text style={styles.viewProductText}>View product</Text>
                  </View>
                ) : null}
                {post.caption ? (
                  <View style={styles.captionOverlay} pointerEvents="box-none">
                    <ScrollView style={styles.captionScroll} showsVerticalScrollIndicator>
                      <Text style={[styles.captionText, { fontSize: captionFontSize(post.caption.length) }]}>
                        {post.caption}
                      </Text>
                    </ScrollView>
                  </View>
                ) : null}
              </Pressable>
            ) : (
              <Text style={styles.emptyText}>No media for this status.</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center"
  },
  viewer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between"
  },
  progressRow: {
    flexDirection: "row",
    gap: 4,
    width: "92%",
    paddingHorizontal: 8,
    marginBottom: 8
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)"
  },
  progressDone: {
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  progressActive: {
    backgroundColor: "rgba(255,255,255,0.65)"
  },
  topBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 2
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 12
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#38bdf8"
  },
  avatarFallback: {
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarLetter: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },
  userName: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    flex: 1
  },
  mediaFrame: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center"
  },
  tapPrev: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "32%",
    zIndex: 3
  },
  tapNext: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "32%",
    zIndex: 3
  },
  mediaFill: {
    width: "100%",
    height: "100%"
  },
  mediaPressable: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  viewProductPill: {
    position: "absolute",
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(2, 132, 199, 0.95)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    zIndex: 5
  },
  viewProductText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13
  },
  mediaLoader: {
    position: "absolute",
    zIndex: 1
  },
  muteBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4
  },
  textCard: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  textScroll: {
    flex: 1,
    width: "100%"
  },
  textScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24
  },
  textHeading: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8
  },
  textCaption: {
    color: "#cbd5e1",
    fontSize: 16,
    textAlign: "center"
  },
  captionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "44%",
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 14
  },
  captionScroll: {
    maxHeight: 220
  },
  captionText: {
    color: "#f8fafc",
    lineHeight: 20
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 20
  }
});
