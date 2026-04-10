import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { User } from "../types";
import { toAbsoluteMediaUrl, usersAPI } from "../lib/api";

type ProfileScreenProps = {
  user: User | null;
  onSignOut: () => void;
  onOpenVideoCall?: () => void;
  /** Shown when opening profile from the header (not a root tab). */
  onBack?: () => void;
  onOpenWallet?: () => void;
};

export function ProfileScreen({ user, onSignOut, onOpenVideoCall, onBack, onOpenWallet }: ProfileScreenProps) {
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string>("");
  const roleText = Array.isArray(user?.role) ? user?.role.join(", ") : user?.role || "client";
  const userId = String(user?._id || user?.id || "").trim();
  const avatarUri = useMemo(() => {
    if (avatarOverride) return avatarOverride;
    return toAbsoluteMediaUrl(user?.avatar);
  }, [avatarOverride, user?.avatar]);

  const onPickAvatar = async () => {
    if (!userId || avatarBusy) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow photo access to upload your profile picture.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85
      });
      if (picked.canceled || !picked.assets?.length) return;
      const file = picked.assets[0];
      setAvatarBusy(true);
      const name = file.fileName || `avatar-${Date.now()}.jpg`;
      const type = file.mimeType || "image/jpeg";
      const res = await usersAPI.uploadAvatar(userId, { uri: file.uri, name, type });
      const nextAvatar = String(res.data?.avatar || res.data?.user?.avatar || "").trim();
      setAvatarOverride(nextAvatar ? toAbsoluteMediaUrl(nextAvatar) : file.uri);
      Alert.alert("Profile", "Profile picture updated.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Could not upload profile picture.";
      Alert.alert("Upload failed", String(msg));
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color="#1d4ed8" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : null}
      <Text style={styles.pageTitle}>My profile</Text>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{(user?.name || "U").slice(0, 1).toUpperCase()}</Text>
          )}
          {avatarBusy ? (
            <View style={styles.avatarBusy}>
              <ActivityIndicator size="small" color="#1d4ed8" />
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => void onPickAvatar()}
          style={styles.avatarPlusBtn}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          accessibilityHint="Opens your photo library to upload a new profile picture"
        >
          <Text style={styles.avatarPlusText}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.name}>{user?.name || "User"}</Text>
      {user?.username ? <Text style={styles.meta}>@{user.username}</Text> : null}
      {user?.email ? <Text style={styles.meta}>{user.email}</Text> : null}
      <Text style={styles.role}>Role: {roleText}</Text>
      {onOpenVideoCall ? (
        <Pressable onPress={onOpenVideoCall} style={styles.callBtn}>
          <Text style={styles.callBtnText}>Video call (beta)</Text>
        </Pressable>
      ) : null}
      {onOpenWallet ? (
        <Pressable onPress={onOpenWallet} style={styles.walletBtn}>
          <Ionicons name="wallet-outline" size={18} color="#15803d" />
          <Text style={styles.walletBtnText}>ACBPay Wallet</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginBottom: 4
  },
  backText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 16
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16
  },
  pageTitle: {
    alignSelf: "flex-start",
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
    overflow: "hidden"
  },
  avatarWrap: {
    position: "relative"
  },
  avatarImage: {
    width: "100%",
    height: "100%"
  },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: "#1d4ed8",
    fontSize: 26,
    fontWeight: "700"
  },
  avatarPlusBtn: {
    position: "absolute",
    right: -6,
    top: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarPlusText: {
    color: "#2563eb",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20
  },
  name: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "700"
  },
  meta: {
    color: "#1d4ed8",
    fontSize: 13
  },
  role: {
    color: "#64748b",
    fontSize: 12
  },
  callBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#eff6ff",
  },
  callBtnText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 13,
  },
  walletBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#f0fdf4",
    alignSelf: "stretch"
  },
  walletBtnText: {
    color: "#15803d",
    fontWeight: "700",
    fontSize: 13,
  },
  signOutBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  signOutText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 12
  }
});
