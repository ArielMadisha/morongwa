import axios from "axios";
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
  headers: {
    "Content-Type": "application/json"
  }
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  // Let the runtime set multipart boundaries for file uploads
  if (config.data instanceof FormData) {
    delete (config.headers as Record<string, unknown>)["Content-Type"];
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
  return { uri: file.uri, name: file.name, type: file.type };
}

export const tvAPI = {
  getPost: (id: string) => api.get<{ data: TVPost }>(`/tv/${id}`),
  /** Instagram-style status rings (recent posters). */
  getStatuses: () =>
    api.get<{
      data: Array<{
        userId: string | { _id?: string };
        name?: string;
        avatar?: string;
        latestPost?: unknown;
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
  uploadMedia: (file: RNUploadFile) => {
    const fd = new FormData();
    fd.append("media", toMultipartPart(file));
    return api.post<{ url: string; sensitive?: boolean }>("/tv/upload", fd);
  },
  /** POST /tv/upload-images — multiple images; field name `images` (max 20). */
  uploadImages: (files: RNUploadFile[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("images", toMultipartPart(f)));
    return api.post<{ urls: string[]; sensitive?: boolean }>("/tv/upload-images", fd);
  },
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
  uploadAvatar: (id: string, file: RNUploadFile) => {
    const fd = new FormData();
    fd.append("avatar", toMultipartPart(file));
    return api.post<{ message?: string; avatar?: string; user?: User }>(`/users/${id}/avatar`, fd);
  }
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
  uploadAudio: (file: RNUploadFile) => {
    const fd = new FormData();
    fd.append("audio", toMultipartPart(file));
    return api.post<{ data: { url: string } }>("/music/upload-audio", fd);
  },
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
  getBalance: () => api.get<{ balance?: number }>("/wallet/balance"),
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
    })
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
  pay: (paymentMethod: "wallet" | "card", deliveryAddress: string, deliveryCountry?: string) =>
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
