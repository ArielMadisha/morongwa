import type { TVGridItem } from '@/components/tv/TVGridTile';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';

export type StatusStripRow = {
  userId?: string | { _id?: string };
  name?: string;
  username?: string;
  avatar?: string;
  latestPost?: {
    _id: string;
    type: string;
    mediaUrls?: string[];
    artworkUrl?: string;
    createdAt?: string;
  } | null;
};

/** Build a TV grid item from /api/tv/statuses row when direct post/product fetch fails. */
export function tvGridItemFromStatusStripRow(row: StatusStripRow, userId: string): TVGridItem | null {
  const post = row.latestPost;
  if (!post?._id) return null;

  const creatorId = {
    _id: userId,
    name: userPublicDisplayName(row),
    avatar: row.avatar,
  };
  const counts = { likeCount: 0, commentCount: 0, shareCount: 0 };

  if (post.type === 'product') {
    const media = (post.mediaUrls || []).filter(Boolean);
    if (!media.length) return null;
    return {
      _id: String(post._id),
      type: 'image',
      mediaUrls: media,
      caption: userPublicDisplayName(row),
      creatorId,
      ...counts,
      createdAt: post.createdAt,
    };
  }

  if (post.type === 'text' || String(post._id).startsWith('join-')) {
    const fallbackMedia = row.avatar ? [String(row.avatar)] : [];
    if (fallbackMedia.length) {
      return {
        _id: String(post._id),
        type: 'image',
        mediaUrls: fallbackMedia,
        heading: userPublicDisplayName(row),
        caption: String(post._id).startsWith('join-') ? 'New on Qwertymates' : undefined,
        creatorId,
        ...counts,
        createdAt: post.createdAt,
      };
    }
    return {
      _id: String(post._id),
      type: 'text',
      mediaUrls: [],
      heading: userPublicDisplayName(row),
      caption: String(post._id).startsWith('join-') ? 'New on Qwertymates' : undefined,
      creatorId,
      ...counts,
      createdAt: post.createdAt,
    };
  }

  const media = (post.mediaUrls || []).filter(Boolean);
  const type = post.type as TVGridItem['type'];
  if ((type === 'image' || type === 'video' || type === 'carousel' || type === 'audio') && !media.length && !post.artworkUrl) {
    return null;
  }

  return {
    _id: String(post._id),
    type: type === 'product' ? 'image' : type,
    mediaUrls: media,
    artworkUrl: post.artworkUrl,
    creatorId,
    ...counts,
    createdAt: post.createdAt,
  };
}
