import axios, { isAxiosError } from "axios";

const GRAPH_VERSION = (process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0").replace(/^v?/, "v");
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permissions needed for Page slug resolve + /posts (third-party Pages also need App Review: Page Public Content Access). */
export const FACEBOOK_INGEST_REQUIRED_SCOPES = ["pages_read_engagement", "pages_show_list"] as const;

export type FacebookGraphPostMedia = {
  kind: "image" | "video" | "none";
  imageUrl?: string;
  videoUrl?: string;
};

export type FacebookGraphPost = {
  id: string;
  message?: string;
  permalinkUrl?: string;
  createdTime?: string;
  media: FacebookGraphPostMedia;
};

function graphToken(): string {
  return (
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
    process.env.FACEBOOK_USER_ACCESS_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN ||
    ""
  ).trim();
}

export function isFacebookGraphConfigured(): boolean {
  return !!graphToken();
}

function appIdSecret(): { appId: string; appSecret: string } {
  const appId = (process.env.FACEBOOK_APP_ID || "").trim();
  const appSecret = (process.env.FACEBOOK_APP_SECRET || "").trim();
  if (!appId || !appSecret) throw new Error("FACEBOOK_APP_ID and FACEBOOK_APP_SECRET required");
  return { appId, appSecret };
}

export type FacebookTokenDebug = {
  type: string;
  isValid: boolean;
  scopes: string[];
  expiresAt?: number;
  userId?: string;
};

export async function debugFacebookAccessToken(token = graphToken()): Promise<FacebookTokenDebug> {
  const { appId, appSecret } = appIdSecret();
  if (!token) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN not configured");
  const res = await axios.get(`${GRAPH}/debug_token`, {
    params: { input_token: token, access_token: `${appId}|${appSecret}` },
    timeout: 30000,
  });
  const d = (res.data?.data || {}) as Record<string, unknown>;
  return {
    type: String(d.type || ""),
    isValid: !!d.is_valid,
    scopes: Array.isArray(d.scopes) ? d.scopes.map(String) : [],
    expiresAt: typeof d.expires_at === "number" ? d.expires_at : undefined,
    userId: d.user_id ? String(d.user_id) : undefined,
  };
}

export function missingFacebookIngestScopes(scopes: string[]): string[] {
  return FACEBOOK_INGEST_REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
}

export async function assertFacebookIngestTokenReady(): Promise<void> {
  const debug = await debugFacebookAccessToken();
  if (!debug.isValid) {
    throw new Error(
      "Facebook access token is invalid or expired. Regenerate in Graph API Explorer and set FACEBOOK_PAGE_ACCESS_TOKEN."
    );
  }
  const missing = missingFacebookIngestScopes(debug.scopes);
  if (missing.length) {
    throw new Error(
      `Facebook token missing permissions: ${missing.join(", ")}. In Graph API Explorer add those permissions, click Generate Access Token, then update FACEBOOK_PAGE_ACCESS_TOKEN. (App secret alone cannot read Page posts.)`
    );
  }
}

export type ManagedFacebookPage = {
  id: string;
  name?: string;
  username?: string;
  accessToken: string;
};

/** Pages the token holder can manage — use page access_token for owned Pages. */
let managedPagesCache: { at: number; pages: ManagedFacebookPage[] } | null = null;
const MANAGED_PAGES_TTL_MS = 10 * 60 * 1000;

export function clearManagedFacebookPagesCache(): void {
  managedPagesCache = null;
}

export async function listManagedFacebookPages(opts?: { force?: boolean }): Promise<ManagedFacebookPage[]> {
  const now = Date.now();
  if (!opts?.force && managedPagesCache && now - managedPagesCache.at < MANAGED_PAGES_TTL_MS) {
    return managedPagesCache.pages;
  }
  const token = graphToken();
  if (!token) return [];
  try {
    const res = await axios.get(`${GRAPH}/me/accounts`, {
      params: { fields: "id,name,username,access_token", access_token: token, limit: 50 },
      timeout: 30000,
    });
    const rows = res.data?.data;
    if (!Array.isArray(rows)) return managedPagesCache?.pages || [];
    const pages = rows
      .map((row: Record<string, unknown>) => ({
        id: String(row.id || ""),
        name: row.name ? String(row.name) : undefined,
        username: row.username ? String(row.username) : undefined,
        accessToken: String(row.access_token || ""),
      }))
      .filter((p) => p.id && p.accessToken);
    managedPagesCache = { at: now, pages };
    return pages;
  } catch (err) {
    // On transient rate limits, reuse last good cache if any.
    if (managedPagesCache?.pages?.length) return managedPagesCache.pages;
    return [];
  }
}

/** Short-lived user token → ~60-day user token (still needs correct scopes). */
export async function exchangeFacebookLongLivedUserToken(shortLivedToken: string): Promise<string> {
  const { appId, appSecret } = appIdSecret();
  const res = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
    timeout: 30000,
  });
  const out = String(res.data?.access_token || "").trim();
  if (!out) throw new Error("Long-lived token exchange returned no access_token");
  return out;
}

async function resolveManagedPageToken(pageSlug: string): Promise<string | null> {
  const slug = pageSlug.trim().toLowerCase();
  const pages = await listManagedFacebookPages();
  const hit = pages.find(
    (p) =>
      (p.username || "").toLowerCase() === slug ||
      (p.name || "").toLowerCase().replace(/\s+/g, "") === slug.replace(/\s+/g, "")
  );
  return hit?.accessToken || null;
}

function parseAttachments(data: Record<string, unknown>): FacebookGraphPostMedia {
  const attachments = data.attachments as { data?: Array<Record<string, unknown>> } | undefined;
  const items = attachments?.data || [];
  for (const item of items) {
    const type = String(item.type || "").toLowerCase();
    const media = item.media as { image?: { src?: string }; source?: string } | undefined;
    if (type === "video_inline" || type === "video") {
      const src = media?.source || (item as { url?: string }).url;
      if (src) return { kind: "video", videoUrl: String(src) };
    }
    if (type === "photo" || type === "album") {
      const img = media?.image?.src || (item as { url?: string }).url;
      if (img) return { kind: "image", imageUrl: String(img) };
      const subs = item.subattachments as { data?: Array<Record<string, unknown>> } | undefined;
      for (const sub of subs?.data || []) {
        const subMedia = sub.media as { image?: { src?: string }; source?: string } | undefined;
        if (subMedia?.source) return { kind: "video", videoUrl: String(subMedia.source) };
        if (subMedia?.image?.src) return { kind: "image", imageUrl: String(subMedia.image.src) };
      }
    }
  }
  const fullPicture = String(data.full_picture || "").trim();
  if (fullPicture) return { kind: "image", imageUrl: fullPicture };
  return { kind: "none" };
}

function mapPost(row: Record<string, unknown>): FacebookGraphPost {
  return {
    id: String(row.id || ""),
    message: row.message ? String(row.message) : undefined,
    permalinkUrl: row.permalink_url ? String(row.permalink_url) : undefined,
    createdTime: row.created_time ? String(row.created_time) : undefined,
    media: parseAttachments(row),
  };
}

/** Resolve Page slug → numeric id (requires token with pages_read_engagement or Page Public Content Access). */
export async function resolveFacebookPageId(pageSlug: string): Promise<{ id: string; name?: string }> {
  await assertFacebookIngestTokenReady();
  const slug = pageSlug.trim();
  const managed = await resolveManagedPageToken(slug);
  const token = managed || graphToken();
  if (!token) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN not configured");
  const res = await axios.get(`${GRAPH}/${encodeURIComponent(slug)}`, {
    params: { fields: "id,name", access_token: token },
    timeout: 30000,
  });
  const id = String(res.data?.id || "").trim();
  if (!id) throw new Error(`Could not resolve Facebook Page id for ${slug}`);
  return { id, name: res.data?.name ? String(res.data.name) : undefined };
}

/** Latest Page posts with text + image/video attachments. */
export async function fetchFacebookPagePosts(
  pageId: string,
  limit = 15,
  pageSlugForToken?: string
): Promise<FacebookGraphPost[]> {
  await assertFacebookIngestTokenReady();
  const managed =
    pageSlugForToken ? await resolveManagedPageToken(pageSlugForToken) : null;
  const token = managed || graphToken();
  if (!token) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN not configured");
  const fields = [
    "id",
    "message",
    "permalink_url",
    "created_time",
    "full_picture",
    "attachments{type,media,subattachments,type,url}",
  ].join(",");
  const res = await axios.get(`${GRAPH}/${encodeURIComponent(pageId)}/posts`, {
    params: { fields, limit, access_token: token },
    timeout: 45000,
  });
  const data = res.data?.data;
  if (!Array.isArray(data)) return [];
  return data.map((row: Record<string, unknown>) => mapPost(row));
}

export function formatFacebookGraphError(err: unknown): string {
  if (isAxiosError(err)) {
    const fb = err.response?.data as { error?: { message?: string; code?: number; type?: string } };
    if (fb?.error?.message) {
      return `[${fb.error.code ?? "?"}] ${fb.error.message}`;
    }
    return err.message;
  }
  return String((err as Error)?.message || err);
}

/** Permissions needed to publish marketplace products to a Page you manage. */
export const FACEBOOK_PUBLISH_REQUIRED_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
] as const;

export function missingFacebookPublishScopes(scopes: string[]): string[] {
  return FACEBOOK_PUBLISH_REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
}

async function resolvePageAccessTokenForId(pageId: string): Promise<string> {
  const pages = await listManagedFacebookPages();
  const hit = pages.find((p) => p.id === pageId);
  if (hit?.accessToken) return hit.accessToken;

  const qwertymatesPageId = (process.env.FACEBOOK_QWERTYMATES_PAGE_ID || "427972753928205").trim();
  const buyAfrikaPageId = (process.env.FACEBOOK_BUYAFRIKA_PAGE_ID || "104790967934453").trim();
  const bmeidaPageId = (
    process.env.FACEBOOK_BMEIDA_PAGE_ID ||
    process.env.FACEBOOK_BMEDIA_PAGE_ID ||
    "101382291537671"
  ).trim();

  // Prefer page-specific tokens only for the matching page id (avoid using a stale
  // Qwertymates page token as a fallback for every Page publish).
  let dedicated = "";
  if (pageId === qwertymatesPageId) {
    dedicated = (process.env.FACEBOOK_QWERTYMATES_PAGE_ACCESS_TOKEN || "").trim();
  } else if (pageId === buyAfrikaPageId) {
    dedicated = (process.env.FACEBOOK_BUYAFRIKA_PAGE_ACCESS_TOKEN || "").trim();
  } else if (pageId === bmeidaPageId) {
    dedicated = (
      process.env.FACEBOOK_BMEIDA_PAGE_ACCESS_TOKEN ||
      process.env.FACEBOOK_BMEDIA_PAGE_ACCESS_TOKEN ||
      ""
    ).trim();
  }
  if (dedicated) return dedicated;

  const token = graphToken();
  if (!token) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN not configured");
  return token;
}

/** Map profile URL id or name to Graph API Page id + page access token when possible. */
export async function resolveFacebookPublishPage(
  configuredPageId: string,
  nameHint = "Qwertymates"
): Promise<{ pageId: string; accessToken: string }> {
  const pages = await listManagedFacebookPages();
  const byId = pages.find((p) => p.id === configuredPageId);
  if (byId) return { pageId: byId.id, accessToken: byId.accessToken };
  const byName = pages.find((p) => (p.name || "").toLowerCase() === nameHint.toLowerCase());
  if (byName) return { pageId: byName.id, accessToken: byName.accessToken };
  return { pageId: configuredPageId, accessToken: await resolvePageAccessTokenForId(configuredPageId) };
}

export type FacebookPagePublishResult = {
  postId: string;
  permalinkUrl?: string;
};

/** Publish a photo + caption to a Facebook Page (marketplace product posts). */
export async function publishFacebookPagePhotoPost(params: {
  pageId: string;
  imageUrl: string;
  caption: string;
  link?: string;
}): Promise<FacebookPagePublishResult> {
  const { pageId, accessToken } = await resolveFacebookPublishPage(params.pageId);
  const body: Record<string, string | boolean> = {
    url: params.imageUrl,
    caption: params.caption,
    published: true,
    access_token: accessToken,
  };
  if (params.link) body.link = params.link;
  const res = await axios.post(`${GRAPH}/${encodeURIComponent(pageId)}/photos`, null, {
    params: body,
    timeout: 60000,
  });
  const postId = String(res.data?.post_id || res.data?.id || "").trim();
  if (!postId) throw new Error("Facebook photo publish returned no post id");
  return { postId };
}

/** Text + link post when no image is available. */
export async function publishFacebookPageFeedPost(params: {
  pageId: string;
  message: string;
  link?: string;
}): Promise<FacebookPagePublishResult> {
  const { pageId, accessToken } = await resolveFacebookPublishPage(params.pageId);
  const body: Record<string, string> = {
    message: params.message,
    access_token: accessToken,
  };
  if (params.link) body.link = params.link;
  const res = await axios.post(`${GRAPH}/${encodeURIComponent(pageId)}/feed`, null, {
    params: body,
    timeout: 45000,
  });
  const postId = String(res.data?.id || "").trim();
  if (!postId) throw new Error("Facebook feed publish returned no post id");
  return { postId };
}

/** Delete a Page post/photo by Graph object id (requires pages_manage_posts). */
export async function deleteFacebookPageObject(objectId: string): Promise<boolean> {
  const id = String(objectId || "").trim();
  if (!id) throw new Error("objectId required");
  const { accessToken } = await resolveFacebookPublishPage(
    (process.env.FACEBOOK_QWERTYMATES_PAGE_ID || "").trim() || id.split("_")[0] || id
  );
  const res = await axios.delete(`${GRAPH}/${encodeURIComponent(id)}`, {
    params: { access_token: accessToken },
    timeout: 45000,
  });
  return Boolean(res.data?.success ?? res.status === 200);
}

/** List recent published posts on a Page (message + created_time). */
export async function listFacebookPageFeedPosts(params: {
  pageId: string;
  limit?: number;
}): Promise<Array<{ id: string; message?: string; createdTime?: string; permalinkUrl?: string }>> {
  const { pageId, accessToken } = await resolveFacebookPublishPage(params.pageId);
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);
  const out: Array<{ id: string; message?: string; createdTime?: string; permalinkUrl?: string }> = [];
  let url: string | null = `${GRAPH}/${encodeURIComponent(pageId)}/feed`;
  let nextParams: Record<string, string | number> | null = {
    fields: "id,message,created_time,permalink_url",
    limit,
    access_token: accessToken,
  };

  while (url && out.length < (params.limit || 100)) {
    const res: { data?: { data?: unknown[]; paging?: { next?: string } } } = await axios.get(url, {
      params: nextParams || undefined,
      timeout: 45000,
    });
    const rows = Array.isArray(res.data?.data) ? res.data!.data! : [];
    for (const row of rows as Array<{
      id?: string;
      message?: string;
      created_time?: string;
      permalink_url?: string;
    }>) {
      out.push({
        id: String(row.id || ""),
        message: row.message ? String(row.message) : undefined,
        createdTime: row.created_time ? String(row.created_time) : undefined,
        permalinkUrl: row.permalink_url ? String(row.permalink_url) : undefined,
      });
      if (out.length >= (params.limit || 100)) break;
    }
    const nextUrl: string | undefined = res.data?.paging?.next;
    if (!nextUrl || rows.length === 0) break;
    url = String(nextUrl);
    nextParams = null;
  }
  return out.filter((p) => p.id);
}
