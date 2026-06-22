/** Normalize Mongo/user ids for Socket.IO presence rooms (`user-<id>`). */
export function normalizeWebrtcUserId(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "object" && raw !== null && "_id" in raw) {
    return normalizeWebrtcUserId((raw as { _id?: unknown })._id);
  }
  return String(raw).trim();
}

export function userPresenceRoom(userId: unknown): string {
  const id = normalizeWebrtcUserId(userId);
  return id ? `user-${id}` : "";
}
