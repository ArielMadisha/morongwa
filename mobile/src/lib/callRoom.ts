/** Canonical 1:1 Morongwa / WebRTC room id (must match web `directCallRoomId`). */
export function directCallRoomId(userIdA: string, userIdB: string): string {
  const [a, b] = [String(userIdA), String(userIdB)].sort();
  return `direct-${a}-${b}`;
}

/** Shared room for group voice/video (participants join by id, sorted for stability). */
export function groupCallRoomId(hostUserId: string, participantIds: string[]): string {
  const all = [String(hostUserId), ...participantIds.map(String)].filter(Boolean).sort();
  const slug = all.join("-").slice(0, 120);
  return `group-${slug}`;
}
