'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Repeat2,
  Flag,
  Bookmark,
  MoreHorizontal,
  Package,
  ShoppingCart,
  Download,
  Check,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Star,
  ExternalLink,
  Link2,
  Code,
  User,
  UserPlus,
  HeartHandshake,
  Coffee,
  Music2,
  Maximize2,
  Trash2,
  Pencil,
} from 'lucide-react';
import { EditPostModal } from './EditPostModal';
import {
  tvAPI,
  followsAPI,
  walletAPI,
  getImageUrl,
  getImageUrlFull,
  getEffectivePrice,
  getProductPriceForQty,
  productSupplierStoreName,
} from '@/lib/api';
import { looksLikeImageUrl, looksLikeVideoUrl } from '@/lib/tvMedia';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';
import { TVCommentModal } from './TVCommentModal';
import { FollowButton } from '@/components/FollowButton';
import { SetPictureOptionsModal } from '@/components/SetPictureOptionsModal';
import { VideoSidebar } from './VideoSidebar';
import { TranslateText } from '@/components/TranslateText';
import { LinkifiedText } from '@/components/LinkifiedText';
import { useCurrency } from '@/contexts/CurrencyContext';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { formatCatalogProductPrice } from '@/lib/productPriceZar';
import { bulkTierSummary } from '@/lib/bulkTierLabel';
import { freeShippingAreasFromProduct, FREE_DELIVERY_PROMO_LABEL, productShowsFreeDeliveryPromo } from '@/lib/freeShippingAreas';
import { creatorDisplayLabel } from '@/lib/userDisplayLabel';
import { ProfileSummaryHoverCard } from '@/components/ProfileSummaryHoverCard';
import { MarketplaceCartStepper } from '@/components/MarketplaceCartStepper';

const WATERMARK_IMG = '/watermark-qwertymates.svg';
const WATERMARK_DURATION = 3; // seconds at start and end

const DONATE_PRESET_AMOUNTS_ZAR = [50, 100, 200, 500] as const;
const DONATE_COFFEE_AMOUNT_ZAR = 35;

function formatPrice(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

/** Add to Cart / Download for songs with purchase enabled */
function AudioPurchaseDownload({ songId, price, currentUserId }: { songId: string; price: number; currentUserId?: string }) {
  const [purchased, setPurchased] = useState(false);
  const [adding, setAdding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    import('@/lib/api').then(({ musicAPI }) => {
      musicAPI.getMyPurchases().then((r) => {
        const ids = new Set((r.data?.data ?? []).map((x: any) => String(x.songId)));
        setPurchased(ids.has(songId));
      }).catch(() => {});
    });
  }, [songId, currentUserId]);

  const handleAddToCart = async () => {
    if (!currentUserId) {
      toast.error('Sign in to add to cart');
      return;
    }
    setAdding(true);
    try {
      const { cartAPI } = await import('@/lib/api');
      const { invalidateCartStoresCache } = await import('@/lib/useCartAndStores');
      await cartAPI.addMusic(songId, 1);
      invalidateCartStoresCache();
      setAddedFeedback(true);
      toast.success('Added to cart');
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to add to cart');
    } finally {
      setAdding(false);
    }
  };

  const handleDownload = async () => {
    if (!currentUserId) {
      toast.error('Sign in to download');
      return;
    }
    setDownloading(true);
    try {
      const { musicAPI, getImageUrl, API_BASE } = await import('@/lib/api');
      const res = await musicAPI.getDownloadLinks(songId);
      const data = res.data?.data ?? res.data;
      const links = data?.links ?? data?.wavUrl ? [{ url: data.wavUrl, title: data.title || 'song' }] : [];
      if (links.length === 0) {
        toast.error('No download links');
        return;
      }
      for (const l of links) {
        const url = (l.url || l).startsWith('http') ? (l.url || l) : `${API_BASE || ''}${l.url || l}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = (l.title || l.filename || 'song') + '.wav';
        a.click();
      }
      toast.success('Download started');
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.response?.data?.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (!currentUserId) return null;
  const priceStr = formatPrice(price, 'ZAR');
  const showDownload = purchased;
  const showAdded = addedFeedback && !purchased;
  return (
    <div className="relative group">
      <button
        onClick={(e) => { e.stopPropagation(); showDownload ? handleDownload() : handleAddToCart(); }}
        disabled={adding || downloading}
        className={`p-2.5 rounded-full shadow-lg transition-all ${
          showAdded || showDownload ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-sky-500 text-white hover:bg-sky-600'
        } disabled:opacity-50`}
        title={showDownload ? 'Download' : showAdded ? 'Added to cart' : `${priceStr} · Add to cart`}
        aria-label={showDownload ? 'Download' : showAdded ? 'Added to cart' : `Add to cart ${priceStr}`}
      >
        {adding ? (
          <span className="text-xs font-medium">...</span>
        ) : downloading ? (
          <Download className="h-5 w-5" />
        ) : showDownload ? (
          <Download className="h-5 w-5" />
        ) : showAdded ? (
          <Check className="h-5 w-5" />
        ) : (
          <ShoppingCart className="h-5 w-5" />
        )}
      </button>
      {/* Hover tooltip: price + add to cart */}
      {!purchased && !adding && !downloading && !addedFeedback && (
        <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/85 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-20">
          {priceStr} · Add to cart
        </div>
      )}
      {/* Hover tooltip: Added to cart */}
      {showAdded && (
        <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-20">
          Added to cart
        </div>
      )}
      {/* Hover tooltip: Download */}
      {showDownload && (
        <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-20">
          Download
        </div>
      )}
    </div>
  );
}

export interface TVGridItem {
  _id: string;
  type: 'video' | 'image' | 'carousel' | 'product' | 'product_tile' | 'text' | 'audio';
  mediaUrls?: string[];
  artworkUrl?: string;
  songId?: { _id: string; title?: string; artist?: string; artworkUrl?: string; downloadEnabled?: boolean; downloadPrice?: number } | null;
  caption?: string;
  heading?: string;
  subject?: string;
  hashtags?: string[];
  taggedUserIds?: Array<{ _id: string; name?: string; username?: string; avatar?: string }>;
  productId?: Product & { _id: string; supplierId?: { userId?: string } | string };
  filter?: string;
  hasWatermark?: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount?: number;
  creatorId?: { _id: string; name?: string; avatar?: string; storeSlug?: string };
  /** Supplier storefront slug (QwertyHub tiles) — links to /store/[slug] */
  storeSlug?: string;
  /** Supplier display name from catalog enrich */
  storeName?: string;
  createdAt?: string;
  /** When true, media is blurred until user clicks to reveal */
  sensitive?: boolean;
  // product tile
  title?: string;
  description?: string;
  images?: string[];
  price?: number;
  discountPrice?: number;
  currency?: string;
  slug?: string;
  bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
  supplierId?: { userId?: string; storeName?: string; _id?: string } | string;
  allowResell?: boolean;
  /** Reseller commission % when post is from reseller wall (3–7) */
  resellerCommissionPct?: number;
  /** Set when TV post was created from Add to MyStore (reseller listing) */
  fromResellerWall?: boolean;
  /** e.g. profile_avatar_update */
  feedActivity?: string;
  colors?: Array<{ name: string; hex?: string; imageIndex?: number }>;
  sizes?: string[];
  outOfStock?: boolean;
  freeShippingEnabled?: boolean;
  freeShippingAreas?: Array<{ countryCode: string; locality: string }>;
}

function formatPostPeriod(createdAt?: string) {
  if (!createdAt) return "";
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "";
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHours < 2) return "An hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}

function productCartOptionsFromItem(item: TVGridItem): { colorsRequired: boolean; sizesRequired: boolean } {
  const colors =
    (Array.isArray(item.colors) && item.colors.length > 0) ||
    (Array.isArray((item.productId as { colors?: unknown[] } | undefined)?.colors) &&
      ((item.productId as { colors: unknown[] }).colors?.length ?? 0) > 0);
  const sizes =
    (Array.isArray(item.sizes) && item.sizes.length > 0) ||
    (Array.isArray((item.productId as { sizes?: unknown[] } | undefined)?.sizes) &&
      ((item.productId as { sizes: unknown[] }).sizes?.length ?? 0) > 0);
  return { colorsRequired: colors, sizesRequired: sizes };
}

interface TVGridTileProps {
  item: TVGridItem;
  liked?: boolean;
  onLike?: (id: string, liked: boolean) => void;
  onRepost?: (id: string) => void;
  onEnquire?: (productId: string) => void;
  onCommentAdded?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpdated?: (post: TVGridItem) => void;
  isVisible?: boolean;
  currentUserId?: string;
  onSetProfilePicFromUrl?: (url: string) => Promise<void>;
  onSetStripBackgroundFromUrl?: (url: string) => Promise<void>;
  /** When 'grid', shows action icons overlay on media (for clipped tiles). When 'feed', icons are below media. */
  variant?: 'feed' | 'grid';
  /** Related videos to show in sidebar when video is expanded (grid view) */
  relatedVideos?: TVGridItem[];
  /** Cart qty for marketplace product on this tile (wall / feed). */
  cartQty?: number;
  onCartUpdated?: () => void;
  loginHref?: string;
  /** Hide tile when primary media cannot load (e.g. missing school-gallery file). */
  onMediaUnavailable?: (id: string) => void;
}

function formatPriceLocal(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

export function TVGridTile({
  item,
  liked = false,
  onLike,
  onRepost,
  onEnquire,
  onCommentAdded,
  onDelete,
  onUpdated,
  isVisible = true,
  currentUserId,
  onSetProfilePicFromUrl,
  onSetStripBackgroundFromUrl,
  variant = 'feed',
  relatedVideos,
  cartQty = 0,
  onCartUpdated,
  loginHref = '/login?returnTo=/wall',
  onMediaUnavailable,
}: TVGridTileProps) {
  const router = useRouter();
  const { rates } = useCurrency();
  const [watermarkPhase, setWatermarkPhase] = useState<'start' | 'middle' | 'end'>('start');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoExpandOpen, setVideoExpandOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);
  const [pictureOptionsOpen, setPictureOptionsOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [textHeadingExpanded, setTextHeadingExpanded] = useState(false);
  const [textBodyExpanded, setTextBodyExpanded] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState('');
  const [donateSending, setDonateSending] = useState(false);
  const [donateBalance, setDonateBalance] = useState<number | null>(null);
  const [donateBalanceLoading, setDonateBalanceLoading] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const [followNonce, setFollowNonce] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  /** Set when <video> fires error or media URL is missing — usually missing file on API (404). */
  const [videoLoadError, setVideoLoadError] = useState(false);
  /** Retry media with absolute API URL if same-origin /uploads proxy fails. */
  const [mediaDirectApiFallback, setMediaDirectApiFallback] = useState(false);
  const [imageFullyUnavailable, setImageFullyUnavailable] = useState(false);
  const imageSkipAttemptsRef = useRef(0);

  const postPeriod = formatPostPeriod(item.createdAt);
  // Resolve creatorId (populated object or raw string) for donate/own-post logic
  const creatorIdResolved = typeof item.creatorId === 'object' && item.creatorId !== null && '_id' in item.creatorId
    ? String((item.creatorId as { _id: string })._id)
    : item.creatorId
      ? String(item.creatorId)
      : null;

  const isProductTile = item.type === 'product_tile';
  /** Catalog product tiles often omit creatorId — fall back to supplier owner for store hover. */
  const storeOwnerUserId = (() => {
    const fromSupplier = (sid?: { userId?: string | { _id?: string } } | string | null): string | null => {
      if (!sid || typeof sid !== 'object') return null;
      const uid = (sid as { userId?: string | { _id?: string } }).userId;
      if (!uid) return null;
      if (typeof uid === 'object' && uid !== null && '_id' in uid) return String(uid._id);
      return String(uid);
    };
    return (
      fromSupplier(item.supplierId) ||
      fromSupplier((item.productId as { supplierId?: { userId?: string } } | undefined)?.supplierId) ||
      null
    );
  })();
  const profileHoverUserId = creatorIdResolved || storeOwnerUserId;
  const isOwnPost = profileHoverUserId && currentUserId && profileHoverUserId === String(currentUserId);

  const storeSlugResolved =
    item.storeSlug ||
    item.creatorId?.storeSlug ||
    (typeof item.supplierId === 'object' && item.supplierId && 'storeSlug' in item.supplierId
      ? String((item.supplierId as { storeSlug?: string }).storeSlug || '')
      : '') ||
    undefined;
  const isProfileAvatarUpdate =
    item.feedActivity === 'profile_avatar_update' ||
    Boolean(item.caption?.toLowerCase().includes('updated profile picture'));
  const supplierStoreLabel =
    productSupplierStoreName(item.supplierId) ||
    (item.storeName ? String(item.storeName).trim() : null) ||
    productSupplierStoreName((item.productId as { supplierId?: { storeName?: string } } | undefined)?.supplierId) ||
    null;
  const creatorName =
    supplierStoreLabel || creatorDisplayLabel(item.creatorId, isProductTile ? 'Store' : 'User');
  const headerTitle = isProfileAvatarUpdate && item.caption ? item.caption : creatorName;
  const creatorProfileHref = (() => {
    if (isOwnPost) {
      if ((isProductTile || !!supplierStoreLabel) && storeSlugResolved) return `/store/${storeSlugResolved}`;
      return '/store';
    }
    if ((isProductTile || !!supplierStoreLabel) && storeSlugResolved) return `/store/${storeSlugResolved}`;
    if (item.creatorId?._id || item.creatorId) return `/user/${item.creatorId?._id ?? item.creatorId}`;
    if (storeOwnerUserId) return `/user/${storeOwnerUserId}`;
    return '/wall';
  })();
  const isProductPost = isProductTile || !!item.productId;
  const catalogProductId = isProductTile
    ? String(item._id)
    : item.productId
      ? String((item.productId as { _id?: string })._id ?? item.productId)
      : '';
  const productOutOfStock =
    isProductTile &&
    ((item.stock != null && item.stock < 1) || !!(item as TVGridItem & { outOfStock?: boolean }).outOfStock);
  const productPageHref = catalogProductId
    ? `/marketplace/product/${catalogProductId}${!isProductTile && creatorIdResolved ? `?resellerId=${creatorIdResolved}` : ''}`
    : '#';
  const showProductCartStepper = Boolean(isProductTile && catalogProductId && onCartUpdated);
  const productCartOptions = productCartOptionsFromItem(item);
  const productCartStepperEl = showProductCartStepper ? (
    <MarketplaceCartStepper
      productId={catalogProductId}
      resellerId={undefined}
      qty={cartQty}
      colorsRequired={productCartOptions.colorsRequired}
      sizesRequired={productCartOptions.sizesRequired}
      optionsPickerHref={productPageHref}
      outOfStock={productOutOfStock}
      isGuest={!currentUserId}
      loginHref={loginHref}
      onUpdated={onCartUpdated!}
      compact
    />
  ) : null;
  const isTextPost = item.type === 'text';
  const isAudioPost = item.type === 'audio';
  /** Image/carousel must never use the `<video>` branch — uploads under `/uploads/tv/` without a file extension
   * are ambiguous and `looksLikeVideoUrl` would misclassify them as video (broken playback + blank tile). */
  const explicitImageOrCarousel = item.type === 'image' || item.type === 'carousel';
  const isProductCarousel = isProductTile && (item.images?.length ?? 0) > 1;
  const productCarouselUrls = (() => {
    if (isProductTile) return item.images ?? [];
    if (item.type === 'product' && item.productId) {
      const fromMedia = item.mediaUrls ?? [];
      const fromProduct = ((item.productId as { images?: string[] }).images ?? []).filter(Boolean);
      const merged = [...fromMedia];
      for (const url of fromProduct) {
        if (!merged.includes(url)) merged.push(url);
      }
      return merged;
    }
    return item.mediaUrls ?? [];
  })();
  const isCatalogImageCarousel = productCarouselUrls.length > 1 && (isProductTile || !!item.productId);
  const mediaUrl = isProductTile || (item.type === 'product' && item.productId)
    ? (productCarouselUrls[carouselIndex] || productCarouselUrls[0] || '')
    : (item.mediaUrls?.[carouselIndex] || item.mediaUrls?.[0] || (item.productId as any)?.images?.[0] || '');
  const primaryTvMedia = item.mediaUrls?.[0];
  const isVideo =
    !isProductTile &&
    !isTextPost &&
    !isAudioPost &&
    !explicitImageOrCarousel &&
    !looksLikeImageUrl(primaryTvMedia) &&
    !looksLikeImageUrl(mediaUrl) &&
    (item.type === 'video' || looksLikeVideoUrl(primaryTvMedia));
  const isCarousel = !isProductTile && !isTextPost && !isAudioPost && !isVideo && (item.mediaUrls?.length ?? 0) > 1;
  /** Same-origin /uploads paths and legacy API URLs — prefer getImageUrl, never drop a valid relative URL. */
  const resolvedMediaSrc = mediaUrl ? getImageUrl(mediaUrl) || mediaUrl : '';
  const displayMediaSrc =
    mediaDirectApiFallback && mediaUrl ? getImageUrlFull(mediaUrl) : resolvedMediaSrc;

  useEffect(() => {
    setVideoLoadError(false);
    setMediaDirectApiFallback(false);
    setImageFullyUnavailable(false);
    imageSkipAttemptsRef.current = 0;
  }, [resolvedMediaSrc, mediaUrl, item._id, carouselIndex]);

  const carouselUrlCount = isProductCarousel || isCatalogImageCarousel
    ? productCarouselUrls.length
    : (item.mediaUrls?.length ?? 0);

  const tryNextCarouselImage = () => {
    if (carouselUrlCount <= 1) return false;
    imageSkipAttemptsRef.current += 1;
    if (imageSkipAttemptsRef.current >= carouselUrlCount) return false;
    setCarouselIndex((i) => (i + 1) % carouselUrlCount);
    setMediaDirectApiFallback(false);
    return true;
  };

  const markImageUnavailable = () => {
    if ((isCarousel || isProductCarousel || isCatalogImageCarousel) && tryNextCarouselImage()) return;
    setImageFullyUnavailable(true);
    onMediaUnavailable?.(item._id);
  };

  const handleImageLoadError = () => {
    if (!mediaDirectApiFallback) {
      setMediaDirectApiFallback(true);
      return;
    }
    markImageUnavailable();
  };

  const videoUnavailable = isVideo && (!displayMediaSrc || videoLoadError);

  if (imageFullyUnavailable && !isTextPost && !isAudioPost && !isVideo) {
    return null;
  }

  // TikTok-style watermark: show at start (first 3s) and end (last 3s)
  useEffect(() => {
    if (!isVideo || !videoRef.current || !isVisible) return;
    const video = videoRef.current;

    const handleTimeUpdate = () => {
      const t = video.currentTime;
      const d = video.duration;
      if (!d || d <= WATERMARK_DURATION * 2) {
        setWatermarkPhase('start');
        return;
      }
      if (t < WATERMARK_DURATION) setWatermarkPhase('start');
      else if (d - t < WATERMARK_DURATION) setWatermarkPhase('end');
      else setWatermarkPhase('middle');
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleTimeUpdate);
    };
  }, [isVideo, isVisible]);

  const showWatermark =
    !isProfileAvatarUpdate &&
    item.hasWatermark !== false &&
    (watermarkPhase === 'start' || watermarkPhase === 'end');

  useEffect(() => {
    if (!lightboxOpen) return;
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && setLightboxOpen(false);
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!videoExpandOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVideoExpandOpen(false);
        expandedVideoRef.current?.pause();
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [videoExpandOpen]);

  /** Browsers block unmuted autoplay — expanded player starts muted; user can unmute via controls. */
  useEffect(() => {
    if (!videoExpandOpen || !isVideo) return;
    const id = requestAnimationFrame(() => {
      const v = expandedVideoRef.current;
      if (!v) return;
      v.muted = true;
      void v.play().catch(() => {});
    });
    return () => cancelAnimationFrame(id);
  }, [videoExpandOpen, isVideo, displayMediaSrc]);

  // Hide sidebar when video is fullscreen (YouTube-style)
  useEffect(() => {
    if (!videoExpandOpen || !expandedVideoRef.current) return;
    const el = expandedVideoRef.current;
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [videoExpandOpen]);

  // Autoplay when tile is visible (muted + playsInline satisfies browser autoplay rules)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;
    if (isVisible) {
      v.muted = true;
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isVisible, isVideo, displayMediaSrc]);

  const nudgeVideoPlay = () => {
    const v = videoRef.current;
    if (!v || !isVideo || !isVisible) return;
    v.muted = true;
    void v.play().catch(() => {});
  };

  // Autoplay audio when visible (mobile scroll)
  useEffect(() => {
    if (!isAudioPost || !audioRef.current) return;
    if (isVisible) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isVisible, isAudioPost]);

  const handleReport = () => {
    if (!reportReason.trim() || item.type === 'product_tile') return;
    tvAPI.report(item._id, reportReason.trim()).then(() => {
      setReportOpen(false);
      setReportReason('');
    });
  };

  useEffect(() => {
    if (!donateModalOpen) return;
    setDonateBalanceLoading(true);
    walletAPI
      .getBalance()
      .then((res) => setDonateBalance(Number(res.data?.balance ?? 0)))
      .catch(() => setDonateBalance(null))
      .finally(() => setDonateBalanceLoading(false));
  }, [donateModalOpen]);

  const startTopupAndQueueDonation = async (amount: number) => {
    const current = Math.max(0, Number(donateBalance ?? 0));
    const shortfall = Math.max(0, amount - current);
    if (shortfall <= 0) return false;
    const topupAmount = Math.max(10, Math.ceil(shortfall));
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'pending_donation',
        JSON.stringify({ recipientId: creatorIdResolved, amount, createdAt: Date.now() })
      );
    }
    const res = await walletAPI.topUp(topupAmount, '/wallet?pendingDonate=1');
    const paymentUrl = res.data?.paymentUrl;
    if (paymentUrl) {
      window.location.href = paymentUrl;
      return true;
    }
    return false;
  };

  const handleDonate = (mode: 'wallet' | 'topup' = 'wallet') => {
    const amount = parseFloat(donateAmount);
    if (!creatorIdResolved || !currentUserId || isNaN(amount) || amount < 1) return;
    if (creatorIdResolved === String(currentUserId)) return; // Guard: cannot donate to self
    setDonateSending(true);
    (async () => {
      if (mode === 'topup') {
        const redirected = await startTopupAndQueueDonation(amount);
        if (redirected) return;
      } else if ((donateBalance ?? 0) < amount) {
        // Auto-fallback to PayGate checkout when wallet is short.
        const redirected = await startTopupAndQueueDonation(amount);
        if (redirected) return;
        throw new Error('Insufficient wallet balance. Could not start PayGate checkout.');
      }
      await walletAPI.donate(amount, creatorIdResolved);
      setDonateBalance((prev) => Math.max(0, Number(prev ?? 0) - amount));
    })()
      .then(() => {
        toast.success('Donation sent successfully');
        setDonateModalOpen(false);
        setDonateAmount('');
      })
      .catch((e: any) => toast.error(e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to send donation'))
      .finally(() => setDonateSending(false));
  };

  const getShareUrl = () => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin;
    if (item.type === 'product_tile' && item._id) {
      return `${base}/marketplace/product/${item._id}`;
    }
    return `${base}/morongwa-tv/post/${item._id}`;
  };

  const handleShare = () => {
    const shareUrl = getShareUrl();
    if (navigator.share) {
      navigator.share({
        title: 'Qwertymates',
        text: item.caption || item.heading || item.subject || 'Check this out on Qwertymates',
        url: shareUrl,
      });
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard');
    }
  };

  const filterClass = item.filter
    ? { warm: 'sepia-30', cool: 'filter-[hue-rotate(180deg)]', vintage: 'sepia-50 contrast-110', grayscale: 'grayscale' }[item.filter] || ''
    : '';

  const productId = isProductTile ? item._id : item.productId?._id;
  const hasSeller = isProductTile || !!item.productId?.supplierId;
  const canResellProduct =
    !!(item as { allowResell?: boolean }).allowResell ||
    !!(item.productId as { allowResell?: boolean } | undefined)?.allowResell;

  /** QwertyHub `product_tile` = original catalog (keep Resell). `product` posts from MyStore / reseller wall = already marked up — hide Resell for everyone (no daisy-chain). */
  const isSecondTierResellerListing =
    !isProductTile &&
    item.type === 'product' &&
    !!productId &&
    (item.resellerCommissionPct != null || item.fromResellerWall === true);
  const showResellButton = canResellProduct && !isSecondTierResellerListing;
  const openTextPost = () => router.push(`/morongwa-tv/post/${item._id}`);
  /** Platform rule: wall / QwertyTV product amounts are always shown in ZAR (catalog may store USD, INR, etc.). */
  const toViewerZar = (amount: number, sourceCurrency: string) =>
    formatCatalogProductPrice(amount, sourceCurrency, rates);

  /** ⋯ menu: top placement on feed; bottom placement on QwertyTV grid (opens upward). */
  const postOverflowMenu = (placement: 'top' | 'bottom') => {
    if (isProductTile) return null;
    const openUp = placement === 'bottom';
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPostMenuOpen((v) => !v);
            setReportOpen(false);
          }}
          className={
            openUp
              ? 'flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900'
              : 'rounded-full p-2 text-white/90 transition-colors hover:bg-white/20 hover:text-white'
          }
          aria-label="More options"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        {postMenuOpen && (
          <>
            <div className="fixed inset-0 z-[55]" onClick={() => setPostMenuOpen(false)} aria-hidden="true" />
            <div
              className={`absolute right-0 z-[60] min-w-[220px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl ${
                openUp ? 'bottom-full mb-1' : 'top-full mt-1'
              }`}
            >
              {isOwnPost && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPostMenuOpen(false);
                      setEditOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                  >
                    <Pencil className="h-4 w-4" /> Edit post
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setPostMenuOpen(false);
                      if (!confirm('Delete this post? This cannot be undone.')) return;
                      try {
                        await tvAPI.deletePost(item._id);
                        toast.success('Post deleted');
                        onDelete?.(item._id);
                      } catch (e: any) {
                        toast.error(e.response?.data?.message || 'Failed to delete post');
                      }
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" /> Delete post
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                </>
              )}
              {!isOwnPost && (
                <button
                  type="button"
                  onClick={() => {
                    setPostMenuOpen(false);
                    setReportOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  <Flag className="h-4 w-4" /> Report
                </button>
              )}
              {!isOwnPost && item.creatorId?._id && currentUserId && (
                <>
                  <button
                    onClick={async () => {
                      setPostMenuOpen(false);
                      try {
                        await followsAPI.friendRequest(item.creatorId!._id);
                        toast.success('Friend request sent');
                        setFollowNonce((n) => n + 1);
                      } catch (e: any) {
                        toast.error(e.response?.data?.message || 'Failed to send friend request');
                      }
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <UserPlus className="h-4 w-4" /> Friend request
                  </button>
                  <button
                    onClick={async () => {
                      setPostMenuOpen(false);
                      try {
                        await followsAPI.unfollow(item.creatorId!._id);
                        toast.success('Unfollowed');
                        setFollowNonce((n) => n + 1);
                      } catch (e: any) {
                        toast.error(e.response?.data?.message || 'Failed to unfollow');
                      }
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    Unfollow
                  </button>
                </>
              )}
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => {
                  setPostMenuOpen(false);
                  toast.success('Added to favorites');
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Star className="h-4 w-4" /> Add to favorites
              </button>
              <Link
                href={item.creatorId?._id ? `/morongwa-tv/user/${item.creatorId._id}` : '/morongwa-tv'}
                onClick={() => setPostMenuOpen(false)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" /> Go to post
              </Link>
              <button
                onClick={() => {
                  setPostMenuOpen(false);
                  handleShare();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Share2 className="h-4 w-4" /> Share to...
              </button>
              <button
                onClick={() => {
                  setPostMenuOpen(false);
                  const url = typeof window !== 'undefined' ? `${window.location.origin}/wall` : '';
                  navigator.clipboard.writeText(url || `${window.location.origin}/wall`);
                  toast.success('Link copied');
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Link2 className="h-4 w-4" /> Copy link
              </button>
              <button
                onClick={() => {
                  setPostMenuOpen(false);
                  toast.success('Embed code copied');
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Code className="h-4 w-4" /> Embed
              </button>
              {!isOwnPost && item.creatorId?._id && (
                <Link
                  href={`/morongwa-tv/user/${item.creatorId._id}`}
                  onClick={() => setPostMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <User className="h-4 w-4" /> About this account
                </Link>
              )}
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => setPostMenuOpen(false)}
                className="w-full px-4 py-2.5 text-center text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
    <div
      className={`rounded-lg overflow-hidden bg-white border border-slate-100 shadow-sm flex flex-col ${
        variant === 'grid' ? 'flex-1 min-h-0 h-full' : ''
      } ${isTextPost ? 'cursor-pointer' : ''}`}
      onClick={isTextPost ? openTextPost : undefined}
      onKeyDown={isTextPost ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTextPost();
        }
      } : undefined}
      role={isTextPost ? 'button' : undefined}
      tabIndex={isTextPost ? 0 : undefined}
      aria-label={isTextPost ? 'Open text post' : undefined}
    >
      {/* Grid: media grows to fill tile height above the action bar; feed keeps square aspect cap. */}
      <div
        className={`relative w-full mx-auto bg-slate-900 ${
          variant === 'grid'
            ? 'flex-1 min-h-0 w-full min-w-0'
            : isTextPost
              ? 'aspect-auto min-h-[200px]'
              : `aspect-square max-h-[min(580px,62vh)]`
        }`}
      >
      {/* Media */}
      {isAudioPost ? (
        <div className="relative w-full h-full bg-slate-900 overflow-hidden">
          {/* Album art - full bleed, fills entire area */}
          <div className="absolute inset-0">
            {(item.artworkUrl || (item.songId as any)?.artworkUrl) ? (
              <img
                src={getImageUrl(item.artworkUrl || (item.songId as any)?.artworkUrl)}
                alt={item.caption || item.heading || (item.songId as any)?.title || 'Song'}
                className={`w-full h-full ${variant === 'grid' ? 'object-cover' : 'object-contain'}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800">
                <Music2 className="h-20 w-20 text-sky-400" />
              </div>
            )}
          </div>
          {/* Audio player - compact bar at bottom edge, overlaid. Autoplay when visible (mobile scroll). */}
          <div className="absolute inset-x-0 bottom-0 z-10 bg-black/60 backdrop-blur-sm px-3 py-2" onClick={(e) => e.stopPropagation()}>
            {isAudioPlaying && (
              <p className="text-[10px] text-white/90 font-medium mb-1 truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
                Now playing: {(item.songId as any)?.title || item.caption || item.heading || 'Track'}
              </p>
            )}
            <audio
              ref={audioRef}
              src={displayMediaSrc}
              controls
              playsInline
              className="w-full max-w-full h-9 [&::-webkit-media-controls-panel]:bg-transparent"
              style={{ touchAction: 'pan-y' }}
              onPlay={(e) => {
                setIsAudioPlaying(true);
                document.querySelectorAll('audio').forEach((el) => {
                  if (el !== e.currentTarget) el.pause();
                });
              }}
              onPause={() => setIsAudioPlaying(false)}
              onEnded={() => setIsAudioPlaying(false)}
            />
          </div>
          {/* Buy button - bottom right corner of album art, above audio player bar */}
          {isAudioPost && (item.songId as any)?.downloadEnabled && (item.songId as any)?._id && (
            <div className="absolute bottom-11 right-3 z-10" onClick={(e) => e.stopPropagation()}>
              <AudioPurchaseDownload
                songId={(item.songId as any)._id}
                price={(item.songId as any).downloadPrice ?? 10}
                currentUserId={currentUserId}
              />
            </div>
          )}
        </div>
      ) : isTextPost ? (
        <div
          className="w-full min-h-full flex flex-col pt-14 px-5 pb-5 sm:pt-16 sm:px-6 sm:pb-6 bg-white text-left cursor-pointer"
          onClick={() => router.push(`/morongwa-tv/post/${item._id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/morongwa-tv/post/${item._id}`);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Open text post"
        >
          {(item.heading || item.subject || item.caption) && (
            <div className="flex flex-col gap-3">
              {(() => {
                const rawBody = item.subject || item.caption || '';
                const firstLine = rawBody ? rawBody.split('\n')[0]?.trim().slice(0, 120) || '' : '';
                const headline = item.heading || firstLine;
                const body = item.heading ? rawBody : rawBody.split('\n').slice(1).join('\n').trim();
                const hasBody = body.length > 0;
                const HEADING_TRUNCATE_LEN = 52;
                const BODY_TRUNCATE_LEN = 150;
                const shouldTruncateHeading = !!headline && headline.length > HEADING_TRUNCATE_LEN;
                const shouldTruncateBody = hasBody && body.length > BODY_TRUNCATE_LEN;
                const displayHeading = shouldTruncateHeading && !textHeadingExpanded
                  ? `${headline.slice(0, HEADING_TRUNCATE_LEN).trim()}...`
                  : headline;
                const displayBody = shouldTruncateBody && !textBodyExpanded
                  ? `${body.slice(0, BODY_TRUNCATE_LEN).trim()}...`
                  : body;
                return (
                  <>
                    {headline && (
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 uppercase tracking-tight leading-snug">
                          {displayHeading}
                        </h3>
                        {shouldTruncateHeading && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setTextHeadingExpanded((v) => !v);
                            }}
                            className="mt-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
                          >
                            {textHeadingExpanded ? 'less...' : 'more...'}
                          </button>
                        )}
                      </div>
                    )}
                    {hasBody && (
                      <div>
                        <LinkifiedText
                          text={displayBody}
                          as="p"
                          className="text-slate-700 text-[15px] leading-[1.6]"
                          preserveWhitespace
                        />
                        {shouldTruncateBody && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setTextBodyExpanded((v) => !v);
                            }}
                            className="mt-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
                          >
                            {textBodyExpanded ? 'less...' : 'more...'}
                          </button>
                        )}
                      </div>
                    )}
                    {!headline && !hasBody && (
                      <p className="text-slate-500 text-sm">Text post</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          {!item.heading && !item.subject && !item.caption && (
            <p className="text-slate-500 text-sm">Text post</p>
          )}
          {item.taggedUserIds && item.taggedUserIds.length > 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              with{' '}
              {item.taggedUserIds.map((u, i) => (
                <span key={u._id}>
                  {i > 0 ? (i === item.taggedUserIds!.length - 1 ? ' and ' : ', ') : ''}
                  <Link
                    href={`/user/${u._id}`}
                    className="font-semibold text-slate-800 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {u.name || u.username || 'User'}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : isProductTile ? (
        <div className="relative isolate w-full h-full z-0">
          <button
            type="button"
            className="block w-full h-full cursor-pointer text-left"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/marketplace/product/${item._id}`);
            }}
          >
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              {displayMediaSrc ? (
                <img
                  src={displayMediaSrc}
                  alt={item.title || 'Product'}
                  className={`w-full h-full object-cover relative z-10 ${filterClass}`}
                  data-pin-nopin="true"
                  onError={handleImageLoadError}
                />
              ) : (
                <Package className="h-16 w-16 text-slate-500" />
              )}
            </div>
          </button>
          {isProductCarousel && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCarouselIndex((i) => (i - 1 + productCarouselUrls.length) % productCarouselUrls.length);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-50 p-2.5 rounded-full bg-black/55 hover:bg-black/70 text-white touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCarouselIndex((i) => (i + 1) % productCarouselUrls.length);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-50 p-2.5 rounded-full bg-black/55 hover:bg-black/70 text-white touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1 pointer-events-none z-50">
                {productCarouselUrls.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${i === carouselIndex ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : isVideo ? (
        <button
          type="button"
          className="relative w-full h-full cursor-pointer block focus:outline-none group overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onClick={(e) => {
            e.stopPropagation();
            if (item.sensitive && !sensitiveRevealed) {
              setSensitiveRevealed(true);
            } else {
              setVideoExpandOpen(true);
            }
          }}
        >
          <video
            key={displayMediaSrc || item._id}
            ref={videoRef}
            src={displayMediaSrc || undefined}
            playsInline
            loop
            muted
            autoPlay
            preload="auto"
            onLoadedData={nudgeVideoPlay}
            onCanPlay={nudgeVideoPlay}
            onError={() => {
              if (!mediaDirectApiFallback) setMediaDirectApiFallback(true);
              else setVideoLoadError(true);
            }}
            className={`w-full h-full object-cover ${filterClass} ${item.sensitive && !sensitiveRevealed ? 'blur-2xl scale-110' : ''} ${videoUnavailable ? 'opacity-0' : ''}`}
            style={{ touchAction: 'pan-y' }}
          />
          {videoUnavailable && (
            <div className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-2 bg-slate-900 px-4 text-center">
              <p className="text-sm font-semibold text-white">Video unavailable</p>
              <p className="max-w-xs text-xs text-slate-400">
                This clip&apos;s file is missing on the server. Ops: restore <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300">uploads/tv</code> on the API host or re-upload.
              </p>
            </div>
          )}
          {item.sensitive && !sensitiveRevealed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
              <p className="text-white/90 text-sm font-medium mb-3 px-4 text-center">This content may be sensitive</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSensitiveRevealed(true); }}
                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-sm"
              >
                Click to reveal
              </button>
            </div>
          ) : (
            <div className="absolute bottom-2 left-2 p-2 rounded-lg bg-black/50 text-white/90 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <Maximize2 className="h-5 w-5" aria-label="Expand / Fullscreen" />
            </div>
          )}
        </button>
      ) : (
        <div className="relative w-full h-full overflow-hidden">
          {productId ? (
            <button
              type="button"
              className="relative w-full h-full cursor-pointer block focus:outline-none text-left"
              onClick={(e) => {
                e.stopPropagation();
                router.push(productPageHref);
              }}
            >
              {displayMediaSrc ? (
                <img
                  src={displayMediaSrc}
                  alt={item.caption || (item.productId as any)?.title || 'Product'}
                  className={`w-full h-full ${variant === 'grid' ? 'object-cover' : 'object-contain'} ${filterClass} ${item.sensitive && !sensitiveRevealed ? 'blur-2xl scale-110' : ''}`}
                  data-pin-nopin="true"
                  onError={handleImageLoadError}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                  <Package className="h-16 w-16 text-slate-500" />
                </div>
              )}
              {item.sensitive && !sensitiveRevealed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20">
                  <p className="text-white/90 text-sm font-medium mb-3 px-4 text-center">This content may be sensitive</p>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSensitiveRevealed(true); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setSensitiveRevealed(true);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-sm"
                  >
                    Click to reveal
                  </span>
                </div>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="relative w-full h-full cursor-pointer block focus:outline-none"
              onClick={(e) => {
                e.stopPropagation();
                if (item.sensitive && !sensitiveRevealed) {
                  setSensitiveRevealed(true);
                } else {
                  setLightboxOpen(true);
                }
              }}
            >
              {displayMediaSrc ? (
                <>
                  <img
                    src={displayMediaSrc}
                    alt={item.caption || item.heading || 'Post'}
                    className={`w-full h-full ${variant === 'grid' ? 'object-cover' : 'object-contain'} ${filterClass} ${item.sensitive && !sensitiveRevealed ? 'blur-2xl scale-110' : ''}`}
                    data-pin-nopin="true"
                    onError={handleImageLoadError}
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                  <Package className="h-16 w-16 text-slate-500" />
                </div>
              )}
              {item.sensitive && !sensitiveRevealed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20">
                  <p className="text-white/90 text-sm font-medium mb-3 px-4 text-center">This content may be sensitive</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSensitiveRevealed(true); }}
                    className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-sm"
                  >
                    Click to reveal
                  </button>
                </div>
              )}
            </button>
          )}
          {(isCarousel || isCatalogImageCarousel) && carouselUrlCount > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCarouselIndex((i) => (i - 1 + carouselUrlCount) % carouselUrlCount);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-50 p-2.5 rounded-full bg-black/55 hover:bg-black/70 text-white touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCarouselIndex((i) => (i + 1) % carouselUrlCount);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-50 p-2.5 rounded-full bg-black/55 hover:bg-black/70 text-white touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1 pointer-events-none z-50">
                {(isCatalogImageCarousel ? productCarouselUrls : item.mediaUrls ?? []).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${i === carouselIndex ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
          {!isProductTile && catalogProductId && onCartUpdated ? (
            <div className="absolute right-2 top-2 z-20">
              <MarketplaceCartStepper
                productId={catalogProductId}
                resellerId={creatorIdResolved || undefined}
                qty={cartQty}
                colorsRequired={productCartOptions.colorsRequired}
                sizesRequired={productCartOptions.sizesRequired}
                optionsPickerHref={productPageHref}
                outOfStock={!!(item.productId as Product & { outOfStock?: boolean })?.outOfStock}
                isGuest={!currentUserId}
                loginHref={loginHref}
                onUpdated={onCartUpdated}
                compact
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Top overlay: grid = date + follow only (⋯ moved to bottom bar); feed = date + ⋯ + follow */}
      <div
        className={`absolute inset-x-0 top-0 z-10 flex justify-between items-start gap-2 p-3 ${
          variant === 'grid'
            ? 'bg-gradient-to-b from-black/80 via-black/45 to-transparent pb-4'
            : 'bg-gradient-to-b from-black/50 to-transparent'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {profileHoverUserId ? (
            <ProfileSummaryHoverCard
              userId={profileHoverUserId}
              displayName={headerTitle}
              avatar={item.creatorId?.avatar}
              currentUserId={currentUserId}
              profileHref={creatorProfileHref}
              isStore={isProductTile || !!supplierStoreLabel}
              className="min-w-0 flex-1"
            >
              <Link
                href={creatorProfileHref}
                className="flex min-w-0 items-center gap-2 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/40 bg-slate-600 shadow-md ring-1 ring-black/20">
                  {item.creatorId?.avatar ? (
                    <img
                      src={getImageUrlFull(item.creatorId.avatar) || getImageUrl(item.creatorId.avatar)}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-white">
                      <User className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-semibold text-white ${
                      variant === 'grid' ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]' : ''
                    }`}
                  >
                    {headerTitle}
                    {item.taggedUserIds && item.taggedUserIds.length > 0 ? (
                      <span className="font-normal text-white/90">
                        {' '}
                        with{' '}
                        {item.taggedUserIds.slice(0, 3).map((u, i) => (
                          <span key={u._id}>
                            {i > 0 ? (i === item.taggedUserIds!.length - 1 || i === 2 ? ' and ' : ', ') : ''}
                            {u.name || u.username}
                          </span>
                        ))}
                        {item.taggedUserIds.length > 3 ? ` and ${item.taggedUserIds.length - 3} others` : ''}
                      </span>
                    ) : null}
                  </p>
                </div>
              </Link>
            </ProfileSummaryHoverCard>
          ) : (
            <Link
              href={creatorProfileHref}
              className="flex min-w-0 items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/40 bg-slate-600 shadow-md ring-1 ring-black/20">
                <span className="flex h-full w-full items-center justify-center text-white">
                  <User className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0">
                <p
                  className={`truncate text-sm font-semibold text-white ${
                    variant === 'grid' ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]' : ''
                  }`}
                >
                  {headerTitle}
                  {item.taggedUserIds && item.taggedUserIds.length > 0 ? (
                    <span className="font-normal text-white/90">
                      {' '}
                      with{' '}
                      {item.taggedUserIds.slice(0, 3).map((u, i) => (
                        <span key={u._id}>
                          {i > 0 ? (i === item.taggedUserIds!.length - 1 || i === 2 ? ' and ' : ', ') : ''}
                          {u.name || u.username}
                        </span>
                      ))}
                      {item.taggedUserIds.length > 3 ? ` and ${item.taggedUserIds.length - 3} others` : ''}
                    </span>
                  ) : null}
                </p>
              </div>
            </Link>
          )}
        </div>
        <div
          className={`shrink-0 ${
            variant === 'grid' || showProductCartStepper
              ? 'flex flex-col items-end gap-1.5'
              : 'flex items-center gap-1'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {postPeriod && (
            <span
              className={
                variant === 'grid' || showProductCartStepper
                  ? 'max-w-[min(100%,7.5rem)] shrink-0 text-right text-[9px] font-semibold leading-tight tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] sm:text-[10px] md:text-[11px]'
                  : 'mr-1 text-xs font-medium text-white/90'
              }
            >
              {postPeriod}
            </span>
          )}
          {productCartStepperEl}
          {variant !== 'grid' && !showProductCartStepper && postOverflowMenu('top')}
          {!isProductTile && item.creatorId?._id && !isOwnPost && (
            <FollowButton
              key={followNonce}
              targetUserId={item.creatorId._id}
              currentUserId={currentUserId}
              className={
                variant === 'grid'
                  ? '!border !border-sky-600 !bg-sky-500 !px-3 !py-1.5 !text-xs !font-semibold !text-white shadow-md !rounded-lg hover:!bg-sky-600'
                  : '!rounded-lg !bg-black/40 !px-3 !py-1.5 !text-xs border border-white/30 bg-black/40 text-white hover:bg-black/60'
              }
            />
          )}
        </div>
      </div>

      {/* Product actions overlay — cart stepper is on image; checkout / resell / enquire below */}
      {(isProductTile || productId) && !donateModalOpen && (
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent flex flex-wrap items-center gap-1.5 z-[60] pointer-events-auto touch-manipulation">
          {productId && showResellButton && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/marketplace/product/${productId || item._id}?view=resell`);
              }}
              className="inline-flex items-center justify-center px-3 py-2 min-h-[40px] rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30 touch-manipulation"
            >
              Resell
            </button>
          )}
          {catalogProductId && cartQty > 0 ? (
            <Link
              href="/cart"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 touch-manipulation"
            >
              <ShoppingCart className="h-4 w-4" />
              Checkout
            </Link>
          ) : catalogProductId ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(productPageHref);
              }}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30 border border-white/30 touch-manipulation"
            >
              View product
            </button>
          ) : null}
          {hasSeller && onEnquire && productId && (
            <button
              onClick={(e) => { e.stopPropagation(); onEnquire(productId); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 text-white text-xs font-medium border border-white/40"
            >
              Enquire
            </button>
          )}
        </div>
      )}

      {/* Watermark - bottom right */}
      {!isProductTile && showWatermark && (
        <div className="absolute -bottom-0.5 -right-0.5 pointer-events-none z-10 flex justify-end">
          <img
            src={WATERMARK_IMG}
            alt="Qwertymates"
            className={
              variant === 'grid'
                ? 'h-9 sm:h-11 w-auto object-contain object-right drop-shadow-lg'
                : 'h-6 sm:h-7 w-auto object-contain object-right drop-shadow-lg'
            }
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
          />
        </div>
      )}

      {/* Watermark badge (always visible subtle) when not in start/end phase for videos */}
      {!isProductTile && !showWatermark && item.hasWatermark !== false && (
        <div className="absolute -bottom-0.5 -right-0.5 pointer-events-none z-10 opacity-70 flex justify-end">
          <img
            src={WATERMARK_IMG}
            alt="Qwertymates"
            className={
              variant === 'grid'
                ? 'h-8 sm:h-10 w-auto object-contain object-right'
                : 'h-4 sm:h-5 w-auto object-contain object-right'
            }
          />
        </div>
      )}
      </div>

      {/* QwertyTV grid only: views + share + ⋯ menu (feed/post keep full toolbar elsewhere) */}
      {!isProductPost && variant === 'grid' && (
        <div className="flex min-h-[44px] flex-shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {isVideo && (
              <span className="flex min-h-[36px] items-center justify-center gap-1 px-1 py-1 text-slate-600" title="Views">
                <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-xs font-medium">
                  {(item.viewCount ?? 0) >= 1000 ? `${((item.viewCount ?? 0) / 1000).toFixed(1)}K` : item.viewCount ?? 0}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              className="flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-lg py-1 text-slate-600 transition-colors hover:text-slate-900 touch-manipulation"
              title="Share"
            >
              <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
          {postOverflowMenu('bottom')}
        </div>
      )}

      {/* Below picture: hashtags, action icons (left), report (right) - hidden for product posts */}
      {!isProductPost && variant !== 'grid' && (
        <div className="px-2 py-1.5 border-b border-slate-100">
          {item.hashtags && item.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {item.hashtags.map((tag) => (
                <Link
                  key={tag}
                  href={`/hashtag/${encodeURIComponent(tag)}`}
                  className="px-2 py-1 rounded-lg bg-sky-100 text-sky-700 text-xs font-medium hover:bg-sky-200 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
          {isVideo && item.songId && ((item.songId as any)?.title || (item.songId as any)?.artist) && (
            <div className="mb-2">
              <Link
                href="/qwerty-music"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100"
              >
                <Music2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {(item.songId as any)?.title || 'Sound'}
                  {(item.songId as any)?.artist ? ` — ${(item.songId as any).artist}` : ''}
                </span>
              </Link>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {/* Action icons - bottom left (homepage only). View count: videos only */}
            <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
              {isVideo && (
                <span className="flex items-center gap-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 justify-center py-1 px-1 sm:px-0 text-slate-600" title="Views">
                  <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-xs sm:text-sm font-medium">{(item.viewCount ?? 0) >= 1000 ? `${((item.viewCount ?? 0) / 1000).toFixed(1)}K` : item.viewCount ?? 0}</span>
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onLike?.(item._id, !liked); }}
                className="flex items-center gap-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 justify-center py-1 px-1 sm:px-0 rounded-lg text-slate-700 transition-colors cursor-pointer touch-manipulation hover:text-slate-900"
                aria-pressed={liked}
              >
                <Heart
                  className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${
                    liked || (item.likeCount ?? 0) > 0
                      ? 'fill-red-600 text-red-600'
                      : 'text-red-500 hover:text-red-600'
                  }`}
                />
                <span className="text-xs sm:text-sm font-medium tabular-nums">
                  {(item.likeCount ?? 0) >= 1000 ? `${((item.likeCount ?? 0) / 1000).toFixed(1)}K` : item.likeCount ?? 0}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setCommentModalOpen(true); }}
                className="flex items-center gap-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 justify-center py-1 px-1 sm:px-0 rounded-lg text-slate-700 transition-colors cursor-pointer touch-manipulation hover:text-slate-900"
              >
                <MessageCircle className="h-4 w-4 shrink-0 text-purple-600 sm:h-5 sm:w-5" />
                <span className="text-xs sm:text-sm font-medium tabular-nums">{item.commentCount ?? 0}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
                title="Share"
              >
                <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              {onRepost && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRepost(item._id); }}
                  className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
                  title="Repost"
                >
                  <Repeat2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              )}
              {!isOwnPost && creatorIdResolved && currentUserId && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDonateModalOpen(true); }}
                  className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
                  title="Donate"
                >
                  <HeartHandshake className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); toast.success('Saved'); }}
                className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
                title="Save"
              >
                <Bookmark className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>
            {/* Report flag - bottom right */}
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setReportOpen(!reportOpen); }}
                className="p-2 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                aria-label="Report post"
                title="Report"
              >
                <Flag className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              {reportOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setReportOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 bottom-full mb-1 py-2 bg-white rounded-xl border border-slate-200 shadow-lg z-50 min-w-[200px]">
                    {mediaUrl && currentUserId && (onSetProfilePicFromUrl || onSetStripBackgroundFromUrl) && (
                      <>
                        <button
                          onClick={() => { setReportOpen(false); setPictureOptionsOpen(true); }}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                          Use this image
                        </button>
                        <div className="border-t border-slate-100 my-2" />
                      </>
                    )}
                    <div className="px-3 pb-2">
                      <input
                        type="text"
                        placeholder="Report reason..."
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900"
                      />
                    </div>
                    <button
                      onClick={handleReport}
                      className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                    >
                      <Flag className="h-4 w-4" />
                      Submit report
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Below icons: heading, story/caption and comments - hidden for product posts and grid */}
      {!isProductPost && variant !== 'grid' && (
        <div className="p-2 bg-white">
          {(item.heading || item.subject || item.caption) && !isTextPost && (
            <>
              {item.heading && (
                <h3 className="text-base font-bold text-slate-900 mb-1.5">{item.heading}</h3>
              )}
              {(item.caption || item.subject) && (
                <p className="text-[15px] text-slate-800 leading-relaxed">
                  <TranslateText
                    text={captionExpanded ? (item.caption || item.subject || '') : (item.caption || item.subject || '').length > 80 ? `${(item.caption || item.subject || '').slice(0, 80)}...` : (item.caption || item.subject || '')}
                    as="span"
                    compact
                    preserveWhitespace
                  />
                  {!captionExpanded && (item.caption || item.subject || '').length > 80 && (
                    <button
                      type="button"
                      onClick={() => setCaptionExpanded(true)}
                      className="text-slate-500 hover:text-slate-700 font-medium ml-0.5"
                    >
                      more
                    </button>
                  )}
                </p>
              )}
              {item.taggedUserIds && item.taggedUserIds.length > 0 ? (
                <p className="mt-1 text-sm text-slate-600">
                  with{' '}
                  {item.taggedUserIds.map((u, i) => (
                    <span key={u._id}>
                      {i > 0 ? (i === item.taggedUserIds!.length - 1 ? ' and ' : ', ') : ''}
                      <Link
                        href={`/user/${u._id}`}
                        className="font-semibold text-slate-800 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {u.name || u.username || 'User'}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
            </>
          )}
          {(item.likeCount ?? 0) > 0 && (
            <p className="text-sm font-semibold text-slate-900 mb-1 mt-1">
              {(item.likeCount ?? 0) >= 1000
                ? `Liked by ${((item.likeCount ?? 0) / 1000).toFixed(1)}K others`
                : `Liked by ${item.likeCount} ${(item.likeCount ?? 0) !== 1 ? 'others' : 'other'}`}
            </p>
          )}
          {(item.commentCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setCommentModalOpen(true)}
              className="text-slate-500 hover:text-slate-700 text-sm mt-1 block text-left"
            >
              View all {(item.commentCount ?? 0)} comment{(item.commentCount ?? 0) !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
      {(isProductTile || (productId && (item.productId as any))) && (
        <Link
          href={`/marketplace/product/${productId || item._id}${!isProductTile && creatorIdResolved ? `?resellerId=${creatorIdResolved}` : ''}`}
          className="block p-2 bg-white border-t border-slate-100 hover:bg-slate-50 transition-colors"
        >
          {(() => {
            const name = isProductTile ? (item as any).title : (item.productId as any)?.title;
            return name ? (
              <p className="text-xs text-slate-900 font-bold line-clamp-2 mb-1" title={name}>{name}</p>
            ) : null;
          })()}
          <p className="text-sm font-semibold text-slate-900">
            {(() => {
              const prod = isProductTile
                ? {
                    price: item.price || 0,
                    discountPrice: item.discountPrice,
                    bulkTiers: item.bulkTiers,
                    currency: item.currency || 'ZAR',
                  }
                : {
                    price: (item.productId as any)?.price ?? 0,
                    discountPrice: (item.productId as any)?.discountPrice,
                    bulkTiers: (item.productId as any)?.bulkTiers,
                    currency: (item.productId as any)?.currency || 'ZAR',
                  };
              let displayPrice = getProductPriceForQty(prod, 1);
              const resellerPct = item.resellerCommissionPct ?? (item as any).resellerCommissionPct;
              if (resellerPct != null && creatorIdResolved) {
                displayPrice = Math.round(displayPrice * (1 + resellerPct / 100) * 100) / 100;
              }
              return toViewerZar(displayPrice, prod.currency);
            })()}
          </p>
          {(() => {
            const tiers =
              item.bulkTiers ||
              (item.productId as { bulkTiers?: typeof item.bulkTiers } | undefined)?.bulkTiers;
            const hint = bulkTierSummary(tiers, (n) => formatPriceLocal(n, item.currency || 'ZAR'));
            return hint ? <p className="text-[11px] text-sky-700 mt-0.5">Bulk: {hint}</p> : null;
          })()}
          {productShowsFreeDeliveryPromo(
            isProductTile ? item : (item.productId as Parameters<typeof freeShippingAreasFromProduct>[0] | undefined)
          ) ? (
            <p className="text-[11px] font-semibold text-sky-600 mt-1">{FREE_DELIVERY_PROMO_LABEL}</p>
          ) : null}
        </Link>
      )}

      {/* Report modal for grid variant (below-section hidden when grid) */}
      {!isProductTile && variant === 'grid' && reportOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setReportOpen(false)} aria-hidden="true" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div
              className="bg-white rounded-xl border border-slate-200 shadow-xl min-w-[280px] max-w-md w-full p-4 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Report post</h3>
              <input
                type="text"
                placeholder="Report reason..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setReportOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReport}
                  className="flex-1 px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600"
                >
                  Submit report
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Video expand modal - YouTube-style: video left, sidebar right; fullscreen hides sidebar */}
      {!isProductTile && isVideo && videoExpandOpen && (
        <div
          className={`fixed inset-0 z-50 flex ${relatedVideos?.length && !isFullscreen ? 'overflow-hidden bg-white flex-col lg:flex-row lg:items-stretch' : 'bg-black/95 flex-col items-center justify-center'}`}
          onClick={() => {
            setVideoExpandOpen(false);
            expandedVideoRef.current?.pause();
          }}
        >
          <button
            type="button"
            className={`absolute top-4 right-4 p-2 z-10 ${relatedVideos?.length && !isFullscreen ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}
            onClick={() => {
              setVideoExpandOpen(false);
              expandedVideoRef.current?.pause();
            }}
            aria-label="Close"
          >
            <X className="h-8 w-8" />
          </button>
          <button
            type="button"
            className={`absolute top-4 right-16 p-2 z-10 ${relatedVideos?.length && !isFullscreen ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}
            onClick={(e) => {
              e.stopPropagation();
              const el = expandedVideoRef.current;
              if (!el) return;
              if (!document.fullscreenElement) {
                el.requestFullscreen?.().catch(() => {});
              } else {
                document.exitFullscreen?.();
              }
            }}
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            <Maximize2 className="h-8 w-8" />
          </button>
          <div
            className={`relative flex flex-col flex-1 min-h-0 ${relatedVideos?.length && !isFullscreen ? 'w-full lg:w-auto lg:min-w-0 lg:flex-1 items-start justify-center px-4 lg:px-6' : 'w-full max-w-[90vw] items-center justify-center'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {!videoUnavailable ? (
              <video
                ref={expandedVideoRef}
                src={displayMediaSrc || undefined}
                controls
                autoPlay
                loop
                playsInline
                muted
                preload="auto"
                onError={() => {
                  if (!mediaDirectApiFallback) setMediaDirectApiFallback(true);
                  else setVideoLoadError(true);
                }}
                className={`w-full max-w-full object-contain ${relatedVideos?.length && !isFullscreen ? 'max-h-[60vh] lg:max-h-[85vh]' : 'max-h-[70vh]'}`}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className={`flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-10 text-center ${relatedVideos?.length && !isFullscreen ? 'min-h-[40vh] w-full max-w-xl' : 'min-h-[40vh] w-full max-w-2xl'}`}
              >
                <p className="text-base font-semibold text-white">Video couldn&apos;t load</p>
                <p className="max-w-md text-sm text-slate-400">
                  The MP4 isn&apos;t available at the URL stored for this post (server returned missing file). Restore
                  backups under <code className="text-slate-300">uploads/tv</code> on the API host or replace the post
                  media.
                </p>
              </div>
            )}
            {/* Action icons - visible below video when not fullscreen. View count: videos only */}
            <div className={`flex-shrink-0 mt-4 px-4 py-3 flex items-center justify-center gap-4 sm:gap-6 flex-wrap rounded-xl ${relatedVideos?.length && !isFullscreen ? 'bg-slate-100' : 'bg-white/10 backdrop-blur-sm'}`}>
              {isVideo && (
                <span className={`flex items-center gap-1.5 min-h-[40px] min-w-[40px] justify-center ${relatedVideos?.length && !isFullscreen ? 'text-slate-600' : 'text-white/90'}`} title="Views">
                  <Eye className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="text-sm font-medium">{(item.viewCount ?? 0) >= 1000 ? `${((item.viewCount ?? 0) / 1000).toFixed(1)}K` : item.viewCount ?? 0}</span>
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onLike?.(item._id, !liked); }}
                className={`flex items-center gap-1.5 min-h-[40px] min-w-[40px] justify-center rounded-lg transition-colors cursor-pointer touch-manipulation ${
                  relatedVideos?.length && !isFullscreen
                    ? liked
                      ? 'text-slate-600'
                      : 'text-slate-600 hover:text-slate-900'
                    : liked
                      ? 'text-white/90'
                      : 'text-white/90 hover:text-white'
                }`}
                aria-pressed={liked}
              >
                <Heart
                  className={`h-5 w-5 sm:h-6 sm:w-6 shrink-0 ${
                    relatedVideos?.length && !isFullscreen
                      ? liked || (item.likeCount ?? 0) > 0
                        ? 'fill-red-600 text-red-600'
                        : 'text-red-500 hover:text-red-600'
                      : liked || (item.likeCount ?? 0) > 0
                        ? 'fill-red-400 text-red-400'
                        : 'text-red-400 hover:text-red-300'
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    relatedVideos?.length && !isFullscreen ? 'text-slate-700' : 'text-white/90'
                  }`}
                >
                  {(item.likeCount ?? 0) >= 1000 ? `${((item.likeCount ?? 0) / 1000).toFixed(1)}K` : item.likeCount ?? 0}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setCommentModalOpen(true); }}
                className={`flex items-center gap-1.5 min-h-[40px] min-w-[40px] justify-center rounded-lg transition-colors cursor-pointer touch-manipulation ${relatedVideos?.length && !isFullscreen ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white'}`}
                title="Comments"
              >
                <MessageCircle
                  className={`h-5 w-5 sm:h-6 sm:w-6 shrink-0 ${relatedVideos?.length && !isFullscreen ? 'text-purple-600' : 'text-purple-300'}`}
                />
                <span className="text-sm font-medium">{item.commentCount ?? 0}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors cursor-pointer touch-manipulation ${relatedVideos?.length && !isFullscreen ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white'}`}
                title="Share"
              >
                <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              {onRepost && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRepost(item._id); }}
                  className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors cursor-pointer touch-manipulation ${relatedVideos?.length && !isFullscreen ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white'}`}
                  title="Repost"
                >
                  <Repeat2 className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              )}
              {!isOwnPost && creatorIdResolved && currentUserId && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDonateModalOpen(true); }}
                  className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors cursor-pointer touch-manipulation ${relatedVideos?.length && !isFullscreen ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white'}`}
                  title="Donate"
                >
                  <HeartHandshake className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              )}
            </div>
          </div>
          {relatedVideos && relatedVideos.length > 0 && !isFullscreen && (
            <div
              className="flex flex-col w-full min-h-0 shrink-0 lg:h-full lg:w-[320px] xl:w-[360px] max-h-[42vh] lg:max-h-none lg:border-l lg:border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <VideoSidebar
                items={relatedVideos}
                currentPostId={item._id}
                creatorId={creatorIdResolved ?? undefined}
                creatorName={creatorName !== 'User' ? creatorName : undefined}
                embedded
              />
            </div>
          )}
        </div>
      )}

      {/* Lightbox for image posts */}
      {!isProductTile && !isVideo && lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
          >
            <X className="h-8 w-8" />
          </button>
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={displayMediaSrc}
              alt={item.caption || 'Post'}
              className={`max-w-full max-h-[90vh] object-contain ${filterClass}`}
              data-pin-nopin="true"
              onError={handleImageLoadError}
            />
            {isCarousel && (item.mediaUrls?.length ?? 0) > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCarouselIndex((i) => (i - 1 + (item.mediaUrls?.length ?? 1)) % (item.mediaUrls?.length ?? 1));
                  }}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCarouselIndex((i) => (i + 1) % (item.mediaUrls?.length ?? 1));
                  }}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {(item.mediaUrls ?? []).map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full ${i === carouselIndex ? 'bg-white' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <TVCommentModal
        open={commentModalOpen}
        onClose={() => setCommentModalOpen(false)}
        item={item}
        onCommentAdded={() => onCommentAdded?.(item._id)}
        currentUserId={currentUserId}
      />

      {mediaUrl && (
        <SetPictureOptionsModal
          open={pictureOptionsOpen}
          onClose={() => setPictureOptionsOpen(false)}
          imagePreview={mediaUrl}
          onSetProfilePic={() => onSetProfilePicFromUrl?.(mediaUrl)}
          onSetStripBackground={() => onSetStripBackgroundFromUrl?.(mediaUrl)}
        />
      )}

      {/* Donate modal */}
      {donateModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={() => { setDonateModalOpen(false); setDonateAmount(''); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Donate</h2>
            <p className="text-sm text-slate-600 mb-2">Amount will be deducted from your wallet and sent to the creator.</p>
            <p className="text-xs text-slate-500 mb-4">
              {donateBalanceLoading ? 'Checking wallet balance...' : `Wallet balance: R${Number(donateBalance ?? 0).toFixed(0)}`}
            </p>
            <input
              type="number"
              min={1}
              max={50000}
              step={1}
              value={donateAmount}
              onChange={(e) => setDonateAmount(e.target.value)}
              placeholder="Enter amount (ZAR)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-2"
            />
            <div className="flex flex-wrap gap-2 mb-2">
              {DONATE_PRESET_AMOUNTS_ZAR.map((amt) => {
                const selected = parseFloat(donateAmount) === amt && !Number.isNaN(parseFloat(donateAmount));
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDonateAmount(String(amt))}
                    className={`min-w-[4.25rem] px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                      selected
                        ? 'border-sky-500 bg-sky-50 text-sky-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    R{amt}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setDonateAmount(String(DONATE_COFFEE_AMOUNT_ZAR))}
              className={`inline-flex w-full items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors mb-4 ${
                parseFloat(donateAmount) === DONATE_COFFEE_AMOUNT_ZAR && !Number.isNaN(parseFloat(donateAmount))
                  ? 'border-amber-500 bg-amber-50 text-amber-950'
                  : 'border-amber-200 bg-amber-50/90 text-amber-950 hover:bg-amber-100 hover:border-amber-300'
              }`}
            >
              <Coffee className="h-5 w-5 shrink-0" aria-hidden strokeWidth={2.25} />
              Buy me Coffee R{DONATE_COFFEE_AMOUNT_ZAR}
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => { setDonateModalOpen(false); setDonateAmount(''); }}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDonate('wallet')}
                disabled={donateSending || !donateAmount || parseFloat(donateAmount) < 1}
                className="flex-1 px-4 py-2 rounded-xl bg-rose-500 text-white font-medium disabled:opacity-50 hover:bg-rose-600"
              >
                {donateSending ? 'Sending...' : 'Donate'}
              </button>
            </div>
            {!!donateAmount && parseFloat(donateAmount) > 0 && (donateBalance ?? 0) < parseFloat(donateAmount) && (
              <button
                onClick={() => handleDonate('topup')}
                disabled={donateSending || donateBalanceLoading}
                className="mt-3 w-full px-4 py-2 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 font-medium disabled:opacity-50 hover:bg-sky-100"
              >
                {donateSending ? 'Processing...' : 'Top up & Donate'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    <EditPostModal
      post={item}
      open={editOpen}
      onClose={() => setEditOpen(false)}
      onUpdated={(updated) => {
        onUpdated?.({ ...item, ...updated, _id: item._id });
      }}
    />
    </>
  );
}
