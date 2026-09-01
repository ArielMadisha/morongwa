import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

export type ScrollAwareScrollHandlers = {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: (w: number, h: number) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  scrollEventThrottle: number;
};

export type ScrollAwareChromeApi = {
  /** 1 = chrome fully visible, 0 = fully hidden. Drives height/opacity/translateY. */
  progress: Animated.Value;
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
  durationMs?: number;
  enabled?: boolean;
};

/**
 * Direction-aware chrome visibility for scrollable screens.
 *
 * Swiping up (content moves down / offset grows) hides header + footer; swiping back
 * down reveals them. Uses a small accumulated-delta threshold so tiny finger jitter
 * does not flip the chrome, and always reveals at the top of the list or when the
 * content is shorter than the viewport.
 *
 * `progress` is JS-driven on purpose: consumers animate wrapper *height* so a hidden
 * tab bar collapses instead of leaving an empty strip. The animation only runs on a
 * direction change, not on every scroll frame.
 */
export function useScrollAwareChrome(options: ScrollAwareChromeOptions = {}): ScrollAwareChromeApi {
  const {
    threshold = 10,
    topRevealOffset = 24,
    minScrollableOverflow = 48,
    durationMs = 180,
    enabled = true,
  } = options;

  const progress = useRef(new Animated.Value(1)).current;
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastYRef = useRef(0);
  const accumRef = useRef(0);
  const viewportRef = useRef(0);
  const contentRef = useRef(0);

  const animateTo = useCallback(
    (next: 0 | 1) => {
      Animated.timing(progress, {
        toValue: next,
        duration: durationMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    },
    [progress, durationMs]
  );

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

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled) return;
      const n = e?.nativeEvent;
      if (!n) return;

      const y = n.contentOffset?.y ?? 0;
      const viewport = n.layoutMeasurement?.height ?? viewportRef.current;
      const content = n.contentSize?.height ?? contentRef.current;
      if (viewport > 0) viewportRef.current = viewport;
      if (content > 0) contentRef.current = content;

      const scrollable =
        viewportRef.current <= 0 || contentRef.current > viewportRef.current + minScrollableOverflow;

      // Short pages and the top of the list always keep chrome on screen.
      if (!scrollable || y <= topRevealOffset) {
        lastYRef.current = y;
        accumRef.current = 0;
        show();
        return;
      }

      const delta = y - lastYRef.current;
      lastYRef.current = y;
      if (delta === 0) return;

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

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      contentRef.current = h;
      if (viewportRef.current > 0 && h <= viewportRef.current + minScrollableOverflow) show();
    },
    [minScrollableOverflow, show]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e?.nativeEvent?.layout?.height ?? 0;
      if (h > 0) viewportRef.current = h;
      if (contentRef.current > 0 && contentRef.current <= h + minScrollableOverflow) show();
    },
    [minScrollableOverflow, show]
  );

  const handlers = useMemo<ScrollAwareScrollHandlers>(
    () => ({ onScroll, onContentSizeChange, onLayout, scrollEventThrottle: 16 }),
    [onScroll, onContentSizeChange, onLayout]
  );

  return { progress, hidden, handlers, show, hide, reset };
}

/** Merge scroll-aware handlers with a screen's own handler so both run. */
export function mergeScrollHandler<T>(
  own: ((e: T) => void) | undefined,
  shared: (e: T) => void
): (e: T) => void {
  return (e: T) => {
    own?.(e);
    shared(e);
  };
}
