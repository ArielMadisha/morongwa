import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "qwertymates.mobile.callHistory.v1";
const MAX_ROWS = 60;

export type AppCallHistoryRow = {
  id: string;
  kind: "voice" | "video";
  peerUserId: string;
  peerName: string;
  roomId?: string;
  startedAt: string;
};

/**
 * Local log of in-app WebRTC calls placed from this device.
 *
 * PSTN calls already have a server log (`GET /voice/history`); peer-to-peer WebRTC
 * calls do not, so Voice/Video call history is kept on-device.
 */
export async function loadAppCallHistory(kind?: "voice" | "video"): Promise<AppCallHistoryRow[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const rows = Array.isArray(parsed) ? (parsed as AppCallHistoryRow[]) : [];
    const clean = rows.filter((r) => r && typeof r.id === "string" && (r.kind === "voice" || r.kind === "video"));
    return kind ? clean.filter((r) => r.kind === kind) : clean;
  } catch {
    return [];
  }
}

export async function recordAppCall(row: Omit<AppCallHistoryRow, "id" | "startedAt">): Promise<void> {
  try {
    const existing = await loadAppCallHistory();
    const next: AppCallHistoryRow[] = [
      { ...row, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, startedAt: new Date().toISOString() },
      ...existing,
    ].slice(0, MAX_ROWS);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Call history is best-effort; never block placing a call.
  }
}
