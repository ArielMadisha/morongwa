import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { WorldScreen } from "./WorldScreen";
import { MusicScreen } from "./MusicScreen";
import { CreatePostModal } from "../components/CreatePostModal";
import { StoriesStrip } from "../components/StoriesStrip";
import { SiteNavIcon } from "../components/SiteNavIcon";
import { SITE_NAV_ICONS } from "../constants/site";
import {
  cartAPI,
  contentAPI,
  macgyverAPI,
  productsAPI,
  resellerAPI,
  storesAPI,
  toAbsoluteMediaUrl,
  tvAPI
} from "../lib/api";
import { Product, StoreSummary } from "../types";
import { appTypography, socialChrome, socialTheme } from "../theme/socialTheme";

/** Expo Go has no WebRTC native module; lazy-load real CallScreen only in dev/custom builds. */
const isExpoGo = Constants.executionEnvironment === "storeClient";

const CallScreenLazy = React.lazy(() =>
  isExpoGo
    ? import("./CallScreenExpoGoStub")
    : import("./CallScreen").then((m) => ({ default: m.CallScreen }))
);

const SAVED_POSTS_KEY = "morongwa.mobile.savedPosts";

const SITE_ORIGIN = "https://www.qwertymates.com";
const SCREEN_W = Dimensions.get("window").width;

type PrimaryTab = "wall" | "hub" | "tv" | "world" | "music";
type OverlayScreen = "messages" | "profile" | "wallet" | "cart" | "store";

const bottomNavTabs: {
  id: PrimaryTab;
  label: string;
  iconPath: string;
  fallback: React.ComponentProps<typeof SiteNavIcon>["fallback"];
}[] = [
  { id: "hub", label: "QwertyHub", iconPath: SITE_NAV_ICONS.qwertyHub, fallback: "storefront-outline" },
  { id: "tv", label: "QwertyTV", iconPath: SITE_NAV_ICONS.qwertyTv, fallback: "play-circle-outline" },
  { id: "world", label: "QwertyWorld", iconPath: SITE_NAV_ICONS.qwertyWorld, fallback: "grid-outline" },
  { id: "music", label: "QwertyMusic", iconPath: SITE_NAV_ICONS.qwertyMusic, fallback: "musical-notes-outline" }
];

export function HomeScreen() {
  const { user, logout } = useAuth();
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("wall");
  const [feedViewportHeight, setFeedViewportHeight] = useState(0);
  const [overlay, setOverlay] = useState<OverlayScreen | null>(null);
  const [tab, setTab] = useState<"feed" | "saved">("feed");
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
    roomId: string;
    autoJoin: boolean;
    audioOnly?: boolean;
  } | null>(null);
  const [macGyverOpen, setMacGyverOpen] = useState(false);
  const [macGyverFabExpanded, setMacGyverFabExpanded] = useState(false);
  const [macGyverQuery, setMacGyverQuery] = useState("");
  const [macGyverLoading, setMacGyverLoading] = useState(false);
  const [macGyverResults, setMacGyverResults] = useState<Product[]>([]);
  const [macGyverAiText, setMacGyverAiText] = useState<string | null>(null);
  const [hubOpenProductId, setHubOpenProductId] = useState<string | null>(null);
  const [storyCreators, setStoryCreators] = useState<
    { id: string; name?: string; avatar?: string }[]
  >([]);
  const [showMyStoreQuick, setShowMyStoreQuick] = useState(false);
  const [storePanelStores, setStorePanelStores] = useState<StoreSummary[]>([]);
  const [storePanelLoading, setStorePanelLoading] = useState(false);
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [errandsMenuOpen, setErrandsMenuOpen] = useState(false);
  const [errandsAnchor, setErrandsAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const errandsRef = useRef<View>(null);
  const [landingBgs, setLandingBgs] = useState<string[]>([]);
  const [landingBgIdx, setLandingBgIdx] = useState(0);

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
    if (landingBgs.length <= 1) return;
    const id = setInterval(() => setLandingBgIdx((i) => i + 1), 18000);
    return () => clearInterval(id);
  }, [landingBgs.length]);

  useEffect(() => {
    void tvAPI
      .getStatuses()
      .then((res) => {
        const rows = res.data?.data ?? [];
        const mapped = rows
          .map((r) => {
            const uid = r.userId as unknown;
            const id =
              typeof uid === "object" && uid && "_id" in (uid as { _id?: string })
                ? String((uid as { _id?: string })._id)
                : String(uid ?? "");
            if (!id) return null;
            return { id, name: r.name, avatar: r.avatar };
          })
          .filter(Boolean) as { id: string; name?: string; avatar?: string }[];
        setStoryCreators(mapped);
      })
      .catch(() => setStoryCreators([]));
  }, [feedVersion]);

  useEffect(() => {
    if (!user) {
      setShowMyStoreQuick(false);
      return;
    }
    void resellerAPI
      .getMyWall()
      .then((res) => {
        const n = Array.isArray(res.data?.data?.products) ? res.data!.data!.products!.length : 0;
        setShowMyStoreQuick(n > 0);
      })
      .catch(() => setShowMyStoreQuick(false));
  }, [user, feedVersion, cartRefreshKey]);

  const loadStorePanel = useCallback(async () => {
    setStorePanelLoading(true);
    try {
      const res = await storesAPI.getMine();
      const data = res.data?.data;
      setStorePanelStores(Array.isArray(data) ? data : []);
    } catch {
      setStorePanelStores([]);
    } finally {
      setStorePanelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (overlay === "store") void loadStorePanel();
  }, [overlay, loadStorePanel]);

  const openVideoCallManual = () => {
    setCallLaunch(null);
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

  const openErrandsPath = (path: string) => {
    setErrandsMenuOpen(false);
    setErrandsAnchor(null);
    const url = `${SITE_ORIGIN}${path}`;
    void Linking.openURL(url).catch(() => {
      Alert.alert("Errands", "Could not open the link.");
    });
  };

  const onErrandsPress = () => {
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
    setMacGyverResults([]);
    setMacGyverQuery("");
    setMacGyverAiText(null);
  }, []);

  useEffect(() => {
    if (!macGyverFabExpanded || macGyverOpen) return;
    const id = setTimeout(() => setMacGyverFabExpanded(false), 4200);
    return () => clearTimeout(id);
  }, [macGyverFabExpanded, macGyverOpen]);

  /** Same pipeline as web search page: POST /macgyver/ask → search products or AI text. */
  const submitMacGyverAsk = async () => {
    const q = macGyverQuery.trim();
    if (!q || macGyverLoading) return;
    if (!user) {
      Alert.alert("Ask MacGyver", "Sign in to use Ask MacGyver.");
      return;
    }
    setMacGyverLoading(true);
    setMacGyverAiText(null);
    setMacGyverResults([]);
    try {
      const res = await macgyverAPI.ask(q);
      const data = res.data?.data;
      if (data && "type" in data && data.type === "search" && typeof data.query === "string") {
        const prodRes = await productsAPI.list({ q: data.query.trim(), limit: 30 });
        const list = prodRes.data?.data;
        setMacGyverResults(Array.isArray(list) ? list : []);
      } else if (data && "text" in data && typeof (data as { text?: string }).text === "string") {
        setMacGyverAiText((data as { text: string }).text);
      } else {
        setMacGyverAiText("No response.");
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Something went wrong. Try again.";
      setMacGyverAiText(String(msg));
    } finally {
      setMacGyverLoading(false);
    }
  };

  const pickMacGyverProduct = (p: Product) => {
    if (!p?._id) return;
    closeMacGyver();
    setHubOpenProductId(p._id);
    goToPrimary("hub");
  };

  const mainContent = () => {
    if (overlay === "messages") {
      return (
        <MessagesScreen
          currentUserId={String(user?._id || user?.id || "")}
          onRequestVideoCall={(peerUserId, roomId) => {
            setCallLaunch({ peerUserId, roomId, autoJoin: true, audioOnly: false });
            setCallSession((s) => s + 1);
            setCallOpen(true);
          }}
          onRequestVoiceCall={(peerUserId, roomId) => {
            setCallLaunch({ peerUserId, roomId, autoJoin: true, audioOnly: true });
            setCallSession((s) => s + 1);
            setCallOpen(true);
          }}
        />
      );
    }
    if (overlay === "profile") {
      return (
        <ProfileScreen
          user={user}
          onSignOut={logout}
          onOpenVideoCall={openVideoCallManual}
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
            setCartMode("cart");
            setCartRefreshKey((v) => v + 1);
            setWalletSession((v) => v + 1);
            setOverlay("wallet");
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
          hideStoriesHeader
          onPressCreateStory={() => setCreatePostOpen(true)}
          onCartUpdated={bumpCart}
          userName={user?.name}
          currentUserId={user?._id || user?.id}
          onSavedCountChange={setSavedCount}
        />
      );
    }
    if (primaryTab === "tv") {
      return (
        <>
          <View style={styles.tabsRow}>
            <Pressable onPress={() => setTab("feed")} style={[styles.tabBtn, tab === "feed" && styles.tabBtnActive]}>
              <Text style={[styles.tabBtnText, tab === "feed" && styles.tabBtnTextActive]}>Feed</Text>
            </Pressable>
            <Pressable onPress={() => setTab("saved")} style={[styles.tabBtn, tab === "saved" && styles.tabBtnActive]}>
              <View style={styles.savedTabWrap}>
                <Text style={[styles.tabBtnText, tab === "saved" && styles.tabBtnTextActive]}>Saved</Text>
                {savedCount > 0 ? (
                  <View style={[styles.savedBadge, tab === "saved" && styles.savedBadgeActive]}>
                    <Text style={[styles.savedBadgeText, tab === "saved" && styles.savedBadgeTextActive]}>
                      {savedCount > 99 ? "99+" : savedCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
            {tab === "saved" && savedCount > 0 ? (
              <Pressable onPress={clearAllSaved} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear all</Text>
              </Pressable>
            ) : null}
          </View>
          <FeedScreen
            key={`${tab}-${feedVersion}`}
            variant={tab === "saved" ? "default" : "tvVideo"}
            viewportHeight={tab === "feed" ? feedViewportHeight : 0}
            hideStoriesHeader
            onPressCreateStory={() => setCreatePostOpen(true)}
            onCartUpdated={bumpCart}
            userName={user?.name}
            currentUserId={user?._id || user?.id}
            savedOnly={tab === "saved"}
            onSavedCountChange={setSavedCount}
          />
        </>
      );
    }
    if (primaryTab === "hub") {
      return (
        <HubScreen
          openProductId={hubOpenProductId}
          onConsumedOpenProductId={() => setHubOpenProductId(null)}
          onAddedToCart={() => {
            setCartRefreshKey((v) => v + 1);
          }}
          onGoToCart={openCartOverlay}
        />
      );
    }
    if (primaryTab === "world") {
      return (
        <WorldScreen
          onOpenProductId={(id) => {
            setHubOpenProductId(id);
            goToPrimary("hub");
          }}
          onGoToQwertyTv={() => {
            setTab("feed");
            goToPrimary("tv");
          }}
        />
      );
    }
    if (primaryTab === "music") {
      return <MusicScreen />;
    }
    return null;
  };

  const landingBgUri = landingBgs.length ? landingBgs[landingBgIdx % landingBgs.length] : null;

  const mainShell = (
    <View style={[styles.container, landingBgUri ? styles.containerOnPhotoBg : null]}>
      <View style={styles.fixedChrome}>
        <View style={styles.statusTopRow}>
          <Pressable
            onPress={() => goToPrimary("wall")}
            style={[styles.brandLogo, primaryTab === "wall" && styles.brandLogoAtWall]}
            accessibilityRole="button"
            accessibilityLabel="Home: Qwertymates wall feed"
          >
            <Image
              source={require("../../assets/images/qwertymates-logo-icon.png")}
              style={styles.brandLogoImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </Pressable>
          <View style={styles.storiesSlot}>
            <StoriesStrip
              creators={storyCreators}
              onPressSelf={() => setCreatePostOpen(true)}
              onPressCreator={() => {
                goToPrimary("wall");
              }}
            />
          </View>
        </View>
        <View style={styles.quickActionsBar} />
      </View>

      <View style={styles.bodyWrap}>
        {/* Left rail: icon-only column (placeholders for future shortcuts). */}
        <View style={styles.leftRail} pointerEvents="none" />

        <View
          style={styles.content}
          onLayout={(e) => setFeedViewportHeight(e.nativeEvent.layout.height)}
        >
          {mainContent()}
        </View>

        {/* Right FABs: cart (optional), Ask MacGyver AI (above), Morongwa messages (below). */}
        {overlay || createPostOpen || errandsMenuOpen || macGyverOpen ? null : (
          <View style={styles.rightFabColumn} pointerEvents="box-none">
            {cartCount > 0 ? (
              <Pressable
                onPress={openCartOverlay}
                style={styles.cartFabWrap}
                accessibilityRole="button"
                accessibilityLabel="Open cart"
              >
                <Text style={styles.cartFabLabel}>cart</Text>
                <View style={styles.fab}>
                  <Ionicons name="cart-outline" size={22} color={socialTheme.brandBlueDark} />
                  {cartCount > 0 ? (
                    <View style={styles.cartFabBadge}>
                      <Text style={styles.cartFabBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            {showMyStoreQuick ? (
              <Pressable
                onPress={() => setOverlay("store")}
                style={styles.fab}
                accessibilityRole="button"
                accessibilityLabel="Open MyStore"
              >
                <SiteNavIcon path={SITE_NAV_ICONS.myStore} size={24} fallback="storefront-outline" active />
              </Pressable>
            ) : null}
            <View ref={errandsRef} collapsable={false}>
              <Pressable
                onPress={onErrandsPress}
                style={styles.fab}
                accessibilityRole="button"
                accessibilityLabel="Errands"
                accessibilityHint="Choose Client or Runner errands"
              >
                <SiteNavIcon path={SITE_NAV_ICONS.errands} size={24} fallback="car-outline" active />
              </Pressable>
            </View>
            {macGyverFabExpanded ? (
              <Pressable
                onPress={() => {
                  setMacGyverAiText(null);
                  setMacGyverResults([]);
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
                onPress={() => setMacGyverFabExpanded(true)}
                style={styles.fabMacGyver}
                accessibilityRole="button"
                accessibilityLabel="Open Ask MacGyver button"
                accessibilityHint="Expands to a wider Ask MacGyver search button"
              >
                <Ionicons name="search" size={22} color="#ffffff" />
              </Pressable>
            )}
            <Pressable
              onPress={() => setOverlay("messages")}
              style={styles.fab}
              accessibilityRole="button"
              accessibilityLabel="Open Morongwa messages"
            >
              <SiteNavIcon path={SITE_NAV_ICONS.morongwa} size={24} fallback="chatbubbles-outline" active />
            </Pressable>
            <Pressable
              onPress={() => setOverlay("profile")}
              style={[styles.fab, overlay === "profile" && styles.fabActive]}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              <View style={styles.fabProfileAvatar}>
                <Text style={styles.fabProfileAvatarText}>{(user?.name || "U").slice(0, 1).toUpperCase()}</Text>
              </View>
            </Pressable>
          </View>
        )}
      </View>

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

      <Modal
        visible={macGyverOpen}
        animationType="slide"
        transparent
        onRequestClose={closeMacGyver}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.macGyverOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMacGyver} />
          <View style={styles.macGyverCard}>
            <View style={styles.macGyverHeaderRow}>
              <View style={styles.macGyverTitleRow}>
                <Ionicons name="construct" size={22} color="#f59e0b" />
                <Text style={styles.macGyverTitle}>Ask MacGyver</Text>
              </View>
              <Pressable
                onPress={closeMacGyver}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close Ask MacGyver"
              >
                <Ionicons name="close" size={26} color={socialTheme.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.macGyverSub}>
              When there&apos;s no solution… MacGyver makes one. Search or ask anything about Qwertymates.
            </Text>
            {!user ? (
              <Text style={styles.macGyverSignInHint}>Sign in to use Ask MacGyver.</Text>
            ) : (
              <>
                <ScrollView
                  style={styles.macGyverBodyScroll}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {macGyverAiText ? (
                    <View style={styles.macGyverAiBox}>
                      <Text style={styles.macGyverAiText} selectable>
                        {macGyverAiText}
                      </Text>
                    </View>
                  ) : null}
                  {macGyverResults.length > 0 ? (
                    <View style={styles.macGyverResultsBlock}>
                      <Text style={styles.macGyverResultsLabel}>Products</Text>
                      {macGyverResults.map((p) => {
                        const img = toAbsoluteMediaUrl(p.images?.[0]);
                        return (
                          <Pressable
                            key={p._id}
                            style={styles.macGyverRow}
                            onPress={() => pickMacGyverProduct(p)}
                          >
                            {img ? (
                              <Image source={{ uri: img }} style={styles.macGyverThumb} />
                            ) : (
                              <View style={[styles.macGyverThumb, styles.macGyverThumbPh]} />
                            )}
                            <View style={styles.macGyverRowText}>
                              <Text style={styles.macGyverRowTitle} numberOfLines={2}>
                                {p.title}
                              </Text>
                              <Text style={styles.macGyverRowMeta} numberOfLines={1}>
                                {p.currency || "ZAR"} {(p.discountPrice ?? p.price).toFixed(2)}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  {!macGyverAiText && macGyverResults.length === 0 && !macGyverLoading ? (
                    <Text style={styles.macGyverEmptyHint}>Type a question and tap Ask.</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.macGyverAskRow}>
                  <TextInput
                    value={macGyverQuery}
                    onChangeText={setMacGyverQuery}
                    placeholder="Search or ask anything…"
                    placeholderTextColor="#94a3b8"
                    style={styles.macGyverInputFlex}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={() => void submitMacGyverAsk()}
                    editable={!macGyverLoading}
                  />
                  <Pressable
                    onPress={() => void submitMacGyverAsk()}
                    disabled={macGyverLoading || !macGyverQuery.trim()}
                    style={[
                      styles.macGyverAskBtn,
                      (macGyverLoading || !macGyverQuery.trim()) && styles.macGyverAskBtnDisabled
                    ]}
                  >
                    {macGyverLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.macGyverAskBtnText}>Ask</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
            <Pressable onPress={closeMacGyver} style={styles.macGyverDone}>
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
                onPress={() => openErrandsPath("/dashboard/client")}
                accessibilityRole="button"
                accessibilityLabel="Client errands"
              >
                <Ionicons name="person-outline" size={18} color={socialTheme.brandBlueDark} />
                <Text style={styles.errandsMenuItemText}>Client</Text>
              </Pressable>
              <View style={styles.errandsMenuDivider} />
              <Pressable
                style={styles.errandsMenuItem}
                onPress={() => openErrandsPath("/dashboard/runner")}
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
            initialRoomId={callLaunch?.roomId}
            autoJoinRoom={callLaunch?.autoJoin}
            initialAudioOnly={callLaunch?.audioOnly}
          />
        </Suspense>
      ) : null}
    </View>
  );

  return landingBgUri ? (
    <ImageBackground
      source={{ uri: landingBgUri }}
      style={{ flex: 1 }}
      imageStyle={styles.landingBgImage}
      resizeMode="cover"
    >
      <View style={styles.landingScrim}>{mainShell}</View>
    </ImageBackground>
  ) : (
    mainShell
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 0, backgroundColor: socialTheme.canvas },
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
    marginBottom: 6
  },
  storiesSlot: {
    flex: 1,
    minHeight: 58
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
  cartFabWrap: {
    alignItems: "center",
    gap: 4
  },
  cartFabLabel: {
    ...appTypography.badge,
    color: socialTheme.brandBlueDark,
    fontWeight: "800"
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
  fabActive: {
    borderColor: socialTheme.brandBlue
  },
  fabProfileAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center"
  },
  fabProfileAvatarText: {
    color: "#ffffff",
    fontSize: 13,
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
  content: { flex: 1, paddingTop: 0, paddingLeft: 44, paddingRight: 62 },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: socialTheme.surface,
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
