import mongoose from "mongoose";
import TVPost from "../data/models/TVPost";
import User from "../data/models/User";
import Follow from "../data/models/Follow";
import { sendNotification } from "./notification";
import { userPublicDisplayName } from "../utils/userDisplayLabel";
import { logger } from "./monitoring";
import { bumpStatusStripCache } from "./statusStripPolicy";
import { clearTvFeedCache } from "./tvFeedCache";

export const PROFILE_AVATAR_FEED_ACTIVITY = "profile_avatar_update";

/**
 * When a user changes their profile picture: create a wall/TV feed post, refresh statuses,
 * and notify accepted followers (realtime + saved in-app notification).
 */
export async function publishProfileAvatarFeedUpdate(params: {
  userId: mongoose.Types.ObjectId | string;
  avatarPath: string;
  previousAvatar?: string | null;
}): Promise<{ postId?: string; caption?: string; avatarPath?: string; createdAt?: Date; skipped?: boolean }> {
  try {
    const avatarPath = String(params.avatarPath || "").trim();
    if (!avatarPath) return { skipped: true };

    const prev = String(params.previousAvatar || "").trim();
    if (prev && prev === avatarPath) return { skipped: true };

    const userId =
      params.userId instanceof mongoose.Types.ObjectId
        ? params.userId
        : new mongoose.Types.ObjectId(String(params.userId));

    const user = await User.findById(userId).select("name username email avatar").lean();
    if (!user) return { skipped: true };

    const label = userPublicDisplayName(user);
    const caption = `${label} updated profile picture`;

    const post = await TVPost.create({
      creatorId: userId,
      type: "image",
      mediaUrls: [avatarPath],
      caption,
      feedActivity: PROFILE_AVATAR_FEED_ACTIVITY,
      status: "approved",
      hasWatermark: false,
    });

    const followers = await Follow.find({
      followingId: userId,
      status: "accepted",
    })
      .select("followerId")
      .lean();

    const followerIds = followers
      .map((f) => String(f.followerId))
      .filter((id) => id && id !== String(userId));

    await Promise.all(
      followerIds.map((followerId) =>
        sendNotification({
          userId: followerId,
          type: "PROFILE_AVATAR_UPDATE",
          message: caption,
          channel: "realtime",
        })
      )
    );

    logger.info("Profile avatar feed post published", {
      userId: String(userId),
      postId: String(post._id),
      followerCount: followerIds.length,
    });

    bumpStatusStripCache();
    clearTvFeedCache();

    return {
      postId: String(post._id),
      caption,
      avatarPath,
      createdAt: post.createdAt,
    };
  } catch (err) {
    logger.warn("publishProfileAvatarFeedUpdate failed (non-fatal)", {
      error: String((err as Error)?.message || err),
    });
    return { skipped: true };
  }
}
