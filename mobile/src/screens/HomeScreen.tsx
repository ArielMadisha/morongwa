import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { FeedScreen } from "./FeedScreen";
import { HubScreen } from "./HubScreen";
import { WalletScreen } from "./WalletScreen";
import { CartScreen } from "./CartScreen";
import { ProfileScreen } from "./ProfileScreen";
import { CheckoutScreen } from "./CheckoutScreen";
import { MessagesScreen } from "./MessagesScreen";
import { MusicScreen } from "./MusicScreen";
import { PodcastsScreen } from "./PodcastsScreen";
import { ErrandsScreen } from "./ErrandsScreen";
import { ErrandsHubScreen, type ErrandsHubTab } from "./ErrandsHubScreen";
import { CreatePostModal } from "../components/CreatePostModal";
import { AskMacGyverModal } from "../components/AskMacGyverModal";
import { ErrandsTshwaneBookModal } from "../components/ErrandsTshwaneBookModal";
import { StoriesStrip } from "../components/StoriesStrip";
import { TrendingNowMarquee } from "../components/TrendingNowMarquee";
import { MediaChipsRow } from "../components/MediaChipsRow";
import { TV_GENRE_FALLBACK, type TvGenre } from "../lib/tvGenres";
import { StatusStoryViewer } from "../components/StatusStoryViewer";
import { SiteNavIcon } from "../components/SiteNavIcon";
import {
  CollapsibleChrome,
  ScrollAwareChromeProvider,
} from "../components/ScrollAwareChrome";
import type { ScrollAwareChromeApi } from "../hooks/useScrollAwareChrome";
import { SITE_NAV_ICONS } from "../constants/site";
import { openWebUrl } from "../lib/openWebUrl";
import {
  emitNewShopOrderAlert,
  subscribeNewShopOrderAlert,
  subscribeOpenErrands,
} from "../lib/errandsNavigation";
import {
  cartAPI,
  contentAPI,
  notificationsAPI,
  productsAPI,
  resellerAPI,
  storesAPI,
  toAbsoluteMediaUrl,
  tvAPI
} from "../lib/api";
import {
  normalizeStatusStripItem,
  postsForStatusItem,
  sortStatusStripNewestFirst,
  tvPostFromStatusStripRow,
  type StatusStripItem
} from "../lib/statusStripItem";
import { statusProductId } from "../lib/statusProductLink";
import { filterFirstPartyStatusItems } from "../lib/iosStoreCompliance";
import { Product, StoreSummary, TVPost } from "../types";
import { appTypography, socialChrome, socialTheme } from "../theme/socialTheme";
import { CallPresenceService } from "../lib/callPresence";
import { CallUserPicker, type CallUserPickerResult } from "../components/CallUserPicker";

/** Expo Go has no WebRTC native module; lazy-load real CallScreen only in dev/custom builds. */
const isExpoGo = Constants.executionEnvironment === "storeClient";

const CallScreenLazy = React.lazy(() =>
  isExpoGo
    ? import("./CallScreenExpoGoStub")
    : import("./CallScreen").then((m) => ({ default: m.CallScreen }))
);

const SAVED_POSTS_KEY = "qwertymates.mobile.savedPosts";

const SCREEN_W = Dimensions.get("window").width;

type PrimaryTab = "wall" | "hub" | "tv" | "music";
type OverlayScreen = "messages" | "profile" | "wallet" | "cart" | "store";

const bottomNavTabs: {
  id: PrimaryTab;
  label: string;
  iconPath: string;
  fallback: React.ComponentProps<typeof SiteNavIcon>["fallback"];
}[] = [
  { id: "hub", label: "QwertyHub", iconPath: SITE_NAV_ICONS.qwertyHub, fallback: "storefront-outline" },
  { id: "tv", label: "QwertyMedia", iconPath: SITE_NAV_ICONS.qwertyMedia, fallback: "play-circle-outline" }
];

/** Top-level sections inside QwertyMedia (QwertyMusic no longer has its own bottom tab). */
type MediaSection = "tv" | "music" | "podcasts";

const mediaSectionChips: { id: MediaSection; label: string }[] = [
  { id: "tv", label: "QwertyTV" },
  { id: "music", label: "QwertyMusic" },
  { id: "podcasts", label: "QwertyPodcasts" }
];

export function HomeScreen() {
  const { user, logout } = useAuth();
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("wall");
  const [feedViewportHeight, setFeedViewportHeight] = useState(0);
  const [overlay, setOverlay] = useState<OverlayScreen | null>(null);
  const [tab, setTab] = useState<"feed" | "saved">("feed");
  const [mediaSection, setMediaSection] = useState<MediaSection>("tv");
  const [tvGenre, setTvGenre] = useState<string>("all");
  const [tvGenres, setTvGenres] = useState<TvGenre[]>(TV_GENRE_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    tvAPI
      .getGenres()
      .then((res) => {
        const list = res.data?.data ?? [];
        if (!cancelled && list.length) setTvGenres([{ id: "all", label: "All" }, ...list]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const [savedCount, setSavedCount] = useState(0);
  const [feedVersion, setFeedVersion] = useState(0);
  const [cartRefreshKey, setCartRefreshKey] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [cartMode, setCartMode] = useState<"cart" | "checkout">("cart");
  const [walletSession, setWalletSession] = useState(0);
  const [callOpen, setCallOpen] = useState(false);
  const [callSession, setCallSession] = useState(0);
  const [callLaunch, setCallLaunch] = useState<{
    peerUserId: string;
    peerUserName?: string;
    roomId: string;
    autoJoin: boolean;
    autoStartCall?: boolean;
    audioOnly?: boolean;
    answerIncoming?: boolean;
    callerId?: string;
    invitedUserIds?: string[];
  } | null>(null);
  const [callPickerOpen, setCallPickerOpen] = useState(false);
  const [macGyverOpen, setMacGyverOpen] = useState(false);
  const [aboutQwertymatesOpen, setAboutQwertymatesOpen] = useState(false);
  const [macGyverFabExpanded, setMacGyverFabExpanded] = useState(false);
  const [messagesPeer, setMessagesPeer] = useState<{ id: string; name?: string } | null>(null);
  const [fabHint, setFabHint] = useState<string | null>(null);
  const fabHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hubOpenProductId, setHubOpenProductId] = useState<string | null>(null);
  const [hubFocusedProduct, setHubFocusedProduct] = useState<Product | null>(null);
  const [hubCartBusy, setHubCartBusy] = useState(false);
  const [statusItems, setStatusItems] = useState<StatusStripItem[]>([]);
  const [statusViewerOpen, setStatusViewerOpen] = useState(false);
  const [statusViewerLoading, setStatusViewerLoading] = useState(false);
  const [statusViewerPost, setStatusViewerPost] = useState<TVPost | null>(null);
  const [statusViewerMeta, setStatusViewerMeta] = useState<{ name?: string; avatar?: string }>({});
  const [statusViewerItem, setStatusViewerItem] = useState<StatusStripItem | null>(null);
  const [statusPostIndex, setStatusPostIndex] = useState(0);
  const [showMyStoreQuick, setShowMyStoreQuick] = useState(false);
  const [storePanelStores, setStorePanelStores] = useState<StoreSummary[]>([]);
  const [shopOrderUnread, setShopOrderUnread] = useState(0);
  const [storePanelLoading, setStorePanelLoading] = useState(false);
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [errandsMenuOpen, setErrandsMenuOpen] = useState(false);
  const [errandsOverlay, setErrandsOverlay] = useState<"hub" | "client" | "runner" | null>(null);
  const [errandsHubTab, setErrandsHubTab] = useState<ErrandsHubTab>("orders");
  const [errandTshwaneBookOpen, setErrandTshwaneBookOpen] = useState(false);
  const [errandsAnchor, setErrandsAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const errandsRef = useRef<View>(null);
  const shopOrderUnreadRef = useRef(0);
  const shopOrderPollPrimedRef = useRef(false);
  const newOrderAlertOpenRef = useRef(false);
  const callPresenceRef = useRef(new CallPresenceService());
  const [landingBgs, setLandingBgs] = useState<string[]>([]);
  const [landingBgIdx, setLandingBgIdx] = useState(0);
  const [landingBgBroken, setLandingBgBroken] = useState(false);

  const bumpCart = useCallback(() => {
    setCartRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!user) {
      setCartCount(0);
      return;
    }
    void cartAPI
      .get()
      .then((res) => {
        const items = res.data?.data?.items;
        const arr = Array.isArray(items) ? items : [];
        const count = arr.reduce((sum, item) => sum + (item.qty || 0), 0);
        setCartCount(count);
      })
      .catch(() => setCartCount(0));
  }, [user, cartRefreshKey]);

  useEffect(() => {
    const uid = String(user?._id || user?.id || "").trim();
    if (!uid) {
      callPresenceRef.current.stop();
      return;
    }
    callPresenceRef.current.start(uid, (call) => {
      if (callOpen) return;
      callPresenceRef.current.showIncomingAlert(
        call,
        () => {
          setCallLaunch({
            peerUserId: call.callerId,
            roomId: call.roomId,
            autoJoin: true,
            audioOnly: !!call.audioOnly,
            answerIncoming: true,
            callerId: call.callerId,
          });
          setCallSession((s) => s + 1);
          setCallOpen(true);
        },
        () => callPresenceRef.current.emitCallReject(call)
      );
    });
    return () => callPresenceRef.current.stop();
  }, [user?._id, user?.id, callOpen]);

  useEffect(() => {
    void contentAPI
      .getLandingBackgrounds()
      .then((res) => {
        const rows = res.data?.data ?? [];
        const urls = rows
          .map((r) => toAbsoluteMediaUrl(r.imageUrl))
          .filter((u): u is string => typeof u === "string" && u.length > 0);
        setLandingBgs(urls);
      })
      .catch(() => setLandingBgs([]));
  }, []);

  useEffect(() => {
    // Do not rotate landing backgrounds while the user is in the app — it felt like a full refresh.
    if (user || landingBgs.length <= 1) return;
    const id = setInterval(() => setLandingBgIdx((i) => i + 1), 18000);
    return () => clearInterval(id);
  }, [landingBgs.length, user]);

  useEffect(() => {
    setLandingBgBroken(false);
  }, [landingBgIdx, landingBgs]);

  useEffect(() => {
    let cancelled = false;

    const loadStatuses = async () => {
      try {
        const res = await tvAPI.getStatuses();
        if (cancelled) return;
        const rows = res.data?.data ?? [];
        const mapped = rows
          .map((r) => {
            const uid = r.userId as unknown;
            const id =
              typeof uid === "object" && uid && "_id" in (uid as { _id?: string })
                ? String((uid as { _id?: string })._id)
                : String(uid ?? "");
            const posts = Array.isArray(r.posts) ? r.posts : [];
            const latestPost =
              r.latestPost?._id != null
                ? r.latestPost
                : posts.length > 0
                  ? posts[0]
                  : null;
            const rowKey =
              typeof r.statusKey === "string" && r.statusKey.trim()
                ? String(r.statusKey).trim()
                : id;
            // Keep rows that have a key and either latestPost or posts[].
            if (!rowKey) return null;
            if (!latestPost?._id && posts.length === 0) return null;
            const item: StatusStripItem = {
              id: rowKey,
              name: r.name,
              avatar: r.avatar,
              isStoreStatus: r.isStoreStatus === true,
              latestPost: latestPost ?? undefined,
              posts: posts.length ? posts : undefined
            };
            return normalizeStatusStripItem(item);
          })
          .filter(Boolean) as StatusStripItem[];
        setStatusItems(sortStatusStripNewestFirst(filterFirstPartyStatusItems(mapped)));
      } catch {
        // Soft-fail: keep previous statusItems (do not wipe on transient errors).
      }
    };

    void loadStatuses();

    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void loadStatuses();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [feedVersion]);

  const loadStatusPostAt = useCallback(async (item: StatusStripItem, index: number) => {
    const posts = postsForStatusItem(item);
    const stripPost = posts[index];
    if (!stripPost?._id) {
      setStatusViewerPost(null);
      setStatusViewerLoading(false);
      return;
    }

    setStatusViewerLoading(true);
    setStatusViewerPost(null);

    const finish = (post: TVPost | null) => {
      setStatusViewerPost(post);
      setStatusViewerLoading(false);
    };

    if (String(stripPost._id).startsWith("join-")) {
      finish(tvPostFromStatusStripRow(item, stripPost));
      return;
    }

    try {
      const res = await tvAPI.getPost(String(stripPost._id));
      const post = res.data?.data;
      if (post?._id) {
        finish(post);
        return;
      }
    } catch {
      /* fall through */
    }

    if (stripPost.type === "product") {
      try {
        const res = await productsAPI.getByIdOrSlug(String(stripPost._id));
        const product = res.data?.data;
        if (product?._id && product.images?.length) {
          finish({
            _id: product._id,
            type: "image",
            mediaUrls: product.images,
            caption: product.title,
            creatorId: { _id: item.id, name: item.name, avatar: item.avatar }
          });
          return;
        }
      } catch {
        /* fall through */
      }
    }

    finish(tvPostFromStatusStripRow(item, stripPost));
  }, []);

  const openStatusViewer = useCallback(
    async (item: StatusStripItem) => {
      const normalized = normalizeStatusStripItem(item);
      const posts = postsForStatusItem(normalized);
      if (!posts.length) return;

      setStatusViewerItem(normalized);
      setStatusPostIndex(0);
      setStatusViewerMeta({ name: normalized.name, avatar: normalized.avatar });
      setStatusViewerOpen(true);
      await loadStatusPostAt(normalized, 0);
    },
    [loadStatusPostAt]
  );

  const goNextStatusPost = useCallback(() => {
    if (!statusViewerItem) return;
    const posts = postsForStatusItem(statusViewerItem);
    const next = statusPostIndex + 1;
    if (next >= posts.length) {
      setStatusViewerOpen(false);
      setStatusViewerItem(null);
      setStatusViewerPost(null);
      return;
    }
    setStatusPostIndex(next);
    void loadStatusPostAt(statusViewerItem, next);
  }, [statusViewerItem, statusPostIndex, loadStatusPostAt]);

  const goPrevStatusPost = useCallback(() => {
    if (!statusViewerItem || statusPostIndex <= 0) return;
    const prev = statusPostIndex - 1;
    setStatusPostIndex(prev);
    void loadStatusPostAt(statusViewerItem, prev);
  }, [statusViewerItem, statusPostIndex, loadStatusPostAt]);

  useEffect(() => {
    if (!user) {
      setShowMyStoreQuick(false);
      return;
    }
    // Any store counts (supplier or the reseller store auto-created on first resell),
    // with the reseller wall as a fallback signal if /stores/me is unavailable.
    void Promise.all([
      storesAPI.getMine().catch(() => null),
      resellerAPI.getMyWall().catch(() => null),
    ])
      .then(([storesRes, wallRes]) => {
        const storeCount = Array.isArray(storesRes?.data?.data) ? storesRes!.data!.data!.length : 0;
        const resoldCount = Array.isArray(wallRes?.data?.data?.products)
          ? wallRes!.data!.data!.products!.length
          : 0;
        setShowMyStoreQuick(storeCount > 0 || resoldCount > 0);
      })
      .catch(() => setShowMyStoreQuick(false));
  }, [user, feedVersion, cartRefreshKey]);

  const loadStorePanel = useCallback(async () => {
    setStorePanelLoading(true);
    try {
      const [res, unreadRes] = await Promise.all([
        storesAPI.getMine(),
        notificationsAPI.getUnreadCount({ shopOrders: true }).catch(() => null),
      ]);
      const data = res.data?.data;
      setStorePanelStores(Array.isArray(data) ? data : []);
      const n = Number(unreadRes?.data?.shopOrderUnreadCount ?? unreadRes?.data?.unreadCount ?? 0);
      setShopOrderUnread(Number.isFinite(n) ? n : 0);
    } catch {
      setStorePanelStores([]);
    } finally {
      setStorePanelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (overlay === "store") void loadStorePanel();
  }, [overlay, loadStorePanel]);

  const openErrandsHub = useCallback((tab: ErrandsHubTab = "orders") => {
    setErrandsMenuOpen(false);
    setErrandsAnchor(null);
    setErrandTshwaneBookOpen(false);
    setOverlay(null);
    setErrandsHubTab(tab);
    setErrandsOverlay("hub");
  }, []);

  const showNewOrderAlert = useCallback(() => {
    if (newOrderAlertOpenRef.current) return;
    newOrderAlertOpenRef.current = true;
    Alert.alert("New Order", "A customer placed an order at your store.", [
      { text: "Later", style: "cancel", onPress: () => { newOrderAlertOpenRef.current = false; } },
      {
        text: "View Orders",
        onPress: () => {
          newOrderAlertOpenRef.current = false;
          openErrandsHub("orders");
        },
      },
    ]);
  }, [openErrandsHub]);

  /** Poll shop-order unread while logged in; popup when count rises (even off Errands). */
  useEffect(() => {
    if (!user) {
      shopOrderUnreadRef.current = 0;
      shopOrderPollPrimedRef.current = false;
      setShopOrderUnread(0);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const unreadRes = await notificationsAPI.getUnreadCount({ shopOrders: true });
        if (cancelled) return;
        const n = Number(
          unreadRes?.data?.shopOrderUnreadCount ?? unreadRes?.data?.unreadCount ?? 0
        );
        const next = Number.isFinite(n) ? n : 0;
        const isOwner = !!unreadRes?.data?.isShopOwner;
        if (!shopOrderPollPrimedRef.current) {
          shopOrderPollPrimedRef.current = true;
          shopOrderUnreadRef.current = next;
          setShopOrderUnread(next);
          return;
        }
        if (isOwner && next > shopOrderUnreadRef.current) {
          emitNewShopOrderAlert();
        }
        shopOrderUnreadRef.current = next;
        setShopOrderUnread(next);
      } catch {
        /* ignore poll errors */
      }
    };

    void poll();
    const id = setInterval(() => void poll(), 20000);
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void poll();
    });
    return () => {
      cancelled = true;
      clearInterval(id);
      appSub.remove();
    };
  }, [user]);

  useEffect(() => {
    return subscribeOpenErrands((req) => {
      openErrandsHub(req.tab || "orders");
    });
  }, [openErrandsHub]);

  useEffect(() => {
    return subscribeNewShopOrderAlert(() => {
      showNewOrderAlert();
    });
  }, [showNewOrderAlert]);

  const openCallPicker = () => {
    setCallPickerOpen(true);
  };

  const handlePickerStart = (result: CallUserPickerResult) => {
    setCallLaunch({
      peerUserId: result.peerUserId,
      peerUserName: result.peerUserName,
      roomId: result.roomId,
      autoJoin: true,
      autoStartCall: true,
      audioOnly: result.audioOnly,
      invitedUserIds: result.invitedUserIds,
    });
    setCallSession((s) => s + 1);
    setCallOpen(true);
  };

  const launchDirectCall = (
    peerUserId: string,
    roomId: string,
    opts: { audioOnly?: boolean; peerUserName?: string } = {}
  ) => {
    setCallLaunch({
      peerUserId,
      peerUserName: opts.peerUserName,
      roomId,
      autoJoin: true,
      autoStartCall: true,
      audioOnly: opts.audioOnly,
    });
    setCallSession((s) => s + 1);
    setCallOpen(true);
  };

  const clearAllSaved = () => {
    Alert.alert("Clear all saved?", "This removes all saved posts from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(SAVED_POSTS_KEY);
          setSavedCount(0);
          setFeedVersion((v) => v + 1);
        }
      }
    ]);
  };

  const goToPrimary = (id: PrimaryTab) => {
    setOverlay(null);
    setPrimaryTab(id);
  };

  const openErrandsInApp = (mode: "client" | "runner") => {
    setErrandsMenuOpen(false);
    setErrandsAnchor(null);
    setErrandTshwaneBookOpen(false);
    setOverlay(null);
    setErrandsOverlay(mode);
  };

  const onErrandsPress = () => {
    // Primary: open Orders | Clients | Runners hub (shop owners + everyone).
    openErrandsHub("orders");
  };

  const onErrandsLongPress = () => {
    const openAt = (x: number, y: number, width: number, height: number) => {
      setErrandsAnchor({ x, y, width, height });
      setErrandsMenuOpen(true);
    };
    const fallback = () => openAt(16, 112, 72, 56);
    if (!errandsRef.current) {
      fallback();
      return;
    }
    errandsRef.current.measureInWindow((x, y, width, height) => {
      if (!width || !height) fallback();
      else openAt(x, y, width, height);
    });
  };

  const openCartOverlay = () => {
    setCartMode("cart");
    setOverlay("cart");
    setCartRefreshKey((v) => v + 1);
  };

  const closeMacGyver = useCallback(() => {
    setMacGyverOpen(false);
    setMacGyverFabExpanded(false);
  }, []);

  const flashFabHint = useCallback((label: string) => {
    if (fabHintTimer.current) clearTimeout(fabHintTimer.current);
    setFabHint(label);
    fabHintTimer.current = setTimeout(() => setFabHint(null), 1400);
  }, []);

  useEffect(() => {
    if (!macGyverFabExpanded || macGyverOpen) return;
    const id = setTimeout(() => setMacGyverFabExpanded(false), 4200);
    return () => clearTimeout(id);
  }, [macGyverFabExpanded, macGyverOpen]);

  const mainContent = () => {
    if (errandsOverlay === "hub") {
      return (
        <ErrandsHubScreen
          key={`errands-hub-${errandsHubTab}`}
          initialTab={errandsHubTab}
          onBack={() => setErrandsOverlay(null)}
          onOpenClientTasks={() => openErrandsInApp("client")}
          onOpenRunnerTasks={() => openErrandsInApp("runner")}
          onOpenTshwaneBook={() => {
            setErrandsOverlay(null);
            setErrandTshwaneBookOpen(true);
          }}
        />
      );
    }
    if (errandsOverlay === "client" || errandsOverlay === "runner") {
      return (
        <ErrandsScreen
          mode={errandsOverlay}
          onBack={() => {
            setErrandsHubTab("runners");
            setErrandsOverlay("hub");
          }}
        />
      );
    }
    if (overlay === "messages") {
      return (
        <MessagesScreen
          currentUserId={String(user?._id || user?.id || "")}
          initialDirectUserId={messagesPeer?.id}
          initialDirectUserName={messagesPeer?.name}
          onConsumedInitialDirect={() => setMessagesPeer(null)}
          onRequestVideoCall={(peerUserId, roomId) => {
            launchDirectCall(peerUserId, roomId, { audioOnly: false });
          }}
          onRequestVoiceCall={(peerUserId, roomId) => {
            launchDirectCall(peerUserId, roomId, { audioOnly: true });
          }}
        />
      );
    }
    if (overlay === "profile") {
      return (
        <ProfileScreen
          user={user}
          onSignOut={logout}
          onOpenVideoCall={openCallPicker}
          onBack={() => setOverlay(null)}
          onOpenWallet={() => setOverlay("wallet")}
        />
      );
    }
    if (overlay === "wallet") {
      return (
        <WalletScreen
          key={walletSession}
          onBack={() => setOverlay(null)}
          onOpenMessages={() => setOverlay("messages")}
        />
      );
    }
    if (overlay === "cart") {
      return cartMode === "cart" ? (
        <CartScreen
          refreshKey={cartRefreshKey}
          onCheckout={() => setCartMode("checkout")}
          onContinueShopping={() => {
            setOverlay(null);
            goToPrimary("hub");
          }}
          onCartCountChange={setCartCount}
        />
      ) : (
        <CheckoutScreen
          onBack={() => {
            setCartMode("cart");
            setCartRefreshKey((v) => v + 1);
          }}
          onPaid={() => {
            // Leave checkout after success — do not reopen unpaid checkout / web login loop.
            setCartMode("cart");
            setCartRefreshKey((v) => v + 1);
            setWalletSession((v) => v + 1);
            setOverlay(null);
            goToPrimary("hub");
          }}
        />
      );
    }
    if (overlay === "store") {
      return (
        <ScrollView
          style={styles.storeOverlay}
          contentContainerStyle={styles.storeOverlayContent}
          refreshControl={
            <RefreshControl refreshing={storePanelLoading} onRefresh={() => void loadStorePanel()} />
          }
        >
          <Text style={styles.storeOverlayTitle}>My store</Text>
          {storePanelStores.length > 0 ? (
            <Pressable
              onPress={() => openErrandsHub("orders")}
              style={styles.shopOrdersBtn}
              accessibilityRole="button"
              accessibilityLabel="Open Shop Orders in Errands"
            >
              <Ionicons name="clipboard-outline" size={18} color="#fff" />
              <Text style={styles.shopOrdersBtnText}>Shop Orders</Text>
              {shopOrderUnread > 0 ? (
                <View style={styles.shopOrdersBadge}>
                  <Text style={styles.shopOrdersBadgeText}>
                    {shopOrderUnread > 99 ? "99+" : String(shopOrderUnread)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <Text style={styles.storeOrdersHint}>
            New paid orders appear in Errands → Orders (and Activity) even if WhatsApp is delayed.
          </Text>
          {storePanelLoading && storePanelStores.length === 0 ? (
            <ActivityIndicator color={socialTheme.brandBlue} />
          ) : (
            storePanelStores.map((s) => (
              <View key={s._id} style={styles.storeCard}>
                <Text style={styles.storeCardName}>{s.name}</Text>
                {s.slug ? (
                  <Text style={styles.storeCardSlug} selectable>
                    /{s.slug}
                  </Text>
                ) : null}
                {s.email ? <Text style={styles.storeCardLine}>{s.email}</Text> : null}
                {s.cellphone ? <Text style={styles.storeCardLine}>{s.cellphone}</Text> : null}
              </View>
            ))
          )}
          {!storePanelLoading && storePanelStores.length === 0 ? (
            <Text style={styles.storeEmpty}>No store on this account yet.</Text>
          ) : null}
        </ScrollView>
      );
    }

    if (primaryTab === "wall") {
      return (
        <FeedScreen
          key={`wall-${feedVersion}`}
          variant="wall"
          viewportHeight={feedViewportHeight}
          hideStoriesHeader
          onPressCreateStory={() => setCreatePostOpen(true)}
          onCartUpdated={bumpCart}
          onOpenProduct={(id) => {
            setHubOpenProductId(id);
            goToPrimary("hub");
          }}
          userName={user?.name}
          currentUserId={user?._id || user?.id}
          onSavedCountChange={setSavedCount}
        />
      );
    }
    if (primaryTab === "tv") {
      if (mediaSection === "music") {
        return (
          <MusicScreen
            onThemeSetForPosts={() => {
              setCreatePostOpen(true);
            }}
          />
        );
      }
      if (mediaSection === "podcasts") {
        return <PodcastsScreen />;
      }
      return (
        <FeedScreen
          key={`${tab}-${tvGenre}-${feedVersion}`}
          genre={tvGenre}
          variant={tab === "saved" ? "default" : "tvVideo"}
          viewportHeight={tab === "feed" ? feedViewportHeight : 0}
          hideStoriesHeader
          onPressCreateStory={() => setCreatePostOpen(true)}
          onCartUpdated={bumpCart}
          onOpenProduct={(id) => {
            setHubOpenProductId(id);
            goToPrimary("hub");
          }}
          userName={user?.name}
          currentUserId={user?._id || user?.id}
          savedOnly={tab === "saved"}
          onSavedCountChange={setSavedCount}
          tvListMode={tab}
          onTvListModeChange={setTab}
          savedCount={savedCount}
          onClearAllSaved={clearAllSaved}
        />
      );
    }
    if (primaryTab === "hub") {
      return (
        <HubScreen
          viewportHeight={feedViewportHeight}
          openProductId={hubOpenProductId}
          onConsumedOpenProductId={() => setHubOpenProductId(null)}
          onFocusedProductChange={setHubFocusedProduct}
          onAddedToCart={() => {
            setCartRefreshKey((v) => v + 1);
          }}
          onGoToCart={openCartOverlay}
        />
      );
    }
    if (primaryTab === "music") {
      return (
        <MusicScreen
          onThemeSetForPosts={() => {
            setCreatePostOpen(true);
          }}
        />
      );
    }
    return null;
  };

  const landingBgUri = landingBgs.length ? landingBgs[landingBgIdx % landingBgs.length] : null;
  // Logged-in users get a solid chrome — rotating photo backgrounds felt like a feed refresh.
  const showLandingPhotoBg = !!(!user && landingBgUri && !landingBgBroken);

  const mainShell = (
    <ScrollAwareChromeProvider>
      {(chrome) => (
    <View style={[styles.container, showLandingPhotoBg ? styles.containerOnPhotoBg : null]}>
      <ScrollAwareChromeReset chrome={chrome} watch={`${primaryTab}|${tab}|${overlay ?? ""}|${errandsOverlay ?? ""}`} />
      <CollapsibleChrome api={chrome} edge="top" style={styles.chromeCollapse}>
      <View style={styles.fixedChrome}>
        <View style={styles.statusTopRow}>
          <Pressable
            onPress={() => goToPrimary("wall")}
            style={[styles.brandLogo, primaryTab === "wall" && styles.brandLogoAtWall]}
            accessibilityRole="button"
            accessibilityLabel="Home: Qwertymates wall feed"
          >
            <Image
              source={require("../../assets/images/qwertymates-q-mark-official.png")}
              style={styles.brandLogoImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
          <View style={styles.storiesSlot}>
            <StoriesStrip
              items={statusItems}
              selfAvatarUrl={user?.avatar}
              onPressSelf={() => setCreatePostOpen(true)}
              onPressItem={(item) => {
                void openStatusViewer(item);
              }}
            />
          </View>
        </View>
        {primaryTab === "tv" ? (
          <MediaChipsRow
            chips={mediaSectionChips}
            activeId={mediaSection}
            onSelect={(id) => setMediaSection(id as MediaSection)}
            accessibilityLabel="QwertyMedia sections"
          />
        ) : null}
        {primaryTab === "wall" || primaryTab === "hub" || (primaryTab === "tv" && mediaSection === "tv") ? (
          <TrendingNowMarquee
            onPressTag={(tag) => {
              setTab("feed");
              goToPrimary("tv");
              Alert.alert("Trending", `#${tag} — open QwertyTV search for this tag.`);
            }}
          />
        ) : null}
        {primaryTab === "tv" && mediaSection === "tv" ? (
          <MediaChipsRow
            chips={tvGenres}
            activeId={tvGenre}
            onSelect={setTvGenre}
            accessibilityLabel="TV genres"
          />
        ) : null}
      </View>
      </CollapsibleChrome>

      <View style={styles.bodyWrap}>
        {/* Left rail: icon-only column (placeholders for future shortcuts). */}
        <View style={styles.leftRail} pointerEvents="none" />

        <View
          style={styles.content}
          onLayout={(e) => setFeedViewportHeight(e.nativeEvent.layout.height)}
        >
          {mainContent()}
        </View>

        {/* Right FABs: icons only; label flashes on press. Store appears above cart after resell. */}
        {overlay || errandsOverlay || createPostOpen || statusViewerOpen || errandsMenuOpen || macGyverOpen || aboutQwertymatesOpen ? null : (
          <View style={styles.rightFabColumn} pointerEvents="box-none">
            {fabHint ? (
              <View style={styles.fabHintBubble} pointerEvents="none">
                <Text style={styles.fabHintText}>{fabHint}</Text>
              </View>
            ) : null}
            <View ref={errandsRef} collapsable={false}>
              <Pressable
                onPress={() => {
                  flashFabHint("Errands");
                  onErrandsPress();
                }}
                onLongPress={() => {
                  flashFabHint("Errands menu");
                  onErrandsLongPress();
                }}
                delayLongPress={380}
                style={styles.fab}
                accessibilityRole="button"
                accessibilityLabel="Errands"
                accessibilityHint="Open Orders, Clients, and Runners. Long-press for Book, Client, or Runner tasks."
              >
                <SiteNavIcon path={SITE_NAV_ICONS.errands} size={24} fallback="car-outline" active />
                {shopOrderUnread > 0 ? (
                  <View style={styles.errandsFabBadge}>
                    <Text style={styles.errandsFabBadgeText}>
                      {shopOrderUnread > 99 ? "99+" : String(shopOrderUnread)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
            {macGyverFabExpanded ? (
              <Pressable
                onPress={() => {
                  flashFabHint("Ask MacGyver");
                  setMacGyverOpen(true);
                }}
                style={styles.fabMacGyverExpanded}
                accessibilityRole="button"
                accessibilityLabel="Ask MacGyver"
                accessibilityHint="Open AI search and help for Qwertymates"
              >
                <Ionicons name="search" size={18} color="#ffffff" />
                <Text style={styles.fabMacGyverExpandedText}>Ask MacGyver</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  flashFabHint("Ask MacGyver");
                  setMacGyverFabExpanded(true);
                }}
                style={styles.fabMacGyver}
                accessibilityRole="button"
                accessibilityLabel="Open Ask MacGyver button"
                accessibilityHint="Expands to a wider Ask MacGyver search button"
              >
                <Ionicons name="search" size={22} color="#ffffff" />
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                flashFabHint("About");
                setAboutQwertymatesOpen(true);
              }}
              style={styles.fab}
              accessibilityRole="button"
              accessibilityLabel="About Qwertymates"
              accessibilityHint="Open about information"
            >
              <Ionicons name="information-circle-outline" size={24} color={socialTheme.brandBlueDark} />
            </Pressable>
            <Pressable
              onPress={() => {
                flashFabHint("Messages");
                setOverlay("messages");
              }}
              style={styles.fab}
              accessibilityRole="button"
              accessibilityLabel="Open messages"
            >
              <SiteNavIcon path={SITE_NAV_ICONS.messages} size={24} fallback="chatbubbles-outline" active />
            </Pressable>
            <Pressable
              onPress={() => {
                flashFabHint("Profile");
                setOverlay("profile");
              }}
              style={[styles.fab, styles.fabProfile, overlay === "profile" && styles.fabActive]}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              {user?.avatar ? (
                <Image
                  source={{ uri: toAbsoluteMediaUrl(user.avatar) }}
                  style={styles.fabProfileImage}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={styles.fabProfileAvatar}>
                  <Text style={styles.fabProfileAvatarText}>{(user?.name || "U").slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
            </Pressable>
            {showMyStoreQuick ? (
              <Pressable
                onPress={() => {
                  flashFabHint("My store");
                  setOverlay("store");
                }}
                style={styles.fab}
                accessibilityRole="button"
                accessibilityLabel="Open MyStore"
              >
                <SiteNavIcon path={SITE_NAV_ICONS.myStore} size={24} fallback="storefront-outline" active />
              </Pressable>
            ) : null}
            {/* Cart under store (or under profile when no store yet) — icon only */}
            <Pressable
              onPress={() => {
                flashFabHint(primaryTab === "hub" && hubFocusedProduct ? "Add to cart" : "Cart");
                if (primaryTab === "hub" && hubFocusedProduct?._id) {
                  if (hubCartBusy) return;
                  if (typeof hubFocusedProduct.stock === "number" && hubFocusedProduct.stock <= 0) {
                    Alert.alert("Cart", "Out of stock.");
                    return;
                  }
                  // Web parity: open product details so shopper can pick size/color (and qty).
                  setHubOpenProductId(hubFocusedProduct._id);
                  return;
                }
                openCartOverlay();
              }}
              style={styles.fab}
              accessibilityRole="button"
              accessibilityLabel={
                primaryTab === "hub" && hubFocusedProduct ? "Add focused product to cart" : "Open cart"
              }
            >
              <Ionicons name="cart-outline" size={22} color={socialTheme.brandBlueDark} />
              {cartCount > 0 ? (
                <View style={styles.cartFabBadge}>
                  <Text style={styles.cartFabBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        )}
      </View>

      <CollapsibleChrome api={chrome} edge="bottom" style={styles.bottomNavCollapse}>
      <View style={styles.bottomNav}>
        {bottomNavTabs.map((item) => {
          const active = !overlay && primaryTab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => goToPrimary(item.id)}
              style={[styles.navItem, active && styles.navItemActive]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
            >
              <SiteNavIcon path={item.iconPath} size={22} fallback={item.fallback} active={active} />
              <Text
                style={[styles.navItemText, active && styles.navItemTextActive]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {item.label}
              </Text>
              {item.id === "tv" && tab === "saved" && savedCount > 0 ? (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{savedCount > 99 ? "99+" : savedCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setOverlay("wallet")}
          style={[styles.navItem, overlay === "wallet" && styles.navItemActive]}
          accessibilityRole="button"
          accessibilityLabel="Open ACBPayWallet"
        >
          <SiteNavIcon
            path={SITE_NAV_ICONS.acbPayWallet}
            size={22}
            fallback="card-outline"
            active={overlay === "wallet"}
          />
          <Text
            style={[styles.navItemText, overlay === "wallet" && styles.navItemTextActive]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            ACBPayWallet
          </Text>
        </Pressable>
      </View>
      </CollapsibleChrome>

      <AskMacGyverModal
        visible={macGyverOpen}
        onClose={closeMacGyver}
        isSignedIn={!!user}
        onOpenProduct={(productId) => {
          closeMacGyver();
          setHubOpenProductId(productId);
          goToPrimary("hub");
        }}
        onOpenTv={() => {
          closeMacGyver();
          goToPrimary("tv");
        }}
        onOpenMusic={() => {
          closeMacGyver();
          goToPrimary("music");
        }}
        onOpenStore={(store) => {
          closeMacGyver();
          goToPrimary("hub");
          const slug = String(store.slug || "").trim();
          if (!slug) return;
          void storesAPI
            .getProductsBySlug(slug)
            .then((res) => {
              const list = res.data?.data?.products;
              const first = Array.isArray(list) ? list[0] : null;
              const id = first && typeof first === "object" ? String((first as Product)._id || "") : "";
              if (id) setHubOpenProductId(id);
            })
            .catch(() => {});
        }}
        onMessageUser={(userId, name) => {
          closeMacGyver();
          setMessagesPeer({ id: userId, name });
          setOverlay("messages");
        }}
      />

      <Modal
        visible={aboutQwertymatesOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAboutQwertymatesOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.macGyverOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAboutQwertymatesOpen(false)} />
          <View style={styles.macGyverCard}>
            <View style={styles.macGyverHeaderRow}>
              <View style={styles.macGyverTitleRow}>
                <Ionicons name="information-circle" size={22} color={socialTheme.brandBlueDark} />
                <Text style={styles.macGyverTitle}>About Qwertymates</Text>
              </View>
              <Pressable
                onPress={() => setAboutQwertymatesOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close About Qwertymates"
              >
                <Ionicons name="close" size={26} color={socialTheme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.macGyverBodyScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <View style={styles.macGyverAiBox}>
                <Text style={styles.macGyverAiText}>💡 Welcome to Qwertymates{"\n"}</Text>
                <Text style={styles.macGyverAiText}>
                  Qwertymates is an all‑in‑one digital platform where you can earn, pay, sell, communicate, and
                  explore content — all in one place.{"\n\n"}
                </Text>
                <Text style={styles.macGyverAiText}>🚀 What you can do:{"\n\n"}</Text>
                <Text style={styles.macGyverAiText}>
                  🛒 Earn & Sell (QwertyHub + MyStore){"\n"}
                  Browse products, resell instantly, and get your own store — no stock or logistics needed.{"\n\n"}
                  💸 Pay & Get Paid (ACBPayWallet){"\n"}
                  Send money, pay shops, receive payments, and manage everything securely.{"\n\n"}
                  🧰 Do & Post Tasks (Errands){"\n"}
                  Find tasks or earn money by completing them, with secure payments.{"\n\n"}
                  💬 Chat & Call (Morongwa){"\n"}
                  Message, call, and communicate for business or social.{"\n\n"}
                  🎥 Watch & 🎵 Listen (QwertyTV & QwertyMusic){"\n"}
                  Stream videos, music, and content from creators.{"\n\n"}
                  🤖 Ask MacGyver (AI Assistant){"\n"}
                  Get help, recommendations, and answers instantly.{"\n\n"}
                  ✅ One account. One platform. Everything connected.
                </Text>
              </View>
            </ScrollView>
            <Pressable onPress={() => setAboutQwertymatesOpen(false)} style={styles.macGyverDone}>
              <Text style={styles.macGyverDoneText}>Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={errandsMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setErrandsMenuOpen(false);
          setErrandsAnchor(null);
        }}
      >
        <View style={styles.errandsModalRoot} pointerEvents="box-none">
          <Pressable
            style={styles.errandsBackdrop}
            onPress={() => {
              setErrandsMenuOpen(false);
              setErrandsAnchor(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss errands menu"
          />
          {errandsAnchor ? (
            <View
              style={[
                styles.errandsDropdown,
                {
                  top: errandsAnchor.y + errandsAnchor.height + 4,
                  left: Math.min(Math.max(8, errandsAnchor.x), SCREEN_W - 196)
                }
              ]}
              pointerEvents="box-none"
            >
              <Pressable
                style={styles.errandsMenuItem}
                onPress={() => openErrandsHub("orders")}
                accessibilityRole="button"
                accessibilityLabel="Shop orders hub"
              >
                <Ionicons name="clipboard-outline" size={18} color={socialTheme.brandBlueDark} />
                <Text style={styles.errandsMenuItemText}>Orders hub</Text>
              </Pressable>
              <View style={styles.errandsMenuDivider} />
              <Pressable
                style={styles.errandsMenuItem}
                onPress={() => {
                  setErrandsMenuOpen(false);
                  setErrandsAnchor(null);
                  setErrandTshwaneBookOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Book Tshwane errand in app"
              >
                <Ionicons name="location-outline" size={18} color={socialTheme.brandBlueDark} />
                <Text style={styles.errandsMenuItemText}>Book (Tshwane)</Text>
              </Pressable>
              <View style={styles.errandsMenuDivider} />
              <Pressable
                style={styles.errandsMenuItem}
                onPress={() => openErrandsInApp("client")}
                accessibilityRole="button"
                accessibilityLabel="Client errands"
              >
                <Ionicons name="person-outline" size={18} color={socialTheme.brandBlueDark} />
                <Text style={styles.errandsMenuItemText}>Client</Text>
              </Pressable>
              <View style={styles.errandsMenuDivider} />
              <Pressable
                style={styles.errandsMenuItem}
                onPress={() => openErrandsInApp("runner")}
                accessibilityRole="button"
                accessibilityLabel="Runner errands"
              >
                <Ionicons name="walk-outline" size={18} color={socialTheme.brandBlueDark} />
                <Text style={styles.errandsMenuItemText}>Runner</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      <CreatePostModal
        visible={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        onCreated={() => {
          setFeedVersion((v) => v + 1);
        }}
      />

      <StatusStoryViewer
        visible={statusViewerOpen}
        post={statusViewerPost}
        loading={statusViewerLoading}
        creatorName={statusViewerMeta.name}
        creatorAvatar={statusViewerMeta.avatar}
        productId={
          statusViewerItem
            ? statusProductId(
                postsForStatusItem(statusViewerItem)[statusPostIndex],
                statusViewerPost
              )
            : null
        }
        onOpenProduct={(id) => {
          setStatusViewerOpen(false);
          setStatusViewerItem(null);
          setStatusViewerPost(null);
          setStatusViewerLoading(false);
          setStatusPostIndex(0);
          setHubOpenProductId(id);
          goToPrimary("hub");
        }}
        segmentCount={statusViewerItem ? postsForStatusItem(statusViewerItem).length : 1}
        postIndex={statusPostIndex}
        onNextPost={goNextStatusPost}
        onPrevPost={goPrevStatusPost}
        onClose={() => {
          setStatusViewerOpen(false);
          setStatusViewerItem(null);
          setStatusViewerPost(null);
          setStatusViewerLoading(false);
          setStatusPostIndex(0);
        }}
      />

      <ErrandsTshwaneBookModal visible={errandTshwaneBookOpen} onClose={() => setErrandTshwaneBookOpen(false)} user={user} />

      {callOpen && user ? (
        <Suspense
          fallback={
            <View style={styles.callLoadingOverlay}>
              <ActivityIndicator size="large" color={socialTheme.brandBlue} />
            </View>
          }
        >
          <CallScreenLazy
            key={callSession}
            userId={String(user._id || user.id || "")}
            onClose={() => {
              setCallOpen(false);
              setCallLaunch(null);
            }}
            initialPeerUserId={callLaunch?.peerUserId}
            initialPeerName={callLaunch?.peerUserName}
            initialRoomId={callLaunch?.roomId}
            autoJoinRoom={callLaunch?.autoJoin}
            autoStartCall={callLaunch?.autoStartCall}
            initialAudioOnly={callLaunch?.audioOnly}
            answerIncoming={callLaunch?.answerIncoming}
            incomingCallerId={callLaunch?.callerId}
            invitedUserIds={callLaunch?.invitedUserIds}
          />
        </Suspense>
      ) : null}

      {user ? (
        <CallUserPicker
          visible={callPickerOpen}
          currentUserId={String(user._id || user.id || "")}
          onClose={() => setCallPickerOpen(false)}
          onStartCall={handlePickerStart}
        />
      ) : null}
    </View>
      )}
    </ScrollAwareChromeProvider>
  );

  return showLandingPhotoBg ? (
    <ImageBackground
      source={{ uri: landingBgUri! }}
      style={{ flex: 1 }}
      imageStyle={styles.landingBgImage}
      resizeMode="cover"
      onError={() => setLandingBgBroken(true)}
    >
      <View style={styles.landingScrim}>{mainShell}</View>
    </ImageBackground>
  ) : (
    mainShell
  );
}

/** Reveal header + tab bar again whenever the visible screen changes. */
function ScrollAwareChromeReset({ chrome, watch }: { chrome: ScrollAwareChromeApi; watch: string }) {
  const reset = chrome.reset;
  useEffect(() => {
    reset();
  }, [watch, reset]);
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 0, backgroundColor: socialTheme.canvas },
  chromeCollapse: { zIndex: 20 },
  bottomNavCollapse: { zIndex: 15 },
  containerOnPhotoBg: {
    backgroundColor: "transparent"
  },
  landingBgImage: {
    opacity: 0.42
  },
  landingScrim: {
    flex: 1,
    backgroundColor: "rgba(250,250,250,0.92)"
  },
  fixedChrome: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: socialChrome.headerBorder,
    backgroundColor: socialChrome.headerBg,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    zIndex: 20
  },
  statusTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 2
  },
  storiesSlot: {
    flex: 1,
    minHeight: 78
  },
  /** Full-width row so shortcuts sit centered (ScrollView only sized to content and stayed left on web). */
  quickActionsBar: {
    width: "100%",
    height: 0,
    paddingVertical: 0,
    paddingHorizontal: 0
  },
  quickAction: {
    alignItems: "center",
    gap: 4,
    minWidth: 92
  },
  quickActionHit: {
    alignItems: "center",
    gap: 4
  },
  errandsLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  errandsModalRoot: {
    flex: 1
  },
  errandsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.35)"
  },
  errandsDropdown: {
    position: "absolute",
    width: 188,
    backgroundColor: socialTheme.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    paddingVertical: 4,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16
      },
      android: { elevation: 8 }
    })
  },
  errandsMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  errandsMenuItemText: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  errandsMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: socialTheme.borderHairline,
    marginHorizontal: 10
  },
  quickActionLabel: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary,
    textAlign: "center",
    maxWidth: 122,
    fontSize: 11,
    lineHeight: 13
  },
  fabHintBubble: {
    alignSelf: "center",
    backgroundColor: "rgba(15,23,42,0.88)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 4,
    maxWidth: 120
  },
  fabHintText: {
    ...appTypography.badge,
    color: "#ffffff",
    fontWeight: "700",
    textAlign: "center"
  },
  cartFabBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: socialChrome.badgeBg,
    alignItems: "center",
    justifyContent: "center"
  },
  cartFabBadgeText: {
    ...appTypography.badge,
    color: socialChrome.badgeText,
    fontSize: 9
  },
  navProfileItem: {
    minWidth: 56
  },
  navProfileAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderLight
  },
  navProfileAvatarText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },
  storeOverlay: {
    flex: 1,
    backgroundColor: socialTheme.canvas
  },
  storeOverlayContent: {
    padding: 12,
    gap: 12,
    paddingBottom: 24
  },
  storeOverlayTitle: {
    ...appTypography.headline,
    color: socialTheme.textPrimary,
    marginBottom: 4
  },
  shopOrdersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: socialTheme.brandBlue,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  shopOrdersBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14
  },
  shopOrdersBadge: {
    marginLeft: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e11d48",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5
  },
  shopOrdersBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800"
  },
  storeOrdersHint: {
    fontSize: 12,
    color: socialTheme.textSecondary,
    lineHeight: 16,
    marginBottom: 4
  },
  storeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 14,
    padding: 12,
    gap: 4
  },
  storeCardName: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  storeCardSlug: {
    ...appTypography.meta,
    color: socialTheme.brandBlue
  },
  storeCardLine: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  storeEmpty: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    textAlign: "center",
    marginTop: 12
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: socialChrome.headerBorder,
    backgroundColor: socialChrome.headerBg,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  bodyWrap: {
    flex: 1,
    position: "relative"
  },
  leftRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 44,
    zIndex: 5,
    alignItems: "center",
    paddingTop: 8,
    gap: 10
  },
  rightFabColumn: {
    position: "absolute",
    right: 10,
    bottom: 82,
    zIndex: 6,
    gap: 8,
    alignItems: "center"
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: socialTheme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  errandsFabBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#e11d48",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  errandsFabBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  fabActive: {
    borderColor: socialTheme.brandBlue
  },
  fabProfile: {
    overflow: "hidden",
    padding: 0,
    backgroundColor: socialTheme.surface
  },
  fabProfileImage: {
    width: 48,
    height: 48,
    borderRadius: 24
  },
  fabProfileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center"
  },
  fabProfileAvatarText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  fabMacGyver: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#1d4ed8",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
  },
  fabMacGyverExpanded: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#1d4ed8",
    paddingHorizontal: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
  },
  fabMacGyverExpandedText: {
    ...appTypography.labelSm,
    color: "#ffffff",
    fontWeight: "800"
  },
  content: { flex: 1, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderLight,
    overflow: "hidden",
    /** Match `StoriesStrip` scroll `paddingVertical` so ring tops line up with logo top. */
    marginTop: 2
  },
  brandLogoAtWall: {
    borderColor: socialTheme.brandBlue,
    backgroundColor: socialTheme.brandBlueSoft
  },
  brandLogoImage: {
    width: 40,
    height: 40
  },
  profilePill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: socialTheme.brandBlue,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderLight,
    alignItems: "center",
    justifyContent: "center"
  },
  profilePillText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    marginTop: 8,
    paddingHorizontal: 2
  },
  tabBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  tabBtnActive: {
    borderColor: socialTheme.brandBlue,
    backgroundColor: socialTheme.brandBlueSoft
  },
  tabBtnText: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary
  },
  tabBtnTextActive: {
    color: socialTheme.brandBlueDark
  },
  savedTabWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  savedBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: socialTheme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  savedBadgeActive: {
    backgroundColor: socialTheme.brandBlue
  },
  savedBadgeText: {
    ...appTypography.badge,
    color: socialTheme.brandBlueDark
  },
  savedBadgeTextActive: {
    color: "#ffffff"
  },
  clearBtn: {
    marginLeft: "auto",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  clearBtnText: {
    ...appTypography.meta,
    color: "#be123c",
    fontWeight: "700"
  },
  bottomNav: {
    minHeight: 68,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: socialChrome.bottomBarBorder,
    backgroundColor: socialChrome.bottomBarBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 6,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 4
  },
  navItem: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 2
  },
  navItemActive: {
    backgroundColor: "#eaf0ff"
  },
  navItemText: {
    ...appTypography.labelSm,
    color: socialChrome.navInactive,
    textAlign: "center",
    maxWidth: 64,
    fontSize: 10,
    lineHeight: 12
  },
  navItemTextActive: {
    color: socialChrome.navActiveBrand
  },
  navBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: socialChrome.badgeBg
  },
  navBadgeText: {
    ...appTypography.badge,
    color: socialChrome.badgeText
  },
  callLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(250,250,250,0.92)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9998
  },
  macGyverOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20
  },
  macGyverCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    gap: 10,
    maxWidth: 400,
    maxHeight: "88%",
    alignSelf: "center",
    width: "100%"
  },
  macGyverHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  macGyverTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  macGyverTitle: {
    ...appTypography.headline,
    color: socialTheme.textPrimary,
    flexShrink: 1
  },
  macGyverSub: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    lineHeight: 18
  },
  macGyverSignInHint: {
    ...appTypography.meta,
    color: "#b45309",
    fontWeight: "600"
  },
  macGyverBodyScroll: {
    maxHeight: 280,
    flexGrow: 0
  },
  macGyverAiBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: "#f8fafc",
    padding: 12,
    marginBottom: 8
  },
  macGyverAiText: {
    ...appTypography.meta,
    color: socialTheme.textPrimary,
    lineHeight: 20
  },
  macGyverResultsBlock: {
    gap: 4,
    paddingTop: 4
  },
  macGyverResultsLabel: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary,
    marginBottom: 4,
    fontWeight: "700"
  },
  macGyverEmptyHint: {
    ...appTypography.meta,
    color: socialTheme.textMuted,
    textAlign: "center",
    paddingVertical: 16
  },
  macGyverAskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4
  },
  macGyverInputFlex: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    ...appTypography.input,
    color: socialTheme.textPrimary
  },
  macGyverAskBtn: {
    backgroundColor: "#f59e0b",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center"
  },
  macGyverAskBtnDisabled: {
    opacity: 0.5
  },
  macGyverAskBtnText: {
    ...appTypography.cta,
    color: "#ffffff"
  },
  macGyverDone: {
    alignItems: "center",
    paddingVertical: 8,
    marginTop: 4
  },
  macGyverDoneText: {
    ...appTypography.meta,
    color: socialTheme.brandBlue,
    fontWeight: "700"
  },
  macGyverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: socialTheme.borderLight
  },
  macGyverThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: socialTheme.surfaceMuted
  },
  macGyverThumbPh: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline
  },
  macGyverRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  macGyverRowTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  macGyverRowMeta: {
    ...appTypography.meta,
    color: socialTheme.brandBlueDark
  }
});
