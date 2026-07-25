import express, { Response } from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import multer from "multer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import TVPost from "../data/models/TVPost";
import TVComment from "../data/models/TVComment";
import ResellerWall from "../data/models/ResellerWall";
import TVInteraction from "../data/models/TVInteraction";
import TVReport from "../data/models/TVReport";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import Store from "../data/models/Store";
import User from "../data/models/User";
import Follow from "../data/models/Follow";
import Song from "../data/models/Song";
import MusicSoundUsage from "../data/models/MusicSoundUsage";
import { authenticate, authenticateOptional, AuthRequest } from "../middleware/auth";
import { tvUploadSingle, tvUploadMultiple, TV_UPLOAD_STORAGE_DIR } from "../middleware/tvUpload";
import { AppError } from "../middleware/errorHandler";
import { TV_WATERMARK } from "../data/models/TVPost";
import { moderationUploadBlockedReason, moderateMedia } from "../services/contentModeration";
import AuditLog from "../data/models/AuditLog";
import { logger } from "../services/monitoring";
import { mapProductsStripInrForApi, mapTvFeedStripInr, normalizeTvPostProductCurrencyInResponse } from "../utils/currencyPolicy";
import { buildPublicProductMatch, getApprovedSupplierIds } from "../services/publicProductListing";
import { enrichProductsWithStoreFields } from "../services/enrichProductStoreFields";
import { effectiveResellerMarkupPctFromWall } from "../config/marketplaceCategoryMarkups";
import {
  hashtagArrayTagRegex,
  hashtagPostMatchClause,
  normalizeTvHashtags,
  TV_HASHTAG_MIN_TRENDING_LEN,
} from "../utils/tvHashtags";
import { userPublicDisplayName } from "../utils/userDisplayLabel";
import {
  filterTvPostsWithAvailableMedia,
  pruneTvPostMedia,
  resolveUploadedTvFilePath,
  tvPostHasAvailableMedia,
} from "../services/tvMediaAvailability";
import {
  applySchoolProfileMediaToUser,
  resolveSchoolGalleryMediaUrl,
  resolveSchoolStatusThumbUrl,
} from "../utils/schoolProfileMedia";
import { resolveProfileBackfillMediaUrl } from "../utils/profileBackfillMedia";
import {
  STATUS_STRIP_TTL_MS,
  statusStripCacheKey,
  bumpStatusStripCache,
  sortStatusStripRowsNewestFirst,
} from "../services/statusStripPolicy";
import { clearTvFeedCache, tvFeedCacheGet, tvFeedCacheSet } from "../services/tvFeedCache";
import { isIncompleteAiNewsPost } from "../services/aiNewsQuality";
import { PROFILE_AVATAR_FEED_ACTIVITY } from "../services/profileAvatarFeed";

const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads");

const router = express.Router();
router.use((req, _res, next) => {
  if (req.method !== "GET") tvFeedCacheClear();
  next();
});

/** Always include username so wall/TV never falls back to generic labels like "Creator". */
const CREATOR_POPULATE_SELECT =
  "name username email avatar storeSlug isSchoolAccount profileGalleryUrls";

/** Cart stepper on wall/TV needs colors/sizes to avoid 400 when adding to cart. */
const TV_PRODUCT_POPULATE_SELECT =
  "title description price discountPrice images currency allowResell supplierId colors sizes outOfStock stock freeShippingEnabled freeShippingAreas bulkTiers";

const TV_PRODUCT_POPULATE = {
  path: "productId",
  select: TV_PRODUCT_POPULATE_SELECT,
  populate: { path: "supplierId", select: "userId storeName" },
};

function withCreatorDisplayName<T extends { name?: string; username?: string; email?: string }>(
  row: T
): T & { name: string; publicDisplayName: string } {
  const publicDisplayName = userPublicDisplayName(row);
  return { ...row, name: publicDisplayName, publicDisplayName };
}

function mapPopulatedCreatorDisplay(post: any): any {
  const c = post?.creatorId;
  if (!c || typeof c !== "object") return post;
  const schoolAware = applySchoolProfileMediaToUser(
    { ...c, _id: c._id } as Record<string, unknown>,
    UPLOADS_ROOT
  ) as Record<string, unknown>;
  const mediaFirst = Array.isArray(post.mediaUrls) ? String(post.mediaUrls[0] || "").trim() : "";
  if (
    post.feedActivity === PROFILE_AVATAR_FEED_ACTIVITY &&
    mediaFirst &&
    (!schoolAware.avatar || String(schoolAware.avatar) !== mediaFirst)
  ) {
    schoolAware.avatar = mediaFirst;
  }
  return {
    ...post,
    creatorId: withCreatorDisplayName({
      ...schoolAware,
      username: schoolAware.username as string | undefined,
      name: schoolAware.name as string | undefined,
      email: schoolAware.email as string | undefined,
    }),
  };
}

/** Remap school-gallery TV media to the creator's synced folder before availability checks. */
function enrichSchoolGalleryMediaOnFeedPosts(posts: any[]): any[] {
  return posts.map((post) => {
    const c = post?.creatorId;
    if (!c || typeof c !== "object") return post;
    const userRow = applySchoolProfileMediaToUser(
      { ...c, _id: c._id } as Record<string, unknown>,
      UPLOADS_ROOT
    ) as Record<string, unknown>;
    const mediaUrls = Array.isArray(post.mediaUrls) ? [...post.mediaUrls] : [];
    if (!mediaUrls.length) {
      return { ...post, creatorId: userRow };
    }
    // Never remap TV upload paths (video/audio) — resolveSchoolStatusThumbUrl falls back to avatar.
    const postType = String(post.type || "").trim();
    if (postType === "video" || postType === "audio") {
      return { ...post, creatorId: userRow };
    }
    const resolved = mediaUrls
      .map((url: unknown) => {
        const raw = String(url || "").trim();
        if (!raw) return raw;
        const schoolResolved = resolveSchoolGalleryMediaUrl(
          userRow as { _id?: unknown; avatar?: string; profileGalleryUrls?: string[] },
          raw,
          UPLOADS_ROOT
        );
        if (schoolResolved && schoolResolved !== raw) return schoolResolved;
        return resolveProfileBackfillMediaUrl(raw, UPLOADS_ROOT) || raw;
      })
      .filter(Boolean);
    return { ...post, creatorId: userRow, mediaUrls: resolved };
  });
}

function prepareFeedPostsForClient(posts: any[]): any[] {
  return enrichSchoolGalleryMediaOnFeedPosts(posts)
    .map((post) => pruneTvPostMedia(post, UPLOADS_ROOT))
    .filter((post): post is NonNullable<typeof post> => post != null);
}

const GALLERY_POST_ID_RE = /^gallery-([a-f0-9]{24})-(\d+)$/i;

/** Synthetic TV rows for school profile gallery when DB posts have missing local files. */
function schoolGalleryFeedPosts(creatorId: string, userRow: Record<string, unknown>): any[] {
  const gallery = Array.isArray(userRow.profileGalleryUrls)
    ? (userRow.profileGalleryUrls as string[]).map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  if (!gallery.length) return [];
  const creator = withCreatorDisplayName({
    ...userRow,
    _id: creatorId,
    username: userRow.username as string | undefined,
    name: userRow.name as string | undefined,
    email: userRow.email as string | undefined,
  });
  const counts = { likeCount: 0, commentCount: 0, shareCount: 0, viewCount: 0 };
  return gallery.map((url, idx) => ({
    _id: `gallery-${creatorId}-${idx}`,
    type: "image",
    mediaUrls: [url],
    creatorId: creator,
    status: "approved",
    ...counts,
    createdAt: new Date(),
  }));
}

/** Status/deep links: remap school gallery paths and fall back to profile gallery before 404. */
function resolveTvPostForClient(post: any): any | null {
  if (!post) return null;
  const [enriched] = enrichSchoolGalleryMediaOnFeedPosts([post]);
  const pruned = pruneTvPostMedia(enriched, UPLOADS_ROOT);
  if (pruned) {
    return { ...enriched, ...pruned };
  }
  const c = enriched?.creatorId;
  if (c && typeof c === "object") {
    const userRow = applySchoolProfileMediaToUser(
      { ...c, _id: (c as { _id?: unknown })._id ?? enriched.creatorId } as Record<string, unknown>,
      UPLOADS_ROOT
    );
    const gallery = Array.isArray(userRow.profileGalleryUrls)
      ? (userRow.profileGalleryUrls as string[]).filter(Boolean)
      : [];
    const thumb =
      resolveSchoolStatusThumbUrl(userRow, enriched?.mediaUrls?.[0], UPLOADS_ROOT) || gallery[0];
    if (thumb) {
      const type = String(enriched.type || "image") === "video" ? "video" : "image";
      return { ...enriched, creatorId: userRow, type, mediaUrls: [thumb] };
    }
  }
  if (String(enriched?.type || "") === "text") return enriched;
  return null;
}

type StatusLatestPost = {
  _id: unknown;
  type: string;
  mediaUrls: string[];
  artworkUrl?: string;
  createdAt: Date | string;
};

/** Status ring + viewer: remap school paths and fall back to gallery when TV media is missing. */
function buildStatusStripLatestPost(
  userRow: Record<string, unknown>,
  latest: Record<string, unknown> | null | undefined
): StatusLatestPost | null {
  const uid = String(userRow._id ?? "");
  const gallery = Array.isArray(userRow.profileGalleryUrls)
    ? (userRow.profileGalleryUrls as string[]).filter(Boolean)
    : [];

  if (latest) {
    const [enriched] = enrichSchoolGalleryMediaOnFeedPosts([
      { ...latest, creatorId: userRow },
    ]);
    if (enriched && tvPostHasAvailableMedia(enriched as { type?: string; mediaUrls?: string[]; artworkUrl?: string })) {
      const mediaUrls = [...(enriched.mediaUrls || [])].map(String).filter(Boolean);
      return {
        _id: enriched._id,
        type: String(enriched.type || "image"),
        mediaUrls,
        artworkUrl: enriched.artworkUrl,
        createdAt: enriched.createdAt,
      };
    }
  }

  const thumbRaw =
    resolveSchoolStatusThumbUrl(
      userRow as { _id?: unknown; avatar?: string; profileGalleryUrls?: string[] },
      gallery.find((u) => !String(u).endsWith(".webp")) || gallery[0],
      UPLOADS_ROOT
    ) ||
    resolveSchoolStatusThumbUrl(
      userRow as { _id?: unknown; avatar?: string; profileGalleryUrls?: string[] },
      String(userRow.avatar || ""),
      UPLOADS_ROOT
    );
  const thumb = thumbRaw ? resolveProfileBackfillMediaUrl(thumbRaw, UPLOADS_ROOT) || thumbRaw : undefined;
  if (!thumb) return null;

  const postId = latest?._id ? String(latest._id) : `gallery-${uid}-0`;
  return {
    _id: postId,
    type: "image",
    mediaUrls: [thumb],
    createdAt: (latest?.createdAt as Date | string) || new Date(),
  };
}

/** All playable status posts for one user, oldest-first (Instagram story order). */
function buildStatusStripPostsList(
  userRow: Record<string, unknown>,
  rawPosts: Array<Record<string, unknown>>
): StatusLatestPost[] {
  const sorted = [...rawPosts].sort(
    (a, b) =>
      new Date(a.createdAt as string | Date).getTime() -
      new Date(b.createdAt as string | Date).getTime()
  );
  const out: StatusLatestPost[] = [];
  const seenIds = new Set<string>();
  for (const raw of sorted) {
    const built = buildStatusStripLatestPost(userRow, raw);
    if (!built) continue;
    const id = String(built._id);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    out.push(built);
  }
  return out;
}

type StatusStripRow = {
  statusKey: string;
  userId: string;
  name: string;
  username?: unknown;
  avatar?: unknown;
  isSchoolAccount: boolean;
  isLive: boolean;
  /** Marketplace store/supplier row — products for one store only (uploader row unchanged). */
  isStoreStatus?: boolean;
  /** True when store products are Food & Restaurant (Order Food). */
  isFoodStore?: boolean;
  supplierId?: string;
  storeSlug?: string;
  latestPost: StatusLatestPost | null;
  posts: StatusLatestPost[];
};

function upsertStatusStripRow(
  map: Map<string, StatusStripRow>,
  key: string,
  rowMeta: Omit<StatusStripRow, "posts" | "latestPost">,
  newPosts: StatusLatestPost[]
): void {
  if (!newPosts.length) return;
  const existing = map.get(key);
  const byId = new Map<string, StatusLatestPost>();
  for (const p of existing?.posts ?? []) byId.set(String(p._id), p);
  for (const p of newPosts) byId.set(String(p._id), p);
  const merged = [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  map.set(key, {
    ...(existing ?? rowMeta),
    ...rowMeta,
    statusKey: key,
    posts: merged,
    latestPost: merged[merged.length - 1] ?? null,
  });
}

function statusStripRowFromUser(
  uid: string,
  userRow: Record<string, unknown>
): Omit<StatusStripRow, "posts" | "latestPost"> {
  return {
    statusKey: uid,
    userId: uid,
    name: userPublicDisplayName(userRow),
    username: userRow?.username,
    avatar: userRow?.avatar,
    isSchoolAccount: userRow?.isSchoolAccount === true,
    isLive: userShowsLiveBadge(userRow),
  };
}
const execFileAsync = promisify(execFile);
const QWERTZ_MAX_DURATION_SECONDS = 180;

function tvFeedCacheKey(req: AuthRequest): string {
  const userId = req.user?._id ? String(req.user._id) : "anon";
  const q = req.query || {};
  return JSON.stringify({
    u: userId,
    page: String(q.page || "1"),
    limit: String(q.limit || "20"),
    sort: String(q.sort || "newest"),
    type: String(q.type || ""),
    creatorId: String(q.creatorId || ""),
    q: String(q.q || ""),
    genre: String(q.genre || ""),
    hideProducts: String(q.hideProducts || ""),
  });
}

function tvFeedCacheClear(): void {
  clearTvFeedCache();
}

async function enrichAudioPostsWithSongArtwork(posts: any[]): Promise<any[]> {
  const audioUrls = Array.from(
    new Set(
      posts
        .filter((p) => p?.type === "audio" && !p?.artworkUrl && !(p?.songId && p?.songId?.artworkUrl))
        .map((p) => String(p?.mediaUrls?.[0] || "").trim())
        .filter(Boolean)
    )
  );
  if (!audioUrls.length) return posts;
  const songs = await Song.find({ audioUrl: { $in: audioUrls } })
    .select("_id audioUrl artworkUrl title artist downloadEnabled downloadPrice")
    .lean();
  const songByAudio = new Map(songs.map((s: any) => [String(s.audioUrl || ""), s]));
  return posts.map((p) => {
    if (p?.type !== "audio" || p?.artworkUrl || (p?.songId && p?.songId?.artworkUrl)) return p;
    const audioUrl = String(p?.mediaUrls?.[0] || "").trim();
    const song = songByAudio.get(audioUrl);
    if (!song) return p;
    return { ...p, artworkUrl: song.artworkUrl, songId: p.songId || song };
  });
}

async function attachResellerWallMarkup(posts: any[]): Promise<void> {
  const productIds = posts
    .filter((p: any) => p.productId)
    .map((p: any) => ({
      post: p,
      productId: (p.productId as any)?._id?.toString?.() ?? p.productId?.toString?.(),
      creatorId: (p.creatorId as any)?._id?.toString?.() ?? p.creatorId?.toString?.(),
    }))
    .filter((x) => x.productId && x.creatorId);
  if (productIds.length === 0) return;
  const walls = await ResellerWall.find({
    resellerId: { $in: [...new Set(productIds.map((x) => x.creatorId))] },
  }).lean();
  const wallMap = new Map(walls.map((w: any) => [w.resellerId?.toString(), w]));
  for (const { post, productId, creatorId } of productIds) {
    const wall = wallMap.get(creatorId);
    const wp = (wall?.products as any[])?.find((p) => (p.productId as any)?.toString?.() === productId);
    if (wp) {
      (post as any).resellerCommissionPct = effectiveResellerMarkupPctFromWall(
        wp.resellerCommissionPct,
        (post.productId as any)?.categories
      );
      (post as any).fromResellerWall = true;
    }
  }
}

function buildSortedFeedQuery(match: Record<string, unknown>, sort: string) {
  let query = TVPost.find(match)
    .select(
      "creatorId type mediaUrls caption heading subject hashtags productId artworkUrl songId filter genre hasWatermark originalPostId repostedBy feedActivity status sensitive likeCount commentCount shareCount viewCount createdAt updatedAt isAiNews newsCategory"
    )
    .populate("creatorId", CREATOR_POPULATE_SELECT)
    .populate(TV_PRODUCT_POPULATE)
    .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice");

  if (sort === "trending") {
    query = query.sort({ likeCount: -1, commentCount: -1, createdAt: -1, _id: -1 });
  } else {
    query = query.sort({ createdAt: -1, _id: -1 });
  }
  return query;
}

async function prepareVisibleFeedPosts(rawPosts: any[]): Promise<any[]> {
  const posts = await enrichAudioPostsWithSongArtwork(rawPosts);
  await attachResellerWallMarkup(posts);
  return filterTvPostsWithAvailableMedia(prepareFeedPostsForClient(posts)).filter(
    (post) => !isIncompleteAiNewsPost(post as { isAiNews?: boolean; heading?: string; subject?: string; caption?: string })
  );
}

/** Paginate by visible posts after media pruning (newest rows may all be missing files on disk). */
async function fetchVisibleFeedPage(
  match: Record<string, unknown>,
  sort: string,
  page: number,
  limit: number,
  total: number
): Promise<any[]> {
  const targetSkipVisible = (page - 1) * limit;
  const visiblePosts: any[] = [];
  let visibleSkipped = 0;
  let dbSkip = 0;
  const batchSize = Math.min(50, Math.max(limit * 3, 20));
  const maxDbRows = Math.min(total, Math.max(limit * 50, 500));

  while (visiblePosts.length < limit && dbSkip < maxDbRows) {
    const batch = await buildSortedFeedQuery(match, sort).skip(dbSkip).limit(batchSize).lean();
    if (!batch.length) break;
    dbSkip += batch.length;

    const visible = await prepareVisibleFeedPosts(batch);
    for (const post of visible) {
      if (visibleSkipped < targetSkipVisible) {
        visibleSkipped++;
        continue;
      }
      visiblePosts.push(post);
      if (visiblePosts.length >= limit) break;
    }
  }

  return visiblePosts;
}

const commentAudioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TV_UPLOAD_STORAGE_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || "") || ".m4a";
    cb(null, `tv-comment-audio-${unique}${ext}`);
  },
});

const commentAudioUpload = multer({
  storage: commentAudioStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/aac",
      "audio/x-m4a",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new AppError("Invalid audio format for voice note", 400));
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

function mediaUrl(filename: string) {
  return `/uploads/tv/${filename}`;
}

async function probeVideoDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const duration = Number(String(stdout || "").trim());
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return duration;
  } catch {
    return null;
  }
}

/** LIVE ring/badge: only while broadcasting, max 24h from go-live */
export const LIVE_BADGE_TTL_MS = 24 * 60 * 60 * 1000;

function withinLiveBadgeTtl(at: Date | string | null | undefined): boolean {
  if (at == null) return false;
  const t = new Date(at as Date).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < LIVE_BADGE_TTL_MS;
}

export function userShowsLiveBadge(u: {
  isLive?: boolean;
  liveStartedAt?: Date | string | null;
}): boolean {
  if (!u.isLive) return false;
  return withinLiveBadgeTtl(u.liveStartedAt);
}

/** Clear isLive when broadcast started more than 24h ago (or flag stuck on without start time). */
async function expireStaleLiveBroadcasts(): Promise<void> {
  const cutoff = new Date(Date.now() - LIVE_BADGE_TTL_MS);
  await User.updateMany(
    {
      isLive: true,
      $or: [{ liveStartedAt: { $lt: cutoff } }, { liveStartedAt: { $exists: false } }, { liveStartedAt: null }],
    },
    {
      $set: { isLive: false, lastLiveEndedAt: new Date() },
      $unset: { liveStreamName: "", liveStartedAt: "" },
    }
  );
}

/** Per-viewer follow flags — not stored in the shared statuses cache. */
async function attachViewerFollowToStatuses(
  payload: { data: Array<Record<string, unknown>> },
  viewerId: mongoose.Types.ObjectId
): Promise<{ data: Array<Record<string, unknown>> }> {
  const rows = payload.data || [];
  const viewerStr = String(viewerId);
  const targetIds = rows
    .map((s) => String(s.userId ?? ""))
    .filter((id) => id && id !== viewerStr);
  if (!targetIds.length) return payload;
  const follows = await Follow.find({
    followerId: viewerId,
    followingId: { $in: targetIds },
  })
    .select("followingId status")
    .lean();
  const byTarget = new Map(
    follows.map((f) => [String(f.followingId), (f as { status?: string }).status ?? "accepted"])
  );
  return {
    data: rows.map((s) => {
      const uid = String(s.userId ?? "");
      const st = byTarget.get(uid);
      return {
        ...s,
        isFollowing: !!st,
        followStatus: st ?? null,
      };
    }),
  };
}

// GET /api/tv/statuses - status strip: recent posts/products + new joiners (24h window)
router.get("/statuses", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  const startedAt = Date.now();
  try {
    await expireStaleLiveBroadcasts();
    const cacheKey = statusStripCacheKey();
    const cached = tvFeedCacheGet(cacheKey);
    let payload: { data: any[] };
    if (cached && Array.isArray((cached as { data?: unknown }).data)) {
      res.setHeader("X-TV-Statuses-Cache", "HIT");
      payload = cached as { data: any[] };
    } else {
    const cutoff = new Date(Date.now() - STATUS_STRIP_TTL_MS);
    const agg = await TVPost.aggregate([
      { $match: { status: "approved", createdAt: { $gte: cutoff } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$creatorId", posts: { $push: "$$ROOT" } } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
          pipeline: [
            { $match: { $nor: [{ role: "superadmin" }] } },
            {
              $project: {
                name: 1,
                username: 1,
                email: 1,
                avatar: 1,
                isLive: 1,
                liveStartedAt: 1,
                lastLiveEndedAt: 1,
                isSchoolAccount: 1,
                profileGalleryUrls: 1,
              },
            },
          ],
        },
      },
      { $unwind: "$user" },
      {
        $addFields: {
          latestPostAt: {
            $max: {
              $map: { input: "$posts", as: "p", in: "$$p.createdAt" },
            },
          },
        },
      },
      { $sort: { latestPostAt: -1 } },
      { $limit: 100 },
    ]);
    const statusByKey = new Map<string, StatusStripRow>();
    for (const s of agg) {
      const id = s._id.toString();
      const userRow = applySchoolProfileMediaToUser(
        { ...(s.user || {}), _id: s._id } as Record<string, unknown>,
        UPLOADS_ROOT
      ) as Record<string, unknown>;
      const playablePosts = buildStatusStripPostsList(userRow, (s.posts || []) as Record<string, unknown>[]);
      upsertStatusStripRow(statusByKey, id, statusStripRowFromUser(id, userRow), playablePosts);
    }
    // Include users who posted new marketplace products recently so status strip shows fresh product uploads too.
    const recentProducts = await Product.find({
      active: true,
      createdAt: { $gte: cutoff },
    })
      .select("_id supplierId title images createdAt categories tags")
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .lean();
    const supplierIds = [
      ...new Set(
        recentProducts
          .map((p: any) => String(p?.supplierId || "").trim())
          .filter(Boolean)
      ),
    ];
    const suppliers = supplierIds.length
      ? await Supplier.find({ _id: { $in: supplierIds } })
          .select("_id userId storeName")
          .lean()
      : [];
    const supplierUserIds = [
      ...new Set(
        suppliers
          .map((s: any) => String(s?.userId || "").trim())
          .filter(Boolean)
      ),
    ];
    const users = supplierUserIds.length
      ? await User.find({ _id: { $in: supplierUserIds }, role: { $ne: "superadmin" } })
          .select("name username email avatar isLive liveStartedAt lastLiveEndedAt isSchoolAccount profileGalleryUrls")
          .lean()
      : [];
    const supplierById = new Map(suppliers.map((s: any) => [String(s._id), s]));
    const userById = new Map(users.map((u: any) => [String(u._id), u]));
    const productsBySupplier = new Map<string, StatusLatestPost[]>();
    const foodSupplierIds = new Set<string>();
    for (const p of recentProducts as any[]) {
      const supplier = supplierById.get(String(p?.supplierId || ""));
      const uid = supplier?.userId ? String(supplier.userId) : "";
      if (!uid) continue;
      const rawU = userById.get(uid);
      if (!rawU) continue;
      const u = applySchoolProfileMediaToUser(
        { ...rawU, _id: uid } as Record<string, unknown>,
        UPLOADS_ROOT
      ) as Record<string, unknown>;
      const firstImage = Array.isArray(p.images) ? String(p.images[0] || "").trim() : "";
      const productPost = buildStatusStripLatestPost(u, {
        _id: String(p._id),
        type: "product",
        mediaUrls: firstImage ? [firstImage] : [],
        createdAt: p.createdAt,
      });
      if (!productPost) continue;
      const sid = String(p.supplierId);
      const cats = (Array.isArray(p.categories) ? p.categories : []).map((c: unknown) =>
        String(c || "").trim().toLowerCase()
      );
      const tags = (Array.isArray(p.tags) ? p.tags : []).map((t: unknown) =>
        String(t || "").trim().toLowerCase()
      );
      if (cats.includes("food & restaurant") || tags.includes("food-menu") || tags.includes("kota")) {
        foodSupplierIds.add(sid);
      }
      // Uploader/creator status — unchanged: all products for this supplier owner.
      upsertStatusStripRow(statusByKey, uid, statusStripRowFromUser(uid, u), [productPost]);
      const storePosts = productsBySupplier.get(sid) ?? [];
      storePosts.push(productPost);
      productsBySupplier.set(sid, storePosts);
    }
    const stores = supplierIds.length
      ? await Store.find({ supplierId: { $in: supplierIds }, type: "supplier" })
          .select("supplierId name slug")
          .lean()
      : [];
    const storeBySupplierId = new Map(stores.map((s: any) => [String(s.supplierId), s]));
    for (const [supplierId, storePosts] of productsBySupplier) {
      const supplier = supplierById.get(supplierId);
      if (!supplier || !storePosts.length) continue;
      const uid = supplier?.userId ? String(supplier.userId) : "";
      if (!uid) continue;
      const rawU = userById.get(uid);
      if (!rawU) continue;
      const u = applySchoolProfileMediaToUser(
        { ...rawU, _id: uid } as Record<string, unknown>,
        UPLOADS_ROOT
      ) as Record<string, unknown>;
      const store = storeBySupplierId.get(supplierId);
      const supplierName = String((supplier as { storeName?: string }).storeName || "").trim();
      const storeLabel =
        supplierName ||
        (store?.name ? String(store.name).trim() : "") ||
        userPublicDisplayName(u);
      const statusKey = `store:${supplierId}`;
      upsertStatusStripRow(statusByKey, statusKey, {
        statusKey,
        userId: uid,
        supplierId,
        isStoreStatus: true,
        isFoodStore: foodSupplierIds.has(supplierId),
        storeSlug: store?.slug ? String(store.slug) : undefined,
        name: storeLabel,
        username: u.username,
        avatar: u.avatar,
        isSchoolAccount: false,
        isLive: false,
      }, storePosts);
    }
    // New accounts: appear on the status strip for STATUS_STRIP_TTL_MS (same as posts/products).
    const newJoiners = await User.find({
      createdAt: { $gte: cutoff },
      active: { $ne: false },
      suspended: { $ne: true },
      $nor: [{ role: "superadmin" }],
    })
      .select(
        "name username email avatar isLive liveStartedAt lastLiveEndedAt isSchoolAccount profileGalleryUrls createdAt"
      )
      .sort({ createdAt: -1 })
      .limit(80)
      .lean();
    for (const rawU of newJoiners) {
      const uid = String(rawU._id);
      if (statusByKey.has(uid)) continue;
      const u = applySchoolProfileMediaToUser(
        { ...rawU, _id: uid } as Record<string, unknown>,
        UPLOADS_ROOT
      ) as Record<string, unknown>;
      const avatar = String(u.avatar || "").trim();
      const joinRow = {
        _id: `join-${uid}`,
        type: avatar ? "image" : "text",
        mediaUrls: avatar ? [avatar] : ([] as string[]),
        createdAt: rawU.createdAt,
      };
      const joinPosts = buildStatusStripPostsList(u, [joinRow]);
      const fallbackPost: StatusLatestPost = {
        _id: joinRow._id,
        type: String(joinRow.type),
        mediaUrls: [...joinRow.mediaUrls],
        createdAt: joinRow.createdAt as Date,
      };
      upsertStatusStripRow(
        statusByKey,
        uid,
        statusStripRowFromUser(uid, u),
        joinPosts.length ? joinPosts : [fallbackPost]
      );
    }
    const statuses = sortStatusStripRowsNewestFirst([...statusByKey.values()]);
    payload = { data: statuses };
    tvFeedCacheSet(cacheKey, payload);
    res.setHeader("X-TV-Statuses-Cache", "MISS");
    }
    if (req.user?._id) {
      payload = await attachViewerFollowToStatuses(payload, req.user._id);
    }
    res.json(payload);
  } catch (err) {
    next(err);
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed > 600) {
      logger.warn("Slow /api/tv/statuses request", { elapsedMs: elapsed });
    }
  }
});

// GET /api/tv/hashtags/trending - hashtags ranked by recent usage (default: last 7 days)
router.get("/hashtags/trending", async (req: express.Request, res: Response, next) => {
  try {
    const limit = Math.min(20, parseInt(req.query?.limit as string) || 10);
    const daysRaw = parseInt(req.query?.days as string, 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(90, daysRaw) : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const modeRaw = String(req.query?.mode || "latest").toLowerCase();
    const sortStage =
      modeRaw === "popular"
        ? { $sort: { count: -1 as const, lastUsed: -1 as const } }
        : { $sort: { lastUsed: -1 as const, count: -1 as const } };

    const agg = await TVPost.aggregate([
      {
        $match: {
          status: "approved",
          createdAt: { $gte: since },
          hashtags: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$hashtags" },
      {
        $group: {
          _id: { $toLower: "$hashtags" },
          count: { $sum: 1 },
          lastUsed: { $max: "$createdAt" },
        },
      },
      {
        $match: {
          $expr: { $gte: [{ $strLenCP: "$_id" }, TV_HASHTAG_MIN_TRENDING_LEN] },
        },
      },
      sortStage,
      { $limit: limit },
      { $project: { tag: "$_id", count: 1, lastUsed: 1, _id: 0 } },
    ]);

    res.setHeader("Cache-Control", "no-store");
    res.json({ data: agg, windowDays: days });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/hashtags/:tag/related — co-occurring hashtags on posts that use this tag
router.get("/hashtags/:tag/related", async (req: express.Request, res: Response, next) => {
  try {
    let raw = String(req.params.tag || "").trim().replace(/^#/, "");
    raw = decodeURIComponent(raw).trim().toLowerCase();
    if (!raw || raw.length > 80) {
      return res.status(400).json({ error: true, message: "Invalid hashtag" });
    }
    const limit = Math.min(20, parseInt(req.query.limit as string, 10) || 8);
    const daysRaw = parseInt(req.query.days as string, 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(90, daysRaw) : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const selfRegex = hashtagArrayTagRegex(raw);

    const agg = await TVPost.aggregate([
      {
        $match: {
          status: "approved",
          createdAt: { $gte: since },
          ...hashtagPostMatchClause(raw),
        },
      },
      { $unwind: "$hashtags" },
      { $match: { hashtags: { $not: selfRegex } } },
      {
        $group: {
          _id: { $toLower: "$hashtags" },
          count: { $sum: 1 },
          lastUsed: { $max: "$createdAt" },
        },
      },
      {
        $match: {
          $expr: { $gte: [{ $strLenCP: "$_id" }, TV_HASHTAG_MIN_TRENDING_LEN] },
        },
      },
      { $sort: { count: -1, lastUsed: -1 } },
      { $limit: limit },
      { $project: { tag: "$_id", count: 1, lastUsed: 1, _id: 0 } },
    ]);

    res.setHeader("Cache-Control", "no-store");
    res.json({ data: agg, tag: raw, windowDays: days });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/hashtags/:tag/accounts — distinct creators who used this hashtag (random order for grid UI)
router.get("/hashtags/:tag/accounts", async (req: express.Request, res: Response, next) => {
  try {
    let raw = String(req.params.tag || "").trim().replace(/^#/, "");
    raw = decodeURIComponent(raw).trim();
    if (!raw || raw.length > 80) {
      return res.status(400).json({ error: true, message: "Invalid hashtag" });
    }
    const limit = Math.min(200, parseInt(req.query.limit as string, 10) || 120);

    const rows = await TVPost.aggregate([
      { $match: { status: "approved", ...hashtagPostMatchClause(raw) } },
      { $group: { _id: "$creatorId" } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "u",
          pipeline: [
            {
              $match: { active: true, suspended: { $ne: true } },
            },
            { $project: { name: 1, avatar: 1, username: 1 } },
          ],
        },
      },
      { $unwind: { path: "$u", preserveNullAndEmptyArrays: false } },
      { $addFields: { r: { $rand: {} } } },
      { $sort: { r: 1 } },
      { $limit: limit },
      { $project: { _id: "$u._id", name: "$u.name", avatar: "$u.avatar", username: "$u.username", email: "$u.email" } },
    ]);

    res.json({
      data: rows.map((row: { name?: string; username?: string; email?: string; avatar?: string; _id: unknown }) =>
        withCreatorDisplayName(row)
      ),
      tag: raw,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv - list posts (feed, scroll). sort=newest|trending|random, type=video|image|carousel|product
router.get("/", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  const startedAt = Date.now();
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const sort = (req.query.sort as string) || "newest";
    const type = req.query.type as string; // optional: video, image, carousel, product

    const match: Record<string, unknown> = { status: "approved" };

    // Respect content preferences: hide product posts when user opted out
    const hideProducts =
      (req.user && (req.user as any).contentPreferences?.showProducts === false) ||
      req.query.hideProducts === "1" ||
      req.query.hideProducts === "true";
    if (type) {
      if (type === "images") {
        (match as any).type = { $in: ["image", "carousel"] };
      } else if (["video", "image", "carousel", "product", "audio", "text"].includes(type)) {
        match.type = type;
      }
    }
    if (hideProducts) {
      if (type === "product") {
        return res.json({ data: [], total: 0, page: 1, limit });
      }
      if (!(match as any).type) {
        (match as any).type = { $ne: "product" };
      }
    }
    const genreParam = (req.query.genre as string)?.trim();
    if (genreParam && genreParam !== "qwertz") {
      (match as any).genre = genreParam;
    }
    const qRaw = (req.query.q as string)?.trim();
    const q = qRaw?.replace(/^#/, "") ?? "";
    if (q && q.length >= 2) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      (match as any).$or = [
        { caption: { $regex: escaped, $options: "i" } },
        { subject: { $regex: escaped, $options: "i" } },
        { heading: { $regex: escaped, $options: "i" } },
        { hashtags: new RegExp(`^${escaped}$`, "i") },
      ];
    }
    const creatorIdParam = req.query.creatorId as string;
    if (creatorIdParam && mongoose.Types.ObjectId.isValid(creatorIdParam)) {
      match.creatorId = new mongoose.Types.ObjectId(creatorIdParam);
    }

    const cacheKey = tvFeedCacheKey(req);
    const cached = tvFeedCacheGet(cacheKey);
    if (cached) {
      res.setHeader("X-TV-Feed-Cache", "HIT");
      return res.json(cached);
    }
    const total = await TVPost.countDocuments(match);

    if (sort === "random") {
      const posts = await TVPost.aggregate([
        { $match: match },
        { $sample: { size: limit } },
        {
          $lookup: {
            from: "users",
            localField: "creatorId",
            foreignField: "_id",
            as: "creatorId",
            pipeline: [{ $project: { name: 1, username: 1, email: 1, avatar: 1 } }],
          },
        },
        { $unwind: { path: "$creatorId", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "productId",
            pipeline: [
              {
                $project: {
                  title: 1,
                  description: 1,
                  price: 1,
                  discountPrice: 1,
                  images: 1,
                  currency: 1,
                  supplierId: 1,
                  colors: 1,
                  sizes: 1,
                  outOfStock: 1,
                  stock: 1,
                  allowResell: 1,
                  bulkTiers: 1,
                  freeShippingEnabled: 1,
                  freeShippingAreas: 1,
                },
              },
              {
                $lookup: {
                  from: "suppliers",
                  localField: "supplierId",
                  foreignField: "_id",
                  as: "supplierId",
                  pipeline: [{ $project: { userId: 1 } }],
                },
              },
              { $unwind: { path: "$supplierId", preserveNullAndEmptyArrays: true } },
            ],
          },
        },
        { $unwind: { path: "$productId", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "songs",
            localField: "songId",
            foreignField: "_id",
            as: "songId",
            pipeline: [{ $project: { title: 1, artist: 1, artworkUrl: 1, downloadEnabled: 1, downloadPrice: 1 } }],
          },
        },
        { $unwind: { path: "$songId", preserveNullAndEmptyArrays: true } },
      ]);
      const visibleRandom = await prepareVisibleFeedPosts(posts);
      const payload = {
        data: mapTvFeedStripInr(visibleRandom.map(mapPopulatedCreatorDisplay)),
        total,
        page: 1,
        limit,
      };
      tvFeedCacheSet(cacheKey, payload);
      res.setHeader("X-TV-Feed-Cache", "MISS");
      return res.json(payload);
    }

    let visiblePosts = await fetchVisibleFeedPage(match, sort, page, limit, total);
    let effectiveTotal = total;
    if (
      creatorIdParam &&
      mongoose.Types.ObjectId.isValid(creatorIdParam) &&
      page === 1 &&
      visiblePosts.length === 0
    ) {
      const creatorUser = await User.findById(creatorIdParam).select(CREATOR_POPULATE_SELECT).lean();
      if (creatorUser) {
        const userRow = applySchoolProfileMediaToUser(
          { ...creatorUser, _id: creatorUser._id } as Record<string, unknown>,
          UPLOADS_ROOT
        );
        const supplements = schoolGalleryFeedPosts(creatorIdParam, userRow);
        if (supplements.length) {
          visiblePosts = supplements.slice(0, limit);
          effectiveTotal = supplements.length;
        }
      }
    }
    const payload = {
      data: mapTvFeedStripInr(visiblePosts.map(mapPopulatedCreatorDisplay)),
      total: effectiveTotal,
      page,
      limit,
    };
    tvFeedCacheSet(cacheKey, payload);
    res.setHeader("X-TV-Feed-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    next(err);
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed > 600) {
      logger.warn("Slow /api/tv feed request", {
        elapsedMs: elapsed,
        page: req.query.page,
        limit: req.query.limit,
        sort: req.query.sort,
        type: req.query.type,
        hasSearch: !!String(req.query.q || "").trim(),
      });
    }
  }
});

// POST /api/tv/upload - upload video or image (auto-moderation if API configured)
router.post("/upload", authenticate, (req: AuthRequest, res: Response, next) => {
  tvUploadSingle.single("media")(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (!req.file) throw new AppError("No file uploaded", 400);
      const modBlock = moderationUploadBlockedReason();
      if (modBlock) throw new AppError(modBlock, 503);
      const filePath = (req.file as any).path || path.join(TV_UPLOAD_STORAGE_DIR, req.file.filename);
      const result = await moderateMedia(filePath, req.file.mimetype);
      if (!result.safe) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          /* ignore */
        }
        await AuditLog.create({
          action: "CONTENT_MODERATION_BLOCKED",
          user: req.user!._id,
          meta: {
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            reason: result.reason,
            categories: result.categories,
          },
        });
        throw new AppError(result.reason || "Content violates community guidelines", 400);
      }
      const url = mediaUrl(req.file.filename);
      logger.info("TV media uploaded", { userId: req.user?._id, url, bytes: req.file.size });
      res.json({ url, sensitive: result.sensitive ?? false });
    } catch (e) {
      next(e);
    }
  });
});

// POST /api/tv/upload-images - upload multiple images (carousel, auto-moderation)
router.post("/upload-images", authenticate, (req: AuthRequest, res: Response, next) => {
  tvUploadMultiple.array("images", 20)(req, res, async (err) => {
    if (err) return next(err);
    try {
      const files = (req as any).files as Express.Multer.File[];
      if (!files?.length) throw new AppError("No images uploaded", 400);
      const modBlockMulti = moderationUploadBlockedReason();
      if (modBlockMulti) throw new AppError(modBlockMulti, 503);
      const uploadDir = TV_UPLOAD_STORAGE_DIR;
      let anySensitive = false;
      for (const f of files) {
        const filePath = (f as any).path || path.join(uploadDir, f.filename);
        const result = await moderateMedia(filePath, f.mimetype);
        if (!result.safe) {
          files.forEach((file) => {
            try {
              fs.unlinkSync(path.join(uploadDir, file.filename));
            } catch (e) {
              /* ignore */
            }
          });
          await AuditLog.create({
            action: "CONTENT_MODERATION_BLOCKED",
            user: req.user!._id,
            meta: {
              fileName: f.originalname,
              mimeType: f.mimetype,
              reason: result.reason,
              categories: result.categories,
            },
          });
          throw new AppError(result.reason || "Content violates community guidelines", 400);
        }
        if (result.sensitive) anySensitive = true;
      }
      const urls = files.map((f) => mediaUrl(f.filename));
      res.json({ urls, sensitive: anySensitive });
    } catch (e) {
      next(e);
    }
  });
});

// POST /api/tv/comments/upload-audio - upload voice note for comments
router.post("/comments/upload-audio", authenticate, commentAudioUpload.single("audio"), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) throw new AppError("No audio uploaded", 400);
    const url = mediaUrl(req.file.filename);
    res.json({ data: { url } });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/watermark - must be before /:id
router.get("/watermark", (_req, res) => {
  res.json({ data: { watermark: TV_WATERMARK } });
});

// GET /api/tv/products/featured - must be before /:id
router.get("/products/featured", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  const startedAt = Date.now();
  try {
    const requestedLimit = parseInt(String(req.query.limit || "0"), 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(120, requestedLimit)
      : 12;
    const hideProducts =
      (req.user && (req.user as any).contentPreferences?.showProducts === false) ||
      req.query.hideProducts === "1" ||
      req.query.hideProducts === "true";
    const featuredCacheKey = `featured:v3:hide=${hideProducts ? "1" : "0"}:lim=${limit}`;
    if (hideProducts) {
      return res.json({ data: [] });
    }
    const cached = tvFeedCacheGet(featuredCacheKey);
    if (cached) {
      res.setHeader("X-TV-Featured-Cache", "HIT");
      return res.json(cached);
    }
    const approvedSupplierIds = await getApprovedSupplierIds();
    const match = buildPublicProductMatch(approvedSupplierIds);
    if (!match || !((match.$or as unknown[])?.length)) {
      return res.json({ data: [] });
    }
    const products = await Product.find(match)
      .select(
        "title description price discountPrice bulkTiers images currency slug allowResell stock outOfStock colors sizes freeShippingEnabled freeShippingAreas createdAt supplierId"
      )
      .populate("supplierId", "storeName userId")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const enriched = await enrichProductsWithStoreFields(products as Record<string, unknown>[]);
    const payload = { data: mapProductsStripInrForApi(enriched as Record<string, unknown>[]) };
    tvFeedCacheSet(featuredCacheKey, payload);
    res.setHeader("X-TV-Featured-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    next(err);
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed > 600) {
      logger.warn("Slow /api/tv/products/featured request", {
        elapsedMs: elapsed,
        hideProducts:
          (req.user && (req.user as any).contentPreferences?.showProducts === false) ||
          req.query.hideProducts === "1" ||
          req.query.hideProducts === "true",
      });
    }
  }
});

// POST /api/tv - create post
router.post("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { type, mediaUrls, caption, heading, subject, hashtags, productId, filter, genre, artworkUrl, songId, sensitive } = req.body;
    if (!type) throw new AppError("type required", 400);
    if (!["video", "image", "carousel", "product", "text", "audio"].includes(type)) throw new AppError("Invalid type", 400);
    const isTextPost = type === "text";
    const isAudioPost = type === "audio";
    const isQwertzVideo = type === "video" && String(genre || "").trim().toLowerCase() === "qwertz";
    if (isAudioPost && !mediaUrls?.length) throw new AppError("mediaUrls required for audio posts", 400);
    if (!isTextPost && !isAudioPost && !mediaUrls?.length) throw new AppError("mediaUrls required for non-text posts", 400);
    if (isQwertzVideo) {
      const urls = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];
      const first = urls[0];
      if (!first) throw new AppError("Qwertz video is required", 400);
      const localPath = resolveUploadedTvFilePath(first);
      if (!localPath || !fs.existsSync(localPath)) {
        throw new AppError("Unable to verify Qwertz video duration on server", 400);
      }
      const seconds = await probeVideoDurationSeconds(localPath);
      if (!seconds) {
        throw new AppError("Could not read Qwertz video duration", 400);
      }
      if (seconds > QWERTZ_MAX_DURATION_SECONDS) {
        throw new AppError("Qwertz videos must be 3 minutes or less", 400);
      }
    }

    let resolvedSongId: mongoose.Types.ObjectId | undefined;
    if (isAudioPost && songId && mongoose.isValidObjectId(String(songId))) {
      resolvedSongId = new mongoose.Types.ObjectId(String(songId));
    }
    if (type === "video" && songId) {
      if (!mongoose.isValidObjectId(String(songId))) throw new AppError("Invalid songId", 400);
      const sdoc = await Song.findById(songId).select("type soundLibraryStatus").lean();
      if (!sdoc) throw new AppError("Song not found", 404);
      if ((sdoc as any).type !== "song") throw new AppError("Only catalog singles can be attached to video", 400);
      if ((sdoc as any).soundLibraryStatus !== "approved") {
        throw new AppError("Song is not in the Sounds catalog", 403);
      }
      resolvedSongId = new mongoose.Types.ObjectId(String(songId));
    }

    const trimmedCaption = caption?.trim();
    const trimmedHeading = heading?.trim();
    const trimmedSubject = subject?.trim() || undefined;
    const resolvedHashtags = normalizeTvHashtags(
      hashtags,
      trimmedCaption,
      trimmedSubject,
      trimmedHeading
    );

    const post = await TVPost.create({
      creatorId: req.user!._id,
      type,
      mediaUrls: isTextPost ? [] : (Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls]),
      caption: trimmedCaption,
      heading: trimmedHeading,
      subject: trimmedSubject,
      hashtags: resolvedHashtags,
      productId: productId || undefined,
      artworkUrl: isAudioPost && artworkUrl ? String(artworkUrl).trim() : undefined,
      songId: resolvedSongId,
      filter: filter || undefined,
      genre: genre || undefined,
      hasWatermark: true,
      status: "approved",
      sensitive: !!sensitive,
    });

    if (type === "video" && resolvedSongId) {
      try {
        const sOwner = await Song.findById(resolvedSongId).select("userId").lean();
        if (sOwner?.userId) {
          await MusicSoundUsage.create({
            tvPostId: post._id as mongoose.Types.ObjectId,
            songId: resolvedSongId,
            rightsHolderUserId: sOwner.userId as mongoose.Types.ObjectId,
            videoCreatorId: req.user!._id as mongoose.Types.ObjectId,
          });
        }
      } catch (e: any) {
        if (e?.code !== 11000) logger.warn("MusicSoundUsage create failed", { err: String(e?.message || e) });
      }
    }
    const populated = await TVPost.findById(post._id)
      .populate("creatorId", CREATOR_POPULATE_SELECT)
      .populate("productId", TV_PRODUCT_POPULATE_SELECT)
      .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice")
      .lean();
    bumpStatusStripCache();
    res.status(201).json({ data: populated ? mapPopulatedCreatorDisplay(populated) : populated });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/repost
router.post("/:id/repost", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const original = await TVPost.findById(req.params.id);
    if (!original || original.status !== "approved") throw new AppError("Post not found", 404);

    const repost = await TVPost.create({
      creatorId: req.user!._id,
      type: original.type,
      mediaUrls: original.mediaUrls,
      caption: original.caption,
      heading: original.heading,
      subject: original.subject,
      hashtags: original.hashtags,
      productId: original.productId,
      artworkUrl: (original as any).artworkUrl,
      songId: (original as any).songId,
      filter: original.filter,
      hasWatermark: true,
      originalPostId: original._id,
      repostedBy: req.user!._id,
      status: "approved",
      sensitive: (original as any).sensitive,
    });
    await TVPost.findByIdAndUpdate(original._id, { $inc: { shareCount: 1 } });
    await TVInteraction.create({ postId: original._id, userId: req.user!._id, type: "repost", repostId: repost._id });

    const repostSongId = (original as any).songId as mongoose.Types.ObjectId | undefined;
    if (original.type === "video" && repostSongId) {
      try {
        const sOwner = await Song.findById(repostSongId).select("userId").lean();
        if (sOwner?.userId) {
          await MusicSoundUsage.create({
            tvPostId: repost._id as mongoose.Types.ObjectId,
            songId: repostSongId,
            rightsHolderUserId: sOwner.userId as mongoose.Types.ObjectId,
            videoCreatorId: req.user!._id as mongoose.Types.ObjectId,
          });
        }
      } catch (e: any) {
        if (e?.code !== 11000) logger.warn("MusicSoundUsage repost create failed", { err: String(e?.message || e) });
      }
    }

    const populated = await TVPost.findById(repost._id)
      .populate("creatorId", CREATOR_POPULATE_SELECT)
      .populate("productId", TV_PRODUCT_POPULATE_SELECT)
      .populate("originalPostId", "creatorId")
      .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice")
      .lean();
    res.status(201).json({ data: populated ? mapPopulatedCreatorDisplay(populated) : populated });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/like
router.post("/:id/like", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);

    const existing = await TVInteraction.findOne({ postId: post._id, userId: req.user!._id, type: "like" });
    if (existing) {
      await TVInteraction.deleteOne({ _id: existing._id });
      await TVPost.findByIdAndUpdate(post._id, { $inc: { likeCount: -1 } });
      return res.json({ data: { liked: false, likeCount: post.likeCount - 1 } });
    }
    await TVInteraction.create({ postId: post._id, userId: req.user!._id, type: "like" });
    await TVPost.findByIdAndUpdate(post._id, { $inc: { likeCount: 1 } });
    res.json({ data: { liked: true, likeCount: post.likeCount + 1 } });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/:id/liked
router.get("/:id/liked", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const liked = await TVInteraction.findOne({ postId: req.params.id, userId: req.user!._id, type: "like" });
    res.json({ data: { liked: !!liked } });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/report
router.post("/:id/report", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) throw new AppError("reason required", 400);
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);

    await TVReport.create({
      reporterId: req.user!._id,
      targetType: "post",
      targetId: post._id,
      reason: reason.trim().substring(0, 500),
    });
    res.json({ message: "Report submitted" });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tv/:id - edit own post (caption/text fields; media unchanged)
router.patch("/:id", authenticate, async (req: AuthRequest, res: Response, next: express.NextFunction) => {
  try {
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);
    const creatorId = typeof post.creatorId === "object" ? (post.creatorId as any)?._id : post.creatorId;
    if (String(creatorId) !== String(req.user!._id)) throw new AppError("You can only edit your own posts", 403);
    if (post.originalPostId) throw new AppError("Reposts cannot be edited", 400);

    const { caption, heading, subject, hashtags, filter, genre } = req.body ?? {};
    if (caption !== undefined) post.caption = String(caption).trim().slice(0, 4000) || undefined;
    if (heading !== undefined) post.heading = String(heading).trim().slice(0, 500) || undefined;
    if (subject !== undefined) post.subject = String(subject).trim().slice(0, 8000) || undefined;
    if (hashtags !== undefined || caption !== undefined || subject !== undefined || heading !== undefined) {
      post.hashtags = normalizeTvHashtags(
        hashtags !== undefined ? hashtags : post.hashtags,
        caption !== undefined ? post.caption : post.caption,
        subject !== undefined ? post.subject : post.subject,
        heading !== undefined ? post.heading : post.heading
      );
    }
    if (filter !== undefined) post.filter = String(filter).trim() || undefined;
    if (genre !== undefined) post.genre = String(genre).trim() || undefined;

    await post.save();
    const populated = await TVPost.findById(post._id)
      .populate("creatorId", CREATOR_POPULATE_SELECT)
      .populate("productId", TV_PRODUCT_POPULATE_SELECT)
      .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice")
      .lean();
    res.json({ data: populated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tv/:id - delete own post (creator only)
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response, next: express.NextFunction) => {
  try {
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);
    const creatorId = typeof post.creatorId === "object" ? (post.creatorId as any)?._id : post.creatorId;
    if (String(creatorId) !== String(req.user!._id)) throw new AppError("You can only delete your own posts", 403);

    const postType = String(post.type || "").trim();
    const mediaUrls = Array.isArray(post.mediaUrls)
      ? post.mediaUrls.map((u: unknown) => String(u || "").trim()).filter(Boolean)
      : [];

    await TVPost.deleteOne({ _id: post._id });

    if (mediaUrls.length && (postType === "image" || postType === "carousel")) {
      const owner = await User.findById(creatorId).select("profileGalleryUrls avatar").lean();
      if (owner) {
        const removeSet = new Set(mediaUrls);
        const gallery = Array.isArray(owner.profileGalleryUrls)
          ? owner.profileGalleryUrls.map((u) => String(u || "").trim()).filter(Boolean)
          : [];
        const nextGallery = gallery.filter((u) => !removeSet.has(u));
        if (nextGallery.length !== gallery.length) {
          const avatar = String(owner.avatar || "").trim();
          const updates: Record<string, unknown> = { profileGalleryUrls: nextGallery };
          if (avatar && removeSet.has(avatar)) {
            updates.avatar = nextGallery[0] || null;
          }
          await User.findByIdAndUpdate(creatorId, updates);
        }
      }
    }

    res.json({ message: "Post deleted" });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/:id/comments
router.get("/:id/comments", async (req: express.Request, res: Response, next) => {
  try {
    const comments = await TVComment.find({ postId: req.params.id, status: "visible" })
      .populate("userId", "name avatar")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ data: comments });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/comments
router.post("/:id/comments", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const rawText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const audioUrl = typeof req.body?.audioUrl === "string" ? req.body.audioUrl.trim() : "";
    if (!rawText && !audioUrl) throw new AppError("text or audioUrl is required", 400);
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);

    const comment = await TVComment.create({
      postId: post._id,
      userId: req.user!._id,
      text: rawText ? rawText.substring(0, 1000) : undefined,
      audioUrl: audioUrl || undefined,
    });
    await TVPost.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } });
    const populated = await TVComment.findById(comment._id).populate("userId", "name avatar").lean();
    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/:id - single post (for share links) - must be after /:id/liked, /:id/comments, etc.
router.get("/:id", async (req: express.Request, res: Response, next) => {
  try {
    const galleryMatch = GALLERY_POST_ID_RE.exec(String(req.params.id || ""));
    if (galleryMatch) {
      const [, creatorId, idxStr] = galleryMatch;
      const creatorUser = await User.findById(creatorId).select(CREATOR_POPULATE_SELECT).lean();
      if (!creatorUser) throw new AppError("Post not found", 404);
      const userRow = applySchoolProfileMediaToUser(
        { ...creatorUser, _id: creatorUser._id } as Record<string, unknown>,
        UPLOADS_ROOT
      );
      const supplements = schoolGalleryFeedPosts(creatorId, userRow);
      const idx = Number(idxStr);
      const synthetic = supplements[idx];
      if (!synthetic) throw new AppError("Post not found", 404);
      const mapped = mapPopulatedCreatorDisplay(synthetic);
      return res.json({ data: normalizeTvPostProductCurrencyInResponse(mapped as Record<string, unknown>) });
    }

    let post = await TVPost.findOne({ _id: req.params.id, status: "approved" })
      .populate("creatorId", CREATOR_POPULATE_SELECT)
      .populate(TV_PRODUCT_POPULATE)
      .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice")
      .lean();
    if (!post && mongoose.Types.ObjectId.isValid(req.params.id)) {
      post = await TVPost.findById(req.params.id)
        .populate("creatorId", CREATOR_POPULATE_SELECT)
        .populate(TV_PRODUCT_POPULATE)
        .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice")
        .lean();
    }
    if (!post) {
      const product = await Product.findById(req.params.id)
        .select("title description price discountPrice images currency allowResell supplierId")
        .populate({ path: "supplierId", select: "userId" })
        .lean();
      if (product) {
        const supplierUserId = (product as { supplierId?: { userId?: unknown } }).supplierId?.userId;
        let creatorId: Record<string, unknown> | null = null;
        if (supplierUserId) {
          const u = await User.findById(supplierUserId).select(CREATOR_POPULATE_SELECT).lean();
          if (u) {
            creatorId = applySchoolProfileMediaToUser(
              { ...u, _id: u._id } as Record<string, unknown>,
              UPLOADS_ROOT
            ) as Record<string, unknown>;
          }
        }
        const firstImage = Array.isArray((product as { images?: string[] }).images)
          ? String((product as { images?: string[] }).images?.[0] || "").trim()
          : "";
        const synthetic = {
          _id: req.params.id,
          type: "image",
          mediaUrls: firstImage ? [firstImage] : [],
          caption: (product as { title?: string }).title,
          productId: product,
          creatorId: creatorId ? withCreatorDisplayName(creatorId as any) : undefined,
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          viewCount: 0,
          status: "approved",
        };
        const mapped = mapPopulatedCreatorDisplay(synthetic);
        return res.json({ data: normalizeTvPostProductCurrencyInResponse(mapped as Record<string, unknown>) });
      }
    }
    if (!post) {
      const creatorIdParam = String(req.query.creatorId || "").trim();
      if (mongoose.Types.ObjectId.isValid(creatorIdParam)) {
        const creatorUser = await User.findById(creatorIdParam).select(CREATOR_POPULATE_SELECT).lean();
        if (creatorUser) {
          const userRow = applySchoolProfileMediaToUser(
            { ...creatorUser, _id: creatorUser._id } as Record<string, unknown>,
            UPLOADS_ROOT
          );
          const gallery = Array.isArray(userRow.profileGalleryUrls)
            ? (userRow.profileGalleryUrls as string[]).filter(Boolean)
            : [];
          const thumb =
            resolveSchoolStatusThumbUrl(userRow, undefined, UPLOADS_ROOT) || gallery[0] || userRow.avatar;
          if (thumb) {
            const synthetic = {
              _id: req.params.id,
              type: "image",
              mediaUrls: [String(thumb)],
              creatorId: withCreatorDisplayName({
                ...userRow,
                _id: creatorIdParam,
                username: userRow.username as string | undefined,
                name: userRow.name as string | undefined,
                email: userRow.email as string | undefined,
              }),
              likeCount: 0,
              commentCount: 0,
              shareCount: 0,
              viewCount: 0,
              status: "approved",
              createdAt: new Date(),
            };
            const mapped = mapPopulatedCreatorDisplay(synthetic);
            return res.json({ data: normalizeTvPostProductCurrencyInResponse(mapped as Record<string, unknown>) });
          }
        }
      }
      throw new AppError("Post not found", 404);
    }
    if (isIncompleteAiNewsPost(post as { isAiNews?: boolean; heading?: string; subject?: string; caption?: string })) {
      throw new AppError("Post not found", 404);
    }
    const resolved = resolveTvPostForClient(post);
    if (!resolved) {
      throw new AppError("Post not found", 404);
    }
    Object.assign(post as object, resolved);
    // Enrich audio post: if missing artwork, lookup Song by audioUrl
    if ((post as any).type === "audio" && !(post as any).artworkUrl && !((post as any).songId && (post as any).songId.artworkUrl)) {
      const audioUrl = (post as any).mediaUrls?.[0];
      if (audioUrl) {
        const song = await Song.findOne({ audioUrl }).select("_id artworkUrl title artist downloadEnabled downloadPrice").lean();
        if (song) {
          (post as any).artworkUrl = song.artworkUrl;
          if (!(post as any).songId) (post as any).songId = song;
        }
      }
    }
    // Increment view count for video/carousel posts
    const isVideo = (post as any).type === "video" || ((post as any).type === "carousel" && (post as any).mediaUrls?.[0]?.match(/\.(mp4|webm)$/i));
    if (isVideo) {
      await TVPost.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
      (post as any).viewCount = ((post as any).viewCount ?? 0) + 1;
    }
    const mapped = mapPopulatedCreatorDisplay(post);
    res.json({ data: normalizeTvPostProductCurrencyInResponse(mapped as Record<string, unknown>) });
  } catch (err) {
    next(err);
  }
});

export default router;
