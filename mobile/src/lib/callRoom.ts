/** Stable WebRTC room id for a 1:1 call between two user ids (order-independent). */
export function directCallRoomId(userIdA: string, userIdB: string): string {
  const [a, b] = [String(userIdA), String(userIdB)].sort();
  return `morongwa-dm-${a}-${b}`;
}
