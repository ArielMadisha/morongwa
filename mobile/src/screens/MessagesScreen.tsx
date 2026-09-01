import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { messengerAPI, voiceAPI, type VoiceCallHistoryRow } from "../lib/api";
import { MorongwaPstnCallFab } from "../components/MorongwaPstnCallFab";
import { directCallRoomId } from "../lib/callRoom";
import { loadAppCallHistory, recordAppCall, type AppCallHistoryRow } from "../lib/callHistoryStore";
import { useScrollAwareScrollHandlers } from "../components/ScrollAwareChrome";
import type { MessengerConversation, MessengerMessageRow, User } from "../types";

/** Web parity: Morongwa left panel is Chat / Voice Call / Video Call. */
type MessagesMode = "chat" | "voice" | "video";

const MODE_TABS: Array<{ id: MessagesMode; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "voice", label: "Voice Call" },
  { id: "video", label: "Video Call" },
];

function formatDestination(digits: string): string {
  const d = String(digits || "").replace(/\D/g, "");
  return d ? `+${d}` : "Unknown";
}

function voiceStatusLabel(status: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "in-progress") return "In progress";
  if (s === "ringing" || s === "queued") return "Ringing";
  if (s === "no-answer") return "No answer";
  if (s === "canceled" || s === "cancelled") return "Canceled";
  if (s === "busy") return "Busy";
  if (s === "failed") return "Failed";
  return status || "Unknown";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

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
  /** Open a direct thread immediately (e.g. from Ask MacGyver user results). */
  initialDirectUserId?: string | null;
  initialDirectUserName?: string;
  onConsumedInitialDirect?: () => void;
};

function senderId(m: MessengerMessageRow): string {
  const s = m.sender;
  if (typeof s === "string") return s;
  return String(s?._id ?? "");
}

function messageText(m: MessengerMessageRow): string {
  return String(m.content ?? m.text ?? "").trim();
}

export function MessagesScreen({
  currentUserId,
  onRequestVideoCall,
  onRequestVoiceCall,
  initialDirectUserId,
  initialDirectUserName,
  onConsumedInitialDirect,
}: MessagesScreenProps) {
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

  const [mode, setMode] = useState<MessagesMode>("chat");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [pstnCalls, setPstnCalls] = useState<VoiceCallHistoryRow[]>([]);
  const [appCalls, setAppCalls] = useState<AppCallHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const chromeScroll = useScrollAwareScrollHandlers();

  const loadCallHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [local, remote] = await Promise.all([
        loadAppCallHistory(),
        voiceAPI.getHistory(40).catch(() => ({ data: { calls: [] as VoiceCallHistoryRow[] } })),
      ]);
      setAppCalls(local);
      const rows = remote.data?.calls;
      setPstnCalls(Array.isArray(rows) ? rows : []);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "voice" || mode === "video") void loadCallHistory();
  }, [mode, loadCallHistory]);

  const loadConversations = useCallback(async (opts?: { soft?: boolean }) => {
    try {
      const res = await messengerAPI.getConversations();
      const list = res.data?.conversations;
      setConversations(Array.isArray(list) ? list : []);
    } catch {
      if (!opts?.soft) setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const id = String(initialDirectUserId || "").trim();
    if (!id) return;
    setThread({
      kind: "direct",
      otherUserId: id,
      title: initialDirectUserName?.trim() || "Chat",
    });
    onConsumedInitialDirect?.();
  }, [initialDirectUserId, initialDirectUserName, onConsumedInitialDirect]);

  // Lightweight live refresh while Messages is mounted + when app becomes active.
  useEffect(() => {
    const tick = () => void loadConversations({ soft: true });
    const id = setInterval(tick, 15_000);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
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
        void messengerAPI.markAsRead(t.taskId).catch(() => {});
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
    const taskId = c.taskId ?? undefined;
    setThread({
      kind,
      otherUserId: String(otherId),
      taskId,
      title: c.taskTitle || c.user?.name || "Chat",
    });
    if (kind === "task" && taskId) {
      void messengerAPI.markAsRead(taskId).catch(() => {});
    }
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
      void loadConversations({ soft: true });
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
      // Server already filters; show matches as-is. Light client includes fallback if needed.
      if (list.length > 0) {
        setSearchHits(list);
      } else {
        setSearchHits([]);
      }
    } catch {
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const q = searchQ.trim();
    if (!q || !peopleOpen) {
      setSearchHits([]);
      return;
    }
    const id = setTimeout(() => {
      void runSearch(q);
    }, 220);
    return () => clearTimeout(id);
  }, [searchQ, peopleOpen, runSearch]);

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

  /** Places a real WebRTC call through the shell's call signaling and logs it locally. */
  const startCallWithPeer = useCallback(
    (peerUserId: string, peerName: string, kind: "voice" | "video") => {
      const id = String(peerUserId || "").trim();
      if (!id) return;
      const room = directCallRoomId(currentUserId, id);
      void recordAppCall({ kind, peerUserId: id, peerName: peerName || "Qwertymates user", roomId: room }).then(() =>
        loadAppCallHistory().then(setAppCalls)
      );
      if (kind === "video") onRequestVideoCall(id, room);
      else if (onRequestVoiceCall) onRequestVoiceCall(id, room);
      else onRequestVideoCall(id, room);
    },
    [currentUserId, onRequestVideoCall, onRequestVoiceCall]
  );

  const videoFromThread = () => {
    if (!thread) return;
    startCallWithPeer(thread.otherUserId, thread.title, "video");
  };

  const voiceFromThread = () => {
    if (!thread) return;
    startCallWithPeer(thread.otherUserId, thread.title, "voice");
  };

  if (thread) {
    return (
      <View style={styles.screenWrap}>
        <View style={styles.threadWrap}>
        <View style={styles.threadHeader}>
          <Pressable onPress={() => setThread(null)} hitSlop={12}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {thread.title}
          </Text>
          <View style={styles.callRow}>
            {onRequestVoiceCall ? (
              <Pressable onPress={voiceFromThread} style={styles.callBtn}>
                <Text style={styles.callBtnText}>Voice</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={videoFromThread} style={[styles.callBtn, styles.callBtnPrimary]}>
              <Text style={styles.callBtnTextPrimary}>Video</Text>
            </Pressable>
          </View>
        </View>

        {msgLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color="#0ea5e9" />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m._id}
            contentContainerStyle={styles.msgList}
            renderItem={({ item }) => {
              const mine = senderId(item) === String(currentUserId);
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {messageText(item) || " "}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello.</Text>}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={() => void sendMessage()}
            disabled={sending || !draft.trim()}
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
          >
            <Text style={styles.sendBtnText}>{sending ? "…" : "Send"}</Text>
          </Pressable>
        </View>
        </View>
        <MorongwaPstnCallFab />
      </View>
    );
  }

  const pickPerson = (u: User) => {
    if (mode === "chat") {
      openUserAsDirect(u);
      return;
    }
    const id = String(u._id ?? u.id ?? "");
    setSearchHits([]);
    setSearchQ("");
    setPeopleOpen(false);
    startCallWithPeer(id, u.name || "Qwertymates user", mode === "video" ? "video" : "voice");
  };

  const convQuery = peopleOpen ? "" : searchQ.trim().toLowerCase();
  const visibleConversations = conversations
    .filter((c) => (unreadOnly ? Number(c.unread || 0) > 0 : true))
    .filter((c) => {
      if (!convQuery) return true;
      const haystack = `${c.taskTitle || ""} ${c.user?.name || ""} ${c.lastMessage || ""}`.toLowerCase();
      return haystack.includes(convQuery);
    });

  const historyRows: Array<
    | { key: string; kind: "app"; row: AppCallHistoryRow }
    | { key: string; kind: "pstn"; row: VoiceCallHistoryRow }
  > = [
    ...appCalls
      .filter((r) => (mode === "video" ? r.kind === "video" : r.kind === "voice"))
      .map((row) => ({ key: `app-${row.id}`, kind: "app" as const, row })),
    // PSTN calls are audio only — never listed under Video call history.
    ...(mode === "voice"
      ? pstnCalls.map((row) => ({ key: `pstn-${row._id}`, kind: "pstn" as const, row }))
      : []),
  ].sort((a, b) => {
    const at = a.kind === "app" ? a.row.startedAt : a.row.createdAt;
    const bt = b.kind === "app" ? b.row.startedAt : b.row.createdAt;
    return new Date(bt).getTime() - new Date(at).getTime();
  });

  const modeTabs = (
    <View style={styles.segment}>
      {MODE_TABS.map((t) => {
        const active = mode === t.id;
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              setMode(t.id);
              setPeopleOpen(t.id !== "chat");
              setSearchQ("");
              setSearchHits([]);
            }}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.label}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const peopleIcon = (
    <Pressable
      onPress={() => setPeopleOpen((v) => !v)}
      style={[styles.iconBtn, peopleOpen && styles.iconBtnActive]}
      accessibilityRole="button"
      accessibilityLabel="Find people"
    >
      <Ionicons name="people-outline" size={20} color={peopleOpen ? "#fff" : "#0369a1"} />
    </Pressable>
  );

  if (mode !== "chat") {
    const isVideo = mode === "video";
    return (
      <View style={styles.screenWrap}>
        <View style={styles.listWrap}>
          {modeTabs}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                setPeopleOpen(true);
                setUnreadOnly(false);
              }}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={isVideo ? "New video call" : "New call"}
            >
              <Ionicons name={isVideo ? "videocam-outline" : "call-outline"} size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{isVideo ? "New Video Call" : "New Call"}</Text>
            </Pressable>
            <Pressable
              onPress={() => void loadCallHistory()}
              style={styles.actionBtnGhost}
              accessibilityRole="button"
              accessibilityLabel={isVideo ? "Refresh video call history" : "Refresh call history"}
            >
              <Ionicons name="time-outline" size={16} color="#0369a1" />
              <Text style={styles.actionBtnGhostText}>{isVideo ? "Video Call History" : "Call History"}</Text>
            </Pressable>
            {isVideo ? null : peopleIcon}
          </View>

          {peopleOpen ? (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  value={searchQ}
                  onChangeText={setSearchQ}
                  placeholder="Find people…"
                  placeholderTextColor="#94a3b8"
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
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
                    <Pressable onPress={() => pickPerson(item)} style={styles.searchHit}>
                      <Text style={styles.searchHitName}>{item.name}</Text>
                      <Text style={styles.searchHitMeta}>
                        {item.username ? `@${item.username} · ` : ""}
                        {isVideo ? "Tap to start video call" : "Tap to start voice call"}
                      </Text>
                    </Pressable>
                  )}
                />
              ) : null}
            </>
          ) : null}

          {historyLoading && historyRows.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 32 }} color="#0ea5e9" />
          ) : (
            <FlatList
              data={historyRows}
              keyExtractor={(r) => r.key}
              scrollEventThrottle={chromeScroll.scrollEventThrottle}
              onScroll={chromeScroll.onScroll}
              onContentSizeChange={chromeScroll.onContentSizeChange}
              onLayout={chromeScroll.onLayout}
              refreshControl={
                <RefreshControl
                  refreshing={historyLoading}
                  onRefresh={() => void loadCallHistory()}
                  tintColor="#0ea5e9"
                />
              }
              contentContainerStyle={historyRows.length === 0 ? styles.emptyPad : undefined}
              renderItem={({ item }) => {
                if (item.kind === "app") {
                  return (
                    <Pressable
                      onPress={() => startCallWithPeer(item.row.peerUserId, item.row.peerName, item.row.kind)}
                      style={styles.row}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${item.row.peerName} again`}
                    >
                      <Ionicons
                        name={item.row.kind === "video" ? "videocam-outline" : "call-outline"}
                        size={20}
                        color="#0369a1"
                        style={styles.rowIcon}
                      />
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {item.row.peerName}
                        </Text>
                        <Text style={styles.rowPreview}>
                          {item.row.kind === "video" ? "Video call" : "Voice call"} · {formatWhen(item.row.startedAt)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }
                const dest = formatDestination(item.row.destinationPhone);
                const mins = Number(item.row.durationSec || 0);
                return (
                  <View style={styles.row}>
                    <Ionicons name="call-outline" size={20} color="#4f46e5" style={styles.rowIcon} />
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {dest}
                      </Text>
                      <Text style={styles.rowPreview}>
                        {formatWhen(item.row.createdAt)} · {voiceStatusLabel(item.row.status)}
                        {mins > 0 ? ` · ${Math.ceil(mins / 60)} min` : ""}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {isVideo
                    ? "No video calls yet. Tap New Video Call and pick someone."
                    : "No calls yet. Tap New Call to reach a mate, or Call phone to dial a number."}
                </Text>
              }
            />
          )}
        </View>
        <MorongwaPstnCallFab />
      </View>
    );
  }

  return (
    <View style={styles.screenWrap}>
      <View style={styles.listWrap}>
      {modeTabs}
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => {
            setPeopleOpen(true);
            setUnreadOnly(false);
          }}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="New chat"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>New Chat</Text>
        </Pressable>
        <Pressable
          onPress={() => setUnreadOnly((v) => !v)}
          style={[styles.actionBtnGhost, unreadOnly && styles.actionBtnGhostActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: unreadOnly }}
          accessibilityLabel="Show unread conversations only"
        >
          <Ionicons name="mail-unread-outline" size={16} color={unreadOnly ? "#fff" : "#0369a1"} />
          <Text style={[styles.actionBtnGhostText, unreadOnly && styles.actionBtnGhostTextActive]}>Unread</Text>
        </Pressable>
        {peopleIcon}
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={searchQ}
          onChangeText={setSearchQ}
          placeholder={peopleOpen ? "Find people…" : "Search conversations…"}
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => peopleOpen && void runSearch(searchQ)}
        />
        <Pressable
          onPress={() => (peopleOpen ? void runSearch(searchQ) : setPeopleOpen(true))}
          style={styles.searchBtn}
          disabled={searching}
        >
          <Text style={styles.searchBtnText}>{searching ? "…" : "Search"}</Text>
        </Pressable>
      </View>
      {peopleOpen && searchHits.length > 0 ? (
        <FlatList
          style={styles.searchList}
          data={searchHits}
          keyExtractor={(u) => String(u._id ?? u.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => pickPerson(item)} style={styles.searchHit}>
              <Text style={styles.searchHitName}>{item.name}</Text>
              {item.username ? <Text style={styles.searchHitMeta}>@{item.username}</Text> : null}
            </Pressable>
          )}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#0ea5e9" />
      ) : (
        <FlatList
          data={visibleConversations}
          keyExtractor={(c, i) => `${c.kind}-${c.taskId || c.user?._id || i}`}
          scrollEventThrottle={chromeScroll.scrollEventThrottle}
          onScroll={chromeScroll.onScroll}
          onContentSizeChange={chromeScroll.onContentSizeChange}
          onLayout={chromeScroll.onLayout}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
          contentContainerStyle={visibleConversations.length === 0 ? styles.emptyPad : undefined}
          renderItem={({ item }) => (
            <Pressable onPress={() => openConversation(item)} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.taskTitle || item.user?.name || "Chat"}
                </Text>
                {item.lastMessage ? (
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                ) : null}
              </View>
              {item.unread && item.unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread > 99 ? "99+" : item.unread}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {unreadOnly
                ? "No unread conversations."
                : convQuery
                  ? "No conversations match that search."
                  : "No conversations yet. Tap New Chat to find someone."}
            </Text>
          }
        />
      )}
      </View>
      <MorongwaPstnCallFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: "#f8fafc" },
  listWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  threadWrap: { flex: 1 },
  heading: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  segment: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    padding: 3,
    marginBottom: 8,
  },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  segmentBtnActive: { backgroundColor: "#fff" },
  segmentText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  segmentTextActive: { color: "#0369a1" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  actionBtnGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionBtnGhostActive: { backgroundColor: "#0369a1" },
  actionBtnGhostText: { color: "#0369a1", fontWeight: "700", fontSize: 13 },
  actionBtnGhostTextActive: { color: "#fff" },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0f2fe",
  },
  iconBtnActive: { backgroundColor: "#0369a1" },
  rowIcon: { marginRight: 10 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
  },
  searchBtn: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchList: { maxHeight: 160, marginBottom: 8 },
  searchHit: {
    backgroundColor: "#fff",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  searchHitName: { color: "#0f172a", fontWeight: "600" },
  searchHitMeta: { color: "#64748b", fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontWeight: "700", color: "#0f172a", fontSize: 16 },
  rowPreview: { color: "#64748b", marginTop: 4, fontSize: 13 },
  badge: {
    backgroundColor: "#0ea5e9",
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  empty: { color: "#64748b", textAlign: "center", marginTop: 24 },
  emptyPad: { flexGrow: 1 },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  back: { color: "#0ea5e9", fontWeight: "700", width: 56 },
  threadTitle: { flex: 1, fontWeight: "700", color: "#0f172a", fontSize: 16 },
  callRow: { flexDirection: "row", gap: 6 },
  callBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#e0f2fe",
  },
  callBtnPrimary: { backgroundColor: "#0ea5e9" },
  callBtnText: { color: "#0369a1", fontWeight: "700", fontSize: 12 },
  callBtnTextPrimary: { color: "#fff", fontWeight: "700", fontSize: 12 },
  msgList: { padding: 12, paddingBottom: 24 },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    marginBottom: 8,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#0ea5e9" },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: "#e2e8f0" },
  bubbleText: { color: "#0f172a", fontSize: 15 },
  bubbleTextMine: { color: "#fff" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
  },
  sendBtn: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: { color: "#fff", fontWeight: "800" },
});
