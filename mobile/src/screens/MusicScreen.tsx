import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { musicAPI, toAbsoluteMediaUrl } from "../lib/api";
import { MusicSong } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";

const PAGE_SIZE = 24;

export function MusicScreen() {
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [genres, setGenres] = useState<{ id: string; label: string }[]>([]);
  const [genreId, setGenreId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true
    });
  }, []);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const loadGenres = useCallback(async () => {
    try {
      const res = await musicAPI.getGenres();
      const data = res.data?.data;
      setGenres(Array.isArray(data) ? data : []);
    } catch {
      setGenres([]);
    }
  }, []);

  const loadPage = useCallback(async (nextPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await musicAPI.getSongs({
        page: nextPage,
        limit: PAGE_SIZE,
        type: "song",
        random: false
      });
      const data = res.data?.data ?? [];
      const more = !!res.data?.hasMore;
      setHasMore(more);
      setPage(nextPage);
      setSongs((prev) => (append ? [...prev, ...data] : data));
    } catch {
      if (!append) setSongs([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadGenres();
  }, [loadGenres]);

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPage(1, false);
    setRefreshing(false);
  };

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    void loadPage(page + 1, true);
  };

  const filtered = useMemo(() => {
    const selected = genres.find((x) => x.id === genreId);
    return songs.filter((s) => {
      if (genreId === "all") return true;
      const sg = (s.genre || "").toLowerCase();
      const byId = sg === genreId.toLowerCase();
      const byLabel = selected ? sg === selected.label.toLowerCase() : false;
      return byId || byLabel;
    });
  }, [songs, genreId, genres]);

  const stopPlayback = useCallback(async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    soundRef.current = null;
    setPlayingId(null);
  }, []);

  const togglePlay = async (song: MusicSong) => {
    if (busyId) return;
    const uri = toAbsoluteMediaUrl(song.audioUrl);
    if (!uri) return;
    setBusyId(song._id);
    try {
      if (playingId === song._id && soundRef.current) {
        const st = await soundRef.current.getStatusAsync();
        if (st.isLoaded && st.isPlaying) {
          await soundRef.current.pauseAsync();
          setPlayingId(null);
          return;
        }
        if (st.isLoaded && !st.isPlaying) {
          await soundRef.current.playAsync();
          setPlayingId(song._id);
          return;
        }
      }
      await stopPlayback();
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 }
      );
      soundRef.current = sound;
      setPlayingId(song._id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setPlayingId(null);
        }
      });
    } catch {
      setPlayingId(null);
    } finally {
      setBusyId(null);
    }
  };

  if (loading && songs.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={socialTheme.brandBlue} />
        <Text style={styles.hint}>Loading QwertyMusic…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <Pressable
          onPress={() => setGenreId("all")}
          style={[styles.chip, genreId === "all" && styles.chipOn]}
        >
          <Text style={[styles.chipText, genreId === "all" && styles.chipTextOn]}>All</Text>
        </Pressable>
        {genres.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setGenreId(g.id)}
            style={[styles.chip, genreId === g.id && styles.chipOn]}
          >
            <Text style={[styles.chipText, genreId === g.id && styles.chipTextOn]}>{g.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id}
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
          <Text style={styles.empty}>
            {genreId !== "all" ? "No tracks match this genre." : "No tracks yet. Pull to refresh."}
          </Text>
        }
        renderItem={({ item }) => {
          const art = toAbsoluteMediaUrl(item.artworkUrl);
          const isPlaying = playingId === item._id;
          const busy = busyId === item._id;
          const uploader =
            typeof item.userId === "object" && item.userId?.name ? item.userId.name : null;
          return (
            <View style={styles.row}>
              {art ? (
                <Image source={{ uri: art }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPh]} />
              )}
              <View style={styles.rowBody}>
                <Text style={styles.trackTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {item.artist}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.genrePill}>{item.genre}</Text>
                  {uploader ? (
                    <Text style={styles.uploader} numberOfLines={1}>
                      {uploader}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable
                onPress={() => void togglePlay(item)}
                style={[styles.playBtn, isPlaying && styles.playBtnOn]}
                disabled={!!busy}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? "Pause" : "Play"}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={socialTheme.brandBlue} />
                ) : (
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={22}
                    color={isPlaying ? "#ffffff" : socialTheme.brandBlueDark}
                  />
                )}
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: socialTheme.canvas
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: socialTheme.canvas
  },
  hint: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  chipsRow: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 2,
    alignItems: "center"
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  chipOn: {
    borderColor: socialTheme.brandBlue,
    backgroundColor: socialTheme.brandBlueSoft
  },
  chipText: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary
  },
  chipTextOn: {
    color: socialTheme.brandBlueDark
  },
  list: {
    paddingBottom: 24,
    gap: 10
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: socialTheme.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    padding: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: socialTheme.surfaceMuted
  },
  coverPh: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderLight
  },
  rowBody: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  trackTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  artist: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  genrePill: {
    ...appTypography.badge,
    color: socialTheme.brandBlueDark,
    backgroundColor: socialTheme.brandBlueSoft,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  uploader: {
    ...appTypography.meta,
    color: socialTheme.textMuted,
    flex: 1,
    minWidth: 0
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  playBtnOn: {
    backgroundColor: socialTheme.brandBlue,
    borderColor: socialTheme.brandBlue
  },
  footer: {
    paddingVertical: 14,
    alignItems: "center"
  },
  empty: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    textAlign: "center",
    marginTop: 20
  }
});
