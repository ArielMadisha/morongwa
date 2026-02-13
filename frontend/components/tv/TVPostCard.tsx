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
  Send,
} from 'lucide-react';
import { tvAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import type { Product } from '@/lib/types';

const TV_WATERMARK = 'Qwertymates.com';

interface TVPost {
  _id: string;
  type: 'video' | 'image' | 'carousel' | 'product';
  mediaUrls: string[];
  caption?: string;
  productId?: Product & { _id: string };
  filter?: string;
  hasWatermark?: boolean;
  originalPostId?: { creatorId?: { name?: string } };
  repostedBy?: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  creatorId: { _id: string; name?: string; avatar?: string };
  createdAt: string;
}

interface TVComment {
  _id: string;
  text: string;
  userId: { _id: string; name?: string; avatar?: string };
  createdAt: string;
}

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatTimeAgo(date: string) {
  const d = new Date(date);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return 'now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return d.toLocaleDateString();
}

interface TVPostCardProps {
  post: TVPost;
  liked?: boolean;
  onLike?: (id: string, liked: boolean) => void;
  onRepost?: (id: string) => void;
  onComment?: () => void;
}

export function TVPostCard({ post, liked = false, onLike, onRepost, onComment }: TVPostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<TVComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideo = post.type === 'video' || (post.mediaUrls?.[0]?.match(/\.(mp4|webm)$/i));
  const mediaUrls = post.mediaUrls || [];
  const currentMedia = mediaUrls[carouselIndex] || mediaUrls[0];

  const loadComments = () => {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true);
      tvAPI
        .getComments(post._id)
        .then((res) => setComments(res.data?.data ?? []))
        .catch(() => setComments([]))
        .finally(() => setLoadingComments(false));
    }
    setShowComments(!showComments);
  };

  const submitComment = () => {
    if (!commentText.trim() || postingComment) return;
    setPostingComment(true);
    tvAPI
      .addComment(post._id, commentText.trim())
      .then((res) => {
        setComments((c) => [...c, res.data?.data ?? res.data]);
        setCommentText('');
      })
      .finally(() => setPostingComment(false));
  };

  const handleReport = () => {
    if (!reportReason.trim()) return;
    tvAPI.report(post._id, reportReason.trim()).then(() => {
      setReportOpen(false);
      setReportReason('');
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Morongwa-TV',
        text: post.caption || 'Check this out on Morongwa-TV',
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const filterClass = post.filter
    ? {
        warm: 'sepia-30',
        cool: 'filter-[hue-rotate(180deg)]',
        vintage: 'sepia-50 contrast-110',
        grayscale: 'grayscale',
      }[post.filter] || ''
    : '';

  return (
    <article className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      {/* Repost label */}
      {post.originalPostId && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm text-slate-500 flex items-center gap-2">
          <Repeat2 className="h-4 w-4" />
          Reposted by {post.creatorId?.name || 'User'}
        </div>
      )}

      {/* Creator header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200 overflow-hidden">
            {post.creatorId?.avatar ? (
              <img src={getImageUrl(post.creatorId.avatar)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-slate-500 font-semibold">
                {(post.creatorId?.name || '?')[0]}
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{post.creatorId?.name || 'Creator'}</p>
            <p className="text-xs text-slate-500">{formatTimeAgo(post.createdAt)}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setReportOpen(!reportOpen)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="More options"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {reportOpen && (
            <div className="absolute right-0 top-full mt-1 py-2 bg-white rounded-xl border border-slate-200 shadow-lg z-10 min-w-[200px]">
              <input
                type="text"
                placeholder="Report reason..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mx-2 mb-2"
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

      {/* Media */}
      <div className="relative bg-slate-900 aspect-square max-h-[70vh] flex items-center justify-center overflow-hidden">
        {isVideo ? (
          <>
            <video
              ref={videoRef}
              src={currentMedia}
              controls
              playsInline
              loop
              muted
              className={`w-full h-full object-contain ${filterClass}`}
            />
            {post.hasWatermark !== false && (
              <div className="absolute bottom-2 right-2 pointer-events-none">
                <p className="text-[10px] sm:text-xs text-white/90 drop-shadow-lg font-medium">
                  {TV_WATERMARK}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {mediaUrls.length > 1 ? (
              <div className="relative w-full h-full">
                <img
                  src={getImageUrl(currentMedia)}
                  alt={post.caption || 'Post'}
                  className={`w-full h-full object-contain ${filterClass}`}
                />
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {mediaUrls.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCarouselIndex(i)}
                      className={`w-2 h-2 rounded-full ${i === carouselIndex ? 'bg-white' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
                {post.hasWatermark !== false && (
                  <div className="absolute bottom-2 right-2 pointer-events-none">
                    <p className="text-[10px] sm:text-xs text-white/90 drop-shadow-lg font-medium">
                      {TV_WATERMARK}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <img
                  src={getImageUrl(currentMedia)}
                  alt={post.caption || 'Post'}
                  className={`w-full h-full object-contain ${filterClass}`}
                />
                {post.hasWatermark !== false && (
                  <div className="absolute bottom-2 right-2 pointer-events-none">
                    <p className="text-[10px] sm:text-xs text-white/90 drop-shadow-lg font-medium">
                      {TV_WATERMARK}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Caption */}
      {post.caption && (
        <div className="px-4 py-2">
          <p className="text-slate-700 whitespace-pre-wrap">{post.caption}</p>
        </div>
      )}

      {/* Product card (if linked) */}
      {post.productId && (
        <div className="mx-4 mb-4">
          <Link
            href={`/marketplace/product/${post.productId._id}`}
            className="flex gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 transition-colors"
          >
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-200 shrink-0">
              {post.productId.images?.[0] ? (
                <img
                  src={getImageUrl(post.productId.images[0])}
                  alt={post.productId.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-6 w-6 text-slate-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{post.productId.title}</p>
              <p className="text-sky-600 font-semibold">
                {formatPrice(getEffectivePrice(post.productId), post.productId.currency || 'ZAR')}
              </p>
            </div>
            <span className="text-xs text-sky-600 font-medium self-center">Buy →</span>
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-4">
        <button
          onClick={() => onLike?.(post._id, !liked)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors ${
            liked ? 'text-rose-500 bg-rose-50' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Heart className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
          <span className="text-sm font-medium">{post.likeCount}</span>
        </button>
        <button
          onClick={loadComments}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{post.commentCount}</span>
        </button>
        <button
          onClick={onRepost ? () => onRepost(post._id) : undefined}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Repeat2 className="h-5 w-5" />
          <span className="text-sm font-medium">{post.shareCount}</span>
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* Comments panel */}
      {showComments && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
          {loadingComments ? (
            <p className="text-sm text-slate-500">Loading comments...</p>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {comments.map((c) => (
                <div key={c._id} className="flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-slate-200 shrink-0 overflow-hidden">
                    {c.userId?.avatar ? (
                      <img src={getImageUrl(c.userId.avatar)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-500 text-xs font-semibold">
                        {(c.userId?.name || '?')[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold text-slate-800">{c.userId?.name || 'User'}</span>{' '}
                      <span className="text-slate-600">{c.text}</span>
                    </p>
                    <p className="text-xs text-slate-400">{formatTimeAgo(c.createdAt)}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && !loadingComments && (
                <p className="text-sm text-slate-500">No comments yet.</p>
              )}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
            <button
              onClick={submitComment}
              disabled={!commentText.trim() || postingComment}
              className="p-2 rounded-xl bg-sky-500 text-white disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
