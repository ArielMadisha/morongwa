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
    config.headers.Authorization = `Bearer ${authToken}`;
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
  }) => api.post("/auth/register", data),
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
  }) =>
    api.get<{ data: TVPost[]; total: number; page: number; limit: number }>("/tv", { params }),
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
    productId?: string;
    filter?: string;
    genre?: string;
    artworkUrl?: string;
    songId?: string;
    sensitive?: boolean;
  }) => api.post<{ data: TVPost }>("/tv", body)
};

export const advertsAPI = {
  getAdverts: (slot?: "random" | "promo") =>
    api.get<{ data: Advert[] }>("/adverts", { params: slot ? { slot } : {} })
};

export const usersAPI = {
  getProfile: (id: string) => api.get<{ user: User }>(`/users/${id}`),
  getProfileStats: (id: string) => api.get<UserProfileStats>(`/users/${id}/profile-stats`),
  uploadAvatar: (id: string, file: RNUploadFile) =>
    apiMultipartPost<{ message?: string; avatar?: string; user?: User }>(
      `/users/${id}/avatar`,
      (fd) => fd.append("avatar", toMultipartPart(file)),
      120_000
    )
};

export const followsAPI = {
  follow: (userId: string) => api.post<{ message?: string }>(`/follows/${userId}`),
  unfollow: (userId: string) => api.delete<{ message?: string }>(`/follows/${userId}`),
  getStatus: (userId: string) =>
    api.get<{ following: boolean; status: "accepted" | "pending" | null }>(`/follows/${userId}/status`),
  getFollowers: (userId: string) => api.get<{ data: User[] }>(`/follows/${userId}/followers`),
  getFollowing: (userId: string) => api.get<{ data: User[] }>(`/follows/${userId}/following`)
};

export const productsAPI = {
  list: (params?: { limit?: number; random?: boolean; q?: string }) =>
    api.get<{ data?: Product[] }>("/products", {
      params: {
        ...params,
        random: params?.random ? "1" : undefined
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

export const storesAPI = {
  getMine: () => api.get<{ data?: StoreSummary[] }>("/stores/me")
};

export const resellerAPI = {
  getMyWall: () =>
    api.get<{
      data?: { products?: unknown[]; resellerId?: string };
    }>("/reseller/wall/me"),
  addProductToWall: (productId: string, resellerCommissionPct = 5) =>
    api.post(`/reseller/wall/add/${productId}`, { resellerCommissionPct })
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
  add: (productId: string, qty = 1, resellerId?: string) =>
    api.post<{ data?: { items?: CartItem[] } }>("/cart", { productId, qty, resellerId }),
  updateItem: (productId: string, qty: number) =>
    api.put(`/cart/item/${productId}`, { qty }),
  removeItem: (productId: string) => api.delete(`/cart/item/${productId}`)
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
    amount: number;
    message?: string;
    notifyChannel?: "sms" | "whatsapp" | "both";
  }) => api.post<{ requestId?: string; amount?: number; message?: string }>("/wallet/request-money", body),
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
  payWithCard: (paymentRequestId: string, cardId: string) =>
    api.post<{ paymentUrl?: string; reference?: string; message?: string }>("/wallet/pay-with-card", {
      paymentRequestId,
      cardId
    }),
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
  /** Peer-to-peer donation to another user’s wallet (same as web `POST /wallet/donate`). */
  donate: (amount: number, recipientId: string) =>
    api.post<{ message?: string; balance?: number }>("/wallet/donate", { amount, recipientId })
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
};

export const checkoutAPI = {
  quote: (params?: { deliveryCountry?: string }) =>
    api.post<{
      data?: {
        subtotal: number;
        shipping: number;
        total: number;
        currency?: string;
      };
    }>("/checkout/quote", { deliveryCountry: params?.deliveryCountry ?? "ZA" }),
  pay: (paymentMethod: "wallet" | "card" | "eft" | "orange_money", deliveryAddress: string, deliveryCountry?: string) =>
    api.post<{
      data?: {
        orderId?: string;
        status?: string;
        message?: string;
        paymentUrl?: string;
      };
    }>("/checkout/pay", { paymentMethod, deliveryAddress, deliveryCountry: deliveryCountry ?? "ZA" })
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
};
