'use client';

import { AdvertSlot } from '@/components/AdvertSlot';

type Props = {
  children: React.ReactNode;
};

/** Morongwa main area + right column (Trending now + Qwerty Users) — same as wall/chat layout. */
export function MorongwaPageLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="order-2 flex min-h-[min(70dvh,calc(100dvh-11rem))] min-w-0 w-full flex-1 flex-col overflow-y-auto pb-20 lg:order-none lg:min-h-0 lg:pb-0">
        {children}
      </div>
      <AdvertSlot belowHeader hideMobileStrip />
    </div>
  );
}
