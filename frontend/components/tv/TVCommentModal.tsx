'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Mic } from 'lucide-react';
import { tvAPI, getImageUrl } from '@/lib/api';
import type { TVGridItem } from './TVGridTile';
import { FollowButton } from '@/components/FollowButton';
import { TranslateText } from '@/components/TranslateText';

function formatTimeAgo(date: string) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
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

interface TVComment {
  _id: string;
  text?: string;
  audioUrl?: string;
  userId: { _id: string; name?: string; avatar?: string };
  createdAt: string;
}

interface TVCommentModalProps {
  open: boolean;
  onClose: () => void;
  item: TVGridItem | null;
  onCommentAdded?: () => void;
  currentUserId?: string;
}

export function TVCommentModal({ open, onClose, item, onCommentAdded, currentUserId }: TVCommentModalProps) {
  const [comments, setComments] = useState<TVComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !item || item.type === 'product_tile') return;
    setLoadingComments(true);
    tvAPI
      .getComments(item._id)
      .then((res) => setComments(res.data?.data ?? []))
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [open, item?._id]);

  useEffect(() => {
    if (open) return;
    setCommentText('');
    setVoiceUrl('');
    setUploadingVoice(false);
    if (voiceInputRef.current) voiceInputRef.current.value = '';
  }, [open]);

  const submitComment = () => {
    if (!item || postingComment || item.type === 'product_tile') return;
    const text = commentText.trim();
    if (!text && !voiceUrl) return;
    setPostingComment(true);
    tvAPI
      .addComment(item._id, { text: text || undefined, audioUrl: voiceUrl || undefined })
      .then((res) => {
        const newComment = res.data?.data ?? res.data;
        if (newComment) setComments((c) => [...c, newComment]);
        setCommentText('');
        setVoiceUrl('');
        if (voiceInputRef.current) voiceInputRef.current.value = '';
        onCommentAdded?.();
        onClose(); // Close modal automatically so user returns to posts
      })
      .finally(() => setPostingComment(false));
  };

  const handleVoicePick = async (file?: File | null) => {
    if (!file || uploadingVoice) return;
    setUploadingVoice(true);
    try {
      const res = await tvAPI.uploadCommentAudio(file);
      const url = res.data?.data?.url ?? (res.data as any)?.url;
      if (url) setVoiceUrl(url);
    } catch {
      setVoiceUrl('');
    } finally {
      setUploadingVoice(false);
    }
  };

  if (!open) return null;

  const isVideo = item?.type === 'video' || (item?.mediaUrls?.[0]?.match(/\.(mp4|webm)$/i));
  const mediaUrl = item?.mediaUrls?.[0] || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Comments</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Post preview */}
          {item && (
            <div className="p-4 border-b border-slate-100">
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  {isVideo ? (
                    <video src={getImageUrl(mediaUrl) || mediaUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={getImageUrl(mediaUrl)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {item.creatorId?.name || 'Creator'}
                    </p>
                    {item.creatorId?._id && (
                      <FollowButton targetUserId={item.creatorId._id} currentUserId={currentUserId} className="!px-2 !py-1 !text-xs" />
                    )}
                  </div>
                  {item.caption && (
                    <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">
                      <TranslateText text={item.caption} as="span" compact />
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Comments list */}
          <div className="p-4">
            {loadingComments ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">No comments yet. Be the first!</p>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c._id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden">
                      {c.userId?.avatar ? (
                        <img src={getImageUrl(c.userId.avatar)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-xs font-medium text-slate-600">
                          {(c.userId?.name?.[0] || '?').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900">{c.userId?.name || 'User'}</p>
                        {c.userId?._id && (
                          <FollowButton targetUserId={c.userId._id} currentUserId={currentUserId} className="!px-2 !py-1 !text-xs" />
                        )}
                      </div>
                      {!!c.text && (
                        <p className="text-sm text-slate-600">
                          <TranslateText text={c.text} as="span" compact />
                        </p>
                      )}
                      {!!c.audioUrl && (
                        <audio controls className="mt-1 w-full max-w-[260px]">
                          <source src={getImageUrl(c.audioUrl) || c.audioUrl} />
                        </audio>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatTimeAgo(c.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add comment */}
        {item && item.type !== 'product_tile' && (
          <div className="p-4 border-t border-slate-100 flex-shrink-0">
            <div className="flex gap-2">
              <input
                ref={voiceInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  void handleVoicePick(e.target.files?.[0] || null);
                }}
              />
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <button
                onClick={() => voiceInputRef.current?.click()}
                disabled={uploadingVoice}
                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 disabled:opacity-60"
                title="Attach voice note"
              >
                {uploadingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                onClick={submitComment}
                disabled={(!commentText.trim() && !voiceUrl) || postingComment}
                className="px-4 py-2 rounded-xl bg-sky-500 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Post
              </button>
            </div>
            {!!voiceUrl && (
              <div className="mt-2">
                <p className="text-xs text-slate-500 mb-1">Voice note attached</p>
                <audio controls className="w-full max-w-[300px]">
                  <source src={getImageUrl(voiceUrl) || voiceUrl} />
                </audio>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
