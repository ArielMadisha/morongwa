import React, { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { podcastsAPI, toAbsoluteMediaUrl } from "../lib/api";
import type { PodcastEpisodeItem } from "../lib/api";
import { MediaChipsRow } from "../components/MediaChipsRow";
import { appTypography, socialTheme } from "../theme/socialTheme";

const PAGE_SIZE = 24;

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return "Audio";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** QwertyPodcasts, nested under QwertyMedia. */
export function PodcastsScreen() {
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [category, setCategory] = useState("all");
  const [episodes, setEpisodes] = useState<PodcastEpisodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    podcastsAPI
      .getCategories()
      .then((res) => setCategories(res.data?.data ?? []))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await podcastsAPI.listEpisodes({ category, limit: PAGE_SIZE });
      setEpisodes(res.data?.data ?? []);
    } catch {
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      void soundRef.current?.unloadAsync();
    },
    []
  );

  const togglePlay = async (episode: PodcastEpisodeItem) => {
    if (episode.locked) {
      Alert.alert("Premium episode", "Unlock this episode to listen.");
      return;
    }
    const uri = toAbsoluteMediaUrl(episode.audioUrl || "");
    if (!uri) return;
    try {
      if (playingId === episode._id) {
        await soundRef.current?.pauseAsync();
        setPlayingId(null);
        return;
      }
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setPlayingId(null);
      });
      setPlayingId(episode._id);
      void podcastsAPI.recordPlay(episode._id).catch(() => undefined);
    } catch {
      Alert.alert("Playback", "Could not play this episode.");
    }
  };

  const toggleLike = async (episode: PodcastEpisodeItem) => {
    try {
      const res = await podcastsAPI.likeEpisode(episode._id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (res.data?.data?.liked) next.add(episode._id);
        else next.delete(episode._id);
        return next;
      });
      setEpisodes((prev) =>
        prev.map((e) => (e._id === episode._id ? { ...e, likeCount: res.data?.data?.likeCount ?? e.likeCount } : e))
      );
    } catch {
      Alert.alert("Sign in", "Sign in to like episodes.");
    }
  };

  const unlock = async (episode: PodcastEpisodeItem) => {
    // Apple Guideline 3.1.1: wallet unlocks for digital content are Android/web only.
    if (Platform.OS === "ios") {
      Alert.alert("Not available", "Premium episodes cannot be purchased in the iOS app.");
      return;
    }
    try {
      await podcastsAPI.unlockEpisode(episode._id, "android");
      Alert.alert("Unlocked", "Episode unlocked from your ACBPay Wallet.");
      await load();
    } catch (err: any) {
      Alert.alert("Unlock failed", err?.response?.data?.error || "Could not unlock this episode.");
    }
  };

  const renderItem = ({ item }: { item: PodcastEpisodeItem }) => {
    const cover = toAbsoluteMediaUrl(item.coverUrl || "");
    const showTitle = typeof item.podcastId === "object" ? item.podcastId?.title : undefined;
    const premiumOnIos = Platform.OS === "ios" && item.locked;
    return (
      <View style={styles.row}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Ionicons name="mic-outline" size={22} color={socialTheme.textSecondary} />
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {showTitle ? `${showTitle} · ` : ""}
            {formatDuration(item.durationSeconds)}
          </Text>
        </View>
        <Pressable onPress={() => toggleLike(item)} style={styles.iconBtn} accessibilityLabel="Like episode">
          <Ionicons
            name={likedIds.has(item._id) ? "heart" : "heart-outline"}
            size={20}
            color={likedIds.has(item._id) ? "#e11d48" : socialTheme.textSecondary}
          />
        </Pressable>
        {item.locked ? (
          <Pressable
            onPress={() => unlock(item)}
            style={[styles.playBtn, styles.lockBtn, premiumOnIos && styles.lockBtnDisabled]}
            accessibilityLabel="Unlock premium episode"
          >
            <Ionicons name="lock-closed" size={16} color="#fff" />
          </Pressable>
        ) : (
          <Pressable onPress={() => togglePlay(item)} style={styles.playBtn} accessibilityLabel="Play episode">
            <Ionicons name={playingId === item._id ? "pause" : "play"} size={18} color="#fff" />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <MediaChipsRow
        chips={[{ id: "all", label: "All" }, ...categories]}
        activeId={category}
        onSelect={setCategory}
        accessibilityLabel="Podcast categories"
      />
      {loading && episodes.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={socialTheme.brandBlue} />
        </View>
      ) : (
        <FlatList
          data={episodes}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="mic-outline" size={36} color={socialTheme.textSecondary} />
              <Text style={styles.hint}>No episodes in this category yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: socialTheme.canvas, paddingHorizontal: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  hint: { ...appTypography.meta, color: socialTheme.textSecondary },
  list: { paddingBottom: 24, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: socialTheme.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline
  },
  rowText: { flex: 1, minWidth: 0 },
  cover: { width: 52, height: 52, borderRadius: 10, backgroundColor: socialTheme.canvas },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  title: { ...appTypography.labelSm, color: socialTheme.textPrimary, fontWeight: "600" },
  meta: { ...appTypography.meta, color: socialTheme.textSecondary, marginTop: 2 },
  iconBtn: { padding: 6 },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: socialTheme.brandBlue
  },
  lockBtn: { backgroundColor: "#0f172a" },
  lockBtnDisabled: { opacity: 0.5 }
});
