'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Loader2 } from 'lucide-react';
import { cartAPI } from '@/lib/api';
import toast from 'react-hot-toast';

type Props = {
  productId: string;
  /** When buying from a reseller post */
  resellerId?: string;
  qty: number;
  outOfStock?: boolean;
  isGuest: boolean;
  loginHref: string;
  onUpdated: () => void;
  /** Smaller controls for tight product cards */
  compact?: boolean;
};

export function MarketplaceCartStepper({
  productId,
  resellerId,
  qty,
  outOfStock,
  isGuest,
  loginHref,
  onUpdated,
  compact = false,
}: Props) {
  const sm = compact
    ? 'min-h-[24px] min-w-[24px] px-1 text-sm'
    : 'min-h-[32px] min-w-[32px] px-2 text-lg';
  const mid = compact ? 'min-w-[26px] max-w-[28px] px-0.5' : 'min-w-[40px] px-1.5';
  const icon = compact ? 'h-3 w-3' : 'h-4 w-4';
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    if (isGuest) {
      toast.error('Sign in to manage your cart');
      return;
    }
    if (outOfStock) return;
    setLoading(true);
    try {
      await fn();
      onUpdated();
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.response?.data?.error || 'Could not update cart');
    } finally {
      setLoading(false);
    }
  };

  const addOne = () =>
    run(() => cartAPI.add(productId, 1, resellerId));

  const removeOne = () =>
    run(async () => {
      if (qty <= 0) return;
      if (qty <= 1) {
        await cartAPI.removeItem(productId);
      } else {
        await cartAPI.updateItem(productId, qty - 1);
      }
    });

  if (isGuest) {
    return (
      <div
        className={`inline-flex max-w-full items-stretch overflow-hidden border border-sky-200 bg-sky-50/80 text-sky-800 shadow-sm ${compact ? 'rounded-md' : 'rounded-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={loginHref}
          className={`flex items-center justify-center font-bold leading-none hover:bg-sky-100 ${sm}`}
          title="Sign in to add"
        >
          +
        </Link>
        <Link
          href={loginHref}
          className={`flex items-center justify-center border-x border-sky-200 hover:bg-sky-100 ${mid}`}
          title="Cart"
        >
          <ShoppingCart className={icon} />
        </Link>
        <span
          className={`flex cursor-not-allowed items-center justify-center font-bold leading-none text-slate-300 ${sm}`}
          aria-disabled
        >
          −
        </span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex max-w-full shrink-0 items-stretch overflow-hidden border border-sky-200 bg-white text-sky-800 shadow-sm ${compact ? 'rounded-md' : 'rounded-lg'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={loading || outOfStock}
        onClick={addOne}
        className={`flex items-center justify-center font-bold leading-none text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 ${sm}`}
        title="Add one to cart"
        aria-label="Add one to cart"
      >
        {loading ? <Loader2 className={`${icon} animate-spin`} /> : '+'}
      </button>
      <Link
        href="/cart"
        className={`relative flex items-center justify-center gap-0.5 border-x border-sky-200 hover:bg-sky-50 ${mid}`}
        title="View cart"
      >
        <ShoppingCart className={`${icon} text-sky-600`} />
        {qty > 0 && (
          <span
            className={`text-center font-bold tabular-nums text-sky-800 ${compact ? 'min-w-[0.875rem] text-[9px]' : 'min-w-[1rem] text-[11px]'}`}
          >
            {qty}
          </span>
        )}
      </Link>
      <button
        type="button"
        disabled={loading || qty < 1}
        onClick={removeOne}
        className={`flex items-center justify-center font-bold leading-none text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-30 ${sm}`}
        title="Remove one from cart"
        aria-label="Remove one from cart"
      >
        −
      </button>
    </div>
  );
}
