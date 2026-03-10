import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { User } from "../types";

type ProfileScreenProps = {
  user: User | null;
  onSignOut: () => void;
};

export function ProfileScreen({ user, onSignOut }: ProfileScreenProps) {
  const roleText = Array.isArray(user?.role) ? user?.role.join(", ") : user?.role || "client";
  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(user?.name || "U").slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{user?.name || "User"}</Text>
      {user?.username ? <Text style={styles.meta}>@{user.username}</Text> : null}
      {user?.email ? <Text style={styles.meta}>{user.email}</Text> : null}
      <Text style={styles.role}>Role: {roleText}</Text>
      <Pressable onPress={onSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b"
  },
  avatarText: {
    color: "#e2e8f0",
    fontSize: 26,
    fontWeight: "700"
  },
  name: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700"
  },
  meta: {
    color: "#93c5fd",
    fontSize: 13
  },
  role: {
    color: "#cbd5e1",
    fontSize: 12
  },
  signOutBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  signOutText: {
    color: "#fecaca",
    fontWeight: "700",
    fontSize: 12
  }
});
