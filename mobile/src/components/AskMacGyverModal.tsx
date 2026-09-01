import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  followsAPI,
  macgyverAPI,
  musicAPI,
  productsAPI,
  storesAPI,
  toAbsoluteMediaUrl,
  tvAPI,
  usersAPI,
  type PublicStoreSearchHit
} from "../lib/api";
import type { MusicSong, Product, TVPost, User } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";

export type AskMacGyverModalProps = {
  visible: boolean;
  onClose: () => void;
  isSignedIn: boolean;
  onOpenProduct: (productId: string) => void;
  onOpenTv: () => void;
  onOpenMusic: () => void;
  onOpenStore: (store: PublicStoreSearchHit) => void;
  onMessageUser: (userId: string, name?: string) => void;
};

function userIdOf(u: { _id?: unknown; id?: unknown }): string {
  const raw = u._id ?? u.id;
  if (raw && typeof raw === "object" && raw !== null && "_id" in (raw as object)) {
    return String((raw as { _id?: unknown })._id ?? "");
  }
  return String(raw ?? "");
}

function parseUsersPayload(res: {
  data?: {
    users?: User[];
    data?: User[] | { users?: User[] };
  };
}): User[] {
  const body = res.data;
  if (!body) return [];
  if (Array.isArray(body.users)) return body.users;
  if (Array.isArray(body.data)) return body.data;
  if (body.data && typeof body.data === "object" && Array.isArray((body.data as { users?: User[] }).users)) {
    return (body.data as { users: User[] }).users;
  }
  return [];
}

function rankMusic(list: MusicSong[], search: string): MusicSong[] {
  const ranked = list
    .map((item) => {
      const extra = item as MusicSong & { lyrics?: string; songwriters?: string; producer?: string };
      const haystack = [item?.title, item?.artist, item?.genre, extra.lyrics, extra.songwriters, extra.producer]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const starts =
        String(item?.title || "")
          .toLowerCase()
          .startsWith(search) ||
        String(item?.artist || "")
          .toLowerCase()
          .startsWith(search) ||
        String(item?.genre || "")
          .toLowerCase()
          .startsWith(search);
      const includes = haystack.includes(search);
      return { item, score: starts ? 2 : includes ? 1 : 0 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
  return ranked.slice(0, 40);
}

export function AskMacGyverModal({
  visible,
  onClose,
  isSignedIn,
  onOpenProduct,
  onOpenTv,
  onOpenMusic,
  onOpenStore,
  onMessageUser
}: AskMacGyverModalProps) {
  const [query, setQuery] = useState("");
  const [browseLoading, setBrowseLoading] = useState(false);
  const [askLoading, setAskLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tvPosts, setTvPosts] = useState<TVPost[]>([]);
  const [music, setMusic] = useState<MusicSong[]>([]);
  const [stores, setStores] = useState<PublicStoreSearchHit[]>([]);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const searchGen = useRef(0);

  const reset = useCallback(() => {
    setQuery("");
    setAiText(null);
    setProducts([]);
    setUsers([]);
    setTvPosts([]);
    setMusic([]);
    setStores([]);
    setBrowseLoading(false);
    setAskLoading(false);
    setFollowBusyId(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  // Live multi-source browse — same pipeline as web `/search`.
  useEffect(() => {
    if (!visible) return;
    const search = query.trim().toLowerCase();
    if (search.length < 1) {
      setProducts([]);
      setUsers([]);
      setTvPosts([]);
      setMusic([]);
      setStores([]);
      setBrowseLoading(false);
      return;
    }

    const gen = ++searchGen.current;
    const timer = setTimeout(() => {
      setBrowseLoading(true);
      void (async () => {
        const [prods, usrs, posts, songs, storeHits] = await Promise.all([
          productsAPI
            .list({ limit: 40, q: search })
            .then((res) => {
              const list = res.data?.data ?? [];
              return Array.isArray(list) ? list : [];
            })
            .catch(() => [] as Product[]),
          Promise.all([
            isSignedIn
              ? usersAPI
                  .list({ limit: 40, q: search })
                  .then((res) => parseUsersPayload(res))
                  .catch(() => [] as User[])
              : Promise.resolve([] as User[]),
            isSignedIn
              ? followsAPI
                  .getSuggested({ limit: 20, q: search })
                  .then((res) => {
                    const list = res.data?.data ?? [];
                    return Array.isArray(list) ? (list as User[]) : [];
                  })
                  .catch(() => [] as User[])
              : Promise.resolve([] as User[])
          ]).then(([mainUsers, suggested]) => {
            const seen = new Set<string>();
            const merged: User[] = [];
            for (const u of [...mainUsers, ...suggested]) {
              const id = userIdOf(u);
              if (id && !seen.has(id)) {
                seen.add(id);
                merged.push(u);
              }
            }
            return merged;
          }),
          tvAPI
            .getFeed({ limit: 40, q: search, sort: "newest" })
            .then((res) => {
              const list = res.data?.data ?? [];
              return Array.isArray(list) ? list : [];
            })
            .catch(() => [] as TVPost[]),
          musicAPI
            .getSongs({ limit: 80 })
            .then((res) => {
              const list = res.data?.data ?? [];
              return Array.isArray(list) ? rankMusic(list, search) : [];
            })
            .catch(() => [] as MusicSong[]),
          storesAPI
            .search({ q: search, limit: 20 })
            .then((res) => {
              const list = res.data?.data ?? [];
              return Array.isArray(list) ? list : [];
            })
            .catch(() => [] as PublicStoreSearchHit[])
        ]);

        if (gen !== searchGen.current) return;
        setProducts(prods);
        setUsers(usrs);
        setTvPosts(posts);
        setMusic(songs);
        setStores(storeHits);
        setBrowseLoading(false);
      })();
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [query, visible, isSignedIn]);

  const submitAsk = async () => {
    const q = query.trim();
    if (!q || askLoading) return;
    if (!isSignedIn) {
      Alert.alert("Ask MacGyver", "Sign in to use Ask MacGyver.");
      return;
    }
    setAskLoading(true);
    setAiText(null);
    try {
      const res = await macgyverAPI.ask(q);
      const data = res.data?.data;
      if (data && "type" in data && data.type === "search" && typeof data.query === "string") {
        const nextQ = data.query.trim();
        if (nextQ) setQuery(nextQ);
        setAiText(
          ("text" in data && typeof (data as { text?: string }).text === "string"
            ? (data as { text: string }).text
            : null) ||
            `I found matches on Qwertymates for “${nextQ}”. Browse results below, or ask a fuller question for a written answer.`
        );
      } else if (data && "text" in data && typeof (data as { text?: string }).text === "string") {
        setAiText((data as { text: string }).text);
      } else {
        setAiText("No response.");
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Something went wrong. Try again.";
      if (status === 401) {
        setAiText("Your session expired. Sign out and sign in again, then Ask MacGyver.");
      } else {
        setAiText(String(msg));
      }
    } finally {
      setAskLoading(false);
    }
  };

  const followUser = async (id: string, name?: string) => {
    if (!isSignedIn || !id || followBusyId) return;
    setFollowBusyId(id);
    try {
      await followsAPI.follow(id);
      Alert.alert("Following", name ? `You are now following ${name}.` : "Follow request sent.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Could not follow.";
      Alert.alert("Follow", String(msg));
    } finally {
      setFollowBusyId(null);
    }
  };

  const hasBrowse =
    products.length > 0 || users.length > 0 || tvPosts.length > 0 || music.length > 0 || stores.length > 0;
  const qTrim = query.trim();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityLabel="Dismiss" />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Ionicons name="construct" size={22} color="#f59e0b" />
              <Text style={styles.title}>Ask MacGyver</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={socialTheme.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.sub}>
            When there is no solution… MacGyver makes one. Search live results or ask anything.
          </Text>

          {!isSignedIn ? (
            <Text style={styles.signInHint}>Sign in to search people and use Ask MacGyver AI.</Text>
          ) : null}

          <ScrollView style={styles.bodyScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {aiText ? (
              <View style={styles.aiBox}>
                <Text style={styles.aiText} selectable>
                  {aiText}
                </Text>
              </View>
            ) : null}

            {browseLoading && qTrim.length >= 1 ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#f59e0b" />
                <Text style={styles.loadingText}>Searching Qwertymates…</Text>
              </View>
            ) : null}

            {!browseLoading && qTrim.length >= 1 && !hasBrowse && !aiText ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No results for “{qTrim}”</Text>
                <Text style={styles.emptySub}>Try different keywords or tap Ask for a written answer.</Text>
              </View>
            ) : null}

            {qTrim.length < 1 && !aiText ? (
              <Text style={styles.emptyHint}>Type to search stores, people, TV, music, and products — or Ask.</Text>
            ) : null}

            {stores.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Stores ({stores.length})</Text>
                {stores.map((s) => (
                  <Pressable key={s._id} style={styles.row} onPress={() => onOpenStore(s)}>
                    <View style={[styles.thumb, styles.thumbPh]}>
                      <Ionicons name="storefront-outline" size={22} color={socialTheme.brandBlue} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {s.name}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {s.type === "reseller" ? "Reseller store" : "Supplier store"}
                        {s.country ? ` · ${s.country}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {users.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Users ({users.length})</Text>
                {users.map((u) => {
                  const id = userIdOf(u);
                  const avatar = toAbsoluteMediaUrl(u.avatar);
                  return (
                    <View key={id || u.username || u.name} style={styles.userRow}>
                      <Pressable
                        style={styles.userMain}
                        onPress={() => {
                          if (!id) return;
                          onMessageUser(id, u.name);
                        }}
                      >
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={styles.thumb} />
                        ) : (
                          <View style={[styles.thumb, styles.thumbPh]}>
                            <Text style={styles.avatarLetter}>{(u.name || "?").slice(0, 1).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={styles.rowText}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {u.name || "Unknown"}
                          </Text>
                          {u.username ? (
                            <Text style={styles.rowMeta} numberOfLines={1}>
                              @{u.username}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                      {isSignedIn && id ? (
                        <Pressable
                          style={styles.followBtn}
                          disabled={followBusyId === id}
                          onPress={() => void followUser(id, u.name)}
                        >
                          {followBusyId === id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.followBtnText}>Follow</Text>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {tvPosts.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>TV Posts & Videos ({tvPosts.length})</Text>
                {tvPosts.slice(0, 12).map((v) => {
                  const thumb = toAbsoluteMediaUrl(v.mediaUrls?.[0]);
                  return (
                    <Pressable key={v._id} style={styles.row} onPress={onOpenTv}>
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={styles.thumbWide} />
                      ) : (
                        <View style={[styles.thumbWide, styles.thumbPh]}>
                          <Ionicons name="play-circle-outline" size={22} color="#64748b" />
                        </View>
                      )}
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={2}>
                          {v.caption || "Video"}
                        </Text>
                        <Text style={styles.rowMeta}>Open QwertyTV</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {music.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Music & Albums ({music.length})</Text>
                {music.slice(0, 12).map((m) => (
                  <Pressable key={m._id} style={styles.row} onPress={onOpenMusic}>
                    {m.artworkUrl ? (
                      <Image source={{ uri: toAbsoluteMediaUrl(m.artworkUrl) }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPh]}>
                        <Ionicons name="musical-notes-outline" size={20} color="#64748b" />
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {m.title || "Untitled"}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {m.artist || "Unknown artist"}
                        {m.genre ? ` · ${m.genre}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {products.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Products ({products.length})</Text>
                {products.map((p) => {
                  const img = toAbsoluteMediaUrl(p.images?.[0]);
                  const price = p.discountPrice != null && p.discountPrice < p.price ? p.discountPrice : p.price;
                  return (
                    <Pressable key={p._id} style={styles.row} onPress={() => onOpenProduct(p._id)}>
                      {img ? (
                        <Image source={{ uri: img }} style={styles.thumb} />
                      ) : (
                        <View style={[styles.thumb, styles.thumbPh]} />
                      )}
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={2}>
                          {p.title}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {p.currency || "ZAR"} {Number(price).toFixed(2)}
                          {p.outOfStock || (typeof p.stock === "number" && p.stock < 1) ? " · Out of stock" : ""}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {hasBrowse ? (
              <Text style={styles.stillNeed}>Still can’t find it? Tap Ask for MacGyver’s written help.</Text>
            ) : null}
          </ScrollView>

          <View style={styles.askRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search or ask anything…"
              placeholderTextColor="#94a3b8"
              style={styles.inputFlex}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void submitAsk()}
              editable={!askLoading}
            />
            <Pressable
              onPress={() => void submitAsk()}
              disabled={askLoading || !qTrim}
              style={[styles.askBtn, (askLoading || !qTrim) && styles.askBtnDisabled]}
            >
              {askLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.askBtnText}>Ask</Text>
              )}
            </Pressable>
          </View>

          <Pressable onPress={handleClose} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    gap: 10,
    maxWidth: 400,
    maxHeight: "88%",
    alignSelf: "center",
    width: "100%"
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  title: {
    ...appTypography.headline,
    color: socialTheme.textPrimary
  },
  sub: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  signInHint: {
    ...appTypography.meta,
    color: "#b45309",
    marginBottom: 4
  },
  bodyScroll: {
    flexGrow: 0,
    maxHeight: 380
  },
  aiBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 10
  },
  aiText: {
    ...appTypography.meta,
    color: socialTheme.textPrimary,
    lineHeight: 20
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12
  },
  loadingText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  emptyBox: {
    paddingVertical: 16,
    gap: 6
  },
  emptyTitle: {
    ...appTypography.titleMd,
    color: socialTheme.textPrimary
  },
  emptySub: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  emptyHint: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    paddingVertical: 8
  },
  section: {
    marginBottom: 14,
    gap: 6
  },
  sectionLabel: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary,
    textTransform: "uppercase",
    marginBottom: 4
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0"
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0"
  },
  userMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#e2e8f0"
  },
  thumbWide: {
    width: 64,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#1e293b"
  },
  thumbPh: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0f2fe"
  },
  avatarLetter: {
    fontWeight: "700",
    color: "#0369a1"
  },
  rowText: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  rowMeta: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary,
    marginTop: 2
  },
  followBtn: {
    backgroundColor: socialTheme.brandBlue,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: "center"
  },
  followBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12
  },
  stillNeed: {
    ...appTypography.meta,
    color: "#92400e",
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    marginBottom: 8
  },
  askRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  inputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    color: socialTheme.textPrimary,
    backgroundColor: "#fff"
  },
  askBtn: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 64,
    alignItems: "center"
  },
  askBtnDisabled: {
    opacity: 0.5
  },
  askBtnText: {
    color: "#fff",
    fontWeight: "700"
  },
  done: {
    alignSelf: "center",
    paddingVertical: 6
  },
  doneText: {
    ...appTypography.titleSm,
    color: socialTheme.brandBlue
  }
});
