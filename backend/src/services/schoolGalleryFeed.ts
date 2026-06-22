import mongoose from "mongoose";
import TVPost from "../data/models/TVPost";
import User from "../data/models/User";
import { buildSchoolTvCaption, buildSchoolTvHashtags } from "../utils/schoolTvPostCopy";
import { publishProfileAvatarFeedUpdate } from "./profileAvatarFeed";
import { bumpStatusStripCache } from "./statusStripPolicy";
import { remapSchoolGalleryPathForUser } from "../utils/schoolProfileMedia";
import { localUploadMediaExists } from "./tvMediaAvailability";
import path from "path";

const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads");

/**
 * After school gallery import: TV posts (profile feed / tab counts) + avatar status update.
 */
export async function publishSchoolGalleryFeedUpdates(options: {
  userId: mongoose.Types.ObjectId | string;
  schoolName: string;
  newMediaPaths: string[];
  avatarPath?: string | null;
  previousAvatar?: string | null;
}): Promise<{ tvPostsCreated: number; avatarFeed?: boolean }> {
  const userId =
    options.userId instanceof mongoose.Types.ObjectId
      ? options.userId
      : new mongoose.Types.ObjectId(String(options.userId));
  const uid = String(userId);
  const name = String(options.schoolName || "School").trim();
  const caption = buildSchoolTvCaption(name);
  const hashtags = buildSchoolTvHashtags(name);

  const paths = [
    ...new Set(
      (options.newMediaPaths || [])
        .map((p) => remapSchoolGalleryPathForUser(String(p).trim(), uid))
        .filter((p) => p.startsWith("/uploads/school-gallery/"))
    ),
  ];

  let tvPostsCreated = 0;
  for (const mediaUrl of paths) {
    if (!localUploadMediaExists(mediaUrl, UPLOADS_ROOT)) continue;
    const exists = await TVPost.findOne({ creatorId: userId, mediaUrls: mediaUrl }).select("_id").lean();
    if (exists) continue;
    await TVPost.create({
      creatorId: userId,
      type: "image",
      mediaUrls: [mediaUrl],
      caption,
      hashtags,
      genre: "history",
      hasWatermark: true,
      status: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
    });
    tvPostsCreated += 1;
  }

  let avatarFeed = false;
  const avatarPath = options.avatarPath ? remapSchoolGalleryPathForUser(String(options.avatarPath).trim(), uid) : "";
  if (avatarPath && avatarPath.includes("/uploads/school-gallery/")) {
    const prev = String(options.previousAvatar || "").trim();
    const feed = await publishProfileAvatarFeedUpdate({
      userId,
      avatarPath,
      previousAvatar: prev || undefined,
    });
    avatarFeed = !feed.skipped;
  }

  if (tvPostsCreated > 0 || avatarFeed) {
    bumpStatusStripCache();
  }

  return { tvPostsCreated, avatarFeed };
}

/** Backfill TV + avatar feed for a school that already has gallery URLs in DB. */
export async function backfillSchoolGalleryFeedForUser(
  userId: mongoose.Types.ObjectId | string
): Promise<{ tvPostsCreated: number; avatarFeed?: boolean }> {
  const user = await User.findById(userId)
    .select("name avatar profileGalleryUrls")
    .lean();
  if (!user) return { tvPostsCreated: 0 };
  const urls = [
    ...new Set([
      ...(Array.isArray(user.profileGalleryUrls) ? user.profileGalleryUrls : []),
      ...(user.avatar ? [user.avatar] : []),
    ]),
  ].filter((u) => typeof u === "string" && u.includes("/uploads/school-gallery/")) as string[];

  return publishSchoolGalleryFeedUpdates({
    userId,
    schoolName: String(user.name || "School"),
    newMediaPaths: urls,
    avatarPath: user.avatar,
    previousAvatar: null,
  });
}
