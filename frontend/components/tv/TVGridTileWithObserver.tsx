'use client';

import { useState, useRef, useLayoutEffect, type RefObject } from 'react';
import { TVGridTile, type TVGridItem } from './TVGridTile';

interface TVGridTileWithObserverProps {
  /** When set, visibility is measured against this scroll container (QwertyTV main column), not only the viewport. */
  scrollRootRef?: RefObject<HTMLElement | null>;
  /**
   * Preferred over `scrollRootRef` alone: the actual scrollport element, from a callback ref + useState,
   * so the observer re-subscribes when the node mounts (ref.current is not a reactive dependency).
   */
  scrollRoot?: HTMLElement | null;
  item: TVGridItem;
  liked?: boolean;
  onLike?: (id: string, liked: boolean) => void;
  onRepost?: (id: string) => void;
  onEnquire?: (productId: string) => void;
  onCommentAdded?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpdated?: (post: TVGridItem) => void;
  currentUserId?: string;
  onSetProfilePicFromUrl?: (url: string) => Promise<void>;
  onSetStripBackgroundFromUrl?: (url: string) => Promise<void>;
  variant?: 'feed' | 'grid';
  relatedVideos?: TVGridItem[];
  cartQty?: number;
  onCartUpdated?: () => void;
  loginHref?: string;
  onMediaUnavailable?: (id: string) => void;
}

export function TVGridTileWithObserver(props: TVGridTileWithObserverProps) {
  const { scrollRootRef, scrollRoot, variant = 'feed', ...rest } = props;
  /** Grid: start optimistic so first paint attempts muted autoplay; IO then pauses off-screen tiles. Feed: wait for IO (viewport). */
  const [isVisible, setIsVisible] = useState(() => variant === 'grid');
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = scrollRoot ?? scrollRootRef?.current ?? null;
    const isGrid = variant === 'grid';
    const opts: IntersectionObserverInit = {
      threshold: isGrid ? 0.05 : 0.15,
      rootMargin: '80px',
      ...(root ? { root } : {}),
    };
    const obs = new IntersectionObserver(([entry]) => setIsVisible(!!entry?.isIntersecting), opts);
    obs.observe(el);
    return () => obs.disconnect();
  }, [scrollRoot, scrollRootRef, variant]);

  const gridStretch = variant === 'grid';

  return (
    <div
      ref={ref}
      className={`min-h-0 ${gridStretch ? 'flex h-full min-h-0 flex-1 flex-col' : ''}`}
    >
      <TVGridTile {...rest} variant={variant} isVisible={isVisible} />
    </div>
  );
}
