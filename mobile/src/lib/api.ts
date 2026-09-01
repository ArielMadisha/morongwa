import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Platform } from "react-native";
import { MOBILE_API_URL } from "../config";
import {
  Advert,
  CartItem,
  MessengerConversation,
  MessengerMessageRow,
  Product,
  TVComment,
  TVPost,
  MusicSong,
  StoreSummary,
  User,
  UserProfileStats,
  WalletTransaction,
  Task,
} from "../types";

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let clearingAuth = false;

const TOKEN_STORAGE_KEY = "qwertymates.mobile.token";
const USER_STORAGE_KEY = "qwertymates.mobile.user";
const AUTH_ESTABLISH_PATH_RE =
  /\/auth\/(login|register|send-otp|verify-otp|send-email-otp|verify-email-otp)(?:\?|$)/i;

const API_BASE = MOBILE_API_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

/** Normalize media URL and return absolute URL for Image/Video. Handles bare filenames (legacy). */
export function toAbsoluteMediaUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  let path = url.trim();
  if (path.startsWith("/uploads/")) return `${API_BASE}${path}`;
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  // Bare filename (legacy): tv-* -> /uploads/tv/, else -> /uploads/
  const prefix = path.startsWith("tv-") ? "/uploads/tv/" : "/uploads/";
  return `${API_BASE}${prefix}${path}`;
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/** Register AuthContext logout (or similar) when API returns invalid/expired token. */
export function registerUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function isAuthClearedErrorMessage(msg: string): boolean {
  return (
    /Invalid token/i.test(msg) ||
    /Authentication required/i.test(msg) ||
    /No token/i.test(msg)
  );
}

function readHeader(headers: unknown, name: string): string {
  if (!headers || typeof headers !== "object") return "";
  const h = headers as { get?: (n: string) => unknown; [k: string]: unknown };
  if (typeof h.get === "function") {
    const viaGet = h.get(name) ?? h.get(name.toLowerCase());
    if (viaGet) return String(viaGet);
  }
  const direct = h[name] ?? h[name.toLowerCase()] ?? h.Authorization ?? h.authorization;
  return direct ? String(direct) : "";
}

function applyBearerHeader(headers: unknown, token: string): void {
  const value = `Bearer ${token}`;
  const h = headers as {
    set?: (n: string, v: string) => unknown;
    setAuthorization?: (v: string) => unknown;
    [k: string]: unknown;
  } | null;
  if (!h) return;
  if (typeof h.set === "function") {
    h.set("Authorization", value);
    return;
  }
  if (typeof h.setAuthorization === "function") {
    h.setAuthorization(value);
    return;
  }
  h.Authorization = value;
}

function requestUrl(error: { config?: { url?: string; baseURL?: string } } | undefined): string {
  return String(error?.config?.url || "");
}

async function clearStoredAuthAndNotify() {
  if (clearingAuth) return;
  clearingAuth = true;
  setAuthToken(null);
  try {
    await AsyncStorage.multiRemove([TOKEN_STORAGE_KEY, USER_STORAGE_KEY]);
  } catch {
    /* ignore storage failures */
  }
  try {
    unauthorizedHandler?.();
  } finally {
    clearingAuth = false;
  }
}

export const api = axios.create({
  baseURL: MOBILE_API_URL,
  timeout: 45_000,
  headers: {
    "Content-Type": "application/json"
  }
});

/** User-facing message when the app cannot reach the API (release builds use api.qwertymates.com). */
export function formatApiError(err: unknown, fallback = "Request failed"): string {
  const ax = err as {
    message?: string;
    response?: { data?: { error?: string; message?: string } };
    code?: string;
  };
  const server =
    ax?.response?.data?.error ||
    ax?.response?.data?.message ||
    (typeof ax?.response?.data === "string" ? ax.response.data : "");
  if (server) return String(server);
  if (ax?.code === "ECONNABORTED" || /timeout/i.test(String(ax?.message || ""))) {
    return "Connection timed out. Check your internet and try again.";
  }
  if (ax?.code === "ERR_NETWORK" || !ax?.response) {
    return "Cannot reach Qwertymates servers. Check your connection and try again.";
  }
  return ax?.message || fallback;
}

function isMultipartBody(data: unknown): boolean {
  if (data == null) return false;
  if (typeof FormData !== "undefined" && data instanceof FormData) return true;
  return typeof data === "object" && typeof (data as FormData).append === "function";
}

api.interceptors.request.use((config) => {
  if (authToken) {
    if (!config.headers) config.headers = {} as typeof config.headers;
    applyBearerHeader(config.headers, authToken);
    (config as { __qmBearer?: string }).__qmBearer = `Bearer ${authToken}`;
  }
  // React Native FormData often fails `instanceof FormData`; never send JSON Content-Type on multipart.
  if (isMultipartBody(config.data)) {
    const headers = config.headers as Record<string, unknown>;
    delete headers["Content-Type"];
    delete headers["content-type"];
    config.transformRequest = [(body) => body];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const msg = String(
      error?.response?.data?.error ||
        error?.response?.data?.message ||
        (typeof error?.response?.data === "string" ? error.response.data : "") ||
        ""
    );
    const url = requestUrl(error);
    // Login/register 401s (bad password) must not wipe a session we just stored.
    if (AUTH_ESTABLISH_PATH_RE.test(url)) {
      return Promise.reject(error);
    }
    if (status === 401 && isAuthClearedErrorMessage(msg)) {
      const stamped = String((error?.config as { __qmBearer?: string } | undefined)?.__qmBearer || "");
      const sent = (readHeader(error?.config?.headers, "Authorization") || stamped).trim();
      const current = authToken ? `Bearer ${authToken}` : "";
      // Ignore stale 401s (no header, or a token that is no longer current).
      // Otherwise a /auth/me or Home request that raced login wipes the new session.
      if (current && sent === current) {
        await clearStoredAuthAndNotify();
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data: { email?: string; username?: string; phone?: string; password: string }) =>
    api.post("/auth/login", data),
  register: (data: {
    name: string;
    email?: string;
    username?: string;
    password: string;
    role?: string[];
    dateOfBirth?: string;
    phone?: string;
    otpToken?: string;
    emailToken?: string;
  }) => api.post("/auth/register", data),
  sendEmailOtp: (email: string) => api.post("/auth/send-email-otp", { email }),
  verifyEmailOtp: (email: string, otp: string) => api.post("/auth/verify-email-otp", { email, otp }),
  /** Phone SMS/WhatsApp OTP (web register path). */
  sendOtp: (phone: string, channel: "sms" | "whatsapp" = "sms") =>
    api.post<{ message?: string }>("/auth/send-otp", { phone, channel }),
  verifyOtp: (phone: string, otp: string) =>
    api.post<{ otpToken?: string; message?: string }>("/auth/verify-otp", { phone, otp }),
  me: () => api.get("/auth/me")
};

/** Multipart file shape for React Native and web (uri + name + mime + optional File). */
export type RNUploadFile = { uri: string; name: string; type: string; webFile?: unknown };

function toMultipartPart(file: RNUploadFile): any {
  const maybeWebFile = file.webFile;
  if (typeof File !== "undefined" && maybeWebFile instanceof File) return maybeWebFile;
  if (typeof Blob !== "undefined" && maybeWebFile instanceof Blob) return maybeWebFile;
  let uri = String(file.uri || "").trim();
  if (
    Platform.OS === "android" &&
    uri &&
    !uri.startsWith("file://") &&
    !uri.startsWith("content://") &&
    !uri.startsWith("http://") &&
    !uri.startsWith("https://")
  ) {
    uri = `file://${uri}`;
  }
  return {
    uri,
    name: file.name || "upload.bin",
    type: file.type || "application/octet-stream"
  };
}

/** Native multipart uploads via fetch — axios + RN FormData often yields ERR_NETWORK. */
async function apiMultipartPost<T>(path: string, buildForm: (fd: FormData) => void, timeoutMs: number) {
  const fd = new FormData();
  buildForm(fd);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${MOBILE_API_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: fd,
      signal: controller.signal
    });
    const text = await res.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        if (!res.ok) {
          const err = new Error(text.slice(0, 200) || `Upload failed (${res.status})`);
          (err as { response?: { status: number; data: unknown } }).response = {
            status: res.status,
            data: text
          };
          throw err;
        }
      }
    }
    if (!res.ok) {
      const message =
        (typeof payload.message === "string" && payload.message) ||
        (typeof payload.error === "string" && payload.error) ||
        `Upload failed (${res.status})`;
      const err = new Error(message);
      (err as { response?: { status: number; data: unknown } }).response = {
        status: res.status,
        data: payload
      };
      throw err;
    }
    return { data: payload as T };
  } catch (e: unknown) {
    const err = e as { name?: string; code?: string; message?: string };
    if (err?.name === "AbortError") {
      const timeoutErr = new Error("Connection timed out. Check your internet and try again.");
      (timeoutErr as { code?: string }).code = "ECONNABORTED";
      throw timeoutErr;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const tvAPI = {
  getPost: (id: string) => api.get<{ data: TVPost }>(`/tv/${id}`),
  /** Instagram-style status rings (recent posters). */
  getStatuses: () =>
    api.get<{
      data: Array<{
        statusKey?: string;
        userId: string | { _id?: string };
        name?: string;
        avatar?: string;
        isStoreStatus?: boolean;
        supplierId?: string;
        storeSlug?: string;
        latestPost?: {
          _id: string;
          type: string;
          mediaUrls?: string[];
          artworkUrl?: string;
          createdAt?: string;
        } | null;
        posts?: Array<{
          _id: string;
          type: string;
          mediaUrls?: string[];
          artworkUrl?: string;
          createdAt?: string;
        }>;
      }>;
    }>("/tv/statuses"),
  getFeed: (params?: {
    page?: number;
    limit?: number;
    sort?: "newest" | "trending" | "random";
    q?: string;
    type?: "video" | "image" | "carousel" | "product" | "audio" | "text" | "images";
    genre?: string;
  }) =>
    api.get<{ data: TVPost[]; total: number; page: number; limit: number }>("/tv", { params }),
  getGenres: () =>
    api.get<{ data: { id: string; label: string; desc?: string }[] }>("/tv/genres"),
  getTrendingHashtags: (limit = 16, days = 7, mode: "latest" | "popular" = "popular") =>
    api.get<{ data: { tag: string; count: number }[]; windowDays?: number }>("/tv/hashtags/trending", {
      params: { limit, days, mode }
    }),
  like: (id: string) => api.post<{ data: { liked: boolean; likeCount: number } }>(`/tv/${id}/like`),
  getLiked: (id: string) => api.get<{ data: { liked: boolean } }>(`/tv/${id}/liked`),
  getComments: (id: string) => api.get<{ data: TVComment[] }>(`/tv/${id}/comments`),
  addComment: (id: string, text: string) => api.post<{ data: TVComment }>(`/tv/${id}/comments`, { text }),
  report: (id: string, reason: string) => api.post<{ message?: string }>(`/tv/${id}/report`, { reason }),
  /** POST /tv/upload — single image or video; field name `media`. */
  uploadMedia: (file: RNUploadFile) =>
    apiMultipartPost<{ url: string; sensitive?: boolean }>(
      "/tv/upload",
      (fd) => fd.append("media", toMultipartPart(file)),
      300_000
    ),
  /** POST /tv/upload-images — multiple images; field name `images` (max 20). */
  uploadImages: (files: RNUploadFile[]) =>
    apiMultipartPost<{ urls: string[]; sensitive?: boolean }>(
      "/tv/upload-images",
      (fd) => files.forEach((f) => fd.append("images", toMultipartPart(f))),
      180_000
    ),
  /** Create TV post (text, image, video, etc.) — same contract as web `CreatePostModal`. */
  createPost: (body: {
    type: "video" | "image" | "carousel" | "product" | "text" | "audio";
    mediaUrls?: string[];
    caption?: string;
    heading?: string;
    subject?: string;
    hashtags?: string[];
    taggedUserIds?: string[];
    productId?: string;
    filter?: string;
    genre?: string;
    artworkUrl?: string;
    songId?: string;
    sensitive?: boolean;
  }) => api.post<{ data: TVPost }>("/tv", body),
  /** DELETE /tv/:id — creator only (same as web). */
  deletePost: (id: string) => api.delete<{ message?: string }>(`/tv/${id}`)
};

export const advertsAPI = {
  getAdverts: (slot?: "random" | "promo") =>
    api.get<{ data: Advert[] }>("/adverts", { params: slot ? { slot } : {} })
};

export const usersAPI = {
  /** GET /users — MacGyver / search (auth). Response may be `{ users }` or nested `data`. */
  list: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get<{
      users?: User[];
      data?: User[] | { users?: User[] };
      pagination?: { total?: number; page?: number; limit?: number; pages?: number };
    }>("/users", { params }),
  getProfile: (id: string) => api.get<{ user: User }>(`/users/${id}`),
  getProfileStats: (id: string) => api.get<UserProfileStats>(`/users/${id}/profile-stats`),
  /** PUT /users/:id — profile fields (phone verify for ACBPay, etc.). */
  updateProfile: (
    id: string,
    data: {
      name?: string;
      username?: string;
      phone?: string;
      isPrivate?: boolean;
      avatar?: string;
    }
  ) => api.put<{ message?: string; user?: User }>(`/users/${id}`, data),
  uploadAvatar: (id: string, file: RNUploadFile) =>
    apiMultipartPost<{ message?: string; avatar?: string; user?: User }>(
      `/users/${id}/avatar`,
      (fd) => fd.append("avatar", toMultipartPart(file)),
      120_000
    ),
  /** DELETE /users/:id — self-service account deletion (password required). */
  deleteAccount: (id: string, password: string) =>
    api.delete<{ message?: string }>(`/users/${id}`, { data: { password } })
};

export const followsAPI = {
  follow: (userId: string) => api.post<{ message?: string }>(`/follows/${userId}`),
  unfollow: (userId: string) => api.delete<{ message?: string }>(`/follows/${userId}`),
  getStatus: (userId: string) =>
    api.get<{ following: boolean; status: "accepted" | "pending" | null }>(`/follows/${userId}/status`),
  getFollowers: (userId: string) => api.get<{ data: User[] }>(`/follows/${userId}/followers`),
  getFollowing: (userId: string) => api.get<{ data: User[] }>(`/follows/${userId}/following`),
  /** Suggested / search-filtered users (MacGyver). Auth required. */
  getSuggested: (params?: { limit?: number; q?: string }) =>
    api.get<{
      data: Array<{
        _id: string;
        name: string;
        avatar?: string;
        username?: string;
        followerCount?: number;
      }>;
    }>("/follows/suggested", { params })
};

export const productsAPI = {
  list: (params?: {
    limit?: number;
    page?: number;
    random?: boolean;
    q?: string;
    category?: string;
    /** Prefer warehouse stock (web AdvertTile uses `hammanskraal`). */
    warehouseCity?: string;
  }) =>
    api.get<{ data?: Product[]; hasMore?: boolean; page?: number; total?: number }>("/products", {
      params: {
        ...params,
        random: params?.random ? "1" : undefined,
        warehouseCity: params?.warehouseCity || undefined
      }
    }),
  getByIdOrSlug: (idOrSlug: string) => api.get<{ data?: Product }>(`/products/${idOrSlug}`)
};

/** Ask MacGyver AI — matches web `/api/macgyver/ask`. Requires auth. */
export type MacGyverAskResult =
  | { type: "search"; query: string }
  | { text: string; error?: string };

export const macgyverAPI = {
  ask: (query: string) => api.post<{ data: MacGyverAskResult }>("/macgyver/ask", { query })
};

/** Errands / tasks — matches backend `routes/tasks.ts` (mounted at /api/tasks). */
export const tasksAPI = {
  getMine: () => api.get<Task[]>("/tasks/my-tasks"),
  getMyAccepted: () => api.get<Task[]>("/tasks/my-accepted"),
  getAvailable: () => api.get<Task[]>("/tasks/available"),
  create: (body: {
    title: string;
    description: string;
    budget: number;
    pickupLocation: { type: string; coordinates: number[]; address?: string };
    deliveryLocation: { type: string; coordinates: number[]; address?: string };
  }) => api.post<{ message?: string; task?: Task }>("/tasks", body),
  accept: (id: string) => api.post<{ message?: string; task?: Task }>(`/tasks/${id}/accept`),
  start: (id: string) => api.post<{ message?: string; task?: Task }>(`/tasks/${id}/start`),
  complete: (id: string) => api.post<{ message?: string; task?: Task }>(`/tasks/${id}/complete`),
  cancel: (id: string) => api.post<{ message?: string; task?: Task }>(`/tasks/${id}/cancel`),
  checkArrival: (id: string, lat: number, lon: number) =>
    api.post<{ atDestination?: boolean; message?: string; distance?: number }>(`/tasks/${id}/check-arrival`, {
      lat,
      lon,
    }),
  confirmDelivery: (id: string) =>
    api.post<{ message?: string; task?: Task }>(`/tasks/${id}/confirm-delivery`),
};

/** City of Tshwane errands — `routes/errandsTshwane.ts` (same pricing as WhatsApp). */
export type TshwaneRegionRow = { id: string; label: string };
export type TshwaneTownshipRow = { id: string; name: string; regionId: string; lat: number; lng: number };

export const errandsTshwaneAPI = {
  getCoverage: () =>
    api.get<{ regions: TshwaneRegionRow[]; townships: TshwaneTownshipRow[] }>("/tasks/tshwane/coverage"),
  quote: (body: Record<string, unknown>) => api.post<{ quote: unknown }>("/tasks/tshwane/quote", body),
  book: (body: Record<string, unknown>) =>
    api.post<{ message?: string; task?: Task; estimate?: number }>("/tasks/tshwane/book", body),
};

export type PublicStoreSearchHit = {
  _id: string;
  name: string;
  slug: string;
  type?: "supplier" | "reseller";
  country?: string;
  countryCode?: string;
};

export const storesAPI = {
  getMine: () => api.get<{ data?: StoreSummary[] }>("/stores/me"),
  /** Public storefront search (MacGyver + web /search). */
  search: (params: { q: string; limit?: number }) =>
    api.get<{ data?: PublicStoreSearchHit[]; count?: number }>("/stores/search", { params }),
  getBySlug: (slug: string) => api.get<{ data?: StoreSummary }>(`/stores/by-slug/${slug}`),
  getProductsBySlug: (slug: string) =>
    api.get<{ data?: { storeType?: string; products?: Product[] } }>(`/stores/by-slug/${slug}/products`)
};

/** In-app Activity / shop-owner order notifications. */
export const notificationsAPI = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    read?: boolean | string;
    shopOrders?: boolean | string;
  }) => api.get("/notifications", { params }),
  markAsRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllAsRead: (params?: { shopOrders?: boolean | string }) =>
    api.post("/notifications/read-all", params?.shopOrders ? { shopOrders: true } : undefined, {
      params: params?.shopOrders ? { shopOrders: "1" } : undefined,
    }),
  getUnreadCount: (params?: { shopOrders?: boolean | string }) =>
    api.get<{ unreadCount: number; shopOrderUnreadCount?: number; isShopOwner?: boolean }>(
      "/notifications/unread/count",
      { params: params?.shopOrders ? { shopOrders: "1" } : undefined }
    ),
};

/** Shop-owner order receipts — matches web `suppliersAPI` / `GET /suppliers/me/orders`. */
export type ShopOrderReceipt = {
  orderId: string;
  orderNumber: string;
  supplierId: string;
  storeName?: string;
  status: string;
  prepStatus: "new" | "preparing" | "ready" | "collected";
  paidAt?: string | null;
  createdAt?: string | null;
  paymentMethod?: string;
  collection: boolean;
  buyer: { name?: string; phone?: string; username?: string } | null;
  items: Array<{
    productId: string;
    title: string;
    qty: number;
    unitPrice: number;
    foodServiceFeeZar: number;
    storeUnitPrice: number;
  }>;
  storeCreditZar: number;
  customerTotalZar: number;
};

export const suppliersAPI = {
  getMyOrders: (params?: { limit?: number; status?: string }) =>
    api.get<{ data: ShopOrderReceipt[] }>("/suppliers/me/orders", { params }),
  updateOrderPrepStatus: (
    orderId: string,
    data: { prepStatus: ShopOrderReceipt["prepStatus"]; supplierId?: string }
  ) => api.patch<{ data: ShopOrderReceipt }>(`/suppliers/me/orders/${orderId}/prep-status`, data),
};

export const resellerAPI = {
  getMyWall: () =>
    api.get<{
      data?: { products?: unknown[]; resellerId?: string };
    }>("/reseller/wall/me"),
  addProductToWall: (productId: string, resellerCommissionPct = 5) =>
    api.post(`/reseller/wall/add/${productId}`, { resellerCommissionPct })
};

export type PodcastShow = {
  _id: string;
  title: string;
  description?: string;
  category: string;
  coverUrl?: string;
  episodeCount?: number;
  subscriberCount?: number;
};

export type PodcastEpisodeItem = {
  _id: string;
  title: string;
  description?: string;
  category: string;
  audioUrl?: string;
  hlsUrl?: string;
  coverUrl?: string;
  durationSeconds?: number;
  playCount?: number;
  likeCount?: number;
  commentCount?: number;
  isPremium?: boolean;
  price?: number;
  locked?: boolean;
  liked?: boolean;
  subscribed?: boolean;
  podcastId?: { _id: string; title?: string; coverUrl?: string } | string;
  creatorId?: { _id: string; name?: string } | string;
};

export const podcastsAPI = {
  getCategories: () => api.get<{ data: { id: string; label: string }[] }>("/podcasts/categories"),
  listShows: (params?: { category?: string; q?: string; page?: number; limit?: number }) =>
    api.get<{ data: PodcastShow[]; hasMore?: boolean }>("/podcasts/shows", { params }),
  listEpisodes: (params?: {
    category?: string;
    podcastId?: string;
    q?: string;
    sort?: "newest" | "popular";
    page?: number;
    limit?: number;
  }) => api.get<{ data: PodcastEpisodeItem[]; hasMore?: boolean }>("/podcasts/episodes", { params }),
  getEpisode: (id: string) => api.get<{ data: PodcastEpisodeItem }>(`/podcasts/episodes/${id}`),
  getRecommended: (limit = 12) =>
    api.get<{ data: PodcastEpisodeItem[]; basis?: string }>("/podcasts/recommended", { params: { limit } }),
  likeEpisode: (id: string) =>
    api.post<{ data: { liked: boolean; likeCount: number } }>(`/podcasts/episodes/${id}/like`),
  recordPlay: (id: string, positionSeconds?: number) =>
    api.post(`/podcasts/episodes/${id}/play`, { positionSeconds }),
  listComments: (id: string) =>
    api.get<{
      data: { _id: string; text: string; createdAt: string; userId?: { _id: string; name?: string } }[];
    }>(`/podcasts/episodes/${id}/comments`),
  addComment: (id: string, text: string) => api.post(`/podcasts/episodes/${id}/comments`, { text }),
  toggleSubscribe: (showId: string) =>
    api.post<{ data: { subscribed: boolean } }>(`/podcasts/shows/${showId}/subscribe`),
  mySubscriptions: () => api.get<{ data: PodcastShow[] }>("/podcasts/me/subscriptions"),
  /** Premium unlock is Android/web only — iOS would need In-App Purchase (Guideline 3.1.1). */
  unlockEpisode: (id: string, platform: "android" | "ios" | "web") =>
    api.post<{ data: { unlocked: boolean; amount?: number } }>(`/podcasts/episodes/${id}/unlock`, { platform }),
};

export const musicAPI = {
  /** POST /music/upload-audio — field name `audio` (MP3, WAV, M4A, …). */
  uploadAudio: (file: RNUploadFile) =>
    apiMultipartPost<{ data: { url: string } }>(
      "/music/upload-audio",
      (fd) => fd.append("audio", toMultipartPart(file)),
      300_000
    ),
  getGenres: () => api.get<{ data: { id: string; label: string }[] }>("/music/genres"),
  getSongs: (params?: {
    page?: number;
    limit?: number;
    type?: "song" | "album";
    random?: boolean;
  }) =>
    api.get<{ data: MusicSong[]; page: number; limit: number; total: number; hasMore: boolean }>(
      "/music/songs",
      {
        params: {
          ...params,
          random: params?.random ? "1" : undefined
        }
      }
    ),
  /** GET /music/sounds — approved catalog for video post themes (same as web). */
  listSounds: (params?: { q?: string; page?: number; limit?: number }) =>
    api.get<{ data: MusicSong[]; page?: number; limit?: number; total?: number; hasMore?: boolean }>(
      "/music/sounds",
      { params }
    )
};

/** Public content (no auth required). */
export const contentAPI = {
  getLandingBackgrounds: () =>
    api.get<{ data: Array<{ _id?: string; imageUrl: string; order?: number; active?: boolean }> }>(
      "/landing-backgrounds"
    )
};

export const cartAPI = {
  get: () => api.get<{ data?: { items?: CartItem[] } }>("/cart"),
  add: (
    productId: string,
    qty = 1,
    resellerId?: string,
    selectedColor?: string,
    selectedSize?: string
  ) =>
    api.post<{ data?: { items?: CartItem[] } }>("/cart", {
      productId,
      qty,
      resellerId,
      selectedColor,
      selectedSize
    }),
  updateItem: (
    productId: string,
    qty: number,
    selectedColor?: string,
    selectedSize?: string,
    opts?: { updateColor?: string; updateSize?: string }
  ) =>
    api.put(`/cart/item/${productId}`, {
      qty,
      selectedColor,
      selectedSize,
      ...(opts?.updateColor !== undefined ? { updateColor: opts.updateColor } : {}),
      ...(opts?.updateSize !== undefined ? { updateSize: opts.updateSize } : {})
    }),
  removeItem: (productId: string, selectedColor?: string, selectedSize?: string) =>
    api.delete(`/cart/item/${productId}`, {
      params: {
        ...(selectedColor ? { selectedColor } : {}),
        ...(selectedSize ? { selectedSize } : {})
      }
    })
};

/** Stored card row — matches GET /wallet/cards (vault fields stripped server-side). */
export type WalletCard = {
  _id: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
};

export const walletAPI = {
  getBalance: () => api.get<{ balance?: number; availableBalance?: number }>("/wallet/balance"),
  getTransactions: (params?: { limit?: number; page?: number }) =>
    api.get<WalletTransaction[]>("/wallet/transactions", { params }),
  topUp: (amount: number, returnPath?: string) =>
    api.post<{
      paymentUrl?: string;
      reference?: string;
      message?: string;
      paygateFeeZar?: number;
      chargedZar?: number;
    }>("/wallet/topup", {
      amount,
      returnPath
    }),
  withdraw: (amount: number) =>
    api.post<{ message?: string; balance?: number }>("/wallet/payout", { amount }),
  getQrPayload: () =>
    api.get<{ payload?: string; userId?: string; displayName?: string }>("/wallet/qr-payload"),
  getMoneyRequests: () => api.get<unknown[]>("/wallet/money-requests"),
  requestMoney: (body: {
    toUserId?: string;
    toUsername?: string;
    toEmail?: string;
    toPhone?: string;
    amount: number;
    message?: string;
    notifyChannel?: "sms" | "whatsapp" | "both";
  }) => api.post<{ requestId?: string; amount?: number; message?: string }>("/wallet/request-money", body),
  sendMoney: (body: {
    toUserId?: string;
    toUsername?: string;
    toEmail?: string;
    toPhone?: string;
    amount: number;
    message?: string;
  }) =>
    api.post<{
      message?: string;
      amount?: number;
      balance?: number;
      reference?: string;
    }>("/wallet/send-money", body),
  payRequest: (requestId: string) =>
    api.post<{
      message?: string;
      amount?: number;
      balance?: number;
      code?: string;
      paymentUrl?: string;
      shortfall?: number;
      topupReference?: string;
    }>("/wallet/pay-request", { requestId }),
  addCard: () =>
    api.post<{ paymentUrl?: string; reference?: string; message?: string }>("/wallet/add-card"),
  getCards: () => api.get<WalletCard[]>("/wallet/cards"),
  deleteCard: (cardId: string) => api.delete<{ message?: string }>(`/wallet/cards/${cardId}`),
  setDefaultCard: (cardId: string) =>
    api.patch<{ message?: string }>(`/wallet/cards/${cardId}/default`),
  getPendingPayment: (id: string) =>
    api.get<{ _id: string; amount: number; merchantName: string; expiresAt?: string }>(
      `/wallet/pending-payment/${id}`
    ),
  payPendingWithWallet: (paymentRequestId: string) =>
    api.post<{ message?: string; amount?: number; balance?: number }>("/wallet/pay-pending-with-wallet", {
      paymentRequestId
    }),
  payWithCard: (paymentRequestId: string, cardId?: string) =>
    api.post<{
      paymentUrl?: string;
      reference?: string;
      message?: string;
      payGateRedirect?: { processUrl: string; payRequestId: string; checksum: string };
    }>("/wallet/pay-with-card", cardId ? { paymentRequestId, cardId } : { paymentRequestId }),
  paymentFromScan: (fromUserId: string, amount: number, merchantName?: string) =>
    api.post<{ paymentRequestId?: string; amount?: number; expiresIn?: number; message?: string }>(
      "/wallet/payment-from-scan",
      { fromUserId, amount, merchantName }
    ),
  confirmPayment: (paymentRequestId: string, otp: string) =>
    api.post<{ message?: string; amount?: number; reference?: string }>("/wallet/confirm-payment", {
      paymentRequestId,
      otp
    }),
  confirmMyPayment: (paymentRequestId: string, otp: string) =>
    api.post<{ message?: string; amount?: number; reference?: string }>("/wallet/confirm-my-payment", {
      paymentRequestId,
      otp
    }),
  getPendingPaymentsForPayer: () =>
    api.get<Array<{ _id: string; amount: number; merchantName: string; expiresAt?: string }>>(
      "/wallet/pending-payments"
    ),
  /** Peer-to-peer donation to another user’s wallet (same as web `POST /wallet/donate`). */
  donate: (amount: number, recipientId: string) =>
    api.post<{ message?: string; balance?: number }>("/wallet/donate", { amount, recipientId }),
  // Merchant agents — cash deposit / withdrawal
  searchMerchantAgents: (params?: { q?: string; location?: string }) =>
    api.get<
      Array<{
        _id: string;
        name: string;
        username?: string;
        publicNote?: string;
        businessName?: string;
        businessDescription?: string;
        countryCode?: string;
      }>
    >("/wallet/merchant-agents", { params: params ?? {} }),
  initiateAgentDeposit: (body: { customerUserId?: string; customerUsername?: string; amount: number }) =>
    api.post<{ _id?: string; reference?: string; message?: string }>("/wallet/merchant-agent/deposit/initiate", body),
  approveAgentDeposit: (txId: string) =>
    api.post<{ message?: string }>("/wallet/merchant-agent/deposit/approve", { txId }),
  initiateAgentWithdrawal: (body: { agentId: string; amount: number }) =>
    api.post<{ reference?: string; message?: string }>("/wallet/merchant-agent/withdrawal/initiate", body),
  getMerchantAgentPending: () =>
    api.get<{ asCustomer: unknown[]; asAgent: unknown[] }>("/wallet/merchant-agent/pending"),
  getMerchantAgentHistory: (limit?: number) =>
    api.get<unknown[]>("/wallet/merchant-agent/history", { params: { limit } })
};

export const messengerAPI = {
  getConversations: () => api.get<{ conversations: MessengerConversation[] }>("/messenger/conversations"),
  getDirectMessages: (userId: string) => api.get<{ messages: MessengerMessageRow[] }>(`/messenger/direct/${userId}`),
  sendDirect: (userId: string, content: string) =>
    api.post(`/messenger/direct/${userId}`, { content }),
  getTaskMessages: (taskId: string) => api.get<{ messages: MessengerMessageRow[] }>(`/messenger/task/${taskId}`),
  sendTaskMessage: (taskId: string, content: string) =>
    api.post(`/messenger/task/${taskId}`, { content }),
  searchUsers: (q: string) =>
    api.get<{ data: User[] }>("/messenger/users/search", { params: { q: q.trim(), limit: 15 } }),
  markAsRead: (taskId: string) => api.post(`/messenger/task/${taskId}/read`),
  getUnreadCount: () => api.get<{ unreadCount?: number }>("/messenger/unread"),
};

export const checkoutAPI = {
  quote: (params?: {
    deliveryCountry?: string;
    deliveryAddress?: string;
    deliveryCity?: string;
    courierTariffId?: string;
    deliveryScope?: "local" | "crossborder";
  }) =>
    api.post<{
      data?: {
        subtotal: number;
        shipping: number;
        total: number;
        currency?: string;
        foodPickup?: boolean;
        deliveryMethodHint?: string;
        totalZarForPayment?: number;
        readyForPayment?: boolean;
        requiresCourierSelection?: boolean;
        itemCount?: number;
      };
    }>("/checkout/quote", {
      deliveryCountry: params?.deliveryCountry ?? "ZA",
      deliveryAddress: params?.deliveryAddress,
      deliveryCity: params?.deliveryCity,
      courierTariffId: params?.courierTariffId,
      deliveryScope: params?.deliveryScope
    }),
  pay: (
    paymentMethod: "wallet" | "card" | "eft" | "orange_money",
    deliveryAddress: string,
    deliveryCountry?: string,
    courierTariffId?: string,
    deliveryScope?: "local" | "crossborder",
    deliveryCity?: string
  ) =>
    api.post<{
      data?: {
        orderId?: string;
        status?: string;
        message?: string;
        paymentUrl?: string;
        paymentMethod?: string;
        payGateRedirect?: { processUrl: string; payRequestId: string; checksum: string };
      };
    }>("/checkout/pay", {
      paymentMethod,
      deliveryAddress,
      deliveryCity,
      deliveryCountry: deliveryCountry ?? "ZA",
      courierTariffId,
      deliveryScope
    }),
  getOrder: (orderId: string) =>
    api.get<{
      data?: {
        _id?: string;
        status?: string;
        paymentStatus?: string | null;
        amounts?: { total?: number; currency?: string };
      };
    }>(`/checkout/order/${orderId}`),
  getPaymentStatus: (orderId: string) =>
    api.get<{
      data?: { orderId?: string; status?: string; paymentStatus?: string | null };
    }>(`/checkout/order/${orderId}/payment-status`),
  cancelPayment: (orderId: string) => api.post(`/checkout/order/${orderId}/cancel-payment`),
  getMyOrders: (params?: { page?: number; limit?: number }) =>
    api.get("/checkout/orders/me", { params })
};

export const webrtcAPI = {
  getTurnCredentials: () =>
    api.get<{
      data?: {
        urls: string[];
        username: string;
        credential: string;
        ttlSec?: number;
        expiresAt?: number;
      };
    }>("/webrtc/turn-credentials"),
};

export type VoiceCallHistoryRow = {
  _id: string;
  destinationPhone: string;
  status: string;
  durationSec?: number;
  billedAmountZar?: number;
  createdAt: string;
};

export const voiceAPI = {
  getQuote: (to: string) =>
    api.get<{ quote: { estimate1MinZar: number; perMinuteZar: number; connectFeeZar: number } }>(
      "/voice/rates",
      { params: { to } }
    ),
  outbound: (body: { to: string }) =>
    api.post<{ message: string; callId: string; token: string; quote: { estimate1MinZar: number } }>(
      "/voice/outbound",
      body
    ),
  /** PSTN call log — same source as web Morongwa "Call history". */
  getHistory: (limit = 40) =>
    api.get<{ calls?: VoiceCallHistoryRow[] }>("/voice/history", { params: { limit } }),
};

export const qwertzAPI = {
  health: () => api.get<{ status: string; ffmpeg?: { ok: boolean } }>("/qwertz/health"),
  upload: (file: RNUploadFile) =>
    apiMultipartPost<{ data: { id: string; playbackUrl?: string; durationSeconds: number } }>(
      "/qwertz/videos/upload",
      (fd) => fd.append("video", toMultipartPart(file) as any),
      120_000
    ),
  getVideo: (id: string) => api.get(`/qwertz/videos/${id}`),
  edit: (id: string, body: Record<string, unknown>) => api.post(`/qwertz/videos/${id}/edit`, body),
  getJob: (jobId: string) => api.get(`/qwertz/jobs/${jobId}`),
};
