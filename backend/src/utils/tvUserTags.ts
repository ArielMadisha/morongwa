import mongoose from "mongoose";
import User from "../data/models/User";
import { sendNotification } from "../services/notification";
import { sendExpoPushToUser } from "../services/expoPush";
import { userPublicDisplayName } from "./userDisplayLabel";
import { logger } from "../services/monitoring";

export const TV_TAG_MAX_PER_POST = 20;

/** @handle in captions/comments — letters, digits, underscore. */
const MENTION_RE = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,48})/g;

export function extractMentionUsernames(...parts: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const text = String(part);
    const re = new RegExp(MENTION_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const u = String(m[1] || "").trim().toLowerCase();
      if (u) seen.add(u);
    }
  }
  return [...seen];
}

function collectExplicitIds(raw: unknown, actorId: string): string[] {
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const ids: string[] = [];
  for (const entry of list) {
    if (entry && typeof entry === "object" && (entry as { userId?: unknown }).userId) {
      const id = String((entry as { userId: unknown }).userId);
      if (mongoose.isValidObjectId(id)) ids.push(id);
      continue;
    }
    const id = String(entry || "").trim();
    if (mongoose.isValidObjectId(id)) ids.push(id);
  }
  return ids.filter((id) => id !== String(actorId));
}

export async function resolveTaggedUserIds(options: {
  actorId: string;
  explicitIds?: unknown;
  texts?: (string | undefined | null)[];
}): Promise<mongoose.Types.ObjectId[]> {
  const actorId = String(options.actorId || "");
  const fromExplicit = collectExplicitIds(options.explicitIds, actorId);
  const usernames = extractMentionUsernames(...(options.texts || []));

  const orClauses: Record<string, unknown>[] = [];
  if (fromExplicit.length) {
    orClauses.push({ _id: { $in: fromExplicit.map((id) => new mongoose.Types.ObjectId(id)) } });
  }
  if (usernames.length) {
    orClauses.push({ username: { $in: usernames } });
  }
  if (!orClauses.length) return [];

  const users = await User.find({
    $or: orClauses,
    _id: { $ne: actorId },
    active: { $ne: false },
    suspended: { $ne: true },
  })
    .select("_id")
    .limit(TV_TAG_MAX_PER_POST * 2)
    .lean();

  const seen = new Set<string>();
  const out: mongoose.Types.ObjectId[] = [];
  for (const u of users) {
    const id = String(u._id);
    if (seen.has(id) || id === actorId) continue;
    seen.add(id);
    out.push(u._id as mongoose.Types.ObjectId);
    if (out.length >= TV_TAG_MAX_PER_POST) break;
  }
  return out;
}

export function tagNounForPostType(type?: string): string {
  const t = String(type || "").toLowerCase();
  if (t === "image" || t === "carousel") return "a photo";
  if (t === "video") return "a video";
  return "a post";
}

export async function notifyTaggedUsers(options: {
  actorId: string;
  actorName: string;
  postId: string;
  postType?: string;
  taggedIds: Array<string | mongoose.Types.ObjectId>;
  previousIds?: Array<string | mongoose.Types.ObjectId>;
  kind?: "post" | "comment";
}): Promise<void> {
  const actorId = String(options.actorId || "");
  const prev = new Set((options.previousIds || []).map((id) => String(id)));
  const ids = [...new Set(options.taggedIds.map((id) => String(id)))].filter(
    (id) => id && id !== actorId && !prev.has(id)
  );
  if (!ids.length) return;

  const actorName = String(options.actorName || "Someone").trim() || "Someone";
  const noun = tagNounForPostType(options.postType);
  const message =
    options.kind === "comment"
      ? `${actorName} mentioned you in a comment`
      : `${actorName} tagged you in ${noun}`;
  const url = `/morongwa-tv/post/${options.postId}`;

  await Promise.all(
    ids.map(async (userId) => {
      try {
        await sendNotification({
          userId,
          type: options.kind === "comment" ? "comment_mention" : "post_tag",
          message,
          channel: "realtime",
          meta: {
            postId: options.postId,
            url,
            taggedByUserId: actorId,
          },
        });
      } catch (e) {
        logger.warn("tag notification failed", { userId, err: String((e as Error)?.message || e) });
      }
      try {
        await sendExpoPushToUser(userId, {
          title: "Tagged",
          body: message,
          data: { type: "post_tag", postId: options.postId, url },
          channelId: "default",
        });
      } catch (e) {
        logger.warn("tag push failed", { userId, err: String((e as Error)?.message || e) });
      }
    })
  );
}

export function taggedIdsFromPost(post: { taggedUserIds?: unknown }): string[] {
  const list = Array.isArray(post?.taggedUserIds) ? post.taggedUserIds : [];
  return list
    .map((t) => {
      if (t && typeof t === "object" && (t as { _id?: unknown })._id) return String((t as { _id: unknown })._id);
      return String(t || "");
    })
    .filter((id) => mongoose.isValidObjectId(id));
}

/** Populate tagged user docs when feed rows only have ObjectIds (e.g. random aggregate). */
export async function hydrateTaggedUsers(posts: any[]): Promise<any[]> {
  if (!Array.isArray(posts) || !posts.length) return posts;
  const ids: string[] = [];
  for (const p of posts) {
    for (const t of p?.taggedUserIds || []) {
      if (t && typeof t === "object" && ((t as { name?: string }).name || (t as { username?: string }).username)) {
        continue;
      }
      const id = String((t as { _id?: unknown })?._id || t || "");
      if (mongoose.isValidObjectId(id)) ids.push(id);
    }
  }
  if (!ids.length) return posts;
  const users = await User.find({ _id: { $in: [...new Set(ids)] } })
    .select("name username avatar isSchoolAccount")
    .lean();
  const map = new Map(users.map((u) => [String(u._id), u]));
  return posts.map((p) => {
    const tags = Array.isArray(p?.taggedUserIds) ? p.taggedUserIds : [];
    if (!tags.length) return p;
    return {
      ...p,
      taggedUserIds: tags
        .map((t: unknown) => {
          if (t && typeof t === "object" && ((t as { name?: string }).name || (t as { username?: string }).username)) {
            return t;
          }
          const id = String((t as { _id?: unknown })?._id || t || "");
          return map.get(id) || null;
        })
        .filter(Boolean),
    };
  });
}

export function mapTaggedUsersForClient(post: any, withDisplayName: (row: any) => any): any {
  const tags = post?.taggedUserIds;
  if (!Array.isArray(tags) || !tags.length) return post;
  return {
    ...post,
    taggedUserIds: tags.map((u: any) => {
      if (!u || typeof u !== "object") return u;
      return withDisplayName({
        ...u,
        _id: u._id,
        name: u.name,
        username: u.username,
        email: u.email,
      });
    }),
  };
}

export function actorDisplayName(user: { name?: string; username?: string; email?: string } | null | undefined): string {
  return userPublicDisplayName(user || {});
}
