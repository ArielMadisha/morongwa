import React, { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { MOBILE_API_URL } from "../config";
import { FeedScreen } from "./FeedScreen";

const SAVED_POSTS_KEY = "morongwa.mobile.savedPosts";

export function HomeScreen() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<"feed" | "saved">("feed");
  const [savedCount, setSavedCount] = useState(0);
  const [feedVersion, setFeedVersion] = useState(0);

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
          <Text style={styles.heading}>Morongwa Feed</Text>
          <Text style={styles.text}>Signed in as {user?.name ?? "User"}</Text>
          <Text style={styles.endpointText}>API: {MOBILE_API_URL}</Text>
        </View>
        <Pressable onPress={logout} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  headerCopy: { flex: 1, gap: 4 },
  heading: { color: "#f8fafc", fontSize: 24, fontWeight: "700" },
  text: { color: "#cbd5e1" },
  endpointText: { color: "#64748b", fontSize: 12 },
  tabsRow: {
    flexDirection: "row",
    gap: 8
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
  signOutBtn: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  signOutText: { color: "#e2e8f0", fontWeight: "700", fontSize: 12 }
});
