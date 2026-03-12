import axios from "axios";
import { MOBILE_API_URL } from "../config";
import { Advert, CartItem, Product, TVComment, TVPost, User, UserProfileStats, WalletTransaction } from "../types";

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

export const tvAPI = {
  getPost: (id: string) => api.get<{ data: TVPost }>(`/tv/${id}`),
  getFeed: (params?: { page?: number; limit?: number; sort?: "newest" | "trending" | "random"; q?: string }) =>
    api.get<{ data: TVPost[]; total: number; page: number; limit: number }>("/tv", { params }),
  like: (id: string) => api.post<{ data: { liked: boolean; likeCount: number } }>(`/tv/${id}/like`),
  getLiked: (id: string) => api.get<{ data: { liked: boolean } }>(`/tv/${id}/liked`),
  getComments: (id: string) => api.get<{ data: TVComment[] }>(`/tv/${id}/comments`),
  addComment: (id: string, text: string) => api.post<{ data: TVComment }>(`/tv/${id}/comments`, { text }),
  report: (id: string, reason: string) => api.post<{ message?: string }>(`/tv/${id}/report`, { reason })
};

export const advertsAPI = {
  getAdverts: (slot?: "random" | "promo") =>
    api.get<{ data: Advert[] }>("/adverts", { params: slot ? { slot } : {} })
};

export const usersAPI = {
  getProfile: (id: string) => api.get<{ user: User }>(`/users/${id}`),
  getProfileStats: (id: string) => api.get<UserProfileStats>(`/users/${id}/profile-stats`)
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

export const cartAPI = {
  get: () => api.get<{ data?: { items?: CartItem[] } }>("/cart"),
  add: (productId: string, qty = 1, resellerId?: string) =>
    api.post<{ data?: { items?: CartItem[] } }>("/cart", { productId, qty, resellerId }),
  updateItem: (productId: string, qty: number) =>
    api.put(`/cart/item/${productId}`, { qty }),
  removeItem: (productId: string) => api.delete(`/cart/item/${productId}`)
};

export const walletAPI = {
  getBalance: () => api.get<{ balance?: number }>("/wallet/balance"),
  getTransactions: (params?: { limit?: number }) =>
    api.get<WalletTransaction[]>("/wallet/transactions", { params }),
  topUp: (amount: number, returnPath?: string) =>
    api.post<{ paymentUrl?: string; reference?: string; message?: string }>("/wallet/topup", {
      amount,
      returnPath
    })
};

export const checkoutAPI = {
  quote: (fulfillmentMethod: "delivery" | "collection" = "delivery") =>
    api.post<{
      data?: {
        subtotal: number;
        shipping: number;
        total: number;
        currency?: string;
        fulfillmentMethod: "delivery" | "collection";
      };
    }>("/checkout/quote", { fulfillmentMethod }),
  pay: (
    paymentMethod: "wallet" | "card",
    deliveryAddress?: string,
    fulfillmentMethod: "delivery" | "collection" = "delivery"
  ) =>
    api.post<{
      data?: {
        orderId?: string;
        status?: string;
        message?: string;
        paymentUrl?: string;
      };
    }>("/checkout/pay", { paymentMethod, deliveryAddress, fulfillmentMethod })
};
