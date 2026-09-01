'use client';

import { useCallback, useRef, useState, type Ref } from 'react';

export type ScrollAwareScrollHandlers = {
  attachRef: (el: HTMLElement | null) => void;
};

export type ScrollAwareChromeApi = {
  /** 1 = chrome fully visible, 0 = fully hidden. Drives height/opacity/translateY. */
  progress: number;
  hidden: boolean;
  handlers: ScrollAwareScrollHandlers;
  show: () => void;
  hide: () => void;
  reset: () => void;
};

export type ScrollAwareChromeOptions = {
  /** Accumulated scroll distance (px) in one direction before chrome toggles. */
  threshold?: number;
  /** Chrome always shows while within this many px of the top of the list. */
  topRevealOffset?: number;
  /** Extra content height (px) required before hiding is allowed at all. */
  minScrollableOverflow?: number;
  enabled?: boolean;
};

/**
 * Direction-aware chrome visibility for scrollable screens (web).
 *
 * Finger swipes up (content scrolls down / scrollTop grows) hides header + footer;
 * scrolling back down reveals them. Mirrors native `mobile/useScrollAwareChrome`.
 */
export function useScrollAwareChrome(options: ScrollAwareChromeOptions = {}): ScrollAwareChromeApi {
  const {
    threshold = 10,
    topRevealOffset = 24,
    minScrollableOverflow = 48,
    enabled = true,
  } = options;

  const [progress, setProgress] = useState(1);
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastYRef = useRef(0);
  const accumRef = useRef(0);
  const viewportRef = useRef(0);
  const contentRef = useRef(0);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const useWindowScrollRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const pickScrollSource = useCallback(
    (el: HTMLElement) => {
      const elementScrollable = el.scrollHeight > el.clientHeight + minScrollableOverflow;
      useWindowScrollRef.current =
        !elementScrollable && document.documentElement.scrollHeight > window.innerHeight + minScrollableOverflow;
    },
    [minScrollableOverflow]
  );

  const animateTo = useCallback((next: 0 | 1) => {
    setProgress(next);
  }, []);

  const setHiddenState = useCallback(
    (next: boolean) => {
      if (hiddenRef.current === next) return;
      hiddenRef.current = next;
      setHidden(next);
      animateTo(next ? 0 : 1);
    },
    [animateTo]
  );

  const show = useCallback(() => setHiddenState(false), [setHiddenState]);
  const hide = useCallback(() => setHiddenState(true), [setHiddenState]);

  const reset = useCallback(() => {
    lastYRef.current = 0;
    accumRef.current = 0;
    setHiddenState(false);
  }, [setHiddenState]);

  const processScrollMetrics = useCallback(
    (y: number, viewport: number, content: number) => {
      if (!enabled) return;
      if (viewport > 0) viewportRef.current = viewport;
      if (content > 0) contentRef.current = content;

      const scrollable =
        viewportRef.current <= 0 || contentRef.current > viewportRef.current + minScrollableOverflow;

      if (!scrollable || y <= topRevealOffset) {
        lastYRef.current = y;
        accumRef.current = 0;
        show();
        return;
      }

      const delta = y - lastYRef.current;
      lastYRef.current = y;
      if (delta === 0) return;

      // While hidden, any downward scroll (finger pulls down / content moves up) reveals chrome immediately.
      if (hiddenRef.current) {
        if (delta < 0) {
          accumRef.current = 0;
          show();
        } else {
          accumRef.current = 0;
        }
        return;
      }

      if ((delta > 0 && accumRef.current < 0) || (delta < 0 && accumRef.current > 0)) {
        accumRef.current = 0;
      }
      accumRef.current += delta;

      if (accumRef.current > threshold) {
        accumRef.current = 0;
        hide();
      } else if (accumRef.current < -threshold) {
        accumRef.current = 0;
        show();
      }
    },
    [enabled, hide, show, threshold, topRevealOffset, minScrollableOverflow]
  );

  const onWindowScroll = useCallback(() => {
    processScrollMetrics(
      window.scrollY,
      window.innerHeight,
      document.documentElement.scrollHeight
    );
  }, [processScrollMetrics]);

  const onScroll = useCallback(
    (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      processScrollMetrics(el.scrollTop, el.clientHeight, el.scrollHeight);
    },
    [processScrollMetrics]
  );

  const measureContent = useCallback(
    (el: HTMLElement) => {
      pickScrollSource(el);
      if (useWindowScrollRef.current) {
        contentRef.current = document.documentElement.scrollHeight;
        viewportRef.current = window.innerHeight;
        lastYRef.current = window.scrollY;
      } else {
        contentRef.current = el.scrollHeight;
        viewportRef.current = el.clientHeight;
        lastYRef.current = el.scrollTop;
      }
      if (viewportRef.current > 0 && contentRef.current <= viewportRef.current + minScrollableOverflow) {
        show();
      }
    },
    [minScrollableOverflow, pickScrollSource, show]
  );

  const attachRef = useCallback(
    (el: HTMLElement | null) => {
      if (scrollElRef.current) {
        scrollElRef.current.removeEventListener('scroll', onScroll);
        window.removeEventListener('scroll', onWindowScroll);
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
      }

      scrollElRef.current = el;
      if (!el) return;

      measureContent(el);
      pickScrollSource(el);
      if (useWindowScrollRef.current) {
        window.addEventListener('scroll', onWindowScroll, { passive: true });
      } else {
        el.addEventListener('scroll', onScroll, { passive: true });
      }

      resizeObserverRef.current = new ResizeObserver(() => measureContent(el));
      resizeObserverRef.current.observe(el);
      for (const child of el.children) {
        if (child instanceof HTMLElement) resizeObserverRef.current.observe(child);
      }
    },
    [measureContent, onScroll, onWindowScroll, pickScrollSource]
  );

  return {
    progress,
    hidden,
    handlers: { attachRef },
    show,
    hide,
    reset,
  };
}

/** Merge scroll-aware attach ref with an existing ref or callback ref. */
export function mergeScrollAwareRef<T extends HTMLElement>(
  attachRef: (el: T | null) => void,
  ...refs: Array<Ref<T> | undefined>
): (el: T | null) => void {
  return (el: T | null) => {
    attachRef(el);
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(el);
      else ref.current = el;
    }
  };
}
