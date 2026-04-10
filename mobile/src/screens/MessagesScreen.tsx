import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { messengerAPI } from "../lib/api";
import { directCallRoomId } from "../lib/callRoom";
import type { MessengerConversation, MessengerMessageRow, User } from "../types";

type ThreadState = {
  kind: "direct" | "task";
  otherUserId: string;
  taskId?: string;
  title: string;
};

type MessagesScreenProps = {
  currentUserId: string;
  onRequestVideoCall: (peerUserId: string, roomId: string) => void;
  onRequestVoiceCall?: (peerUserId: string, roomId: string) => void;
};

function senderId(m: MessengerMessageRow): string {
  const s = m.sender;
  if (typeof s === "string") return s;
  return String(s?._id ?? "");
}

function messageText(m: MessengerMessageRow): string {
  return String(m.content ?? m.text ?? "").trim();
}

export function MessagesScreen({ currentUserId, onRequestVideoCall, onRequestVoiceCall }: MessagesScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<MessengerConversation[]>([]);
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [messages, setMessages] = useState<MessengerMessageRow[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<User[]>([]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await messengerAPI.getConversations();
      const list = res.data?.conversations;
      setConversations(Array.isArray(list) ? list : []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const loadThreadMessages = useCallback(async (t: ThreadState) => {
    setMsgLoading(true);
    try {
      if (t.kind === "direct") {
        const res = await messengerAPI.getDirectMessages(t.otherUserId);
        const list = res.data?.messages;
        setMessages(Array.isArray(list) ? list : []);
      } else if (t.taskId) {
        const res = await messengerAPI.getTaskMessages(t.taskId);
        const list = res.data?.messages;
        setMessages(Array.isArray(list) ? list : []);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (thread) void loadThreadMessages(thread);
  }, [thread, loadThreadMessages]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadConversations();
  };

  const openConversation = (c: MessengerConversation) => {
    const kind = c.kind === "task" ? "task" : "direct";
    const otherId = c.user?._id;
    if (!otherId) return;
    setThread({
      kind,
      otherUserId: String(otherId),
      taskId: c.taskId ?? undefined,
      title: c.taskTitle || c.user?.name || "Chat",
    });
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !thread || sending) return;
    setSending(true);
    try {
      if (thread.kind === "direct") {
        await messengerAPI.sendDirect(thread.otherUserId, text);
      } else if (thread.taskId) {
        await messengerAPI.sendTaskMessage(thread.taskId, text);
      }
      setDraft("");
      await loadThreadMessages(thread);
      void loadConversations();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      Alert.alert("Could not send", err?.response?.data?.message || "Try again.");
    } finally {
      setSending(false);
    }
  };

  const runSearch = useCallback(async (rawQ: string) => {
    const q = rawQ.trim();
    if (q.length < 1) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await messengerAPI.searchUsers(q);
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      const lower = q.toLowerCase();
      const startsWith = list.filter((u) => {
        const name = String(u.name || "").toLowerCase();
        const username = String(u.username || "").toLowerCase();
        const email = String(u.email || "").toLowerCase();
        return name.startsWith(lower) || username.startsWith(lower) || email.startsWith(lower);
      });
      setSearchHits(startsWith);
    } catch {
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const q = searchQ.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    const id = setTimeout(() => {
      void runSearch(q);
    }, 220);
    return () => clearTimeout(id);
  }, [searchQ, runSearch]);

  const openUserAsDirect = (u: User) => {
    const id = String(u._id ?? u.id ?? "");
    if (!id) return;
    setSearchHits([]);
    setSearchQ("");
    setThread({
      kind: "direct",
      otherUserId: id,
      title: u.name || "Chat",
    });
  };

  const videoFromThread = () => {
    if (!thread) return;
    const room = directCallRoomId(currentUserId, thread.otherUserId);
    onRequestVideoCall(thread.otherUserId, room);
  };

  const voiceFromThread = () => {
    if (!thread) return;
    const room = directCallRoomId(currentUserId, thread.otherUserId);
    onRequestVoiceCall?.(thread.otherUserId, room);
  };

  if (thread) {
    return (
      <View style={styles.threadWrap}>
        <View style={styles.threadHeader}>
          <Pressable onPress={() => setThread(null)} style={styles.backPill}>
            <Text style={styles.backPillText}>← Back</Text>
          </Pressable>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {thread.title}
          </Text>
          <Pressable onPress={voiceFromThread} style={styles.voicePill}>
            <Text style={styles.voicePillText}>Voice</Text>
          </Pressable>
          <Pressable onPress={videoFromThread} style={styles.videoPill}>
            <Text style={styles.videoPillText}>Video</Text>
          </Pressable>
        </View>
        {msgLoading ? (
          <ActivityIndicator color="#93c5fd" style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => String(m._id)}
            contentContainerStyle={styles.msgList}
            renderItem={({ item }) => {
              const mine = senderId(item) === currentUserId;
              const body = messageText(item);
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={styles.bubbleText}>{body}</Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyThread}>No messages yet. Say hello.</Text>}
          />
        )}
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor="#64748b"
            style={styles.input}
            multiline
          />
          <Pressable onPress={sendMessage} style={styles.sendBtn} disabled={sending || !draft.trim()}>
            <Text style={styles.sendBtnText}>{sending ? "…" : "Send"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Qwertymates Chat</Text>
        <Text style={styles.heroSub}>Talk to buyers, sellers, and support</Text>
      </View>
      <Text style={styles.sectionLabel}>Find someone</Text>
      <View style={styles.searchRow}>
        <TextInput
          value={searchQ}
          onChangeText={setSearchQ}
          placeholder="Name, username, or email"
          placeholderTextColor="#64748b"
          style={styles.searchInput}
          autoCapitalize="none"
          onSubmitEditing={() => void runSearch(searchQ)}
        />
        <Pressable onPress={() => void runSearch(searchQ)} style={styles.searchBtn} disabled={searching}>
          <Text style={styles.searchBtnText}>{searching ? "…" : "Search"}</Text>
        </Pressable>
      </View>
      {searchHits.length > 0 ? (
        <FlatList
          style={styles.searchList}
          data={searchHits}
          keyExtractor={(u) => String(u._id ?? u.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => openUserAsDirect(item)} style={styles.searchHit}>
              <Text style={styles.searchHitName}>{item.name}</Text>
              {item.username ? <Text style={styles.searchHitMeta}>@{item.username}</Text> : null}
            </Pressable>
          )}
        />
      ) : null}

      <Text style={styles.sectionLabel}>Conversations</Text>
      {loading ? (
        <ActivityIndicator color="#93c5fd" style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => String(c._id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#93c5fd" />}
          ListEmptyComponent={<Text style={styles.empty}>No conversations yet. Search for a user above.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => openConversation(item)} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.user?.name ?? "User"}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.kind === "task" ? (item.taskTitle ?? "Task") : "Direct"} ·{" "}
                  {item.lastMessage ?? "—"}
                </Text>
              </View>
              {item.unread ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unread > 99 ? "99+" : item.unread}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 8, backgroundColor: "#eef3f9" },
  hero: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  heroTitle: { color: "#1d4ed8", fontWeight: "800", fontSize: 18 },
  heroSub: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  sectionLabel: { color: "#64748b", fontSize: 12, fontWeight: "600", marginTop: 4 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    backgroundColor: "#ffffff",
    fontSize: 14,
  },
  searchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1d4ed8",
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchList: { maxHeight: 160, marginBottom: 8 },
  searchHit: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 6,
  },
  searchHitName: { color: "#0f172a", fontWeight: "600" },
  searchHitMeta: { color: "#64748b", fontSize: 12 },
  empty: { color: "#64748b", marginTop: 12, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#dbe4f0",
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#0f172a", fontWeight: "600", fontSize: 15 },
  rowSub: { color: "#64748b", fontSize: 12, marginTop: 2 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#1d4ed8",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  threadWrap: { flex: 1 },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  backPill: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backPillText: { color: "#1d4ed8", fontWeight: "600" },
  threadTitle: { flex: 1, color: "#0f172a", fontWeight: "700", fontSize: 16 },
  videoPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
  },
  videoPillText: { color: "#166534", fontWeight: "800", fontSize: 12 },
  voicePill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe"
  },
  voicePillText: { color: "#1d4ed8", fontWeight: "800", fontSize: 12 },
  msgList: { paddingBottom: 12, gap: 8 },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#dbeafe" },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: "#ffffff" },
  bubbleText: { color: "#0f172a", fontSize: 14 },
  emptyThread: { color: "#64748b", textAlign: "center", marginTop: 24 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#dbe4f0",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  sendBtnText: { color: "#fff", fontWeight: "800" },
});
