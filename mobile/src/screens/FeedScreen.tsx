import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  useWindowDimensions,
  View
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { ActionChip } from "../components/ActionChip";
import { ModalCard } from "../components/ModalCard";
import { usePersistentMap } from "../hooks/usePersistentMap";
import { usePendingActionQueue } from "../hooks/usePendingActionQueue";
import { advertsAPI, followsAPI, toAbsoluteMediaUrl, tvAPI, usersAPI } from "../lib/api";
import { Advert, TVComment, TVPost, User, UserProfileStats } from "../types";

type FeedListItem =
  | { kind: "post"; id: string; post: TVPost }
  | { kind: "advert"; id: string; advert: Advert };

type FeedScreenProps = {
  userName?: string;
  currentUserId?: string;
  savedOnly?: boolean;
  onSavedCountChange?: (count: number) => void;
};

type InteractionToast = {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  tone?: "success" | "error" | "neutral";
};

type FeedSort = "newest" | "trending" | "random";

const FEED_LIMIT = 12;
const ADVERT_INTERVAL = 6;
const LOAD_MORE_THROTTLE_MS = 900;
const REFRESH_THROTTLE_MS = 1200;
const LIKE_TAP_THROTTLE_MS = 280;
const QUEUE_RETRY_THROTTLE_MS = 1500;
const SAVED_POSTS_KEY = "morongwa.mobile.savedPosts";
const MUTED_USERS_KEY = "morongwa.mobile.mutedUsers";
const MUTED_USERS_META_KEY = "morongwa.mobile.mutedUsers.meta";
const PENDING_ACTIONS_KEY = "morongwa.mobile.pendingActions";
const BLOCKED_USERS_24H_KEY = "morongwa.mobile.blockedUsers24h";

function decodeIdListMap(raw: string): Record<string, boolean> {
  const ids = JSON.parse(raw) as unknown;
  if (!Array.isArray(ids)) return {};
  const map: Record<string, boolean> = {};
  ids.forEach((id) => {
    if (typeof id === "string" && id) map[id] = true;
  });
  return map;
}

function encodeIdListMap(map: Record<string, boolean>): string {
  return JSON.stringify(Object.keys(map));
}

function pruneExpiredBlockMap(source: Record<string, number>) {
  const now = Date.now();
  const next: Record<string, number> = {};
  Object.entries(source).forEach(([id, expiresAt]) => {
    if (typeof expiresAt === "number" && expiresAt > now) next[id] = expiresAt;
  });
  return next;
}

function decodeBlockedUsersMap(raw: string): Record<string, number> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") return {};
  return pruneExpiredBlockMap(parsed as Record<string, number>);
}

function getCreatorUserId(post: TVPost): string | undefined {
  if (typeof post.creatorId === "string") return post.creatorId;
  return post.creatorId?._id || post.creatorId?.id;
}

type PendingAction =
  | { id: string; type: "like"; postId: string; desiredLiked: boolean; createdAt: number }
  | { id: string; type: "comment"; postId: string; text: string; createdAt: number }
  | { id: string; type: "report"; postId: string; reason: string; createdAt: number };

type HapticAction =
  | "like_success"
  | "like_error"
  | "save_success"
  | "save_error"
  | "mute_success"
  | "mute_error"
  | "block_success"
  | "block_error"
  | "share_success"
  | "copy_link_success"
  | "copy_link_error"
  | "profile_error"
  | "connections_error"
  | "follow_success"
  | "follow_error"
  | "comment_load_error"
  | "comment_submit_success"
  | "comment_submit_error"
  | "report_submit_success"
  | "report_submit_error"
  | "queue_retry_success"
  | "queue_retry_pending";

const HAPTIC_MAP: Record<
  HapticAction,
  | { kind: "notification"; value: Haptics.NotificationFeedbackType }
  | { kind: "impact"; value: Haptics.ImpactFeedbackStyle }
> = {
  like_success: { kind: "impact", value: Haptics.ImpactFeedbackStyle.Light },
  like_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  save_success: { kind: "notification", value: Haptics.NotificationFeedbackType.Success },
  save_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  mute_success: { kind: "impact", value: Haptics.ImpactFeedbackStyle.Medium },
  mute_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  block_success: { kind: "impact", value: Haptics.ImpactFeedbackStyle.Heavy },
  block_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  share_success: { kind: "impact", value: Haptics.ImpactFeedbackStyle.Light },
  copy_link_success: { kind: "impact", value: Haptics.ImpactFeedbackStyle.Light },
  copy_link_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  profile_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  connections_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  follow_success: { kind: "notification", value: Haptics.NotificationFeedbackType.Success },
  follow_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  comment_load_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  comment_submit_success: { kind: "notification", value: Haptics.NotificationFeedbackType.Success },
  comment_submit_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  report_submit_success: { kind: "notification", value: Haptics.NotificationFeedbackType.Success },
  report_submit_error: { kind: "notification", value: Haptics.NotificationFeedbackType.Error },
  queue_retry_success: { kind: "notification", value: Haptics.NotificationFeedbackType.Success },
  queue_retry_pending: { kind: "impact", value: Haptics.ImpactFeedbackStyle.Medium }
};

export function FeedScreen({ userName, currentUserId, savedOnly = false, onSavedCountChange }: FeedScreenProps) {
  const { width } = useWindowDimensions();
  const compactUI = width < 390;
  const [posts, setPosts] = useState<TVPost[]>([]);
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [sort, setSort] = useState<FeedSort>("newest");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [likingById, setLikingById] = useState<Record<string, boolean>>({});
  const {
    value: savedMap,
    setValue: setSavedMap,
    persistValue: persistSavedMap,
    reload: reloadSavedMap
  } = usePersistentMap<boolean>({
    storageKey: SAVED_POSTS_KEY,
    decode: decodeIdListMap,
    encode: encodeIdListMap
  });
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const {
    value: mutedMap,
    setValue: setMutedMap,
    persistValue: persistMutedMap
  } = usePersistentMap<boolean>({
    storageKey: MUTED_USERS_KEY,
    decode: decodeIdListMap,
    encode: encodeIdListMap
  });
  const {
    value: mutedUsersMeta,
    setValue: setMutedUsersMeta,
    persistValue: persistMutedUsersMeta
  } = usePersistentMap<string>({
    storageKey: MUTED_USERS_META_KEY
  });
  const {
    value: blockedUsers24h,
    setValue: setBlockedUsers24h,
    persistValue: persistBlockedUsers24h
  } = usePersistentMap<number>({
    storageKey: BLOCKED_USERS_24H_KEY,
    decode: decodeBlockedUsersMap,
    encode: (value) => JSON.stringify(pruneExpiredBlockMap(value))
  });
  const [commentsLoadingById, setCommentsLoadingById] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [commentPost, setCommentPost] = useState<TVPost | null>(null);
  const [comments, setComments] = useState<TVComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const [reportPost, setReportPost] = useState<TVPost | null>(null);
  const [reportCategory, setReportCategory] = useState<"spam" | "abuse" | "harassment" | "violence" | "other">("spam");
  const [reportBlockCreator, setReportBlockCreator] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileHistory, setProfileHistory] = useState<string[]>([]);
  const [profileNameCache, setProfileNameCache] = useState<Record<string, string>>({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<UserProfileStats | null>(null);
  const [followStatus, setFollowStatus] = useState<"accepted" | "pending" | "none">("none");
  const [followLoading, setFollowLoading] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsType, setConnectionsType] = useState<"followers" | "following">("followers");
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connections, setConnections] = useState<User[]>([]);
  const [muteManagerOpen, setMuteManagerOpen] = useState(false);
  const [muteSearchQuery, setMuteSearchQuery] = useState("");
  const [queueInspectorOpen, setQueueInspectorOpen] = useState(false);
  const [mediaViewerUri, setMediaViewerUri] = useState<string | null>(null);
  const [mediaViewerIndex, setMediaViewerIndex] = useState<number>(0);
  const [moreActionsPost, setMoreActionsPost] = useState<TVPost | null>(null);
  const [previewCreator, setPreviewCreator] = useState<{ id: string; name?: string; avatar?: string } | null>(null);
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<InteractionToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadMoreAtRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const lastQueueRetryAtRef = useRef(0);
  const lastLikeTapByIdRef = useRef<Record<string, number>>({});
  const likeScaleByIdRef = useRef<Record<string, Animated.Value>>({});
  const heartScaleByIdRef = useRef<Record<string, Animated.Value>>({});
  const heartOpacityByIdRef = useRef<Record<string, Animated.Value>>({});
  const heartTimerByIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const lastTapByIdRef = useRef<Record<string, number>>({});
  const singleTapTimerByIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const [heartVisibleById, setHeartVisibleById] = useState<Record<string, boolean>>({});
  const [heartPosById, setHeartPosById] = useState<Record<string, { x: number; y: number }>>({});
  const lastTapPosByIdRef = useRef<Record<string, { x: number; y: number }>>({});
  const moreModalScale = useRef(new Animated.Value(0.96)).current;
  const moreModalOpacity = useRef(new Animated.Value(0)).current;
  const muteModalScale = useRef(new Animated.Value(0.96)).current;
  const muteModalOpacity = useRef(new Animated.Value(0)).current;
  const queueModalScale = useRef(new Animated.Value(0.96)).current;
  const queueModalOpacity = useRef(new Animated.Value(0)).current;

  const hasMore = !savedOnly && posts.length < total;

  useEffect(() => {
    onSavedCountChange?.(Object.keys(savedMap).length);
  }, [savedMap, onSavedCountChange]);

  const isCreatorHidden = useCallback((creatorId?: string) => {
    if (!creatorId) return false;
    if (mutedMap[creatorId]) return true;
    const expiresAt = blockedUsers24h[creatorId];
    return typeof expiresAt === "number" && expiresAt > Date.now();
  }, [blockedUsers24h, mutedMap]);

  const executePendingAction = useCallback(async (action: PendingAction) => {
    if (action.type === "like") {
      const likedRes = await tvAPI.getLiked(action.postId);
      const currentlyLiked = !!likedRes.data?.data?.liked;
      if (currentlyLiked !== action.desiredLiked) {
        await tvAPI.like(action.postId);
      }
      return;
    }
    if (action.type === "comment") {
      await tvAPI.addComment(action.postId, action.text);
      return;
    }
    await tvAPI.report(action.postId, action.reason);
  }, []);

  const {
    pendingActionsPreview,
    retryingQueue,
    enqueuePendingAction,
    refreshPendingPreview,
    retryPendingNow: retryPendingNowRaw
  } = usePendingActionQueue<PendingAction>({
    storageKey: PENDING_ACTIONS_KEY,
    executeAction: executePendingAction
  });

  const loadSavedPosts = useCallback(async () => {
    setLoading(true);
    try {
      const savedMapLatest = await reloadSavedMap();
      const savedIds = Object.keys(savedMapLatest);
      if (savedIds.length === 0) {
        setPosts([]);
        setTotal(0);
        setPage(1);
        return;
      }
      const postPromises = savedIds.map((id) => tvAPI.getPost(id).catch(() => null));
      const postResponses = await Promise.all(postPromises);
      const resolvedPosts = postResponses
        .map((res) => res?.data?.data)
        .filter((post): post is TVPost => !!post?._id);
      const orderedPosts = savedIds
        .map((id) => resolvedPosts.find((post) => post._id === id))
        .filter((post): post is TVPost => !!post);
      const q = searchQuery.trim().toLowerCase();
      const filteredPosts =
        q.length < 2
          ? orderedPosts
          : orderedPosts.filter((post) => {
              const creatorName =
                (typeof post.creatorId === "object" ? post.creatorId?.name : "")?.toLowerCase() || "";
              const text = [post.caption, post.heading, post.subject, creatorName, ...(post.hashtags || [])]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return text.includes(q);
            });
      const visiblePosts = filteredPosts.filter((post) => {
        const creatorId = getCreatorUserId(post);
        return !isCreatorHidden(creatorId);
      });
      setPosts(visiblePosts);
      setTotal(visiblePosts.length);
      setPage(1);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isCreatorHidden, reloadSavedMap, searchQuery]);

  const loadAdverts = useCallback(async () => {
    try {
      const advertsRes = await advertsAPI.getAdverts();
      const advertList = advertsRes.data?.data ?? [];
      setAdverts(Array.isArray(advertList) ? advertList : []);
    } catch {
      setAdverts([]);
    }
  }, []);

  const loadFeed = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        if (savedOnly) {
          await loadSavedPosts();
          return;
        }
        const res = await tvAPI.getFeed({
          page: targetPage,
          limit: FEED_LIMIT,
          sort,
          q: searchQuery.trim() || undefined
        });
        const data = res.data?.data ?? [];
        const feedPosts = Array.isArray(data) ? data : [];
        const visiblePosts = feedPosts.filter((post) => {
          const creatorId = getCreatorUserId(post);
          return !isCreatorHidden(creatorId);
        });
        const nextTotal = res.data?.total ?? visiblePosts.length;
        setTotal(nextTotal);
        setPage(targetPage);
        setPosts((prev) => (append ? [...prev, ...visiblePosts] : visiblePosts));
      } catch {
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [isCreatorHidden, loadSavedPosts, savedOnly, sort, searchQuery]
  );

  useEffect(() => {
    loadFeed(1, false);
    if (!savedOnly) {
      loadAdverts();
    } else {
      setAdverts([]);
    }
  }, [loadFeed, loadAdverts, savedOnly]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    void loadFeed(1, false);
  }, [searchQuery, sort, savedOnly, loadFeed]);

  const onRefresh = async () => {
    if (refreshing) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) return;
    lastRefreshAtRef.current = now;
    setRefreshing(true);
    if (savedOnly) {
      await loadSavedPosts();
    } else {
      await Promise.all([loadFeed(1, false), loadAdverts()]);
    }
    setRefreshing(false);
  };

  const items = useMemo<FeedListItem[]>(() => {
    const merged: FeedListItem[] = [];
    posts.forEach((post, index) => {
      if (!savedOnly && index > 0 && index % ADVERT_INTERVAL === 0 && adverts.length > 0) {
        const advert = adverts[index % adverts.length];
        if (advert) {
          merged.push({ kind: "advert", id: `advert-${advert._id}-${index}`, advert });
        }
      }
      merged.push({ kind: "post", id: post._id, post });
    });
    return merged;
  }, [posts, adverts, savedOnly]);

  const loadMore = () => {
    const now = Date.now();
    if (now - lastLoadMoreAtRef.current < LOAD_MORE_THROTTLE_MS) return;
    if (loading || loadingMore || !hasMore) return;
    lastLoadMoreAtRef.current = now;
    loadFeed(page + 1, true);
  };

  const mediaItems = useMemo(
    () =>
      posts
        .filter((post) => (post.mediaUrls?.[0] || "").length > 0)
        .map((post) => ({ postId: post._id, uri: toAbsoluteMediaUrl(post.mediaUrls?.[0]) }))
        .filter((m) => !!m.uri),
    [posts]
  );

  const profileBreadcrumb = useMemo(() => {
    const ids = [...profileHistory, profileId].filter(Boolean) as string[];
    if (ids.length <= 1) return "";
    return ids.map((id) => profileNameCache[id] || "Profile").join(" > ");
  }, [profileHistory, profileId, profileNameCache]);

  const filteredMutedIds = useMemo(() => {
    const q = muteSearchQuery.trim().toLowerCase();
    const ids = Object.keys(mutedMap);
    if (!q) return ids;
    return ids.filter((id) => {
      const name = (mutedUsersMeta[id] || "").toLowerCase();
      return name.includes(q) || id.toLowerCase().includes(q);
    });
  }, [muteSearchQuery, mutedMap, mutedUsersMeta]);

  const jumpToBreadcrumbIndex = (index: number) => {
    const ids = [...profileHistory, profileId].filter(Boolean) as string[];
    if (index < 0 || index >= ids.length) return;
    const targetId = ids[index];
    if (!targetId) return;
    setProfileHistory(ids.slice(0, index));
    setProfileId(targetId);
    void loadProfile(targetId);
  };

  const sortOptions: Array<{ id: FeedSort; label: string }> = [
    { id: "newest", label: "Newest" },
    { id: "trending", label: "Trending" },
    { id: "random", label: "Random" }
  ];

  const getLikeScaleValue = useCallback((postId: string) => {
    if (!likeScaleByIdRef.current[postId]) {
      likeScaleByIdRef.current[postId] = new Animated.Value(1);
    }
    return likeScaleByIdRef.current[postId];
  }, []);

  const getHeartScaleValue = useCallback((postId: string) => {
    if (!heartScaleByIdRef.current[postId]) {
      heartScaleByIdRef.current[postId] = new Animated.Value(0.5);
    }
    return heartScaleByIdRef.current[postId];
  }, []);

  const getHeartOpacityValue = useCallback((postId: string) => {
    if (!heartOpacityByIdRef.current[postId]) {
      heartOpacityByIdRef.current[postId] = new Animated.Value(0);
    }
    return heartOpacityByIdRef.current[postId];
  }, []);

  const animateLikeCount = useCallback((postId: string) => {
    const scale = getLikeScaleValue(postId);
    scale.stopAnimation();
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.14,
        duration: 110,
        useNativeDriver: true
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true
      })
    ]).start();
  }, [getLikeScaleValue]);

  const animateHeartBurst = useCallback((postId: string) => {
    const scale = getHeartScaleValue(postId);
    const opacity = getHeartOpacityValue(postId);
    const existingTimer = heartTimerByIdRef.current[postId];
    if (existingTimer) {
      clearTimeout(existingTimer);
      heartTimerByIdRef.current[postId] = null;
    }
    setHeartVisibleById((prev) => ({ ...prev, [postId]: true }));
    scale.stopAnimation();
    opacity.stopAnimation();
    scale.setValue(0.5);
    opacity.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.2,
          duration: 140,
          useNativeDriver: true
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true
        })
      ]),
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 90,
          useNativeDriver: true
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true
        })
      ])
    ]).start(() => {
      heartTimerByIdRef.current[postId] = setTimeout(() => {
        setHeartVisibleById((prev) => ({ ...prev, [postId]: false }));
      }, 40);
    });
  }, [getHeartOpacityValue, getHeartScaleValue]);

  const triggerHaptic = useCallback(async (action: HapticAction) => {
    try {
      const config = HAPTIC_MAP[action];
      if (config.kind === "notification") {
        await Haptics.notificationAsync(config.value);
      } else {
        await Haptics.impactAsync(config.value);
      }
    } catch {
      // Ignore unsupported platforms/devices.
    }
  }, []);

  const showToast = useCallback((payload: InteractionToast, durationMs = 3000) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(payload.message, ToastAndroid.SHORT);
    }
    setToast({ tone: "neutral", ...payload });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const showRetryToast = useCallback((payload: InteractionToast) => {
    showToast({ tone: "error", ...payload }, 4500);
  }, [showToast]);

  const showSuccessToast = useCallback((message: string) => {
    showToast({ message, tone: "success" }, 1400);
  }, []);

  const retryPendingNow = useCallback(async () => {
    const now = Date.now();
    if (retryingQueue || now - lastQueueRetryAtRef.current < QUEUE_RETRY_THROTTLE_MS) return;
    lastQueueRetryAtRef.current = now;
    const remaining = await retryPendingNowRaw();
    if (!remaining.length) {
      void triggerHaptic("queue_retry_success");
      showSuccessToast("Queue cleared");
    } else {
      void triggerHaptic("queue_retry_pending");
      showToast({ message: `${remaining.length} item(s) still pending`, tone: "neutral" }, 2200);
    }
  }, [retryPendingNowRaw, retryingQueue, showSuccessToast, showToast, triggerHaptic]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      Object.values(heartTimerByIdRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      Object.values(singleTapTimerByIdRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  useEffect(() => {
    if (queueInspectorOpen) {
      void refreshPendingPreview();
    }
  }, [queueInspectorOpen, refreshPendingPreview]);

  useEffect(() => {
    if (!moreActionsPost) return;
    moreModalScale.setValue(0.96);
    moreModalOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(moreModalScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6
      }),
      Animated.timing(moreModalOpacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [moreActionsPost, moreModalOpacity, moreModalScale]);

  useEffect(() => {
    if (!muteManagerOpen) return;
    muteModalScale.setValue(0.96);
    muteModalOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(muteModalScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6
      }),
      Animated.timing(muteModalOpacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [muteManagerOpen, muteModalOpacity, muteModalScale]);

  useEffect(() => {
    if (!queueInspectorOpen) return;
    queueModalScale.setValue(0.96);
    queueModalOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(queueModalScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6
      }),
      Animated.timing(queueModalOpacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [queueInspectorOpen, queueModalOpacity, queueModalScale]);

  const handleLikeToggle = async (post: TVPost) => {
    const postId = post._id;
    const now = Date.now();
    const lastTapAt = lastLikeTapByIdRef.current[postId] ?? 0;
    if (now - lastTapAt < LIKE_TAP_THROTTLE_MS) return;
    lastLikeTapByIdRef.current[postId] = now;
    if (likingById[postId]) return;
    const wasLiked = !!likedMap[postId];
    const nextLiked = !wasLiked;
    const prevLikeCount = post.likeCount ?? 0;
    const optimisticLikeCount = Math.max(0, prevLikeCount + (nextLiked ? 1 : -1));

    setLikingById((prev) => ({ ...prev, [postId]: true }));
    setLikedMap((prev) => ({ ...prev, [postId]: nextLiked }));
    setPosts((prev) =>
      prev.map((p) => (p._id === postId ? { ...p, likeCount: optimisticLikeCount } : p))
    );
    animateLikeCount(postId);

    try {
      const res = await tvAPI.like(postId);
      const serverLiked = !!res.data?.data?.liked;
      const serverLikeCount = res.data?.data?.likeCount;
      setLikedMap((prev) => ({ ...prev, [postId]: serverLiked }));
      if (typeof serverLikeCount === "number") {
        setPosts((prev) => prev.map((p) => (p._id === postId ? { ...p, likeCount: serverLikeCount } : p)));
      }
      void triggerHaptic("like_success");
      showSuccessToast(serverLiked ? "Post liked" : "Like removed");
    } catch {
      setLikedMap((prev) => ({ ...prev, [postId]: wasLiked }));
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, likeCount: prevLikeCount } : p))
      );
      await enqueuePendingAction({
        id: `${Date.now()}-like-${postId}`,
        type: "like",
        postId,
        desiredLiked: nextLiked,
        createdAt: Date.now()
      });
      void triggerHaptic("like_error");
      showRetryToast({
        message: "Like failed. Queued for retry.",
        retryLabel: "Retry",
        onRetry: () => {
          const latest = posts.find((p) => p._id === postId) ?? post;
          void handleLikeToggle(latest);
        }
      });
    } finally {
      setLikingById((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const getShareLink = (postId: string) => {
    return `https://qwertymates.com/morongwa-tv/post/${postId}`;
  };

  const handleMediaTap = (post: TVPost, mediaUrl: string) => {
    const now = Date.now();
    const lastTap = lastTapByIdRef.current[post._id] ?? 0;
    const isDoubleTap = now - lastTap < 280;
    lastTapByIdRef.current[post._id] = now;
    if (!isDoubleTap) {
      const existing = singleTapTimerByIdRef.current[post._id];
      if (existing) clearTimeout(existing);
      singleTapTimerByIdRef.current[post._id] = setTimeout(() => {
        if (mediaUrl) {
          const idx = mediaItems.findIndex((m) => m.postId === post._id);
          setMediaViewerIndex(idx >= 0 ? idx : 0);
          setMediaViewerUri(mediaUrl);
        }
      }, 260);
      return;
    }

    const existing = singleTapTimerByIdRef.current[post._id];
    if (existing) {
      clearTimeout(existing);
      singleTapTimerByIdRef.current[post._id] = null;
    }

    const pos = lastTapPosByIdRef.current[post._id];
    if (pos) {
      setHeartPosById((prev) => ({ ...prev, [post._id]: pos }));
    }
    animateHeartBurst(post._id);
    if (!likedMap[post._id]) {
      void handleLikeToggle(post);
    } else {
      void triggerHaptic("like_success");
    }
  };

  const handleSaveToggle = async (post: TVPost) => {
    const postId = post._id;
    if (savingById[postId]) return;
    const wasSaved = !!savedMap[postId];
    const nextSaved = !wasSaved;

    setSavingById((prev) => ({ ...prev, [postId]: true }));
    const nextMap = { ...savedMap };
    if (nextSaved) nextMap[postId] = true;
    else delete nextMap[postId];
    setSavedMap(nextMap);

    try {
      await persistSavedMap(nextMap);
      if (savedOnly && !nextSaved) {
        setPosts((prev) => prev.filter((p) => p._id !== postId));
        setTotal((prev) => Math.max(0, prev - 1));
      }
      void triggerHaptic("save_success");
      showSuccessToast(nextSaved ? "Post saved" : "Post removed from saved");
    } catch {
      setSavedMap((prev) => {
        const restored = { ...prev };
        if (wasSaved) restored[postId] = true;
        else delete restored[postId];
        return restored;
      });
      void triggerHaptic("save_error");
      showRetryToast({
        message: "Could not save post. Retry?",
        retryLabel: "Retry",
        onRetry: () => {
          const latest = posts.find((p) => p._id === postId) ?? post;
          void handleSaveToggle(latest);
        }
      });
    } finally {
      setSavingById((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleMuteToggle = async (creatorId: string, creatorName?: string) => {
    const wasMuted = !!mutedMap[creatorId];
    const nextMuted = !wasMuted;
    const nextMap = { ...mutedMap };
    const nextMeta = { ...mutedUsersMeta };
    if (nextMuted) nextMap[creatorId] = true;
    else delete nextMap[creatorId];
    if (nextMuted && creatorName) nextMeta[creatorId] = creatorName;
    if (!nextMuted) delete nextMeta[creatorId];
    setMutedMap(nextMap);
    setMutedUsersMeta(nextMeta);

    if (nextMuted) {
      setPosts((prev) => prev.filter((post) => getCreatorUserId(post) !== creatorId));
      showToast({
        message: `Muted ${creatorName || "user"}`,
        tone: "success",
        retryLabel: "Undo",
        onRetry: () => {
          void handleMuteToggle(creatorId, creatorName);
        }
      }, 3500);
      void triggerHaptic("mute_success");
    } else {
      showToast({
        message: `Unmuted ${creatorName || "user"}`,
        tone: "success",
        retryLabel: "Undo",
        onRetry: () => {
          void handleMuteToggle(creatorId, creatorName);
        }
      }, 3500);
      void triggerHaptic("mute_success");
    }

    try {
      await Promise.all([persistMutedMap(nextMap), persistMutedUsersMeta(nextMeta)]);
      if (!nextMuted) {
        if (savedOnly) {
          await loadSavedPosts();
        } else {
          await loadFeed(1, false);
        }
      }
    } catch {
      setMutedMap((prev) => {
        const restored = { ...prev };
        if (wasMuted) restored[creatorId] = true;
        else delete restored[creatorId];
        return restored;
      });
      setMutedUsersMeta((prev) => {
        const restored = { ...prev };
        if (!wasMuted) delete restored[creatorId];
        return restored;
      });
      void triggerHaptic("mute_error");
      showRetryToast({
        message: "Failed to update mute. Retry?",
        retryLabel: "Retry",
        onRetry: () => {
          void handleMuteToggle(creatorId, creatorName);
        }
      });
    }
  };

  const handleBlock24h = async (creatorId: string, creatorName?: string) => {
    const now = Date.now();
    const next = pruneExpiredBlockMap({
      ...blockedUsers24h,
      [creatorId]: now + 24 * 60 * 60 * 1000
    });
    setBlockedUsers24h(next);
    setPosts((prev) => prev.filter((post) => getCreatorUserId(post) !== creatorId));
    showSuccessToast(`Hidden ${creatorName || "user"} for 24h`);
    void triggerHaptic("block_success");
    try {
      await persistBlockedUsers24h(next);
    } catch {
      void triggerHaptic("block_error");
      showRetryToast({
        message: "Failed to save 24h block.",
        retryLabel: "Retry",
        onRetry: () => {
          void handleBlock24h(creatorId, creatorName);
        }
      });
    }
  };

  const handleSharePost = async (post: TVPost) => {
    try {
      await Share.share({
        message: `Check this post on Morongwa: ${getShareLink(post._id)}`
      });
      void triggerHaptic("share_success");
    } catch {
      // no-op when user cancels
    }
  };

  const handleCopyPostLink = async (post: TVPost) => {
    try {
      await Clipboard.setStringAsync(getShareLink(post._id));
      showSuccessToast("Post link copied");
      void triggerHaptic("copy_link_success");
    } catch {
      void triggerHaptic("copy_link_error");
      showRetryToast({
        message: "Failed to copy link.",
        retryLabel: "Retry",
        onRetry: () => {
          void handleCopyPostLink(post);
        }
      });
    }
  };

  const moveMediaBy = (delta: number) => {
    if (!mediaItems.length) return;
    const next = mediaViewerIndex + delta;
    if (next < 0 || next >= mediaItems.length) return;
    setMediaViewerIndex(next);
    setMediaViewerUri(mediaItems[next]?.uri || null);
  };

  const mediaPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -40) moveMediaBy(1);
          else if (gestureState.dx > 40) moveMediaBy(-1);
        }
      }),
    [mediaItems.length, mediaViewerIndex]
  );

  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true);
    setProfileData(null);
    try {
      const [profileRes, statusRes] = await Promise.all([
        usersAPI.getProfileStats(id),
        currentUserId && currentUserId !== id ? followsAPI.getStatus(id) : Promise.resolve(null)
      ]);
      setProfileData(profileRes.data ?? null);
      const loadedName = profileRes.data?.user?.name;
      if (loadedName) {
        setProfileNameCache((prev) => ({ ...prev, [id]: loadedName }));
      }
      if (statusRes) {
        const status = statusRes.data?.status;
        if (status === "accepted" || status === "pending") {
          setFollowStatus(status);
        } else {
          setFollowStatus("none");
        }
      } else {
        setFollowStatus("none");
      }
    } catch {
      void triggerHaptic("profile_error");
      showRetryToast({
        message: "Failed to load profile. Retry?",
        retryLabel: "Retry",
        onRetry: () => {
          void loadProfile(id);
        }
      });
    } finally {
      setProfileLoading(false);
    }
  }, [currentUserId, showRetryToast, triggerHaptic]);

  const openProfile = (id: string, pushCurrent = false, seedName?: string) => {
    if (pushCurrent && profileId && profileId !== id) {
      setProfileHistory((prev) => [...prev, profileId]);
    }
    if (!pushCurrent) {
      setProfileHistory([]);
    }
    if (seedName?.trim()) {
      setProfileNameCache((prev) => ({ ...prev, [id]: seedName.trim() }));
    }
    setProfileId(id);
    setProfileOpen(true);
    void loadProfile(id);
  };

  const openNestedProfileFromConnections = (user: User) => {
    const id = user._id || user.id;
    if (!id) return;
    setConnectionsOpen(false);
    setConnections([]);
    setConnectionsLoading(false);
    openProfile(id, true, user.name);
  };

  const goBackProfile = () => {
    setProfileHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const previousId = next.pop() as string;
      setProfileId(previousId);
      void loadProfile(previousId);
      return next;
    });
  };

  const closeProfileModal = () => {
    setProfileOpen(false);
    setProfileId(null);
    setProfileData(null);
    setFollowStatus("none");
    setProfileHistory([]);
  };

  const openConnections = async (type: "followers" | "following") => {
    if (!profileId) return;
    setConnectionsType(type);
    setConnectionsOpen(true);
    setConnectionsLoading(true);
    setConnections([]);
    try {
      const res =
        type === "followers"
          ? await followsAPI.getFollowers(profileId)
          : await followsAPI.getFollowing(profileId);
      const list = res.data?.data ?? [];
      setConnections(Array.isArray(list) ? list : []);
    } catch {
      void triggerHaptic("connections_error");
      showRetryToast({
        message: `Failed to load ${type}. Retry?`,
        retryLabel: "Retry",
        onRetry: () => {
          void openConnections(type);
        }
      });
    } finally {
      setConnectionsLoading(false);
    }
  };

  const toggleFollow = async () => {
    if (!profileId || followLoading || !currentUserId || currentUserId === profileId) return;
    const previous = followStatus;
    const wantsUnfollow = previous === "accepted";
    const optimisticNext: "accepted" | "pending" | "none" = wantsUnfollow ? "none" : "accepted";

    setFollowLoading(true);
    setFollowStatus(optimisticNext);
    setProfileData((prev) => {
      if (!prev) return prev;
      const followerCount = prev.followerCount ?? 0;
      const nextCount = wantsUnfollow ? Math.max(0, followerCount - 1) : followerCount + 1;
      return { ...prev, followerCount: nextCount };
    });

    try {
      if (wantsUnfollow) {
        await followsAPI.unfollow(profileId);
        void triggerHaptic("follow_success");
        showSuccessToast("Unfollowed");
      } else {
        const res = await followsAPI.follow(profileId);
        const message = (res.data?.message || "").toLowerCase();
        const isPending = message.includes("request");
        setFollowStatus(isPending ? "pending" : "accepted");
        if (isPending) {
          setProfileData((prev) => {
            if (!prev) return prev;
            const followerCount = prev.followerCount ?? 0;
            return { ...prev, followerCount: Math.max(0, followerCount - 1) };
          });
          showSuccessToast("Follow request sent");
        } else {
          showSuccessToast("Now following");
        }
        void triggerHaptic("follow_success");
      }
    } catch {
      setFollowStatus(previous);
      setProfileData((prev) => {
        if (!prev) return prev;
        const followerCount = prev.followerCount ?? 0;
        const restoredCount = wantsUnfollow ? followerCount + 1 : Math.max(0, followerCount - 1);
        return { ...prev, followerCount: restoredCount };
      });
      void triggerHaptic("follow_error");
      showRetryToast({
        message: "Failed to update follow. Retry?",
        retryLabel: "Retry",
        onRetry: () => {
          void toggleFollow();
        }
      });
    } finally {
      setFollowLoading(false);
    }
  };

  const toggleExpandPost = useCallback((postId: string) => {
    setExpandedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  const openComments = async (post: TVPost) => {
    setCommentsLoadingById((prev) => ({ ...prev, [post._id]: true }));
    setCommentPost(post);
    setComments([]);
    setCommentText("");
    setCommentsLoading(true);
    try {
      const res = await tvAPI.getComments(post._id);
      const list = res.data?.data ?? [];
      setComments(Array.isArray(list) ? list : []);
    } catch {
      setComments([]);
      void triggerHaptic("comment_load_error");
      showRetryToast({
        message: "Failed to load comments. Retry?",
        retryLabel: "Retry",
        onRetry: () => {
          void openComments(post);
        }
      });
    } finally {
      setCommentsLoadingById((prev) => ({ ...prev, [post._id]: false }));
      setCommentsLoading(false);
    }
  };

  const submitComment = async () => {
    if (!commentPost || !commentText.trim()) return;
    setCommentSending(true);
    const trimmed = commentText.trim();
    try {
      const res = await tvAPI.addComment(commentPost._id, trimmed);
      const createdComment = res.data?.data;
      if (createdComment?._id) {
        setComments((prev) => [...prev, createdComment]);
      }
      setPosts((prev) =>
        prev.map((p) =>
          p._id === commentPost._id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p
        )
      );
      setCommentPost((prev) =>
        prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : prev
      );
      setCommentText("");
      void triggerHaptic("comment_submit_success");
      showSuccessToast("Comment posted");
    } catch {
      await enqueuePendingAction({
        id: `${Date.now()}-comment-${commentPost._id}`,
        type: "comment",
        postId: commentPost._id,
        text: trimmed,
        createdAt: Date.now()
      });
      void triggerHaptic("comment_submit_error");
      showRetryToast({
        message: "Comment failed. Queued for retry.",
        retryLabel: "Retry",
        onRetry: () => {
          void submitComment();
        }
      });
    } finally {
      setCommentSending(false);
    }
  };

  const openReport = (post: TVPost) => {
    setReportPost(post);
    setReportCategory("spam");
    setReportBlockCreator(false);
    setReportReason("");
  };

  const submitReport = async () => {
    if (!reportPost) return;
    const baseReason = reportReason.trim();
    if (!baseReason) return;
    setReportSending(true);
    try {
      const reason = `[${reportCategory}] ${baseReason}`.trim();
      await tvAPI.report(reportPost._id, reason);
      const creatorId = getCreatorUserId(reportPost);
      if (reportBlockCreator && creatorId) {
        await handleMuteToggle(creatorId, typeof reportPost.creatorId === "object" ? reportPost.creatorId?.name : undefined);
      }
      void triggerHaptic("report_submit_success");
      showSuccessToast("Report submitted");
      setReportPost(null);
      setReportCategory("spam");
      setReportBlockCreator(false);
      setReportReason("");
    } catch {
      await enqueuePendingAction({
        id: `${Date.now()}-report-${reportPost._id}`,
        type: "report",
        postId: reportPost._id,
        reason: `[${reportCategory}] ${baseReason}`.trim(),
        createdAt: Date.now()
      });
      void triggerHaptic("report_submit_error");
      showRetryToast({
        message: "Report failed. Queued for retry.",
        retryLabel: "Retry",
        onRetry: () => {
          void submitReport();
        }
      });
    } finally {
      setReportSending(false);
    }
  };

  const formatTimestamp = (value?: string) => {
    if (!value) return "";
    const created = new Date(value);
    if (Number.isNaN(created.getTime())) return "";
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - created.getTime());
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
    if (diffHours < 2) return "An hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
    return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
  };

  const postDerivedById = useMemo(() => {
    const map: Record<
      string,
      {
        creator?: User;
        creatorId?: string;
        creatorName: string;
        mediaUrl: string;
        title: string;
        liked: boolean;
        likeBusy: boolean;
        commentsBusy: boolean;
        showHeart: boolean;
        heartPos: { x: number; y: number };
      }
    > = {};
    posts.forEach((post) => {
      const creator = typeof post.creatorId === "object" ? (post.creatorId as User) : undefined;
      const creatorId = getCreatorUserId(post);
      map[post._id] = {
        creator,
        creatorId,
        creatorName: creator?.name || userName || "Unknown",
        mediaUrl: toAbsoluteMediaUrl(post.mediaUrls?.[0]),
        title: post.heading || post.caption || post.subject || "Untitled post",
        liked: !!likedMap[post._id],
        likeBusy: !!likingById[post._id],
        commentsBusy: !!commentsLoadingById[post._id],
        showHeart: !!heartVisibleById[post._id],
        heartPos: heartPosById[post._id] || { x: 0.5, y: 0.5 }
      };
    });
    return map;
  }, [commentsLoadingById, heartPosById, heartVisibleById, likedMap, likingById, posts, userName]);

  const renderItem = useCallback(({ item }: { item: FeedListItem }) => {
    if (item.kind === "advert") {
      const imageUrl = toAbsoluteMediaUrl(item.advert.imageUrl);
      return (
        <Pressable
          style={styles.card}
          onPress={() => item.advert.linkUrl && Linking.openURL(item.advert.linkUrl).catch(() => null)}
          accessibilityRole="button"
          accessibilityLabel={`Open sponsored post: ${item.advert.title}`}
          accessibilityHint="Opens the sponsor link in your browser"
        >
          <Text style={styles.adLabel}>Sponsored</Text>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" /> : null}
          <Text style={styles.postTitle}>{item.advert.title}</Text>
        </Pressable>
      );
    }

    const { post } = item;
    const derived = postDerivedById[post._id];
    const creator = derived?.creator;
    const creatorId = derived?.creatorId;
    const mediaUrl = derived?.mediaUrl || "";
    const title = derived?.title || "Untitled post";
    const liked = !!derived?.liked;
    const likeBusy = !!derived?.likeBusy;
    const commentsBusy = !!derived?.commentsBusy;
    const likeScale = getLikeScaleValue(post._id);
    const heartScale = getHeartScaleValue(post._id);
    const heartOpacity = getHeartOpacityValue(post._id);
    const showHeart = !!derived?.showHeart;
    const heartPos = derived?.heartPos || { x: 0.5, y: 0.5 };

    return (
      <View style={styles.card}>
        {creatorId ? (
          <Pressable
            onPress={() => openProfile(creatorId, false, creator?.name)}
            onLongPress={() =>
              setPreviewCreator({
                id: creatorId,
                name: creator?.name || "User",
                avatar: creator?.avatar
              })
            }
            style={styles.metaPressable}
            accessibilityRole="button"
            accessibilityLabel={`Open creator profile: ${derived?.creatorName || "Unknown"}`}
            accessibilityHint="Double tap to open profile. Long press for quick actions."
          >
            <Text style={styles.metaText}>
              {derived?.creatorName || "Unknown"} • {post.type}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.metaText}>
            {derived?.creatorName || "Unknown"} • {post.type}
          </Text>
        )}
        {(() => {
          const isTextPost = post.type === "text" || (!mediaUrl && (post.subject || post.caption));
          const rawBody = post.subject || post.caption || "";
          const firstLine = rawBody ? rawBody.split("\n")[0]?.trim().slice(0, 120) || "" : "";
          const headline = post.heading || firstLine;
          const body = post.heading ? rawBody : rawBody.split("\n").slice(1).join("\n").trim();
          const hasBody = body.length > 0;
          const isExpanded = expandedPostIds.has(post._id);
          const TRUNCATE_LEN = 200;
          const shouldTruncate = hasBody && body.length > TRUNCATE_LEN;
          const showTruncated = shouldTruncate && !isExpanded;
          const displayBody = showTruncated ? body.slice(0, TRUNCATE_LEN).trim() + "..." : body;

          if (isTextPost && (headline || hasBody)) {
            return (
              <View style={styles.textPostContent}>
                {headline ? (
                  <Text style={styles.postHeadline} numberOfLines={3}>
                    {headline}
                  </Text>
                ) : null}
                {hasBody ? (
                  <>
                    <Text style={styles.postBody} selectable>
                      {displayBody}
                    </Text>
                    {shouldTruncate ? (
                      <Pressable
                        onPress={() => toggleExpandPost(post._id)}
                        style={styles.showMoreBtn}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? "Show less" : "Show more"}
                      >
                        <Text style={styles.showMoreText}>{isExpanded ? "SHOW LESS" : "SHOW MORE"}</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : headline ? null : (
                  <Text style={styles.postTitle}>{title}</Text>
                )}
              </View>
            );
          }
          if (mediaUrl && (post.heading || post.subject || post.caption)) {
            return null;
          }
          return <Text style={styles.postTitle}>{title}</Text>;
        })()}
        {mediaUrl ? (
          <Pressable
            onPress={() => handleMediaTap(post, mediaUrl)}
            onPressIn={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              lastTapPosByIdRef.current[post._id] = { x: locationX, y: locationY };
            }}
            style={styles.mediaWrap}
            accessibilityRole="button"
            accessibilityLabel={`Open media for post: ${title}`}
            accessibilityHint="Double tap quickly to like this post"
          >
            <Image source={{ uri: mediaUrl }} style={[styles.heroImage, compactUI && styles.heroImageCompact]} resizeMode="contain" />
            {showHeart ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.heartOverlay,
                  {
                    opacity: heartOpacity,
                    left: heartPos.x - 26,
                    top: heartPos.y - 26,
                    transform: [{ scale: heartScale }]
                  }
                ]}
              >
                <Text style={styles.heartIcon}>❤</Text>
              </Animated.View>
            ) : null}
          </Pressable>
        ) : null}
        {mediaUrl && (post.heading || post.subject || post.caption) ? (
          <View style={styles.textPostContent}>
            {post.heading ? (
              <Text style={styles.postHeadline} numberOfLines={2}>
                {post.heading}
              </Text>
            ) : null}
            {(post.caption || post.subject) ? (
              <Text style={styles.postBody} numberOfLines={4} selectable>
                {post.caption || post.subject}
              </Text>
            ) : null}
          </View>
        ) : null}
        {post.hashtags?.length ? <Text style={styles.hashes}>#{post.hashtags.join(" #")}</Text> : null}
        <View style={styles.statsRow}>
          <Animated.Text style={[styles.stats, { transform: [{ scale: likeScale }] }]}>
            {(post.likeCount ?? 0).toLocaleString()} likes
          </Animated.Text>
          <Text style={styles.stats}> • {(post.commentCount ?? 0).toLocaleString()} comments</Text>
        </View>
        <View style={styles.actionsRow}>
          <ActionChip
            label={liked ? "♥ Liked" : "♡ Like"}
            onPress={() => handleLikeToggle(post)}
            disabled={likeBusy}
            loading={likeBusy}
            loadingColor={liked ? "#86efac" : "#e2e8f0"}
            active={liked}
            style={[styles.actionBtn, compactUI && styles.actionBtnCompact, likeBusy && styles.actionBtnDisabled]}
            activeStyle={styles.actionBtnActive}
            textStyle={[styles.actionBtnText, compactUI && styles.actionBtnTextCompact]}
            activeTextStyle={styles.actionBtnTextActive}
            pressedStyle={styles.pressDown}
            accessibilityLabel={liked ? "Unlike post" : "Like post"}
            accessibilityHint="Toggles like on this post"
          />
          <ActionChip
            label="💬 Comment"
            onPress={() => openComments(post)}
            disabled={commentsBusy}
            loading={commentsBusy}
            style={[styles.actionBtn, compactUI && styles.actionBtnCompact, commentsBusy && styles.actionBtnDisabled]}
            textStyle={[styles.actionBtnText, compactUI && styles.actionBtnTextCompact]}
            pressedStyle={styles.pressDown}
            accessibilityLabel="Open comments"
            accessibilityHint="Opens comments for this post"
          />
          <ActionChip
            label="⋯ More"
            onPress={() => setMoreActionsPost(post)}
            style={[styles.actionBtn, compactUI && styles.actionBtnCompact]}
            textStyle={[styles.actionBtnText, compactUI && styles.actionBtnTextCompact]}
            pressedStyle={styles.pressDown}
            accessibilityLabel="Open post actions"
            accessibilityHint="Shows save, share, report, and mute options"
          />
        </View>
      </View>
    );
  }, [
    compactUI,
    expandedPostIds,
    getHeartOpacityValue,
    getHeartScaleValue,
    getLikeScaleValue,
    handleLikeToggle,
    handleMediaTap,
    openComments,
    openProfile,
    postDerivedById,
    setMoreActionsPost,
    setPreviewCreator,
    toggleExpandPost
  ]);

  const feedItemKeyExtractor = useCallback((item: FeedListItem) => item.id, []);

  if (loading && posts.length === 0) {
    return (
      <View style={styles.skeletonWrap}>
        {[0, 1, 2].map((idx) => (
          <View key={idx} style={styles.skeletonCard}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonLineLong} />
            <View style={styles.skeletonMedia} />
            <View style={styles.skeletonLineMid} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={feedItemKeyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />}
        ListHeaderComponent={
          <View style={styles.headerTools}>
            <View style={styles.searchRow}>
              <TextInput
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder={savedOnly ? "Search saved posts..." : "Search feed..."}
                placeholderTextColor="#64748b"
                style={styles.searchInput}
                autoCapitalize="none"
                accessibilityLabel={savedOnly ? "Search saved posts" : "Search feed"}
                accessibilityHint="Type at least two characters to filter posts"
              />
              {searchInput ? (
                <Pressable
                  onPress={() => setSearchInput("")}
                  style={styles.searchClearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  accessibilityHint="Clears current search text"
                >
                  <Text style={styles.searchClearText}>Clear</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setMuteManagerOpen(true)}
                style={styles.searchClearBtn}
                accessibilityRole="button"
                accessibilityLabel={`Open muted creators list. ${Object.keys(mutedMap).length} muted`}
                accessibilityHint="Manage muted creators on this device"
              >
                <Text style={styles.searchClearText}>Muted ({Object.keys(mutedMap).length})</Text>
              </Pressable>
              <Pressable
                onPress={() => setQueueInspectorOpen(true)}
                style={styles.searchClearBtn}
                accessibilityRole="button"
                accessibilityLabel={`Open pending actions queue. ${pendingActionsPreview.length} pending`}
                accessibilityHint="View and retry queued actions"
              >
                <Text style={styles.searchClearText}>Queue ({pendingActionsPreview.length})</Text>
              </Pressable>
            </View>
            {!savedOnly ? (
              <View style={styles.sortRow}>
                {sortOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      if (option.id === sort) return;
                      setSort(option.id);
                    }}
                    style={[styles.sortBtn, sort === option.id && styles.sortBtnActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort by ${option.label}`}
                    accessibilityHint="Updates feed sort order"
                    accessibilityState={{ selected: sort === option.id }}
                  >
                    <Text style={[styles.sortBtnText, sort === option.id && styles.sortBtnTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.subtleText}>
              {savedOnly ? "No saved posts yet." : "No posts yet."}
            </Text>
            {Object.keys(mutedMap).length > 0 ? (
              <Pressable
                onPress={() => setMuteManagerOpen(true)}
                style={styles.mutedHintBtn}
                accessibilityRole="button"
                accessibilityLabel="Manage muted creators"
                accessibilityHint="Opens muted creators management"
              >
                <Text style={styles.mutedHintText}>
                  {Object.keys(mutedMap).length} muted creator(s). Manage muted list.
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color="#22c55e" />
            </View>
          ) : null
        }
      />

      <Modal visible={!!commentPost} transparent animationType="fade" onRequestClose={() => setCommentPost(null)}>
        <View style={styles.modalBackdrop}>
          <ModalCard title="Comments" onClose={() => setCommentPost(null)} style={[styles.modalCard, compactUI && styles.modalCardCompact]}>
            {commentsLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="small" color="#22c55e" />
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => item._id}
                style={styles.commentsList}
                ListEmptyComponent={<Text style={styles.subtleText}>No comments yet.</Text>}
                renderItem={({ item }) => {
                  const commenter = typeof item.userId === "object" ? item.userId?.name : "User";
                  const timestamp = formatTimestamp(item.createdAt);
                  return (
                    <View style={styles.commentItem}>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentAuthor}>{commenter || "User"}</Text>
                        {timestamp ? <Text style={styles.commentTime}>{timestamp}</Text> : null}
                      </View>
                      <Text style={styles.commentText}>{item.text}</Text>
                    </View>
                  );
                }}
              />
            )}

            <View style={styles.commentComposer}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment..."
                placeholderTextColor="#64748b"
                style={styles.commentInput}
                editable={!commentSending}
                accessibilityLabel="Write a comment"
                accessibilityHint="Enter comment text before sending"
              />
              <Pressable
                onPress={submitComment}
                disabled={commentSending || !commentText.trim()}
                style={[
                  styles.commentSendBtn,
                  (commentSending || !commentText.trim()) && styles.commentSendBtnDisabled
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send comment"
                accessibilityHint="Posts your comment to this post"
              >
                <Text style={styles.commentSendText}>{commentSending ? "Sending..." : "Send"}</Text>
              </Pressable>
            </View>
          </ModalCard>
        </View>
      </Modal>
      <Modal visible={!!reportPost} transparent animationType="fade" onRequestClose={() => setReportPost(null)}>
        <View style={styles.modalBackdrop}>
          <ModalCard
            title="Report post"
            onClose={() => {
              setReportPost(null);
              setReportReason("");
            }}
            style={[styles.modalCard, compactUI && styles.modalCardCompact]}
          >
            <Text style={styles.subtleText}>
              Share a short reason so moderators can review this post.
            </Text>
            <View style={styles.reportCategoryRow}>
              {(["spam", "abuse", "harassment", "violence", "other"] as const).map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setReportCategory(cat)}
                  style={[styles.reportCategoryBtn, reportCategory === cat && styles.reportCategoryBtnActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Report category ${cat}`}
                  accessibilityHint="Select report reason category"
                  accessibilityState={{ selected: reportCategory === cat }}
                >
                  <Text style={[styles.reportCategoryText, reportCategory === cat && styles.reportCategoryTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Reason (e.g. spam, abuse, harassment)"
              placeholderTextColor="#64748b"
              style={styles.reportInput}
              editable={!reportSending}
              multiline
              numberOfLines={4}
              accessibilityLabel="Report reason"
              accessibilityHint="Describe why this post should be reviewed"
            />
            <Pressable
              onPress={() => setReportBlockCreator((v) => !v)}
              style={[styles.reportBlockBtn, reportBlockCreator && styles.reportBlockBtnActive]}
              accessibilityRole="button"
              accessibilityLabel={reportBlockCreator ? "Unselect mute creator on this device" : "Also mute creator on this device"}
              accessibilityHint="Toggles muting this creator locally after report"
              accessibilityState={{ selected: reportBlockCreator }}
            >
              <Text style={[styles.reportBlockText, reportBlockCreator && styles.reportBlockTextActive]}>
                {reportBlockCreator ? "Creator will be muted on this device" : "Also mute this creator on this device"}
              </Text>
            </Pressable>
            <View style={styles.reportActionsRow}>
              <Pressable
                onPress={() => {
                  setReportPost(null);
                  setReportReason("");
                }}
                style={styles.reportCancelBtn}
                disabled={reportSending}
                accessibilityRole="button"
                accessibilityLabel="Cancel report"
                accessibilityHint="Closes report modal without submitting"
              >
                <Text style={styles.reportCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitReport}
                style={[styles.reportSubmitBtn, (!reportReason.trim() || reportSending) && styles.commentSendBtnDisabled]}
                disabled={!reportReason.trim() || reportSending}
                accessibilityRole="button"
                accessibilityLabel="Submit report"
                accessibilityHint="Submits your report to moderators"
              >
                {reportSending ? (
                  <ActivityIndicator size="small" color="#e2e8f0" />
                ) : (
                  <Text style={styles.reportSubmitText}>Submit report</Text>
                )}
              </Pressable>
            </View>
          </ModalCard>
        </View>
      </Modal>
      <Modal visible={!!moreActionsPost} transparent animationType="fade" onRequestClose={() => setMoreActionsPost(null)}>
        <View style={styles.modalBackdrop}>
          <ModalCard
            title="Post actions"
            onClose={() => setMoreActionsPost(null)}
            style={[styles.modalCard, compactUI && styles.modalCardCompact]}
            animatedStyle={{ opacity: moreModalOpacity, transform: [{ scale: moreModalScale }] }}
          >
            {moreActionsPost ? (
              <View style={styles.moreActionsGrid}>
                <ActionChip
                  label={savedMap[moreActionsPost._id] ? "Saved" : "Save"}
                  onPress={() => {
                    setMoreActionsPost(null);
                    void handleSaveToggle(moreActionsPost);
                  }}
                  style={[styles.actionBtn, styles.moreActionItem]}
                  textStyle={styles.actionBtnText}
                  active={savedMap[moreActionsPost._id]}
                  activeTextStyle={styles.actionBtnTextActive}
                  pressedStyle={styles.pressDown}
                />
                <ActionChip
                  label="Share"
                  onPress={() => {
                    setMoreActionsPost(null);
                    void handleSharePost(moreActionsPost);
                  }}
                  style={[styles.actionBtn, styles.moreActionItem]}
                  textStyle={styles.actionBtnText}
                  pressedStyle={styles.pressDown}
                />
                <ActionChip
                  label="Copy link"
                  onPress={() => {
                    setMoreActionsPost(null);
                    void handleCopyPostLink(moreActionsPost);
                  }}
                  style={[styles.actionBtn, styles.moreActionItem]}
                  textStyle={styles.actionBtnText}
                  pressedStyle={styles.pressDown}
                />
                <ActionChip
                  label="Report"
                  onPress={() => {
                    setMoreActionsPost(null);
                    openReport(moreActionsPost);
                  }}
                  style={[styles.actionBtn, styles.moreActionItem]}
                  textStyle={styles.actionBtnText}
                  pressedStyle={styles.pressDown}
                />
                {getCreatorUserId(moreActionsPost) ? (
                  <ActionChip
                    label={isCreatorHidden(getCreatorUserId(moreActionsPost)) ? "Unmute" : "Mute"}
                    onPress={() => {
                      const creatorId = getCreatorUserId(moreActionsPost)!;
                      const creatorName = typeof moreActionsPost.creatorId === "object" ? moreActionsPost.creatorId?.name : undefined;
                      setMoreActionsPost(null);
                      void handleMuteToggle(creatorId, creatorName);
                    }}
                    style={[styles.actionBtn, styles.moreActionItem]}
                    textStyle={styles.actionBtnText}
                    pressedStyle={styles.pressDown}
                  />
                ) : null}
                {getCreatorUserId(moreActionsPost) ? (
                  <ActionChip
                    label="Block 24h"
                    onPress={() => {
                      const creatorId = getCreatorUserId(moreActionsPost)!;
                      const creatorName = typeof moreActionsPost.creatorId === "object" ? moreActionsPost.creatorId?.name : undefined;
                      setMoreActionsPost(null);
                      void handleBlock24h(creatorId, creatorName);
                    }}
                    style={[styles.actionBtn, styles.moreActionItem]}
                    textStyle={styles.actionBtnText}
                    pressedStyle={styles.pressDown}
                  />
                ) : null}
              </View>
            ) : null}
          </ModalCard>
        </View>
      </Modal>
      <Modal visible={!!mediaViewerUri} transparent animationType="fade" onRequestClose={() => setMediaViewerUri(null)}>
        <View style={styles.mediaViewerBackdrop} {...mediaPanResponder.panHandlers}>
          <Pressable
            style={styles.mediaViewerClose}
            onPress={() => setMediaViewerUri(null)}
            accessibilityRole="button"
            accessibilityLabel="Close media viewer"
            accessibilityHint="Returns to the feed"
          >
            <Text style={styles.modalClose}>Close</Text>
          </Pressable>
          <View style={styles.mediaViewerNavRow}>
            <Pressable
              style={[styles.mediaNavBtn, mediaViewerIndex <= 0 && styles.actionBtnDisabled]}
              onPress={() => moveMediaBy(-1)}
              disabled={mediaViewerIndex <= 0}
              accessibilityRole="button"
              accessibilityLabel="Previous media"
              accessibilityHint="Shows previous media item"
            >
              <Text style={styles.actionBtnText}>Prev</Text>
            </Pressable>
            <Text style={styles.connectionHandle}>
              {Math.min(mediaViewerIndex + 1, Math.max(1, mediaItems.length))}/{Math.max(1, mediaItems.length)}
            </Text>
            <Pressable
              style={[styles.mediaNavBtn, mediaViewerIndex >= mediaItems.length - 1 && styles.actionBtnDisabled]}
              onPress={() => moveMediaBy(1)}
              disabled={mediaViewerIndex >= mediaItems.length - 1}
              accessibilityRole="button"
              accessibilityLabel="Next media"
              accessibilityHint="Shows next media item"
            >
              <Text style={styles.actionBtnText}>Next</Text>
            </Pressable>
          </View>
          {mediaViewerUri ? (
            <Image source={{ uri: mediaViewerUri }} style={styles.mediaViewerImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
      <Modal visible={!!previewCreator} transparent animationType="fade" onRequestClose={() => setPreviewCreator(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, compactUI && styles.modalCardCompact]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Creator quick actions</Text>
              <Pressable
                onPress={() => setPreviewCreator(null)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close creator quick actions"
                accessibilityHint="Dismisses this modal"
              >
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>
            {previewCreator?.avatar ? (
              <Image source={{ uri: toAbsoluteMediaUrl(previewCreator.avatar) }} style={styles.profileAvatar} />
            ) : null}
            <Text style={styles.profileName}>{previewCreator?.name || "User"}</Text>
            <View style={styles.reportActionsRow}>
              <Pressable
                style={styles.reportCancelBtn}
                onPress={() => {
                  if (previewCreator?.id) openProfile(previewCreator.id, false, previewCreator.name);
                  setPreviewCreator(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="View creator profile"
                accessibilityHint="Opens the selected creator profile"
              >
                <Text style={styles.reportCancelText}>View profile</Text>
              </Pressable>
              <Pressable
                style={styles.reportSubmitBtn}
                onPress={async () => {
                  if (previewCreator?.id) {
                    await handleMuteToggle(previewCreator.id, previewCreator.name);
                  }
                  setPreviewCreator(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={previewCreator?.id && mutedMap[previewCreator.id] ? "Unmute creator" : "Mute creator"}
                accessibilityHint="Toggles mute for this creator on this device"
              >
                <Text style={styles.reportSubmitText}>
                  {previewCreator?.id && mutedMap[previewCreator.id] ? "Unmute" : "Mute"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={muteManagerOpen} transparent animationType="fade" onRequestClose={() => setMuteManagerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[
              styles.modalCard,
              compactUI && styles.modalCardCompact,
              { opacity: muteModalOpacity, transform: [{ scale: muteModalScale }] }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Muted creators</Text>
              <Pressable
                onPress={() => setMuteManagerOpen(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close muted creators"
                accessibilityHint="Dismisses muted creators modal"
              >
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.searchRow}>
              <TextInput
                value={muteSearchQuery}
                onChangeText={setMuteSearchQuery}
                placeholder="Search muted..."
                placeholderTextColor="#64748b"
                style={styles.searchInput}
                accessibilityLabel="Search muted creators"
                accessibilityHint="Filter muted creators by name or id"
              />
              {Object.keys(mutedMap).length > 0 ? (
                <Pressable
                  style={styles.reportCancelBtn}
                  onPress={() => {
                    Alert.alert("Unmute all?", "This will unmute every creator on this device.", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Unmute all",
                        style: "destructive",
                        onPress: async () => {
                          setMutedMap({});
                          setMutedUsersMeta({});
                          await Promise.all([persistMutedMap({}), persistMutedUsersMeta({})]);
                          if (savedOnly) await loadSavedPosts();
                          else await loadFeed(1, false);
                        }
                      }
                    ]);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Unmute all creators"
                  accessibilityHint="Opens a confirmation dialog before unmuting all"
                >
                  <Text style={styles.reportCancelText}>Unmute all</Text>
                </Pressable>
              ) : null}
            </View>
            <FlatList
              data={filteredMutedIds}
              keyExtractor={(item) => item}
              ListEmptyComponent={<Text style={styles.subtleText}>No muted creators.</Text>}
              renderItem={({ item }) => (
                <View style={styles.connectionItem}>
                  <View style={styles.connectionTextWrap}>
                    <Text style={styles.connectionName}>{mutedUsersMeta[item] || "Muted user"}</Text>
                    <Text style={styles.connectionHandle}>{item}</Text>
                  </View>
                  <ActionChip
                    label="Unmute"
                    onPress={() => void handleMuteToggle(item, mutedUsersMeta[item])}
                    style={styles.actionBtn}
                    textStyle={styles.actionBtnText}
                    pressedStyle={styles.pressDown}
                    accessibilityLabel={`Unmute ${mutedUsersMeta[item] || "creator"}`}
                    accessibilityHint="Removes this creator from your muted list"
                  />
                </View>
              )}
            />
          </Animated.View>
        </View>
      </Modal>
      <Modal visible={queueInspectorOpen} transparent animationType="fade" onRequestClose={() => setQueueInspectorOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ModalCard
            title="Pending actions queue"
            onClose={() => setQueueInspectorOpen(false)}
            style={[styles.modalCard, compactUI && styles.modalCardCompact]}
            animatedStyle={{ opacity: queueModalOpacity, transform: [{ scale: queueModalScale }] }}
          >
            <View style={styles.reportActionsRow}>
              <Pressable
                onPress={() => void refreshPendingPreview()}
                style={styles.reportCancelBtn}
                disabled={retryingQueue}
                accessibilityRole="button"
                accessibilityLabel="Refresh queue"
                accessibilityHint="Reloads pending actions list"
              >
                <Text style={styles.reportCancelText}>Refresh</Text>
              </Pressable>
              <Pressable
                onPress={() => void retryPendingNow()}
                style={styles.reportSubmitBtn}
                disabled={retryingQueue}
                accessibilityRole="button"
                accessibilityLabel="Retry pending actions"
                accessibilityHint="Attempts to resend queued actions"
              >
                {retryingQueue ? <ActivityIndicator size="small" color="#e2e8f0" /> : <Text style={styles.reportSubmitText}>Retry now</Text>}
              </Pressable>
            </View>
            <FlatList
              data={pendingActionsPreview}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text style={styles.subtleText}>No pending actions.</Text>}
              renderItem={({ item }) => (
                <View style={styles.connectionItem}>
                  <View style={styles.connectionTextWrap}>
                    <Text style={styles.connectionName}>{item.type.toUpperCase()}</Text>
                    <Text style={styles.connectionHandle}>post: {item.postId}</Text>
                  </View>
                  <Text style={styles.connectionHandle}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
                </View>
              )}
            />
          </ModalCard>
        </View>
      </Modal>
      <Modal visible={profileOpen} transparent animationType="fade" onRequestClose={closeProfileModal}>
        <View style={styles.modalBackdrop}>
          <ModalCard
            title="Creator profile"
            onClose={closeProfileModal}
            style={[styles.modalCard, compactUI && styles.modalCardCompact]}
            headerLeft={
              profileHistory.length > 0 ? (
                <Pressable
                  onPress={goBackProfile}
                  style={styles.modalCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Go back to previous profile"
                  accessibilityHint="Returns to the prior profile in this modal"
                >
                  <Text style={styles.modalClose}>Back</Text>
                </Pressable>
              ) : null
            }
          >
            {profileBreadcrumb ? (
              <View style={styles.breadcrumbRow}>
                {[...profileHistory, profileId].filter(Boolean).map((id, index, arr) => {
                  const label = profileNameCache[id as string] || "Profile";
                  const isCurrent = index === arr.length - 1;
                  return (
                    <React.Fragment key={`${String(id)}-${index}`}>
                      <Pressable
                        onPress={() => !isCurrent && jumpToBreadcrumbIndex(index)}
                        disabled={isCurrent}
                        accessibilityRole="button"
                        accessibilityLabel={`Go to breadcrumb profile ${label}`}
                        accessibilityHint="Jumps back to this profile in navigation history"
                      >
                        <Text style={[styles.breadcrumbText, isCurrent && styles.breadcrumbCurrentText]}>
                          {label}
                        </Text>
                      </Pressable>
                      {!isCurrent ? <Text style={styles.breadcrumbSep}>{" > "}</Text> : null}
                    </React.Fragment>
                  );
                })}
              </View>
            ) : null}
            {profileLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="small" color="#22c55e" />
              </View>
            ) : profileData ? (
              <View style={styles.profileWrap}>
                {profileData.user?.avatar ? (
                  <Image source={{ uri: toAbsoluteMediaUrl(profileData.user.avatar) }} style={styles.profileAvatar} />
                ) : null}
                <Text style={styles.profileName}>{profileData.user?.name || "Unknown user"}</Text>
                {profileData.user?.username ? (
                  <Text style={styles.profileHandle}>@{profileData.user.username}</Text>
                ) : null}
                {profileId && currentUserId && currentUserId !== profileId ? (
                  <Pressable
                    onPress={toggleFollow}
                    disabled={followLoading}
                    style={[
                      styles.followBtn,
                      followStatus === "accepted" && styles.followBtnActive,
                      followStatus === "pending" && styles.followBtnPending,
                      followLoading && styles.actionBtnDisabled
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      followStatus === "accepted"
                        ? "Following creator"
                        : followStatus === "pending"
                        ? "Follow request pending"
                        : "Follow creator"
                    }
                    accessibilityHint="Toggles follow status for this creator"
                  >
                    {followLoading ? (
                      <ActivityIndicator size="small" color="#e2e8f0" />
                    ) : (
                      <Text style={styles.followBtnText}>
                        {followStatus === "accepted"
                          ? "Following"
                          : followStatus === "pending"
                          ? "Requested"
                          : "Follow"}
                      </Text>
                    )}
                  </Pressable>
                ) : null}
                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStat}>
                    <Text style={styles.profileStatValue}>{profileData.postCount ?? 0}</Text>
                    <Text style={styles.profileStatLabel}>Posts</Text>
                  </View>
                  <Pressable
                    onPress={() => void openConnections("followers")}
                    style={styles.profileStatPressable}
                    accessibilityRole="button"
                    accessibilityLabel="Open followers list"
                    accessibilityHint="Shows users who follow this creator"
                  >
                    <View style={styles.profileStat}>
                      <Text style={styles.profileStatValue}>{profileData.followerCount ?? 0}</Text>
                      <Text style={styles.profileStatLabel}>Followers</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => void openConnections("following")}
                    style={styles.profileStatPressable}
                    accessibilityRole="button"
                    accessibilityLabel="Open following list"
                    accessibilityHint="Shows users this creator follows"
                  >
                    <View style={styles.profileStat}>
                      <Text style={styles.profileStatValue}>{profileData.followingCount ?? 0}</Text>
                      <Text style={styles.profileStatLabel}>Following</Text>
                    </View>
                  </Pressable>
                </View>
                <Text style={styles.profileSubStats}>
                  Images: {profileData.imageCount ?? 0} • Videos: {profileData.videoCount ?? 0} • Music: {profileData.musicCount ?? 0}
                </Text>
              </View>
            ) : (
              <View style={styles.modalLoadingWrap}>
                <Text style={styles.subtleText}>No profile data loaded.</Text>
                {profileId ? (
                  <Pressable
                    onPress={() => void loadProfile(profileId)}
                    style={styles.profileRetryBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading profile"
                    accessibilityHint="Tries to load profile data again"
                  >
                    <Text style={styles.profileRetryText}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </ModalCard>
        </View>
      </Modal>
      <Modal visible={connectionsOpen} transparent animationType="fade" onRequestClose={() => setConnectionsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ModalCard
            title={connectionsType === "followers" ? "Followers" : "Following"}
            onClose={() => setConnectionsOpen(false)}
            style={styles.modalCard}
          >
            {connectionsLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="small" color="#22c55e" />
              </View>
            ) : (
              <FlatList
                data={connections}
                keyExtractor={(item, index) => item._id || item.id || `${connectionsType}-${index}`}
                ListEmptyComponent={
                  <Text style={styles.subtleText}>
                    {connectionsType === "followers" ? "No followers yet." : "Not following anyone yet."}
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => openNestedProfileFromConnections(item)}
                    style={({ pressed }) => [styles.connectionItem, pressed && styles.connectionItemPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open profile: ${item.name || "User"}`}
                    accessibilityHint="Opens this user profile in the modal"
                  >
                    {item.avatar ? (
                      <Image source={{ uri: toAbsoluteMediaUrl(item.avatar) }} style={styles.connectionAvatar} />
                    ) : (
                      <View style={[styles.connectionAvatar, styles.connectionAvatarFallback]} />
                    )}
                    <View style={styles.connectionTextWrap}>
                      <Text style={styles.connectionName}>{item.name || "User"}</Text>
                      {item.username ? <Text style={styles.connectionHandle}>@{item.username}</Text> : null}
                    </View>
                    <Text style={styles.connectionChevron}>›</Text>
                  </Pressable>
                )}
              />
            )}
          </ModalCard>
        </View>
      </Modal>
      {toast ? (
        <View
          style={[
            styles.toastWrap,
            toast.tone === "success" && styles.toastWrapSuccess,
            toast.tone === "error" && styles.toastWrapError
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
          {toast.onRetry ? (
            <Pressable
              onPress={() => {
                setToast(null);
                if (Platform.OS !== "android") {
                  Alert.alert("Retry action", toast.message, [
                    { text: "Cancel", style: "cancel" },
                    { text: toast.retryLabel || "Retry", onPress: () => toast.onRetry?.() }
                  ]);
                } else {
                  toast.onRetry?.();
                }
              }}
              style={styles.toastRetryBtn}
              accessibilityRole="button"
              accessibilityLabel={toast.retryLabel || "Retry action"}
              accessibilityHint="Retries the last failed action"
            >
              <Text style={styles.toastRetryText}>{toast.retryLabel || "Retry"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 32,
    gap: 12
  },
  headerTools: {
    gap: 8,
    marginBottom: 4
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13
  },
  searchClearBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  searchClearText: {
    color: "#cbd5e1",
    fontWeight: "600",
    fontSize: 12
  },
  sortRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4
  },
  sortBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#0f172a"
  },
  sortBtnActive: {
    borderColor: "#22c55e",
    backgroundColor: "#052e16"
  },
  sortBtnText: {
    color: "#cbd5e1",
    fontWeight: "600",
    fontSize: 12
  },
  sortBtnTextActive: {
    color: "#86efac"
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12
  },
  skeletonWrap: {
    gap: 12,
    paddingBottom: 24
  },
  skeletonCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 12,
    gap: 10
  },
  skeletonLineShort: {
    width: "35%",
    height: 10,
    borderRadius: 6,
    backgroundColor: "#1f2937"
  },
  skeletonLineLong: {
    width: "75%",
    height: 14,
    borderRadius: 6,
    backgroundColor: "#1f2937"
  },
  skeletonMedia: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: "#1f2937"
  },
  skeletonLineMid: {
    width: "50%",
    height: 10,
    borderRadius: 6,
    backgroundColor: "#1f2937"
  },
  emptyWrap: {
    gap: 10
  },
  mutedHintBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mutedHintText: {
    color: "#cbd5e1",
    fontSize: 12,
    textAlign: "center"
  },
  subtleText: {
    color: "#94a3b8",
    textAlign: "center"
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 10,
    gap: 7
  },
  adLabel: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "700"
  },
  metaText: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "600"
  },
  metaPressable: {
    alignSelf: "flex-start"
  },
  postTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "600"
  },
  textPostContent: {
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 2
  },
  postHeadline: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 22
  },
  postBody: {
    color: "#e2e8f0",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4
  },
  showMoreBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 0,
    marginTop: 2
  },
  showMoreText: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "600"
  },
  heroImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: "#0b1220"
  },
  heroImageCompact: {
    height: 190
  },
  mediaWrap: {
    position: "relative",
    borderRadius: 10,
    overflow: "hidden"
  },
  heartOverlay: {
    position: "absolute",
    width: 52,
    height: 52,
    justifyContent: "center",
    alignItems: "center"
  },
  heartIcon: {
    color: "#f43f5e",
    fontSize: 52,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6
  },
  hashes: {
    color: "#86efac",
    fontSize: 12
  },
  stats: {
    color: "#cbd5e1",
    fontSize: 12
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    minWidth: 66,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center"
  },
  actionBtnCompact: {
    minWidth: 60,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  actionBtnDisabled: { opacity: 0.7 },
  pressDown: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  actionBtnActive: {
    borderColor: "#22c55e",
    backgroundColor: "#052e16"
  },
  actionBtnText: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 12
  },
  actionBtnTextCompact: {
    fontSize: 11
  },
  actionBtnTextActive: {
    color: "#86efac"
  },
  moreActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  moreActionItem: {
    width: "48%"
  },
  footerLoading: {
    paddingVertical: 14
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.8)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    maxHeight: "85%",
    padding: 12,
    gap: 9
  },
  modalCardCompact: {
    padding: 10,
    gap: 8
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  profileHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  modalTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 16
  },
  modalCloseBtn: {
    minHeight: 34,
    minWidth: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  breadcrumbText: {
    color: "#94a3b8",
    fontSize: 12
  },
  breadcrumbCurrentText: {
    color: "#cbd5e1",
    fontWeight: "600"
  },
  breadcrumbRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap"
  },
  breadcrumbSep: {
    color: "#64748b",
    fontSize: 12
  },
  modalClose: {
    color: "#93c5fd",
    fontWeight: "600"
  },
  modalLoadingWrap: {
    paddingVertical: 24
  },
  commentsList: {
    maxHeight: 300
  },
  commentItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    paddingVertical: 8
  },
  commentMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  commentAuthor: {
    color: "#bfdbfe",
    fontWeight: "600",
    fontSize: 12
  },
  commentTime: {
    color: "#94a3b8",
    fontSize: 11
  },
  commentText: {
    color: "#e2e8f0",
    fontSize: 13
  },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  commentSendBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  commentSendBtnDisabled: {
    opacity: 0.6
  },
  commentSendText: {
    color: "#052e16",
    fontWeight: "700"
  },
  reportInput: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 96,
    textAlignVertical: "top"
  },
  reportCategoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  reportCategoryBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  reportCategoryBtnActive: {
    borderColor: "#22c55e",
    backgroundColor: "#052e16"
  },
  reportCategoryText: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize"
  },
  reportCategoryTextActive: {
    color: "#86efac"
  },
  reportBlockBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  reportBlockBtnActive: {
    borderColor: "#a16207",
    backgroundColor: "#451a03"
  },
  reportBlockText: {
    color: "#cbd5e1",
    fontSize: 12
  },
  reportBlockTextActive: {
    color: "#fde68a"
  },
  reportActionsRow: {
    flexDirection: "row",
    gap: 6
  },
  reportCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  reportCancelText: {
    color: "#cbd5e1",
    fontWeight: "700"
  },
  reportSubmitBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10
  },
  reportSubmitText: {
    color: "#fecaca",
    fontWeight: "700"
  },
  mediaViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12
  },
  mediaViewerClose: {
    position: "absolute",
    top: 18,
    right: 18,
    zIndex: 5
  },
  mediaViewerNavRow: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    zIndex: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  mediaNavBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(15,23,42,0.75)"
  },
  mediaViewerImage: {
    width: "100%",
    height: "85%"
  },
  profileWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 6
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1f2937"
  },
  profileName: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 18
  },
  profileHandle: {
    color: "#93c5fd",
    fontSize: 13
  },
  profileStatsRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 6
  },
  profileStat: {
    alignItems: "center"
  },
  profileStatPressable: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2
  },
  profileStatValue: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 16
  },
  profileStatLabel: {
    color: "#94a3b8",
    fontSize: 11
  },
  profileSubStats: {
    color: "#cbd5e1",
    fontSize: 12,
    textAlign: "center"
  },
  profileRetryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  profileRetryText: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 12
  },
  followBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
    borderRadius: 999,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  followBtnActive: {
    borderColor: "#22c55e",
    backgroundColor: "#052e16"
  },
  followBtnPending: {
    borderColor: "#a16207",
    backgroundColor: "#451a03"
  },
  followBtnText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 12
  },
  connectionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b"
  },
  connectionItemPressed: {
    backgroundColor: "#111827",
    borderRadius: 8
  },
  connectionAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1f2937"
  },
  connectionAvatarFallback: {
    borderWidth: 1,
    borderColor: "#334155"
  },
  connectionTextWrap: {
    flex: 1
  },
  connectionName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600"
  },
  connectionHandle: {
    color: "#94a3b8",
    fontSize: 12
  },
  connectionChevron: {
    color: "#64748b",
    fontSize: 24,
    lineHeight: 24
  },
  toastWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 18,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  toastWrapSuccess: {
    borderColor: "#14532d",
    backgroundColor: "#052e16"
  },
  toastWrapError: {
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a"
  },
  toastText: {
    color: "#e2e8f0",
    flex: 1
  },
  toastRetryBtn: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  toastRetryText: {
    color: "#dbeafe",
    fontWeight: "700",
    fontSize: 12
  }
});
