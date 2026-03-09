import axios from "axios";
import { MOBILE_API_URL } from "../config";
import { Advert, TVComment, TVPost, User, UserProfileStats } from "../types";

let authToken: string | null = null;

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
