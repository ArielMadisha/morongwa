'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { describeWalletTransaction } from '@/lib/walletTransactionLabel';

type Tx = {
  type: string;
  amount: number;
  reference?: string;
  createdAt: string | Date;
  orderBreakdown?: {
    items?: Array<{ title?: string; qty?: number; price?: number }>;
    shippingBreakdown?: Array<{ storeName?: string; shippingCost?: number }>;
  };
};

type Props = {
  tx: Tx;
  icon: ReactNode;
  amountClassName: string;
  amountPrefix: string;
};

export function WalletTransactionRow({ tx, icon, amountClassName, amountPrefix }: Props) {
  const txDesc = describeWalletTransaction(tx);

  return (
    <div className="rounded-lg border border-slate-100 bg-white/80 p-4 transition hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              {txDesc.href ? (
                <Link href={txDesc.href} className="hover:text-sky-600 hover:underline">
                  {txDesc.title}
                </Link>
              ) : (
                txDesc.title
              )}
            </p>
            <p className="text-xs text-slate-600">
              {new Date(tx.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            {txDesc.subtitle ? (
              <p className="text-xs text-slate-400 mt-0.5 truncate" title={tx.reference}>
                {txDesc.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <p className={`shrink-0 font-bold ${amountClassName}`}>
          {amountPrefix}R{Math.abs(tx.amount).toFixed(2)}
        </p>
      </div>
      {tx.orderBreakdown ? (
        <div className="mt-3 pt-3 border-t border-slate-100 text-sm space-y-1 text-slate-600">
          {tx.orderBreakdown.items?.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>
                {item.title}
                {item.qty && item.qty > 1 ? ` ×${item.qty}` : ''}
              </span>
              <span>R{((item.price ?? 0) * (item.qty ?? 1)).toFixed(0)}</span>
            </div>
          ))}
          {tx.orderBreakdown.shippingBreakdown && tx.orderBreakdown.shippingBreakdown.length > 1
            ? tx.orderBreakdown.shippingBreakdown.map((s, i) => (
                <div key={i} className="flex justify-between">
                  <span>Shipping ({s.storeName})</span>
                  <span>R{(s.shippingCost ?? 0).toFixed(0)}</span>
                </div>
              ))
            : tx.orderBreakdown.shippingBreakdown?.[0] ? (
                <div className="flex justify-between">
                  <span>Shipping Fee</span>
                  <span>R{(tx.orderBreakdown.shippingBreakdown[0].shippingCost ?? 0).toFixed(0)}</span>
                </div>
              ) : null}
          <div className="flex justify-between font-medium text-slate-800 pt-1">
            <span>Total</span>
            <span>R{Math.abs(tx.amount).toFixed(0)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
