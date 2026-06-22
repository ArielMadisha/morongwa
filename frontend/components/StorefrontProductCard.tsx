'use client';

import Link from 'next/link';
import { Package, ShoppingCart } from 'lucide-react';
import { getImageUrl } from '@/lib/api';
import { MarketplaceCartStepper } from '@/components/MarketplaceCartStepper';

type Props = {
  productId: string;
  title: string;
  image?: string;
  priceLabel: string;
  productHref: string;
  resellHref?: string;
  allowResell?: boolean;
  outOfStock?: boolean;
  resellerId?: string;
  cartQty: number;
  isGuest: boolean;
  loginHref: string;
  onCartUpdated: () => void;
  colorsRequired?: boolean;
};

/** Store + marketplace-style product tile with cart, resell, and view actions. */
export function StorefrontProductCard({
  productId,
  title,
  image,
  priceLabel,
  productHref,
  resellHref,
  allowResell,
  outOfStock,
  resellerId,
  cartQty,
  isGuest,
  loginHref,
  onCartUpdated,
  colorsRequired,
}: Props) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white/90 shadow-sm backdrop-blur transition-all hover:border-sky-200 hover:shadow-lg">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-slate-100">
        <Link href={productHref} className="absolute inset-0 z-0 block bg-slate-100" aria-label={title}>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100">
            <Package className="h-12 w-12 text-slate-300 sm:h-14 sm:w-14" />
          </div>
          {image ? (
            <img
              src={getImageUrl(image)}
              alt={title}
              className="relative z-10 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
        </Link>
        {allowResell && resellHref ? (
          <Link
            href={resellHref}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-2 top-2 z-10 inline-flex items-center rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800 shadow-md ring-1 ring-slate-200/90 hover:bg-white sm:left-2.5 sm:top-2.5 sm:text-xs"
            title="Resell – add markup"
          >
            Resell
          </Link>
        ) : null}
        <div className="absolute right-2 top-2 z-20">
          <MarketplaceCartStepper
            productId={productId}
            resellerId={resellerId}
            qty={cartQty}
            colorsRequired={colorsRequired}
            outOfStock={outOfStock}
            isGuest={isGuest}
            loginHref={loginHref}
            onUpdated={onCartUpdated}
            compact
          />
        </div>
        {outOfStock ? (
          <span className="absolute bottom-2 left-2 z-10 rounded bg-amber-100/95 px-2 py-0.5 text-[10px] font-medium text-amber-800 shadow-sm sm:text-xs">
            Out of stock
          </span>
        ) : null}
      </div>
      <Link href={productHref} className="block min-w-0 px-3 pt-2 sm:px-4">
        <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-sky-700 sm:text-base">{title}</h3>
      </Link>
      <div className="mt-auto px-3 pb-3 pt-1.5 sm:px-4 sm:pb-3">
        <span
          className="block truncate whitespace-nowrap text-xs font-bold tabular-nums leading-none text-sky-600 sm:text-sm"
          title={priceLabel}
        >
          {priceLabel}
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Link
            href={productHref}
            className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            View product
          </Link>
          {cartQty > 0 ? (
            <Link
              href="/cart"
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Cart
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
