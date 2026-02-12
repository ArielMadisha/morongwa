'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Heart,
  MessageCircle,
  Share2,
  Repeat2,
  Flag,
  MoreHorizontal,
  Package,
  ShoppingCart,
} from 'lucide-react';
import { tvAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import type { Product } from '@/lib/types';

const TV_WATERMARK = 'The Digital Home for Doers, Sellers & Creators - Qwertymates.com';
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
  type: 'video' | 'image' | 'carousel' | 'product' | 'product_tile';
  mediaUrls?: string[];
  caption?: string;
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
}

interface TVGridTileProps {
  item: TVGridItem;
  liked?: boolean;
  onLike?: (id: string, liked: boolean) => void;
  onRepost?: (id: string) => void;
  onEnquire?: (productId: string) => void;
  isVisible?: boolean;
}

export function TVGridTile({ item, liked = false, onLike, onRepost, onEnquire, isVisible = true }: TVGridTileProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [watermarkPhase, setWatermarkPhase] = useState<'start' | 'middle' | 'end'>('start');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const isProductTile = item.type === 'product_tile';
  const isVideo = !isProductTile && (item.type === 'video' || (item.mediaUrls?.[0]?.match(/\.(mp4|webm)$/i)));
  const mediaUrl = isProductTile ? (item.images?.[0] || '') : (item.mediaUrls?.[0] || '');

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

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Morongwa-TV',
        text: item.caption || 'Check this out on Morongwa-TV',
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const filterClass = item.filter
    ? { warm: 'sepia-30', cool: 'filter-[hue-rotate(180deg)]', vintage: 'sepia-50 contrast-110', grayscale: 'grayscale' }[item.filter] || ''
    : '';

  const productId = isProductTile ? item._id : item.productId?._id;
  const hasSeller = isProductTile || !!item.productId?.supplierId;

  return (
    <div
      className="aspect-square bg-slate-900 rounded-xl overflow-hidden relative group"
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
    >
      {/* Media */}
      {isProductTile ? (
        <Link href={`/marketplace/product/${item._id}`} className="block w-full h-full">
          <div className="w-full h-full flex items-center justify-center bg-slate-800">
            {mediaUrl ? (
              <img src={getImageUrl(mediaUrl)} alt={item.title || 'Product'} className={`w-full h-full object-cover ${filterClass}`} />
            ) : (
              <Package className="h-16 w-16 text-slate-500" />
            )}
          </div>
        </Link>
      ) : isVideo ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          playsInline
          loop
          muted
          className={`w-full h-full object-cover ${filterClass}`}
        />
      ) : (
        <img
          src={getImageUrl(mediaUrl)}
          alt={item.caption || 'Post'}
          className={`w-full h-full object-cover ${filterClass}`}
        />
      )}

      {/* TikTok-style watermark: at start and end */}
      {!isProductTile && showWatermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
          <p className="text-[10px] sm:text-xs text-white drop-shadow-lg font-medium text-center px-2">
            {TV_WATERMARK}
          </p>
        </div>
      )}

      {/* Overlay on hover */}
      {showOverlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 flex flex-col justify-between p-3">
          <div className="flex justify-between items-start">
            <span className="text-white text-sm font-medium truncate">
              {isProductTile ? item.title : item.creatorId?.name || 'Creator'}
            </span>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (item.type !== 'product_tile') setReportOpen(!reportOpen);
                }}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {reportOpen && item.type !== 'product_tile' && (
                <div className="absolute right-0 top-full mt-1 py-2 bg-white rounded-xl border border-slate-200 shadow-lg z-20 min-w-[180px]">
                  <input
                    type="text"
                    placeholder="Report reason..."
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mx-2 mb-2 text-slate-900"
                  />
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

          <div className="flex flex-col gap-2">
            {!isProductTile && item.caption && (
              <p className="text-white text-sm line-clamp-2">{item.caption}</p>
            )}
            {isProductTile && (
              <p className="text-white font-semibold">
                {formatPrice(getEffectivePrice({ price: item.price || 0, discountPrice: item.discountPrice }), item.currency || 'ZAR')}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => item.type !== 'product_tile' && onLike?.(item._id, !liked)}
                className={`flex items-center gap-1 ${liked ? 'text-rose-400' : 'text-white'}`}
              >
                <Heart className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
                <span className="text-sm">{item.likeCount ?? 0}</span>
              </button>
              {item.type !== 'product_tile' && (
                <>
                  <span className="text-white/80 flex items-center gap-1">
                    <MessageCircle className="h-5 w-5" />
                    <span className="text-sm">{item.commentCount ?? 0}</span>
                  </span>
                  <button onClick={() => onRepost?.(item._id)} className="text-white/80">
                    <Repeat2 className="h-5 w-5" />
                  </button>
                </>
              )}
              <button onClick={handleShare} className="text-white/80">
                <Share2 className="h-5 w-5" />
              </button>
              {(isProductTile || productId) && (
                <div className="flex gap-1">
                  <Link
                    href={`/marketplace/product/${productId || item._id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500 text-white text-sm font-medium"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Buy
                  </Link>
                  {hasSeller && onEnquire && productId && (
                    <button
                      onClick={() => onEnquire(productId)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 text-white text-sm font-medium border border-white/40"
                    >
                      Enquire
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Watermark badge (always visible subtle) when not in start/end phase for videos */}
      {!isProductTile && !showWatermark && item.hasWatermark !== false && (
        <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
          <p className="text-[8px] text-white/70 truncate px-1">{TV_WATERMARK}</p>
        </div>
      )}
    </div>
  );
}
