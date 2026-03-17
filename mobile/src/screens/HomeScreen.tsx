import React, { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { FeedScreen } from "./FeedScreen";
import { HubScreen } from "./HubScreen";
import { WalletScreen } from "./WalletScreen";
import { CartScreen } from "./CartScreen";
import { ProfileScreen } from "./ProfileScreen";
import { CheckoutScreen } from "./CheckoutScreen";

const SAVED_POSTS_KEY = "morongwa.mobile.savedPosts";
type MainTab = "hub" | "tv" | "wallet" | "cart" | "profile";

export function HomeScreen() {
  const { user, logout } = useAuth();
  const [mainTab, setMainTab] = useState<MainTab>("tv");
  const [tab, setTab] = useState<"feed" | "saved">("feed");
  const [savedCount, setSavedCount] = useState(0);
  const [feedVersion, setFeedVersion] = useState(0);
  const [cartRefreshKey, setCartRefreshKey] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [cartMode, setCartMode] = useState<"cart" | "checkout">("cart");

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.heading}>Morongwa</Text>
          <Text style={styles.text}>{user?.name ?? "User"}</Text>
        </View>
        <View style={styles.profilePill}>
          <Text style={styles.profilePillText}>{(user?.name || "U").slice(0, 1).toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {mainTab === "tv" ? (
          <>
            <View style={styles.tabsRow}>
              <Pressable
                onPress={() => setTab("feed")}
                style={[styles.tabBtn, tab === "feed" && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, tab === "feed" && styles.tabBtnTextActive]}>Feed</Text>
              </Pressable>
              <Pressable
                onPress={() => setTab("saved")}
                style={[styles.tabBtn, tab === "saved" && styles.tabBtnActive]}
              >
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
              userName={user?.name}
              currentUserId={user?._id || user?.id}
              savedOnly={tab === "saved"}
              onSavedCountChange={setSavedCount}
            />
          </>
        ) : null}
        {mainTab === "hub" ? (
          <HubScreen
            onAddedToCart={() => {
              setCartRefreshKey((v) => v + 1);
            }}
            onGoToCart={() => {
              setMainTab("cart");
              setCartMode("cart");
              setCartRefreshKey((v) => v + 1);
            }}
          />
        ) : null}
        {mainTab === "wallet" ? <WalletScreen /> : null}
        {mainTab === "cart" ? (
          cartMode === "cart" ? (
            <CartScreen
              refreshKey={cartRefreshKey}
              onCheckout={() => setCartMode("checkout")}
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
              }}
            />
          )
        ) : null}
        {mainTab === "profile" ? <ProfileScreen user={user} onSignOut={logout} /> : null}
      </View>

      <View style={styles.bottomNav}>
        {[
          { id: "hub" as const, label: "Hub" },
          { id: "tv" as const, label: "TV" },
          { id: "wallet" as const, label: "Wallet" },
          { id: "cart" as const, label: "Cart" },
          { id: "profile" as const, label: "Me" }
        ].map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setMainTab(item.id)}
            style={[styles.navItem, mainTab === item.id && styles.navItemActive]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.label} tab`}
          >
            <Text style={[styles.navItemText, mainTab === item.id && styles.navItemTextActive]}>
              {item.label}
            </Text>
            {item.id === "tv" && tab === "saved" && savedCount > 0 ? (
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{savedCount > 99 ? "99+" : savedCount}</Text>
              </View>
            ) : null}
            {item.id === "cart" && cartCount > 0 ? (
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  content: { flex: 1 },
  headerCopy: { flex: 1, gap: 2 },
  heading: { color: "#f8fafc", fontSize: 22, fontWeight: "700" },
  text: { color: "#cbd5e1", fontSize: 13 },
  profilePill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center"
  },
  profilePillText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 15
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10
  },
  tabBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  tabBtnActive: {
    borderColor: "#22c55e",
    backgroundColor: "#052e16"
  },
  tabBtnText: {
    color: "#cbd5e1",
    fontWeight: "600"
  },
  tabBtnTextActive: {
    color: "#86efac"
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
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center"
  },
  savedBadgeActive: {
    backgroundColor: "#166534"
  },
  savedBadgeText: {
    color: "#cbd5e1",
    fontSize: 10,
    fontWeight: "700"
  },
  savedBadgeTextActive: {
    color: "#dcfce7"
  },
  clearBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  clearBtnText: {
    color: "#fecaca",
    fontWeight: "700",
    fontSize: 12
  },
  bottomNav: {
    height: 62,
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 14,
    backgroundColor: "#0b1220",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8
  },
  navItem: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  navItemActive: {
    backgroundColor: "#111827"
  },
  navItemText: {
    color: "#94a3b8",
    fontWeight: "600",
    fontSize: 12
  },
  navItemTextActive: {
    color: "#e2e8f0"
  },
  navBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#14532d"
  },
  navBadgeText: {
    color: "#dcfce7",
    fontSize: 10,
    fontWeight: "700"
  }
});
