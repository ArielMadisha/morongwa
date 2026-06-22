import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { messengerAPI } from "../lib/api";
import { directCallRoomId, groupCallRoomId } from "../lib/callRoom";
import type { User } from "../types";

export type CallUserPickerResult = {
  mode: "direct" | "group";
  peerUserId: string;
  peerUserName: string;
  roomId: string;
  audioOnly: boolean;
  invitedUserIds?: string[];
};

type CallUserPickerProps = {
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  onStartCall: (result: CallUserPickerResult) => void;
};

export function CallUserPicker({ visible, currentUserId, onClose, onStartCall }: CallUserPickerProps) {
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<User[]>([]);
  const [recent, setRecent] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, User>>(new Map());
  const [callType, setCallType] = useState<"voice" | "video">("voice");

  const loadRecent = useCallback(async () => {
    try {
      const res = await messengerAPI.getConversations();
      const list = res.data?.conversations ?? [];
      const users: User[] = [];
      for (const c of list) {
        const u = (c as { user?: User }).user;
        const id = String(u?._id ?? u?.id ?? "");
        if (u && id && id !== currentUserId) users.push(u);
      }
      setRecent(users);
    } catch {
      setRecent([]);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setSearchHits([]);
    setSelected(new Map());
    void loadRecent();
  }, [visible, loadRecent]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await messengerAPI.searchUsers(q);
        const rows = res.data?.data ?? [];
        setSearchHits(Array.isArray(rows) ? rows.filter((u) => String(u._id ?? u.id) !== currentUserId) : []);
      } catch {
        setSearchHits([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(id);
  }, [query, currentUserId]);

  const toggleUser = (u: User) => {
    const id = String(u._id ?? u.id ?? "");
    if (!id) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, u);
      return next;
    });
  };

  const startCall = () => {
    const picked = Array.from(selected.values());
    if (picked.length === 0) return;
    const primary = picked[0]!;
    const primaryId = String(primary._id ?? primary.id ?? "");
    const audioOnly = callType === "voice";
    if (picked.length === 1) {
      onStartCall({
        mode: "direct",
        peerUserId: primaryId,
        peerUserName: primary.name || "Contact",
        roomId: directCallRoomId(currentUserId, primaryId),
        audioOnly,
      });
    } else {
      const ids = picked.map((u) => String(u._id ?? u.id ?? "")).filter(Boolean);
      onStartCall({
        mode: "group",
        peerUserId: primaryId,
        peerUserName: primary.name || "Contact",
        roomId: groupCallRoomId(currentUserId, ids),
        audioOnly,
        invitedUserIds: ids,
      });
    }
    onClose();
  };

  const listData = query.trim() ? searchHits : recent;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Start a call</Text>
          <Pressable onPress={startCall} disabled={selected.size === 0}>
            <Text style={[styles.start, selected.size === 0 && styles.startDisabled]}>Call</Text>
          </Pressable>
        </View>

        <View style={styles.typeRow}>
          <Pressable
            onPress={() => setCallType("voice")}
            style={[styles.typeBtn, callType === "voice" && styles.typeBtnActive]}
          >
            <Text style={[styles.typeBtnText, callType === "voice" && styles.typeBtnTextActive]}>Voice</Text>
          </Pressable>
          <Pressable
            onPress={() => setCallType("video")}
            style={[styles.typeBtn, callType === "video" && styles.typeBtnActive]}
          >
            <Text style={[styles.typeBtnText, callType === "video" && styles.typeBtnTextActive]}>Video</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people by name…"
          placeholderTextColor="#64748b"
          style={styles.search}
          autoCapitalize="none"
        />

        <Text style={styles.hint}>
          {selected.size > 1
            ? `${selected.size} selected — group room (connects with first participant who answers).`
            : "Pick someone from recent chats or search. No user IDs needed."}
        </Text>

        {loading ? <ActivityIndicator color="#93c5fd" style={{ marginTop: 12 }} /> : null}

        <FlatList
          data={listData}
          keyExtractor={(u) => String(u._id ?? u.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{query.trim() ? "No users found." : "No recent chats yet."}</Text>
          }
          renderItem={({ item }) => {
            const id = String(item._id ?? item.id ?? "");
            const active = selected.has(id);
            return (
              <Pressable onPress={() => toggleUser(item)} style={[styles.row, active && styles.rowActive]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.name || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.name || "User"}</Text>
                  {item.username ? <Text style={styles.rowSub}>@{item.username}</Text> : null}
                </View>
                {active ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0f172a", paddingTop: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cancel: { color: "#93c5fd", fontWeight: "600" },
  title: { color: "#f8fafc", fontSize: 17, fontWeight: "700" },
  start: { color: "#38bdf8", fontWeight: "700" },
  startDisabled: { opacity: 0.4 },
  typeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
  },
  typeBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  typeBtnText: { color: "#94a3b8", fontWeight: "600" },
  typeBtnTextActive: { color: "#fff" },
  search: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#e2e8f0",
    backgroundColor: "#111827",
  },
  hint: { color: "#64748b", fontSize: 12, paddingHorizontal: 16, paddingTop: 10 },
  list: { padding: 16, gap: 8 },
  empty: { color: "#64748b", textAlign: "center", marginTop: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  rowActive: { borderColor: "#38bdf8", backgroundColor: "#172554" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#f8fafc", fontWeight: "700" },
  rowBody: { flex: 1 },
  rowName: { color: "#f1f5f9", fontWeight: "600" },
  rowSub: { color: "#64748b", fontSize: 12 },
  check: { color: "#38bdf8", fontSize: 18, fontWeight: "700" },
});
