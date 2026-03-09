// API client configuration with axios
import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/** Backend base URL (no /api) - used for image URLs and Socket.IO. */
export const API_BASE = API_URL.replace(/\/api\/?$/, '').replace(/\/$/, '');

/** Socket.IO server URL - same as API_BASE. */
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

/** Effective price for a product (discountPrice when set and valid, else price). */
export function getEffectivePrice(p: { price: number; discountPrice?: number }): number {
  if (p.discountPrice != null && p.discountPrice >= 0 && p.discountPrice < p.price) return p.discountPrice;
  return p.price;
}

/** Normalize product image URL - use /uploads/... so Next.js proxy serves same-origin (avoids CORS/cross-origin blocking). */
export function getImageUrl(url: string | undefined): string {
  if (!url || typeof url !== 'string') return '';
  let normalized = url.trim().replace(/\/api\/uploads\//g, '/uploads/');
  // Ensure leading slash for relative paths (e.g. "uploads/tv/x" -> "/uploads/tv/x")
  if (normalized.startsWith('uploads/') && !normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  // Strip protocol/host so we always use same-origin proxy (e.g. http://localhost:4000/uploads/... -> /uploads/...)
  const uploadsMatch = normalized.match(/\/uploads\/.+$/);
  if (uploadsMatch) return uploadsMatch[0];
  if (normalized.startsWith('/uploads/')) return normalized;
  return normalized;
}

/** Full URL for images when relative path fails (e.g. cross-origin). */
export function getImageUrlFull(url: string | undefined): string {
  const path = getImageUrl(url);
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = API_BASE || (typeof window !== 'undefined' ? '' : 'http://localhost:4000');
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and fix FormData uploads
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    // Let the browser set Content-Type with boundary for FormData (fixes 400 on image uploads)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Only redirect if not already on login (avoid duplicate nav)
      if (!window.location.pathname.startsWith('/login')) {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = returnTo ? `/login?returnTo=${returnTo}` : '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  register: (data: {
    name: string;
    email?: string;
    username?: string;
    password: string;
    role?: string[];
    dateOfBirth?: string;
    phone?: string;
    otpToken?: string;
  }) => api.post('/auth/register', data),
  sendOtp: (phone: string, channel?: 'sms' | 'whatsapp') =>
    api.post('/auth/send-otp', { phone, channel: channel || 'whatsapp' }),
  verifyOtp: (phone: string, otp: string) => api.post('/auth/verify-otp', { phone, otp }),
  login: (data: { email?: string; username?: string; phone?: string; password: string }) =>
    api.post('/auth/login', data),
  getCurrentUser: () => api.get('/auth/me'),
  requestRunnerRole: () => api.post('/auth/request-runner'),
};

export const advertsAPI = {
  getAdverts: (slot?: 'random' | 'promo') =>
    api.get('/adverts', { params: slot ? { slot } : {} }),
};

export const tasksAPI = {
  getAll: (params?: any) => api.get('/tasks', { params }),
  getAvailable: () => api.get('/tasks/available'),
  getMyTasks: () => api.get('/tasks/my-tasks'),
  getMyAcceptedTasks: () => api.get('/tasks/my-accepted'),
  getById: (id: string) => api.get(`/tasks/${id}`),
  getEscrow: (id: string) => api.get(`/tasks/${id}/escrow`),
  create: (data: any) => api.post('/tasks', data),
  accept: (id: string) => api.post(`/tasks/${id}/accept`),
  startTask: (id: string) => api.post(`/tasks/${id}/start`),
  checkArrival: (id: string, coords: { lat: number; lon: number }) => 
    api.post(`/tasks/${id}/check-arrival`, coords),
  start: (id: string) => api.post(`/tasks/${id}/start`),
  complete: (id: string) => api.post(`/tasks/${id}/complete`),
  cancel: (id: string) => api.post(`/tasks/${id}/cancel`),
};

export const walletAPI = {
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (params?: any) => api.get('/wallet/transactions', { params }),
  topUp: (amount: number, returnPath?: string) => api.post('/wallet/topup', { amount, returnPath }),
  withdraw: (amount: number) => api.post('/wallet/payout', { amount }),
  donate: (amount: number, recipientId: string) => api.post('/wallet/donate', { amount, recipientId }),
};

export const paymentsAPI = {
  initiate: (amount: number) => api.post('/payments/initiate', { amount }),
  getStatus: (reference: string) => api.get(`/payments/${reference}`),
  getAll: () => api.get('/payments'),
  getHistory: () => api.get('/payments/history'),
};

export const reviewsAPI = {
  create: (data: { task: string; runner?: string; rating: number; comment: string }) =>
    api.post('/reviews', data),
  getByUser: (userId: string, params?: any) =>
    api.get(`/reviews/user/${userId}`, { params }),
  getByTask: (taskId: string) => api.get(`/reviews/task/${taskId}`),
};

export const messengerAPI = {
  getConversations: () => api.get('/messenger/conversations'),
  getMessages: (taskId: string) => api.get(`/messenger/task/${taskId}`),
  sendMessage: (taskId: string, content: string) =>
    api.post(`/messenger/task/${taskId}`, { content }),
  searchUsers: (q?: string, limit?: number) => api.get('/messenger/users/search', { params: { q, limit } }),
  getDirectMessages: (userId: string) => api.get(`/messenger/direct/${userId}`),
  sendDirectMessage: (userId: string, content: string) => api.post(`/messenger/direct/${userId}`, { content }),
  markAsRead: (taskId: string) => api.post(`/messenger/task/${taskId}/read`),
  getUnreadCount: () => api.get('/messenger/unread'),
};

export const notificationsAPI = {
  getAll: (params?: any) => api.get('/notifications', { params }),
  markAsRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread/count'),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getAllUsers: (params?: any) => api.get('/admin/users', { params }),
  getUsers: (params?: any) => api.get('/admin/users', { params }),
  suspendUser: (id: string, reason?: string) =>
    api.post(`/admin/users/${id}/suspend`, { reason }),
  activateUser: (id: string) => api.post(`/admin/users/${id}/activate`),
  verifyRunnerVehicle: (userId: string, vehicleIndex: number) =>
    api.post(`/admin/users/${userId}/vehicles/${vehicleIndex}/verify`),
  verifyRunnerPdp: (userId: string) => api.post(`/admin/users/${userId}/pdp/verify`),

  // Adverts
  getAdverts: (params?: { slot?: string }) => api.get('/admin/adverts', { params }),
  createAdvert: (data: { title: string; imageUrl: string; linkUrl?: string; slot: 'random' | 'promo'; productId?: string; active?: boolean; startDate?: string; endDate?: string; order?: number }) =>
    api.post('/admin/adverts', data),
  updateAdvert: (id: string, data: Partial<{ title: string; imageUrl: string; linkUrl: string; slot: string; productId: string; active: boolean; startDate: string; endDate: string; order: number }>) =>
    api.put(`/admin/adverts/${id}`, data),
  deleteAdvert: (id: string) => api.delete(`/admin/adverts/${id}`),

  // Landing backgrounds (login/register page)
  getLandingBackgrounds: () => api.get('/admin/landing-backgrounds'),
  uploadLandingBackground: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ url: string }>('/admin/landing-backgrounds/upload', formData);
  },
  createLandingBackground: (data: { imageUrl: string; order?: number }) =>
    api.post('/admin/landing-backgrounds', data),
  updateLandingBackground: (id: string, data: Partial<{ imageUrl: string; order: number; active: boolean }>) =>
    api.put(`/admin/landing-backgrounds/${id}`, data),
  deleteLandingBackground: (id: string) => api.delete(`/admin/landing-backgrounds/${id}`),

  getTasks: (params?: any) => api.get('/admin/tasks', { params }),
  cancelTask: (id: string, reason?: string) =>
    api.post(`/admin/tasks/${id}/cancel`, { reason }),
  getPayouts: () => api.get('/admin/payouts'),
  getPendingPayouts: () => api.get('/admin/payouts/pending'),
  approvePayout: (id: string) => api.post(`/admin/payouts/${id}/approve`),
  rejectPayout: (id: string, reason?: string) =>
    api.post(`/admin/payouts/${id}/reject`, { reason }),

  // Escrow & ledger
  getEscrows: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/escrows', { params }),
  getEscrow: (id: string) => api.get(`/admin/escrows/${id}`),
  releaseEscrow: (id: string) => api.post(`/admin/escrows/${id}/release`),
  refundEscrow: (id: string, reason: string) =>
    api.post(`/admin/escrows/${id}/refund`, { reason }),
  initiateEscrowPayout: (id: string) => api.post(`/admin/escrows/${id}/initiate-payout`),
  pollEscrowPayout: (id: string) => api.post(`/admin/escrows/${id}/poll-payout`),

  // FNB
  getFnbBalance: () => api.get('/admin/fnb/balance'),

  // Audit
  getAuditLogs: (params?: { page?: number; limit?: number; action?: string }) =>
    api.get('/admin/audit', { params }),

  // Suppliers (marketplace)
  getSuppliers: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/suppliers', { params }),
  getSupplier: (id: string) => api.get(`/admin/suppliers/${id}`),
  updateSupplier: (id: string, data: { shippingCost?: number; pickupAddress?: string }) =>
    api.put(`/admin/suppliers/${id}`, data),
  approveSupplier: (id: string) => api.post(`/admin/suppliers/${id}/approve`),
  rejectSupplier: (id: string, reason?: string) =>
    api.post(`/admin/suppliers/${id}/reject`, { reason }),

  // Marketplace orders (checkout)
  getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/orders', { params }),

  // Reseller stats
  getResellerStats: () => api.get('/admin/reseller-stats'),

  // Stores
  getStores: (params?: { page?: number; limit?: number; type?: string }) =>
    api.get('/admin/stores', { params }),
  createStore: (data: { userId: string; name: string; type: 'supplier' | 'reseller' }) =>
    api.post('/admin/stores', data),
  getStore: (id: string) => api.get(`/admin/stores/${id}`),
  updateStore: (id: string, data: { name?: string }) => api.put(`/admin/stores/${id}`, data),

  // Products (admin load products for marketplace)
  getProducts: (params?: { page?: number; limit?: number; supplierId?: string; active?: boolean }) =>
    api.get('/admin/products', { params }),
  uploadProductImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    return api.post<{ urls: string[] }>('/admin/products/upload-images', formData);
  },
  createProduct: (data: {
    supplierId: string;
    title: string;
    slug?: string;
    description?: string;
    images: string[];
    price: number;
    discountPrice?: number;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
    currency?: string;
    stock?: number;
    outOfStock?: boolean;
    sku?: string;
    sizes?: string[];
    allowResell?: boolean;
    categories?: string[];
    tags?: string[];
    availableCountries?: string[];
  }) => api.post('/admin/products', data),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  updateProduct: (id: string, data: Record<string, unknown>) => api.put(`/admin/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),

  // Morongwa-TV moderation
  getTVPosts: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/tv/posts', { params }),
  approveTVPost: (id: string) => api.post(`/admin/tv/posts/${id}/approve`),
  rejectTVPost: (id: string, reason?: string) => api.post(`/admin/tv/posts/${id}/reject`, { reason }),
  getTVReports: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/tv/reports', { params }),
  resolveTVReport: (id: string) => api.post(`/admin/tv/reports/${id}/resolve`),

  // Super-admin: create admins
  createAdmin: (data: { email: string; name: string; password: string; sections?: string[] }) =>
    api.post('/admin/admins', data),
  getAdmins: () => api.get('/admin/admins'),

  // Music (admin: load songs)
  getMusicSongs: () => api.get('/admin/music/songs'),
  uploadMusicSong: (audio: File, artwork: File, metadata: { userId?: string; title: string; artist: string; songwriters?: string; producer?: string; genre: string; lyrics?: string; downloadEnabled?: boolean; downloadPrice?: number }) => {
    const formData = new FormData();
    formData.append('audio', audio);
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.userId) formData.append('userId', metadata.userId);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    formData.append('downloadEnabled', metadata.downloadEnabled ? 'true' : 'false');
    if (metadata.downloadEnabled && metadata.downloadPrice != null) formData.append('downloadPrice', String(metadata.downloadPrice));
    return api.post('/admin/music/upload-song', formData);
  },
  uploadMusicAlbum: (
    tracks: File[],
    artwork: File,
    metadata: { userId?: string; title: string; artist: string; songwriters?: string; producer?: string; genre: string; lyrics?: string; downloadEnabled?: boolean; downloadPrice?: number }
  ) => {
    const formData = new FormData();
    tracks.forEach((track) => formData.append('tracks', track));
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.userId) formData.append('userId', metadata.userId);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    formData.append('downloadEnabled', metadata.downloadEnabled ? 'true' : 'false');
    if (metadata.downloadEnabled && metadata.downloadPrice != null) formData.append('downloadPrice', String(metadata.downloadPrice));
    return api.post('/admin/music/upload-album', formData);
  },

  // Artists (admin: create artist/publisher, manage verifications)
  getArtistVerifications: (params?: { status?: string }) => api.get('/admin/artist-verifications', { params }),
  approveArtistVerification: (id: string) => api.post(`/admin/artist-verifications/${id}/approve`),
  rejectArtistVerification: (id: string, reason?: string) => api.post(`/admin/artist-verifications/${id}/reject`, { reason }),
  createArtist: (data: { userId: string; type?: 'artist' | 'company' | 'producer'; stageName?: string; labelName?: string }) =>
    api.post('/admin/artists', data),
};

export const supportAPI = {
  create: (data: { title: string; description: string; category: string; priority?: string }) =>
    api.post('/support', data),
  getMyTickets: (params?: any) => api.get('/support/my-tickets', { params }),
  getById: (id: string) => api.get(`/support/${id}`),
  addMessage: (id: string, message: string) =>
    api.post(`/support/${id}/messages`, { message }),
};

export const analyticsAPI = {
  getKPIs: (params?: any) => api.get('/analytics/kpis', { params }),
  getTaskTrends: (days?: number) => api.get('/analytics/trends/tasks', { params: { days } }),
  getRevenueTrends: (days?: number) => api.get('/analytics/trends/revenue', { params: { days } }),
  getRunnerPerformance: (runnerId: string) => api.get(`/analytics/runner/${runnerId}`),
};

export const usersAPI = {
  list: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get('/users', { params }),
  getProfile: (id: string) => api.get(`/users/${id}`),
  getProfileStats: (id: string) =>
    api.get<{ user: any; postCount: number; imageCount: number; videoCount: number; musicCount: number; followerCount: number; followingCount: number }>(`/users/${id}/profile-stats`),
  updateProfile: (id: string, data: { name?: string; username?: string; isPrivate?: boolean; avatar?: string; stripBackgroundPic?: string }) =>
    api.put(`/users/${id}`, data),
  toggleLive: (id: string) => api.patch(`/users/${id}/live`),
  uploadAvatar: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post(`/users/${id}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  setAvatarFromUrl: (id: string, url: string) =>
    api.patch(`/users/${id}/avatar-url`, { url }),
  uploadStripBackground: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/users/${id}/strip-background`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  addRole: (id: string, role: 'client' | 'runner') =>
    api.post(`/users/${id}/roles`, { action: 'add', role }),
  removeRole: (id: string, role: 'client' | 'runner') =>
    api.post(`/users/${id}/roles`, { action: 'remove', role }),
  uploadPdp: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('pdp', file);
    return api.post(`/users/${id}/pdp`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadVehicle: (id: string, data: { make?: string; model?: string; plate?: string }, documents: File[]) => {
    const formData = new FormData();
    if (data.make) formData.append('make', data.make);
    if (data.model) formData.append('model', data.model);
    if (data.plate) formData.append('plate', data.plate);
    documents.forEach((f) => formData.append('documents', f));
    return api.post(`/users/${id}/vehicles`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const policiesAPI = {
  listPublished: () => api.get('/policies'),
  getPublished: (slug: string) => api.get(`/policies/${slug}`),
  listVersions: (slug: string) => api.get(`/policies/${slug}/versions`),
  createVersion: (slug: string, data: { title?: string; summary?: string; content: string; publish?: boolean }) =>
    api.post(`/policies/${slug}/version`, data),
  publishVersion: (slug: string, version: number) => api.post(`/policies/${slug}/publish`, { version }),
  acceptPolicies: (slugs: string[], meta?: any) => api.post('/policies/accept', { slugs, meta }),
};

export const productsAPI = {
  list: (params?: { limit?: number; random?: boolean; q?: string }) =>
    api.get('/products', { params: { ...params, random: params?.random ? '1' : undefined } }),
  getByIdOrSlug: (idOrSlug: string) => api.get(`/products/${idOrSlug}`),
  /** Upload 1–5 product images. Returns { urls: string[] }. */
  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    return api.post<{ urls: string[] }>('/products/upload-images', formData);
  },
  create: (data: {
    title: string;
    description?: string;
    images: string[];
    price: number;
    discountPrice?: number;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
    currency?: string;
    stock?: number;
    outOfStock?: boolean;
    sku?: string;
    sizes?: string[];
    allowResell?: boolean;
    categories?: string[];
    tags?: string[];
    availableCountries?: string[];
  }) => api.post('/products', data),
};

export const cartAPI = {
  get: () => api.get('/cart'),
  add: (productId: string, qty?: number, resellerId?: string) =>
    api.post('/cart', { productId, qty: qty ?? 1, resellerId }),
  updateItem: (productId: string, qty: number) =>
    api.put(`/cart/item/${productId}`, { qty }),
  removeItem: (productId: string) => api.delete(`/cart/item/${productId}`),
};

export const checkoutAPI = {
  quote: (fulfillmentMethod: 'delivery' | 'collection' = 'delivery') =>
    api.post('/checkout/quote', { fulfillmentMethod }),
  pay: (
    paymentMethod: 'wallet' | 'card',
    deliveryAddress?: string,
    fulfillmentMethod: 'delivery' | 'collection' = 'delivery'
  ) =>
    api.post('/checkout/pay', { paymentMethod, deliveryAddress, fulfillmentMethod }),
  getOrder: (orderId: string) => api.get(`/checkout/order/${orderId}`),
};

export const resellerAPI = {
  getWall: (userId: string) => api.get(`/reseller/wall/${userId}`),
  getMyWall: () => api.get('/reseller/wall/me'),
  addToWall: (productId: string, resellerCommissionPct?: number) =>
    api.post(`/reseller/wall/add/${productId}`, { resellerCommissionPct }),
  removeFromWall: (productId: string) => api.delete(`/reseller/wall/remove/${productId}`),
};

export const storesAPI = {
  getMyStores: () => api.get('/stores/me'),
  renameStore: (id: string, name: string) => api.put(`/stores/${id}`, { name }),
  updateStore: (id: string, data: { name?: string; address?: string; email?: string; cellphone?: string; whatsapp?: string; stripBackgroundPic?: string }) =>
    api.put(`/stores/${id}`, data),
  uploadStripBackground: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ url: string; data: any }>(`/stores/${id}/strip-background`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getBySlug: (slug: string) => api.get(`/stores/by-slug/${slug}`),
};

export const followsAPI = {
  follow: (userId: string) => api.post(`/follows/${userId}`),
  unfollow: (userId: string) => api.delete(`/follows/${userId}`),
  getSuggested: (limit?: number) => api.get<{ data: Array<{ _id: string; name: string; avatar?: string; username?: string; followerCount?: number }> }>('/follows/suggested', { params: { limit } }),
  getStatus: (userId: string) => api.get(`/follows/${userId}/status`),
  getPendingRequests: () => api.get('/follows/requests/pending'),
  acceptRequest: (followerId: string) => api.post(`/follows/${followerId}/accept`),
  rejectRequest: (followerId: string) => api.post(`/follows/${followerId}/reject`),
};

export const productEnquiryAPI = {
  enquire: (productId: string, message?: string) =>
    api.post(`/product-enquiry/product/${productId}`, { message }),
  getMyEnquiries: () => api.get('/product-enquiry'),
  getMessages: (enquiryId: string) => api.get(`/product-enquiry/${enquiryId}/messages`),
  sendMessage: (enquiryId: string, content: string) =>
    api.post(`/product-enquiry/${enquiryId}/messages`, { content }),
};

export const tvAPI = {
  getPost: (id: string) => api.get(`/tv/${id}`),
  getFeed: (params?: { page?: number; limit?: number; sort?: 'newest' | 'trending' | 'random'; type?: 'video' | 'image' | 'carousel' | 'product' | 'images' | 'audio' | 'text'; creatorId?: string; q?: string; genre?: string }) =>
    api.get('/tv', { params }),
  getStatuses: () => api.get('/tv/statuses'),
  getTrendingHashtags: (limit?: number) => api.get<{ data: { tag: string; count: number }[] }>('/tv/hashtags/trending', { params: { limit } }),
  uploadMedia: (file: File) => {
    const formData = new FormData();
    formData.append('media', file);
    return api.post<{ url: string }>('/tv/upload', formData);
  },
  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f, f.name));
    return api.post<{ urls: string[] }>('/tv/upload-images', formData);
  },
  createPost: (data: {
    type: 'video' | 'image' | 'carousel' | 'product' | 'text' | 'audio';
    mediaUrls?: string[];
    caption?: string;
    heading?: string;
    subject?: string;
    hashtags?: string[];
    productId?: string;
    filter?: string;
    genre?: string;
  }) => api.post('/tv', data),
  repost: (id: string) => api.post(`/tv/${id}/repost`),
  like: (id: string) => api.post(`/tv/${id}/like`),
  getLiked: (id: string) => api.get<{ data: { liked: boolean } }>(`/tv/${id}/liked`),
  report: (id: string, reason: string) => api.post(`/tv/${id}/report`, { reason }),
  getComments: (id: string) => api.get(`/tv/${id}/comments`),
  addComment: (id: string, text: string) => api.post(`/tv/${id}/comments`, { text }),
  getWatermark: () => api.get<{ data: { watermark: string } }>('/tv/watermark'),
  getFeaturedProducts: () => api.get('/tv/products/featured'),
};

export interface SongRecord {
  _id: string;
  type: 'song' | 'album';
  title: string;
  artist: string;
  songwriters?: string;
  producer?: string;
  genre: string;
  lyrics?: string;
  audioUrl: string;
  artworkUrl: string;
  tracks?: { title: string; audioUrl: string; duration?: number }[];
  downloadEnabled?: boolean;
  downloadPrice?: number;
  userId?: { _id: string; name?: string };
  createdAt: string;
}

export const musicAPI = {
  getGenres: () => api.get<{ data: { id: string; label: string }[] }>('/music/genres'),
  getArtistStatus: () => api.get<{ data: { isVerified: boolean; status: string | null; type: string | null } }>('/music/artist-status'),
  getSongs: () => api.get<{ data: SongRecord[] }>('/music/songs'),
  uploadAudio: (file: File) => {
    const formData = new FormData();
    formData.append('audio', file);
    return api.post<{ data: { url: string } }>('/music/upload-audio', formData);
  },
  artistApply: (data: { type: string; stageName?: string; labelName?: string }, documents?: File[]) => {
    const formData = new FormData();
    formData.append('type', data.type);
    if (data.stageName) formData.append('stageName', data.stageName);
    if (data.labelName) formData.append('labelName', data.labelName);
    (documents || []).forEach((f) => formData.append('documents', f, f.name));
    return api.post('/music/artist-apply', formData);
  },
  /** Upload song: WAV audio, JPEG/PNG artwork (3000x3000), metadata */
  uploadSong: (audio: File, artwork: File, metadata: { title: string; artist: string; songwriters?: string; producer?: string; genre: string; lyrics?: string }) => {
    const formData = new FormData();
    formData.append('audio', audio);
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    return api.post<{ data: SongRecord }>('/music/upload-song', formData);
  },
  uploadAlbum: (
    tracks: File[],
    artwork: File,
    metadata: { title: string; artist: string; songwriters?: string; producer?: string; genre: string; lyrics?: string; downloadEnabled?: boolean; downloadPrice?: number }
  ) => {
    const formData = new FormData();
    tracks.forEach((track) => formData.append('tracks', track));
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    formData.append('downloadEnabled', metadata.downloadEnabled ? 'true' : 'false');
    if (metadata.downloadEnabled && metadata.downloadPrice != null) formData.append('downloadPrice', String(metadata.downloadPrice));
    return api.post<{ data: SongRecord }>('/music/upload-album', formData);
  },
  purchaseDownload: (songId: string) => api.post(`/music/${songId}/purchase`),
  getDownloadLinks: (songId: string) => api.get(`/music/${songId}/download`),
  getMyPurchases: () => api.get<{ data: Array<{ songId: string; reference: string; amount: number; createdAt: string }> }>('/music/purchases/me'),
};

export const suppliersAPI = {
  uploadDocument: (file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    return api.post<{ success: boolean; path: string; fullUrl: string }>('/suppliers/upload-document', formData);
  },
  updateMe: (data: { shippingCost?: number; pickupAddress?: string }) =>
    api.put('/suppliers/me', data),
  apply: (data: {
    type: 'company' | 'individual';
    storeName?: string;
    pickupAddress?: string;
    companyRegNo?: string;
    directorsIdDoc?: string;
    directorsIdDocs?: string[];
    idDocument?: string;
    contactEmail: string;
    contactPhone: string;
    verificationFeeWaived?: boolean;
  }) => api.post('/suppliers/apply', data),
  getMe: () => api.get('/suppliers/me'),
  getMyProducts: () => api.get('/suppliers/me/products'),
};
