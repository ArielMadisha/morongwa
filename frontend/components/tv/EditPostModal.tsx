'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { tvAPI, getImageUrl } from '@/lib/api';
import type { TVGridItem } from './TVGridTile';
import { GENRES } from './GenresDropdown';
import { TagPeoplePicker, type TaggedPerson } from './TagPeoplePicker';
import { useAuth } from '@/contexts/AuthContext';

const FILTERS = [
  { id: 'none', label: 'None' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'grayscale', label: 'Grayscale' },
];

type Props = {
  post: TVGridItem | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: (updated: TVGridItem) => void;
};

export function EditPostModal({ post, open, onClose, onUpdated }: Props) {
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [heading, setHeading] = useState('');
  const [subject, setSubject] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [taggedPeople, setTaggedPeople] = useState<TaggedPerson[]>([]);
  const [filter, setFilter] = useState('');
  const [genre, setGenre] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !post) return;
    setCaption(post.caption || '');
    setHeading(post.heading || '');
    setSubject(post.subject || '');
    setHashtagsInput((post.hashtags || []).join(', '));
    setTaggedPeople(
      (post.taggedUserIds || []).map((u) => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
      }))
    );
    setFilter(post.filter || '');
    setGenre((post as { genre?: string }).genre || '');
  }, [open, post]);

  if (!open || !post) return null;

  const isText = post.type === 'text';
  const previewUrl = post.mediaUrls?.[0] || post.artworkUrl;

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = hashtagsInput
        .split(/[\s,]+/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);
      const taggedUserIds = taggedPeople.map((p) => p._id);
      const payload = isText
        ? {
            heading: heading.trim() || undefined,
            subject: subject.trim() || undefined,
            hashtags: tags.length ? tags : [],
            taggedUserIds,
          }
        : {
            caption: caption.trim() || undefined,
            heading: heading.trim() || undefined,
            taggedUserIds,
            filter: filter || undefined,
            genre: genre || undefined,
          };
      const res = await tvAPI.updatePost(post._id, payload);
      const updated = (res.data?.data ?? res.data) as TVGridItem;
      toast.success('Post updated');
      onUpdated?.(updated);
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.response?.data?.error || 'Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Edit post</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {previewUrl && !isText ? (
            <div className="rounded-xl overflow-hidden bg-slate-100 max-h-40">
              {post.type === 'video' || previewUrl.match(/\.(mp4|webm)$/i) ? (
                <video src={getImageUrl(previewUrl)} className="w-full max-h-40 object-contain" controls muted playsInline />
              ) : (
                <img src={getImageUrl(previewUrl)} alt="" className="w-full max-h-40 object-contain" />
              )}
            </div>
          ) : null}

          {isText ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Heading</label>
                <input
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Body</label>
                <textarea
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hashtags</label>
                <input
                  value={hashtagsInput}
                  onChange={(e) => setHashtagsInput(e.target.value)}
                  placeholder="news, africa"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <TagPeoplePicker
                selected={taggedPeople}
                onChange={setTaggedPeople}
                currentUserId={user?._id || user?.id}
              />
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Caption</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Filter</label>
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id === 'none' ? '' : f.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        (f.id === 'none' && !filter) || filter === f.id
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {post.type === 'video' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Genre</label>
                  <div className="flex flex-wrap gap-2">
                    {GENRES.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGenre(g.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                          genre === g.id ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <TagPeoplePicker
                selected={taggedPeople}
                onChange={setTaggedPeople}
                currentUserId={user?._id || user?.id}
              />
            </>
          )}

          <p className="text-xs text-slate-500">Media cannot be changed here. Delete and create a new post to replace photos or video.</p>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
