export type Role = "client" | "runner" | "admin" | "superadmin";

export interface User {
  id?: string;
  _id?: string;
  name: string;
  email?: string;
  username?: string;
  role?: Role[] | Role;
  avatar?: string;
}

export interface UserProfileStats {
  user: User;
  postCount: number;
  imageCount: number;
  videoCount: number;
  musicCount: number;
  followerCount: number;
  followingCount: number;
}

export type TVPostType = "video" | "image" | "carousel" | "product" | "text" | "audio";

export interface TVCreator {
  _id?: string;
  id?: string;
  name?: string;
  avatar?: string;
}

export interface TVPost {
  _id: string;
  type: TVPostType;
  caption?: string;
  heading?: string;
  subject?: string;
  hashtags?: string[];
  mediaUrls?: string[];
  creatorId?: TVCreator | string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  createdAt?: string;
}

export interface Advert {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
}

export interface TVComment {
  _id: string;
  text: string;
  userId?: {
    _id?: string;
    id?: string;
    name?: string;
    avatar?: string;
  } | string;
  createdAt?: string;
}
