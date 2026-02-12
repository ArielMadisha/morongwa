'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { tvAPI, getImageUrl } from '@/lib/api';
import type { TVGridItem } from './TVGridTile';

interface TVComment {
  _id: string;
  text: string;
  userId: { _id: string; name?: string; avatar?: string };
  createdAt: string;
}

interface TVCommentModalProps {
  open: boolean;
  onClose: () => void;
  item: TVGridItem | null;
  onCommentAdded?: () => void;
}

export function TVCommentModal({ open, onClose, item, onCommentAdded }: TVCommentModalProps) {
  const [comments, setComments] = useState<TVComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    if (!open || !item || item.type === 'product_tile') return;
    setLoadingComments(true);
    tvAPI
      .getComments(item._id)
      .then((res) => setComments(res.data?.data ?? []))
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [open, item?._id]);

  const submitComment = () => {
    if (!item || !commentText.trim() || postingComment || item.type === 'product_tile') return;
    setPostingComment(true);
    tvAPI
      .addComment(item._id, commentText.trim())
      .then((res) => {
        const newComment = res.data?.data ?? res.data;
        if (newComment) setComments((c) => [...c, newComment]);
        setCommentText('');
        onCommentAdded?.();
      })
      .finally(() => setPostingComment(false));
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
                    <video src={mediaUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={getImageUrl(mediaUrl)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {item.creatorId?.name || 'Creator'}
                  </p>
                  {item.caption && (
                    <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">{item.caption}</p>
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
                      <p className="text-sm font-medium text-slate-900">{c.userId?.name || 'User'}</p>
                      <p className="text-sm text-slate-600">{c.text}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(c.createdAt).toLocaleDateString()}
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
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || postingComment}
                className="px-4 py-2 rounded-xl bg-sky-500 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
