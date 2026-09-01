'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  mergeScrollAwareRef,
  useScrollAwareChrome,
  type ScrollAwareChromeApi,
  type ScrollAwareChromeOptions,
} from '@/hooks/useScrollAwareChrome';
import { useMobileChromeBreakpoint } from '@/hooks/useMobileChromeBreakpoint';
import { setScrollAwareChromeBroadcast } from '@/hooks/scrollAwareChromeBroadcast';

const NOOP_ATTACH = () => {};

const ScrollAwareChromeContext = createContext<ScrollAwareChromeApi | null>(null);

export function ScrollAwareChromeProvider({
  children,
  options,
  enabled: enabledProp,
}: {
  children: ReactNode | ((api: ScrollAwareChromeApi) => ReactNode);
  options?: ScrollAwareChromeOptions;
  /** Override mobile breakpoint detection (e.g. force off in tests). */
  enabled?: boolean;
}) {
  const mobile = useMobileChromeBreakpoint();
  const enabled = enabledProp ?? mobile;
  const api = useScrollAwareChrome({ ...options, enabled });

  useEffect(() => {
    if (!enabled) api.show();
  }, [enabled, api]);

  useEffect(() => {
    if (!enabled) {
      setScrollAwareChromeBroadcast({ hidden: false, progress: 1 });
      return;
    }
    setScrollAwareChromeBroadcast({ hidden: api.hidden, progress: api.progress });
    return () => setScrollAwareChromeBroadcast({ hidden: false, progress: 1 });
  }, [enabled, api.hidden, api.progress]);

  return (
    <ScrollAwareChromeContext.Provider value={api}>
      {typeof children === 'function' ? children(api) : children}
    </ScrollAwareChromeContext.Provider>
  );
}

export function useScrollAwareChromeContext(): ScrollAwareChromeApi | null {
  return useContext(ScrollAwareChromeContext);
}

/** Safe outside a provider — returns no-op attach. */
export function useScrollAwareScrollAttachRef<T extends HTMLElement>(
  ...extraRefs: Array<Ref<T> | undefined>
): (el: T | null) => void {
  const api = useScrollAwareChromeContext();
  const attachRef = api?.handlers.attachRef ?? NOOP_ATTACH;
  const extraRefsRef = useRef(extraRefs);
  extraRefsRef.current = extraRefs;
  return useCallback(
    (el: T | null) => mergeScrollAwareRef(attachRef, ...extraRefsRef.current)(el),
    [attachRef]
  );
}

type CollapsibleChromeProps = {
  children: ReactNode;
  className?: string;
  /** "top" slides up out of view, "bottom" slides down. */
  edge?: 'top' | 'bottom';
  /** Keeps this many px visible when collapsed (e.g. safe-area inset). */
  minHeight?: number;
  enabled?: boolean;
};

const CHROME_TRANSITION = 'height 180ms ease-out, transform 180ms ease-out, opacity 180ms ease-out';

/**
 * Collapses natural height while sliding out of view so hidden chrome leaves no gap.
 * On mobile only by default (matches bottom nav `md:hidden`).
 */
export function CollapsibleChrome({
  children,
  className = '',
  edge = 'top',
  minHeight = 0,
  enabled: enabledProp,
}: CollapsibleChromeProps) {
  const api = useScrollAwareChromeContext();
  const mobile = useMobileChromeBreakpoint();
  const enabled = (enabledProp ?? mobile) && !!api;
  const [naturalHeight, setNaturalHeight] = useState(0);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = innerRef.current;
    if (!node || !enabled) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0 && Math.abs(h - naturalHeight) > 1) setNaturalHeight(h);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [enabled, naturalHeight]);

  if (!enabled || !api || naturalHeight <= 0) {
    return <div className={className}>{children}</div>;
  }

  const progress = api.progress;
  const shift = Math.max(0, naturalHeight - minHeight);
  const height = minHeight + progress * shift;
  const translateY = edge === 'top' ? -(1 - progress) * shift : (1 - progress) * shift;
  const opacity = progress <= 0 ? 0 : progress <= 0.6 ? 0.35 + (progress / 0.6) * 0.65 : 1;

  return (
    <div
      className={`overflow-hidden shrink-0 ${className}`}
      style={{
        height,
        opacity,
        transform: shift > 0 ? `translateY(${translateY}px)` : undefined,
        transition: CHROME_TRANSITION,
        pointerEvents: api.hidden ? 'none' : undefined,
      }}
      aria-hidden={api.hidden}
    >
      <div ref={innerRef} className="shrink-0">
        {children}
      </div>
    </div>
  );
}

/** Fixed bottom wrapper for MobileBottomNav — slides down without leaving a gap in the flex column. */
export function CollapsibleBottomChrome({
  children,
  className = '',
  enabled: enabledProp,
}: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
}) {
  const api = useScrollAwareChromeContext();
  const mobile = useMobileChromeBreakpoint();
  const enabled = (enabledProp ?? mobile) && !!api;
  const [naturalHeight, setNaturalHeight] = useState(0);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = innerRef.current;
    if (!node || !enabled) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0 && Math.abs(h - naturalHeight) > 1) setNaturalHeight(h);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [enabled, naturalHeight]);

  if (!enabled || !api || naturalHeight <= 0) {
    return <>{children}</>;
  }

  const progress = api.progress;
  const shift = naturalHeight;
  const translateY = (1 - progress) * shift;
  const opacity = progress <= 0 ? 0 : progress <= 0.6 ? 0.35 + (progress / 0.6) * 0.65 : 1;

  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 z-50 overflow-hidden ${className}`}
      style={{
        height: naturalHeight,
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: CHROME_TRANSITION,
        pointerEvents: api.hidden ? 'none' : undefined,
      }}
      aria-hidden={api.hidden}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export { mergeScrollAwareRef };
