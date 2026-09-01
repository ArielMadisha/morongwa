'use client';

import type { ReactNode, RefObject } from 'react';
import { useCallback, useState } from 'react';
import {
  CollapsibleBottomChrome,
  CollapsibleChrome,
  ScrollAwareChromeProvider,
  useScrollAwareScrollAttachRef,
} from '@/components/ScrollAwareChrome';

type InnerProps = {
  header: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  bottomNav?: ReactNode;
  onScrollRoot?: (el: HTMLDivElement | null) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  outerClassName?: string;
  scrollClassName?: string;
  mainClassName?: string;
  onMainWheelCapture?: React.WheelEventHandler<HTMLElement>;
};

function ScrollAwareAppShellInner({
  header,
  sidebar,
  children,
  bottomNav,
  onScrollRoot,
  scrollContainerRef,
  outerClassName = 'h-[100dvh] min-h-screen max-w-[100%] flex flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900',
  scrollClassName = 'flex-1 flex flex-col lg:flex-row lg:justify-center gap-0 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden',
  mainClassName = '',
  onMainWheelCapture,
}: InnerProps) {
  const [, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const attachScroll = useCallback(
    (el: HTMLDivElement | null) => {
      setScrollRoot(el);
      onScrollRoot?.(el);
      if (scrollContainerRef) scrollContainerRef.current = el;
    },
    [onScrollRoot, scrollContainerRef]
  );
  const scrollRef = useScrollAwareScrollAttachRef(attachScroll);

  return (
    <div className={outerClassName}>
      <CollapsibleChrome edge="top">{header}</CollapsibleChrome>
      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden">
        {sidebar}
        <div ref={scrollRef} className={scrollClassName}>
          <main onWheelCapture={onMainWheelCapture} className={mainClassName}>
            {children}
          </main>
        </div>
      </div>
      {bottomNav ? <CollapsibleBottomChrome>{bottomNav}</CollapsibleBottomChrome> : null}
    </div>
  );
}

/** App pages with header + scroll column + optional bottom nav — scroll-aware on mobile only. */
export function ScrollAwareAppShell(props: InnerProps) {
  return (
    <ScrollAwareChromeProvider>
      <ScrollAwareAppShellInner {...props} />
    </ScrollAwareChromeProvider>
  );
}

/** Provider + inner shell when the page owns sidebar / advert rail outside main scroll. */
export function ScrollAwareChromeRoot({
  children,
}: {
  children: ReactNode | ((attachScroll: (el: HTMLElement | null) => void) => ReactNode);
}) {
  return (
    <ScrollAwareChromeProvider>
      {typeof children === 'function' ? <ScrollAwareChromeRootInner>{children}</ScrollAwareChromeRootInner> : children}
    </ScrollAwareChromeProvider>
  );
}

function ScrollAwareChromeRootInner({
  children,
}: {
  children: (attachScroll: (el: HTMLElement | null) => void) => ReactNode;
}) {
  const attachScroll = useScrollAwareScrollAttachRef();
  return <>{children(attachScroll)}</>;
}

export { CollapsibleChrome, CollapsibleBottomChrome };
