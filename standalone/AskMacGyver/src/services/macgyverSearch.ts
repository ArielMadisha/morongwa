/**
 * MacGyver platform search – finds mentions of a topic across Qwertymates
 * Used when answering general questions: "George Bush" → also show if any user/post mentioned it
 *
 * Performance:
 * - FAQ is checked in macgyverService before DB (see macgyverKnowledge + macgyverService).
 * - Quick scan: limit 1 per collection to decide if unified search UI should open (cheap).
 * - Full scan: only when quick scan finds nothing and we may call OpenAI (needs mention context).
 * - Approved supplier IDs are cached briefly.
 */

import TVPost from "../data/models/TVPost";
import Product from "../data/models/Product";
import User from "../data/models/User";
import Song from "../data/models/Song";
import Supplier from "../data/models/Supplier";

const MAX_TV = 5;
const MAX_PRODUCTS = 3;
const MAX_USERS = 3;
const MAX_SONGS = 3;

const MIN_SEARCH_LEN = 1;

const SUPPLIER_IDS_TTL_MS = 120_000;
let supplierIdsCache: { ids: unknown[]; expires: number } | null = null;

async function getApprovedSupplierIds(): Promise<unknown[]> {
  const now = Date.now();
  if (supplierIdsCache && supplierIdsCache.expires > now) {
    return supplierIdsCache.ids;
  }
  const docs = await Supplier.find({ status: "approved" })
    .select("_id")
    .lean();
  const ids = docs.map((d: any) => d._id);
  supplierIdsCache = { ids, expires: now + SUPPLIER_IDS_TTL_MS };
  return ids;
}

export type MacGyverPlatformBundle = {
  hasResults: boolean;
  /** Non-empty when OpenAI may run and there are on-platform mentions (query length ≥ 2) */
  contextForLlm: string;
};

type TvHit = {
  caption?: string;
  heading?: string;
  subject?: string;
  creatorName?: string;
  creatorUsername?: string;
};

async function runSearchParallel(
  regex: RegExp,
  lim: { tv: number; prod: number; usr: number; sng: number }
): Promise<[TvHit[], Array<{ title: string }>, Array<{ name: string; username?: string }>, Array<{ title: string; artist: string }>]> {
  return Promise.all([
    searchTVPosts(regex, lim.tv),
    searchProducts(regex, lim.prod),
    searchUsers(regex, lim.usr),
    searchSongs(regex, lim.sng),
  ]);
}

function anyHits(
  tv: TvHit[],
  products: Array<{ title: string }>,
  users: Array<{ name: string; username?: string }>,
  songs: Array<{ title: string; artist: string }>
): boolean {
  return tv.length > 0 || products.length > 0 || users.length > 0 || songs.length > 0;
}

function buildLlmContext(
  tvPosts: TvHit[],
  products: Array<{ title: string }>,
  users: Array<{ name: string; username?: string }>,
  songs: Array<{ title: string; artist: string }>
): string {
  const parts: string[] = [];

  if (tvPosts.length > 0) {
    parts.push(
      "QwertyTV posts mentioning this: " +
        tvPosts
          .map(
            (p) =>
              `@${p.creatorUsername || p.creatorName || "user"} wrote: "${(p.caption || p.heading || p.subject || "").slice(0, 120)}${(p.caption || "").length > 120 ? "..." : ""}"`
          )
          .join("; ")
    );
  }
  if (products.length > 0) {
    parts.push("Products: " + products.map((p) => `"${p.title}"`).join(", "));
  }
  if (users.length > 0) {
    parts.push("Users: " + users.map((u) => `@${u.username || u.name} (${u.name})`).join(", "));
  }
  if (songs.length > 0) {
    parts.push("Music: " + songs.map((s) => `"${s.title}" by ${s.artist}`).join(", "));
  }

  if (parts.length === 0) return "";

  return (
    "Mentions on Qwertymates:\n" +
    parts.join("\n") +
    "\n\nIf relevant, you may mention that this topic was also discussed or mentioned on Qwertymates by the above."
  );
}

/**
 * Quick DB scan (limit 1 per collection), then full scan only if no hits and query is long enough for LLM context.
 */
export async function searchPlatformMacGyverBundle(query: string): Promise<MacGyverPlatformBundle> {
  const q = (query || "").trim();
  if (!q || q.length < MIN_SEARCH_LEN) {
    return { hasResults: false, contextForLlm: "" };
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  const quickLim = { tv: 1, prod: 1, usr: 1, sng: 1 };
  const [tvQ, prodQ, usrQ, sngQ] = await runSearchParallel(regex, quickLim);

  if (anyHits(tvQ, prodQ, usrQ, sngQ)) {
    return { hasResults: true, contextForLlm: "" };
  }

  if (q.length < 2) {
    return { hasResults: false, contextForLlm: "" };
  }

  const fullLim = { tv: MAX_TV, prod: MAX_PRODUCTS, usr: MAX_USERS, sng: MAX_SONGS };
  const [tv, products, users, songs] = await runSearchParallel(regex, fullLim);

  return {
    hasResults: false,
    contextForLlm: buildLlmContext(tv, products, users, songs),
  };
}

/** @deprecated Prefer searchPlatformMacGyverBundle */
export async function searchPlatformHasResults(query: string): Promise<boolean> {
  const { hasResults } = await searchPlatformMacGyverBundle(query);
  return hasResults;
}

/** @deprecated Prefer searchPlatformMacGyverBundle */
export async function searchPlatformForContext(query: string): Promise<string> {
  const { contextForLlm } = await searchPlatformMacGyverBundle(query);
  return contextForLlm;
}

async function searchTVPosts(regex: RegExp, limit: number): Promise<TvHit[]> {
  const posts = await TVPost.find({
    status: "approved",
    $or: [
      { caption: regex },
      { heading: regex },
      { subject: regex },
      { hashtags: regex },
    ],
  })
    .populate("creatorId", "name username")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return posts.map((p: any) => ({
    caption: p.caption,
    heading: p.heading,
    subject: p.subject,
    creatorName: p.creatorId?.name,
    creatorUsername: p.creatorId?.username,
  }));
}

async function searchProducts(
  regex: RegExp,
  limit: number
): Promise<Array<{ title: string }>> {
  const approvedSupplierIds = await getApprovedSupplierIds();
  if (approvedSupplierIds.length === 0) return [];

  const products = await Product.find({
    supplierId: { $in: approvedSupplierIds },
    active: true,
    $or: [
      { title: regex },
      { description: regex },
      { categories: { $in: [regex] } },
      { tags: { $in: [regex] } },
    ],
  })
    .select("title")
    .limit(limit)
    .lean();

  return products;
}

async function searchUsers(
  regex: RegExp,
  limit: number
): Promise<Array<{ name: string; username?: string }>> {
  const users = await User.find({
    active: true,
    suspended: { $ne: true },
    $or: [{ name: regex }, { username: regex }],
  })
    .select("name username")
    .limit(limit)
    .lean();

  return users;
}

async function searchSongs(
  regex: RegExp,
  limit: number
): Promise<Array<{ title: string; artist: string }>> {
  const songs = await Song.find({
    $or: [{ title: regex }, { artist: regex }, { lyrics: regex }, { genre: regex }],
  })
    .select("title artist")
    .limit(limit)
    .lean();

  return songs;
}
