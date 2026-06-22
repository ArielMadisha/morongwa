import { productsAPI, tvAPI, usersAPI } from '@/lib/api';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { mapProductToTvTile } from '@/lib/mapProductToTvTile';
import { tvGridItemFromStatusStripRow, type StatusStripRow } from '@/lib/statusStripTvItem';

const GALLERY_POST_ID_RE = /^gallery-([a-f0-9]{24})-(\d+)$/i;

async function profileImageFallback(userId: string, row: StatusStripRow): Promise<TVGridItem | null> {
  if (row.latestPost?.mediaUrls?.length) {
    const fromStrip = tvGridItemFromStatusStripRow(row, userId);
    if (fromStrip?.mediaUrls?.length) return fromStrip;
  }
  if (row.avatar) return tvGridItemFromStatusStripRow(row, userId);
  try {
    const res = await usersAPI.getProfileStats(userId);
    const u = res.data?.user;
    const gallery = Array.isArray(u?.profileGalleryUrls) ? u.profileGalleryUrls : [];
    const first = gallery.find((p: unknown) => typeof p === 'string' && String(p).trim());
    if (first && row.latestPost) {
      return tvGridItemFromStatusStripRow(
        {
          ...row,
          avatar: String(first),
          latestPost: { ...row.latestPost, type: 'image', mediaUrls: [String(first)] },
        },
        userId
      );
    }
    if (u?.avatar) {
      return tvGridItemFromStatusStripRow({ ...row, avatar: String(u.avatar) }, userId);
    }
  } catch {
    /* fall through */
  }
  return tvGridItemFromStatusStripRow(row, userId);
}

async function loadGallerySyntheticPost(postId: string, userId: string): Promise<TVGridItem | null> {
  const match = GALLERY_POST_ID_RE.exec(postId);
  if (!match) return null;
  const [, uid, idxStr] = match;
  if (uid !== userId) return null;
  try {
    const res = await usersAPI.getProfileStats(uid);
    const u = res.data?.user;
    const gallery = Array.isArray(u?.profileGalleryUrls) ? u.profileGalleryUrls : [];
    const url = gallery[Number(idxStr)];
    if (!url) return null;
    return tvGridItemFromStatusStripRow(
      {
        userId: uid,
        name: u?.name,
        username: u?.username,
        avatar: u?.avatar,
        latestPost: {
          _id: postId,
          type: 'image',
          mediaUrls: [String(url)],
          createdAt: new Date().toISOString(),
        },
      },
      uid
    );
  } catch {
    return null;
  }
}

/** Resolve full post for status viewer — API first, strip snapshot fallback. */
export async function loadStatusPost(row: StatusStripRow, userId: string): Promise<TVGridItem | null> {
  const postId = row.latestPost?._id;
  if (!postId) return null;

  const fromStrip = () => tvGridItemFromStatusStripRow(row, userId);

  if (String(postId).startsWith('join-')) {
    return profileImageFallback(userId, row);
  }

  const gallerySynthetic = await loadGallerySyntheticPost(String(postId), userId);
  if (gallerySynthetic) return gallerySynthetic;

  // Strip snapshot often has remapped school-gallery URLs — prefer when API fails.
  const stripItem = fromStrip();

  if (row.latestPost?.type === 'product') {
    if (stripItem?.mediaUrls?.length) {
      try {
        const res = await tvAPI.getPost(String(postId), { creatorId: userId });
        const post = res.data?.data ?? res.data;
        if (post?._id && (post.mediaUrls?.length || post.type === 'text')) {
          return post as TVGridItem;
        }
      } catch {
        return stripItem;
      }
      return stripItem;
    }
    try {
      const res = await productsAPI.getByIdOrSlug(String(postId));
      const product = res.data?.data ?? res.data;
      if (product?._id) {
        const tile = mapProductToTvTile(product);
        const img = product.images?.[0];
        const withMedia =
          img && !tile.mediaUrls?.length
            ? { ...tile, type: 'image' as const, mediaUrls: [String(img)] }
            : tile;
        return {
          ...withMedia,
          caption: product.title || withMedia.caption,
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (stripItem?.mediaUrls?.length) {
    try {
      const res = await tvAPI.getPost(String(postId), { creatorId: userId });
      const post = res.data?.data ?? res.data;
      if (post?._id && (post.mediaUrls?.length || post.type === 'text')) {
        return post as TVGridItem;
      }
    } catch {
      return stripItem;
    }
    return stripItem;
  }

  try {
    const res = await tvAPI.getPost(String(postId), { creatorId: userId });
    const post = res.data?.data ?? res.data;
    if (post?._id) return post as TVGridItem;
  } catch {
    /* fall through */
  }

  return profileImageFallback(userId, row);
}
