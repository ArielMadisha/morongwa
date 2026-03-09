'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Heart,
  MessageCircle,
  Share2,
  Repeat2,
  Send,
  Flag,
  MoreHorizontal,
  Package,
  ShoppingCart,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  ExternalLink,
  Link2,
  Code,
  User,
  HeartHandshake,
  Music2,
  Maximize2,
} from 'lucide-react';
import { tvAPI, followsAPI, walletAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';
import { TVCommentModal } from './TVCommentModal';
import { FollowButton } from '@/components/FollowButton';
import { SetPictureOptionsModal } from '@/components/SetPictureOptionsModal';

const WATERMARK_IMG = '/watermark-qwertymates.svg';
const WATERMARK_DURATION = 3; // seconds at start and end

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export interface TVGridItem {
  _id: string;
  type: 'video' | 'image' | 'carousel' | 'product' | 'product_tile' | 'text' | 'audio';
  mediaUrls?: string[];
  caption?: string;
  heading?: string;
  subject?: string;
  hashtags?: string[];
  productId?: Product & { _id: string; supplierId?: { userId?: string } | string };
  filter?: string;
  hasWatermark?: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  creatorId?: { _id: string; name?: string; avatar?: string };
  createdAt?: string;
  // product tile
  title?: string;
  images?: string[];
  price?: number;
  discountPrice?: number;
  currency?: string;
  slug?: string;
  supplierId?: { userId?: string } | string;
  allowResell?: boolean;
}

interface TVGridTileProps {
  item: TVGridItem;
  liked?: boolean;
  onLike?: (id: string, liked: boolean) => void;
  onRepost?: (id: string) => void;
  onEnquire?: (productId: string) => void;
  onCommentAdded?: (id: string) => void;
  isVisible?: boolean;
  currentUserId?: string;
  onSetProfilePicFromUrl?: (url: string) => Promise<void>;
  onSetStripBackgroundFromUrl?: (url: string) => Promise<void>;
  /** When 'grid', shows action icons overlay on media (for clipped tiles). When 'feed', icons are below media. */
  variant?: 'feed' | 'grid';
}

export function TVGridTile({ item, liked = false, onLike, onRepost, onEnquire, onCommentAdded, isVisible = true, currentUserId, onSetProfilePicFromUrl, onSetStripBackgroundFromUrl, variant = 'feed' }: TVGridTileProps) {
  const [watermarkPhase, setWatermarkPhase] = useState<'start' | 'middle' | 'end'>('start');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoExpandOpen, setVideoExpandOpen] = useState(false);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);
  const [pictureOptionsOpen, setPictureOptionsOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState('');
  const [donateSending, setDonateSending] = useState(false);
  const [donateBalance, setDonateBalance] = useState<number | null>(null);
  const [donateBalanceLoading, setDonateBalanceLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const creatorName = item.creatorId?.name || 'Creator';
  // Resolve creatorId (populated object or raw string) for donate/own-post logic
  const creatorIdResolved = typeof item.creatorId === 'object' && item.creatorId !== null && '_id' in item.creatorId
    ? String((item.creatorId as { _id: string })._id)
    : item.creatorId
      ? String(item.creatorId)
      : null;
  const isOwnPost = creatorIdResolved && currentUserId && creatorIdResolved === String(currentUserId);

  const isProductTile = item.type === 'product_tile';
  const isTextPost = item.type === 'text';
  const isAudioPost = item.type === 'audio';
  const isVideo = !isProductTile && !isTextPost && !isAudioPost && (item.type === 'video' || (item.mediaUrls?.[0]?.match(/\.(mp4|webm)$/i)));
  const isCarousel = !isProductTile && !isTextPost && !isAudioPost && !isVideo && (item.mediaUrls?.length ?? 0) > 1;
  const isProductCarousel = isProductTile && (item.images?.length ?? 0) > 1;
  const mediaUrl = isProductTile ? (item.images?.[0] || '') : (item.mediaUrls?.[carouselIndex] || item.mediaUrls?.[0] || '');

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

  const showWatermark = item.hasWatermark !== false && (watermarkPhase === 'start' || watermarkPhase === 'end');

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

  // Autoplay when visible
  useEffect(() => {
    if (!videoRef.current || !isVisible) return;
    if (isVisible) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isVisible, isVideo]);

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

  const handleDonate = (mode: 'wallet' | 'topup' = 'wallet') => {
    const amount = parseFloat(donateAmount);
    if (!creatorIdResolved || !currentUserId || isNaN(amount) || amount < 1) return;
    if (creatorIdResolved === String(currentUserId)) return; // Guard: cannot donate to self
    setDonateSending(true);
    (async () => {
      if (mode === 'topup') {
        const current = Math.max(0, Number(donateBalance ?? 0));
        const shortfall = Math.max(0, amount - current);
        if (shortfall > 0) {
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
            return;
          }
        }
      } else if ((donateBalance ?? 0) < amount) {
        throw new Error('Insufficient wallet balance');
      }
      await walletAPI.donate(amount, creatorIdResolved);
      setDonateBalance((prev) => Math.max(0, Number(prev ?? 0) - amount));
    })()
      .then(() => {
        toast.success('Donation sent successfully');
        setDonateModalOpen(false);
        setDonateAmount('');
      })
      .catch((e: any) => toast.error(e.response?.data?.message || e.message || 'Failed to send donation'))
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

  return (
    <div className="rounded-lg overflow-hidden bg-white border border-slate-100 shadow-sm flex flex-col">
      {/* Media container - smaller max for grid so icon bar fits below */}
      <div className={`relative aspect-square w-full mx-auto bg-slate-900 ${variant === 'grid' ? 'max-h-[min(260px,42vw)]' : 'max-h-[min(580px,62vh)]'}`}>
      {/* Media */}
      {isAudioPost ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-900">
          <Music2 className="h-16 w-16 text-sky-400 mb-4" />
          <audio src={mediaUrl} controls className="w-full max-w-full" />
          {item.caption && (
            <p className="text-slate-300 text-sm mt-3 text-center max-w-full truncate px-2">{item.caption}</p>
          )}
        </div>
      ) : isTextPost ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-sky-50 to-slate-100 gap-3">
          <div className="text-center max-w-md">
            {(item.heading || item.subject || item.caption) && (
              <>
                {item.heading && (
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">{item.heading}</h3>
                )}
                {(item.subject || item.caption) && (
                  <p className="text-slate-700 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                    {item.subject || item.caption}
                  </p>
                )}
              </>
            )}
            {!item.heading && !item.subject && !item.caption && (
              <p className="text-slate-500 text-sm">Text post</p>
            )}
          </div>
        </div>
      ) : isProductTile ? (
        <div className="relative w-full h-full">
          <Link href={`/marketplace/product/${item._id}`} className="block w-full h-full">
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              {mediaUrl ? (
                <img src={getImageUrl(mediaUrl)} alt={item.title || 'Product'} className={`w-full h-full object-cover ${filterClass}`} />
              ) : (
                <Package className="h-16 w-16 text-slate-500" />
              )}
            </div>
          </Link>
          {isProductCarousel && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCarouselIndex((i) => (i - 1 + (item.images?.length ?? 1)) % (item.images?.length ?? 1));
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white z-10"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCarouselIndex((i) => (i + 1) % (item.images?.length ?? 1));
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white z-10"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1 pointer-events-none">
                {(item.images ?? []).map((_, i) => (
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
          className="relative w-full h-full cursor-pointer block focus:outline-none group"
          onClick={(e) => {
            e.stopPropagation();
            setVideoExpandOpen(true);
          }}
        >
          <video
            ref={videoRef}
            src={getImageUrl(mediaUrl) || mediaUrl}
            playsInline
            loop
            muted
            className={`w-full h-full object-cover ${filterClass}`}
          />
          {/* Fullscreen [ ] icon overlay - visible on hover */}
          <div className="absolute bottom-2 left-2 p-2 rounded-lg bg-black/50 text-white/90 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            <Maximize2 className="h-5 w-5" aria-label="Expand / Fullscreen" />
          </div>
        </button>
      ) : (
        <div className="relative w-full h-full">
          <button
            type="button"
            className="relative w-full h-full cursor-pointer block focus:outline-none"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(true);
            }}
          >
            {getImageUrl(mediaUrl) ? (
              <img
                src={getImageUrl(mediaUrl)}
                alt={item.caption || 'Post'}
                className={`w-full h-full object-cover ${filterClass}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800">
                <Package className="h-16 w-16 text-slate-500" />
              </div>
            )}
          </button>
          {isCarousel && (item.mediaUrls?.length ?? 0) > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCarouselIndex((i) => (i - 1 + (item.mediaUrls?.length ?? 1)) % (item.mediaUrls?.length ?? 1));
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white z-10"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCarouselIndex((i) => (i + 1) % (item.mediaUrls?.length ?? 1));
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white z-10"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1 pointer-events-none">
                {(item.mediaUrls ?? []).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${i === carouselIndex ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Top overlay: user top-left, follow top-right */}
      <div className="absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/50 to-transparent flex justify-between items-start gap-2 z-10">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href={isOwnPost ? '/store' : (item.creatorId?._id || item.creatorId) ? `/morongwa-tv/user/${item.creatorId?._id ?? item.creatorId}` : '/morongwa-tv'}
            className="flex items-center gap-2 min-w-0"
          >
            <div className="h-8 w-8 rounded-full bg-slate-600 flex-shrink-0 overflow-hidden border-2 border-white/30">
              {item.creatorId?.avatar ? (
                <img src={getImageUrl(item.creatorId.avatar)} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-white text-xs font-bold">
                  {creatorName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{isProductTile ? item.title : creatorName}</p>
              {!isProductTile && !isOwnPost && (
                <p className="text-white/80 text-xs">Suggested for you</p>
              )}
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!isProductTile && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPostMenuOpen((v) => !v); setReportOpen(false); }}
                className="p-2 rounded-full text-white/90 hover:text-white hover:bg-white/20 transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {postMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPostMenuOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-full mt-1 py-1 bg-white rounded-xl border border-slate-200 shadow-xl z-20 min-w-[220px]">
                    <button
                      onClick={() => { setPostMenuOpen(false); setReportOpen(true); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                    >
                      <Flag className="h-4 w-4" /> Report
                    </button>
                    {!isOwnPost && item.creatorId?._id && currentUserId && (
                      <button
                        onClick={async () => {
                          setPostMenuOpen(false);
                          try {
                            await followsAPI.unfollow(item.creatorId!._id);
                            toast.success('Unfollowed');
                          } catch (e: any) {
                            toast.error(e.response?.data?.message || 'Failed to unfollow');
                          }
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                      >
                        Unfollow
                      </button>
                    )}
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={() => { setPostMenuOpen(false); toast.success('Added to favorites'); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Star className="h-4 w-4" /> Add to favorites
                    </button>
                    <Link
                      href={item.creatorId?._id ? `/morongwa-tv/user/${item.creatorId._id}` : '/morongwa-tv'}
                      onClick={() => setPostMenuOpen(false)}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 block"
                    >
                      <ExternalLink className="h-4 w-4" /> Go to post
                    </Link>
                    <button
                      onClick={() => { setPostMenuOpen(false); handleShare(); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
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
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Link2 className="h-4 w-4" /> Copy link
                    </button>
                    <button
                      onClick={() => { setPostMenuOpen(false); toast.success('Embed code copied'); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Code className="h-4 w-4" /> Embed
                    </button>
                    {!isOwnPost && item.creatorId?._id && (
                      <Link
                        href={`/morongwa-tv/user/${item.creatorId._id}`}
                        onClick={() => setPostMenuOpen(false)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 block"
                      >
                        <User className="h-4 w-4" /> About this account
                      </Link>
                    )}
                    <div className="border-t border-slate-100 my-1" />
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
          )}
          {!isProductTile && item.creatorId?._id && !isOwnPost && (
            <FollowButton targetUserId={item.creatorId._id} currentUserId={currentUserId} className="!px-3 !py-1.5 !text-xs !rounded-lg bg-black/40 text-white border border-white/30 hover:bg-black/60" />
          )}
        </div>
      </div>

      {/* Product actions overlay (Resell, Buy, Enquire - keep on media for product tiles) */}
      {(isProductTile || productId) && (
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent flex flex-wrap gap-1.5 z-10">
          {((item as any).allowResell || (item.productId as any)?.allowResell) && (
            <Link
              href={`/marketplace/product/${productId || item._id}?view=resell`}
              className="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30"
            >
              Resell
            </Link>
          )}
          <Link
            href={`/marketplace/product/${productId || item._id}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600"
          >
            <ShoppingCart className="h-4 w-4" />
            Buy
          </Link>
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
        <div className="absolute bottom-2 right-2 pointer-events-none z-0 flex justify-end">
          <img
            src={WATERMARK_IMG}
            alt="Qwertymates"
            className="h-6 sm:h-7 w-auto object-contain object-right drop-shadow-lg"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
          />
        </div>
      )}

      {/* Watermark badge (always visible subtle) when not in start/end phase for videos */}
      {!isProductTile && !showWatermark && item.hasWatermark !== false && (
        <div className="absolute bottom-2 right-2 pointer-events-none z-0 opacity-70 flex justify-end">
          <img
            src={WATERMARK_IMG}
            alt="Qwertymates"
            className="h-4 sm:h-5 w-auto object-contain object-right"
          />
        </div>
      )}
      </div>

      {/* QwertyTV grid: action icons below each video - flex-shrink-0 so never clipped */}
      {!isProductTile && variant === 'grid' && (
        <div className="flex-shrink-0 min-h-[44px] px-2 py-1.5 border-t border-slate-100 flex items-center justify-start gap-2 sm:gap-3 flex-wrap bg-white">
          <button
            onClick={(e) => { e.stopPropagation(); onLike?.(item._id, !liked); }}
            className={`flex items-center gap-1 min-h-[36px] min-w-[36px] justify-center py-1 px-1 rounded-lg transition-colors cursor-pointer touch-manipulation ${
              liked ? 'text-rose-500' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Heart className={`h-4 w-4 sm:h-5 sm:w-5 ${liked ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">{(item.likeCount ?? 0) >= 1000 ? `${((item.likeCount ?? 0) / 1000).toFixed(1)}K` : item.likeCount ?? 0}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setCommentModalOpen(true); }}
            className="flex items-center gap-1 min-h-[36px] min-w-[36px] justify-center py-1 px-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
            title="Comments"
          >
            <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="text-xs font-medium">{item.commentCount ?? 0}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleShare(); }}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
            title="Share"
          >
            <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          {onRepost && (
            <button
              onClick={(e) => { e.stopPropagation(); onRepost(item._id); }}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
              title="Repost"
            >
              <Repeat2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          )}
          <Link
            href="/messages"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors touch-manipulation"
            title="Send"
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </Link>
          {!isOwnPost && creatorIdResolved && currentUserId && (
            <button
              onClick={(e) => { e.stopPropagation(); setDonateModalOpen(true); }}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
              title="Donate"
            >
              <HeartHandshake className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          )}
        </div>
      )}

      {/* Below picture: hashtags, action icons (left), report (right) - homepage only */}
      {!isProductTile && variant !== 'grid' && (
        <div className="px-2 py-1.5 border-b border-slate-100">
          {item.hashtags && item.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {item.hashtags.map((tag) => (
                <Link
                  key={tag}
                  href={`/wall?q=%23${encodeURIComponent(tag)}`}
                  className="px-2 py-1 rounded-lg bg-sky-100 text-sky-700 text-xs font-medium hover:bg-sky-200 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {/* Action icons - bottom left (homepage only) */}
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <button
                onClick={(e) => { e.stopPropagation(); onLike?.(item._id, !liked); }}
                className={`flex items-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 justify-center py-1 px-1 sm:px-0 rounded-lg transition-colors cursor-pointer touch-manipulation ${
                  liked ? 'text-rose-500' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Heart className={`h-5 w-5 sm:h-6 sm:w-6 ${liked ? 'fill-current' : ''}`} />
                <span className="text-xs sm:text-sm font-medium">{(item.likeCount ?? 0) >= 1000 ? `${((item.likeCount ?? 0) / 1000).toFixed(1)}K` : item.likeCount ?? 0}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setCommentModalOpen(true); }}
                className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 justify-center py-1 px-1 sm:px-0 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
              >
                <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-xs sm:text-sm font-medium">{item.commentCount ?? 0}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
                title="Share"
              >
                <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              {onRepost && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRepost(item._id); }}
                  className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
                  title="Repost"
                >
                  <Repeat2 className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              )}
              <Link
                href="/messages"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors touch-manipulation"
                title="Send to message"
              >
                <Send className="h-5 w-5 sm:h-6 sm:w-6" />
              </Link>
              {!isOwnPost && creatorIdResolved && currentUserId && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDonateModalOpen(true); }}
                  className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer touch-manipulation"
                  title="Donate"
                >
                  <HeartHandshake className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              )}
            </div>
            {/* Report button - right */}
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setReportOpen(!reportOpen); }}
                className="p-2 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                aria-label="Report post"
              >
                <Flag className="h-5 w-5" />
              </button>
              {reportOpen && (
                <div className="absolute right-0 top-full mt-1 py-2 bg-white rounded-xl border border-slate-200 shadow-lg z-20 min-w-[200px]">
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Below icons: story/caption and comments - hidden in grid */}
      {!isProductTile && variant !== 'grid' && (
        <div className="p-2 bg-white">
          {(item.likeCount ?? 0) > 0 && (
            <p className="text-sm font-semibold text-slate-900 mb-1">
              {(item.likeCount ?? 0) >= 1000
                ? `Liked by ${((item.likeCount ?? 0) / 1000).toFixed(1)}K others`
                : `Liked by ${item.likeCount} ${(item.likeCount ?? 0) !== 1 ? 'others' : 'other'}`}
            </p>
          )}
          {item.caption && (
            <p className="text-sm text-slate-800">
              <Link href={isOwnPost ? '/store' : (item.creatorId?._id || item.creatorId) ? `/morongwa-tv/user/${item.creatorId?._id ?? item.creatorId}` : '/morongwa-tv'} className="font-semibold mr-1.5">
                {creatorName}
              </Link>
              <span>
                {captionExpanded ? item.caption : item.caption.length > 80 ? `${item.caption.slice(0, 80)}...` : item.caption}
              </span>
              {!captionExpanded && item.caption.length > 80 && (
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
      {isProductTile && (
        <div className="p-2 bg-white border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-900">
            {formatPrice(getEffectivePrice({ price: item.price || 0, discountPrice: item.discountPrice }), item.currency || 'ZAR')}
          </p>
        </div>
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

      {/* Video expand modal - click to expand for viewing */}
      {!isProductTile && isVideo && videoExpandOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => {
            setVideoExpandOpen(false);
            expandedVideoRef.current?.pause();
          }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white z-10"
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
            className="absolute top-4 right-16 p-2 text-white/80 hover:text-white z-10"
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
            className="relative max-w-[90vw] max-h-[90vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={expandedVideoRef}
              src={getImageUrl(mediaUrl) || mediaUrl}
              controls
              autoPlay
              loop
              playsInline
              className="max-w-full max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
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
              src={getImageUrl(mediaUrl)}
              alt={item.caption || 'Post'}
              className={`max-w-full max-h-[90vh] object-contain ${filterClass}`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setDonateModalOpen(false); setDonateAmount(''); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Donate to {creatorName}</h2>
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
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-4"
            />
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
  );
}
