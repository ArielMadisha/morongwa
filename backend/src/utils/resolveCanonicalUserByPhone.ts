import User from "../data/models/User";

/**
 * Resolve the website/WhatsApp account for a phone when duplicates exist.
 * Prefers wa_<digits>@morongwa.local, then a user with username, then newest.
 */
export async function resolveCanonicalUserByPhoneDigits(phoneDigits: string) {
  const digits = String(phoneDigits || "").replace(/\D/g, "");
  if (!digits) return null;

  const waEmail = `wa_${digits}@morongwa.local`;
  const byWaEmail = await User.findOne({ email: waEmail });
  if (byWaEmail) return byWaEmail;

  const matches = await User.find({ phone: digits }).limit(10);
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];

  const ranked = [...matches].sort((a, b) => {
    const aUser = String((a as { username?: string }).username || "").trim() ? 1 : 0;
    const bUser = String((b as { username?: string }).username || "").trim() ? 1 : 0;
    if (aUser !== bUser) return bUser - aUser;
    const aT = new Date(
      (a as { updatedAt?: Date; createdAt?: Date }).updatedAt ||
        (a as { createdAt?: Date }).createdAt ||
        0
    ).getTime();
    const bT = new Date(
      (b as { updatedAt?: Date; createdAt?: Date }).updatedAt ||
        (b as { createdAt?: Date }).createdAt ||
        0
    ).getTime();
    return bT - aT;
  });
  return ranked[0] || null;
}
