'use client';

import { useEffect, useState } from 'react';
import {
  getScrollAwareChromeBroadcast,
  subscribeScrollAwareChromeBroadcast,
  type ScrollAwareChromeBroadcast,
} from '@/hooks/scrollAwareChromeBroadcast';

/** Subscribe to the active page's scroll-aware chrome (layout-level FABs). */
export function useScrollAwareChromeBroadcast(): ScrollAwareChromeBroadcast {
  const [state, setState] = useState<ScrollAwareChromeBroadcast>(getScrollAwareChromeBroadcast);

  useEffect(() => subscribeScrollAwareChromeBroadcast(() => setState(getScrollAwareChromeBroadcast())), []);

  return state;
}
