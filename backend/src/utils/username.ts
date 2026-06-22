import User from "../data/models/User";

export function normalizeUsername(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);
}

function randomSuffix(): string {
  return Math.floor(10 + Math.random() * 989).toString();
}

export async function buildUsernameSuggestions(rawInput: string, limit = 5): Promise<string[]> {
  const normalized = normalizeUsername(rawInput);
  const base = normalized || "user";
  const candidates: string[] = [];
  const pushCandidate = (value: string) => {
    const v = normalizeUsername(value);
    if (v.length < 2) return;
    if (!candidates.includes(v)) candidates.push(v);
  };

  pushCandidate(base);
  for (let i = 1; i <= 8; i += 1) pushCandidate(`${base}${i}`);
  pushCandidate(`${base}_${new Date().getFullYear()}`);
  pushCandidate(`${base}${randomSuffix()}`);
  pushCandidate(`${base}_${randomSuffix()}`);

  const existing = await User.find({ username: { $in: candidates } }).select("username").lean();
  const taken = new Set(existing.map((u: any) => String(u.username || "").trim().toLowerCase()));
  const available = candidates.filter((c) => !taken.has(c));
  return available.slice(0, Math.max(1, Math.min(10, limit)));
}
