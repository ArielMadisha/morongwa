/**
 * MacGyver platform search – finds mentions of a topic across Qwertymates
 * Used when answering general questions: "George Bush" → also show if any user/post mentioned it
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

/** Minimum query length for search (1 char for users, 2 for products/TV/songs) */
const MIN_SEARCH_LEN = 1;

/**
 * Check if platform has any results for the query. Used to decide: show search or fall back to AI.
 */
export async function searchPlatformHasResults(query: string): Promise<boolean> {
  const q = (query || "").trim();
  if (!q || q.length < MIN_SEARCH_LEN) return false;

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  const [tvPosts, products, users, songs] = await Promise.all([
    searchTVPosts(regex, 1),
    searchProducts(regex, 1),
    searchUsers(regex, 1),
    searchSongs(regex, 1),
  ]);

  return tvPosts.length > 0 || products.length > 0 || users.length > 0 || songs.length > 0;
}

/**
 * Search platform for mentions of the query. Returns a summary for LLM context.
 */
export async function searchPlatformForContext(query: string): Promise<string> {
  const q = (query || "").trim();
  if (!q || q.length < 2) return "";

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  const [tvPosts, products, users, songs] = await Promise.all([
    searchTVPosts(regex, MAX_TV),
    searchProducts(regex, MAX_PRODUCTS),
    searchUsers(regex, MAX_USERS),
    searchSongs(regex, MAX_SONGS),
  ]);

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
    parts.push(
      "Products: " + products.map((p) => `"${p.title}"`).join(", ")
    );
  }
  if (users.length > 0) {
    parts.push(
      "Users: " +
        users.map((u) => `@${u.username || u.name} (${u.name})`).join(", ")
    );
  }
  if (songs.length > 0) {
    parts.push(
      "Music: " +
        songs.map((s) => `"${s.title}" by ${s.artist}`).join(", ")
    );
  }

  if (parts.length === 0) return "";
  return (
    "Mentions on Qwertymates:\n" +
    parts.join("\n") +
    "\n\nIf relevant, you may mention that this topic was also discussed or mentioned on Qwertymates by the above."
  );
}

async function searchTVPosts(
  regex: RegExp,
  limit: number
): Promise<Array<{ caption?: string; heading?: string; subject?: string; creatorName?: string; creatorUsername?: string }>> {
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
  const approvedSupplierIds = await Supplier.find({ status: "approved" })
    .select("_id")
    .lean()
    .then((docs) => docs.map((d: any) => d._id));

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
    $or: [
      { title: regex },
      { artist: regex },
      { lyrics: regex },
      { genre: regex },
    ],
  })
    .select("title artist")
    .limit(limit)
    .lean();

  return songs;
}
