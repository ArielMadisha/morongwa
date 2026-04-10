export type Role = "client" | "runner" | "admin" | "superadmin";

export interface User {
  id?: string;
  _id?: string;
  name: string;
  email?: string;
  username?: string;
  /** E.164 digits only (no +), same as backend User.phone */
  phone?: string;
  countryCode?: string;
  preferredCurrency?: string;
  stripBackgroundPic?: string;
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
  /** Linked marketplace product when type is product */
  productId?: string;
  /** True when created from reseller wall (hide Resell on this post) */
  fromResellerWall?: boolean;
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

/** QwertyMusic catalog row (from GET /api/music/songs). */
export interface MusicSong {
  _id: string;
  type: "song" | "album";
  title: string;
  artist: string;
  genre: string;
  audioUrl: string;
  artworkUrl: string;
  userId?: { name?: string } | string;
  downloadEnabled?: boolean;
  downloadPrice?: number;
  createdAt?: string;
}

export interface Product {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  images?: string[];
  price: number;
  discountPrice?: number;
  currency?: string;
  stock?: number;
  outOfStock?: boolean;
  /** When true, buyers may resell via reseller wall */
  allowResell?: boolean;
}

/** Seller store summary (GET /api/stores/me). */
export interface StoreSummary {
  _id: string;
  name: string;
  slug?: string;
  address?: string;
  email?: string;
  cellphone?: string;
  whatsapp?: string;
  stripBackgroundPic?: string;
  supplierId?: { storeName?: string; status?: string };
}

export interface CartItem {
  productId: string;
  qty: number;
  lineTotal?: number;
  product?: Product;
}

export interface WalletTransaction {
  type: string;
  amount: number;
  reference?: string;
  createdAt?: string;
}

export interface MessengerConversation {
  _id: string;
  kind?: "task" | "direct";
  taskId?: string | null;
  taskTitle?: string;
  user: { _id: string; name?: string };
  lastMessage?: string | null;
  lastMessageTime?: string;
  unread?: number;
}

export interface MessengerMessageRow {
  _id: string;
  sender?: string | { _id?: string };
  content?: string;
  text?: string;
  createdAt?: string;
}
