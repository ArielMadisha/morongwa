import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { User } from "../types";
import { toAbsoluteMediaUrl, usersAPI } from "../lib/api";
import { ensureMediaLibraryAccess } from "../lib/mediaPermissions";

type ProfileScreenProps = {
  user: User | null;
  onSignOut: () => void;
  onOpenVideoCall?: () => void;
  /** Shown when opening profile from the header (not a root tab). */
  onBack?: () => void;
  onOpenWallet?: () => void;
};

function appVersionLabel(): string {
  const version =
    Constants.nativeAppVersion ||
    Constants.expoConfig?.version ||
    (Constants as { manifest?: { version?: string } }).manifest?.version ||
    "?";
  const build =
    Constants.nativeBuildVersion ||
    String((Constants.expoConfig as { android?: { versionCode?: number } } | null)?.android?.versionCode || "");
  return build ? `App ${version} · build ${build}` : `App ${version}`;
}

function isPrivilegedRole(role: User["role"] | undefined): boolean {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  return roles.some((r) => r === "admin" || r === "superadmin");
}

export function ProfileScreen({ user, onSignOut, onOpenVideoCall, onBack, onOpenWallet }: ProfileScreenProps) {
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string>("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const roleText = Array.isArray(user?.role) ? user?.role.join(", ") : user?.role || "client";
  const userId = String(user?._id || user?.id || "").trim();
  const privileged = isPrivilegedRole(user?.role);
  const avatarUri = useMemo(() => {
    if (avatarOverride) return avatarOverride;
    return toAbsoluteMediaUrl(user?.avatar);
  }, [avatarOverride, user?.avatar]);

  const closeDeleteModal = () => {
    if (deleteBusy) return;
    setDeleteOpen(false);
    setDeletePassword("");
    setDeleteConfirmText("");
  };

  const onPickAvatar = async () => {
    if (!userId || avatarBusy) return;
    try {
      if (!(await ensureMediaLibraryAccess())) {
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

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      Alert.alert("Confirm", 'Type DELETE to confirm account removal.');
      return;
    }
    if (!deletePassword.trim()) {
      Alert.alert("Password required", "Enter your account password to delete your account.");
      return;
    }
    if (!userId || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await usersAPI.deleteAccount(userId, deletePassword.trim());
      setDeleteOpen(false);
      setDeletePassword("");
      setDeleteConfirmText("");
      Alert.alert("Account deleted", "Your Qwertymates account has been deleted.");
      onSignOut();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Could not delete account.";
      Alert.alert("Delete failed", String(msg));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
          <Text style={styles.callBtnText}>Start a call</Text>
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

      <View style={styles.deleteSection}>
        <Text style={styles.deleteTitle}>Delete account</Text>
        <Text style={styles.deleteHint}>
          Permanently remove your Qwertymates account. You will be signed out and cannot sign in again with this
          account. See{" "}
          <Text
            style={styles.deleteLink}
            onPress={() => void Linking.openURL("https://www.qwertymates.com/account-deletion")}
          >
            account deletion
          </Text>{" "}
          and{" "}
          <Text
            style={styles.deleteLink}
            onPress={() => void Linking.openURL("https://www.qwertymates.com/policies/privacy-policy")}
          >
            privacy policy
          </Text>
          .
        </Text>
        {privileged ? (
          <Text style={styles.deleteAdminNote}>
            Admin accounts cannot be self-deleted. Contact support@qwertymates.com.
          </Text>
        ) : (
          <Pressable
            onPress={() => setDeleteOpen(true)}
            style={styles.deleteBtn}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Ionicons name="trash-outline" size={16} color="#b91c1c" />
            <Text style={styles.deleteBtnText}>Delete my account</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.versionChip}>
        <Text style={styles.versionText}>{appVersionLabel()}</Text>
        <Text style={styles.versionHint}>
          Need cellphone register, sticky Hang up, swipe Sponsored, Food stores, ACBPay Receive? Must show App 1.3.20+
          (build 70). Open QwertyTV → ⋯ Post actions for Feed/Saved/Delete. QwertyMusic → Theme.
        </Text>
      </View>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} accessibilityViewIsModal>
            <Text style={styles.modalTitle}>Delete account?</Text>
            <Text style={styles.modalBody}>
              This cannot be undone. Your profile will be removed, your phone and email released for a new
              registration, and you will be signed out.
            </Text>
            <Text style={styles.modalLabel}>Password</Text>
            <TextInput
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Your account password"
              style={styles.modalInput}
              editable={!deleteBusy}
            />
            <Text style={styles.modalLabel}>Type DELETE to confirm</Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              style={styles.modalInput}
              editable={!deleteBusy}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={closeDeleteModal} disabled={deleteBusy} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDeleteAccount()}
                disabled={deleteBusy}
                style={styles.modalConfirm}
              >
                {deleteBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Delete account</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    paddingBottom: 28
  },
  pageTitle: {
    alignSelf: "flex-start",
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8
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
    backgroundColor: "#eff6ff"
  },
  callBtnText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 13
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
    fontSize: 13
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
  },
  deleteSection: {
    marginTop: 16,
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 14,
    gap: 8
  },
  deleteTitle: {
    color: "#7f1d1d",
    fontSize: 14,
    fontWeight: "800"
  },
  deleteHint: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17
  },
  deleteLink: {
    color: "#1d4ed8",
    fontWeight: "600",
    textDecorationLine: "underline"
  },
  deleteAdminNote: {
    color: "#92400e",
    fontSize: 12,
    lineHeight: 16
  },
  deleteBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  deleteBtnText: {
    color: "#b91c1c",
    fontWeight: "700",
    fontSize: 13
  },
  versionChip: {
    marginTop: 18,
    alignSelf: "stretch",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6
  },
  versionText: {
    color: "#1e40af",
    fontSize: 14,
    fontWeight: "800"
  },
  versionHint: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 15
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8
  },
  modalTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800"
  },
  modalBody: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4
  },
  modalLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    fontSize: 14,
    backgroundColor: "#f8fafc"
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12
  },
  modalCancel: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  modalCancelText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 13
  },
  modalConfirm: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: "center"
  },
  modalConfirmText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  }
});
