'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ClipboardList, Loader2, Package, RefreshCw } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { SearchButton } from '@/components/SearchButton';
import { useCartAndStores } from '@/lib/useCartAndStores';
import {
  notificationsAPI,
  suppliersAPI,
  type ShopOrderReceipt,
} from '@/lib/api';

type PrepStatus = ShopOrderReceipt['prepStatus'];

const PREP_OPTIONS: { value: PrepStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'collected', label: 'Collected / done' },
];

function ShopOrdersContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState<ShopOrderReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | PrepStatus>('all');
  const [shopUnread, setShopUnread] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, unreadRes] = await Promise.all([
        suppliersAPI.getMyOrders({ limit: 50, status: filter === 'all' ? undefined : filter }),
        notificationsAPI.getUnreadCount({ shopOrders: true }),
      ]);
      const list = ordersRes.data?.data ?? [];
      setOrders(Array.isArray(list) ? list : []);
      setShopUnread(Number(unreadRes.data?.shopOrderUnreadCount ?? unreadRes.data?.unreadCount ?? 0) || 0);
    } catch {
      setOrders([]);
      toast.error('Could not load Shop Orders');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const updatePrep = async (order: ShopOrderReceipt, prepStatus: PrepStatus) => {
    const key = `${order.orderId}:${order.supplierId}`;
    setUpdatingId(key);
    try {
      const res = await suppliersAPI.updateOrderPrepStatus(order.orderId, {
        prepStatus,
        supplierId: order.supplierId,
      });
      const updated = res.data?.data;
      setOrders((prev) =>
        prev.map((o) =>
          o.orderId === order.orderId && o.supplierId === order.supplierId
            ? { ...o, ...(updated || { prepStatus }) }
            : o
        )
      );
      toast.success(`Marked ${prepStatus}`);
    } catch {
      toast.error('Could not update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const markShopNotificationsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead({ shopOrders: true });
      setShopUnread(0);
      toast.success('Order notifications marked read');
    } catch {
      toast.error('Could not mark notifications read');
    }
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-slate-50">
      <AppShellHeader
        onMenuClick={() => setMenuOpen(true)}
        center={
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-5 w-5 shrink-0 text-sky-600" />
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">Shop Orders</h1>
            {shopUnread > 0 ? (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {shopUnread > 99 ? '99+' : shopUnread}
              </span>
            ) : null}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/store"
              className="hidden text-xs font-semibold text-sky-700 hover:underline sm:inline"
            >
              My Store
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <SearchButton />
            <ProfileHeaderButton />
          </div>
        }
      />
      <div className="flex min-h-0 flex-1">
        <AppSidebar
          variant="wall"
          userName={user?.name}
          userAvatar={(user as { avatar?: string })?.avatar}
          userId={user?._id || (user as { id?: string })?.id}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          hideLogo
          belowHeader
        />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm text-slate-600">
                Paid orders for your store. Prepare here even if WhatsApp alerts are delayed.
              </p>
              <div className="flex flex-wrap gap-2">
                {shopUnread > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markShopNotificationsRead()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Mark notifications read
                  </button>
                ) : null}
                <Link
                  href="/messages?section=activity"
                  className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                >
                  Activity inbox
                </Link>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {(['all', 'new', 'preparing', 'ready', 'collected'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    filter === f
                      ? 'bg-sky-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">No shop orders yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  When customers pay for your products, orders appear here automatically.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {orders.map((o) => {
                  const key = `${o.orderId}:${o.supplierId}`;
                  const busy = updatingId === key;
                  return (
                    <li
                      key={key}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{o.orderNumber}</p>
                          <p className="text-xs text-slate-500">
                            {o.storeName || 'Store'} ·{' '}
                            {o.collection ? 'Collection' : 'Delivery'} ·{' '}
                            {o.paidAt
                              ? new Date(o.paidAt).toLocaleString()
                              : o.createdAt
                                ? new Date(o.createdAt).toLocaleString()
                                : '—'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            o.prepStatus === 'new'
                              ? 'bg-rose-100 text-rose-800'
                              : o.prepStatus === 'preparing'
                                ? 'bg-amber-100 text-amber-900'
                                : o.prepStatus === 'ready'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {o.prepStatus}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        Buyer:{' '}
                        {o.buyer?.name ||
                          (o.buyer?.username ? `@${o.buyer.username}` : '—')}
                        {o.buyer?.phone ? ` · ${o.buyer.phone}` : ''}
                      </p>
                      <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                        {o.items.map((it) => (
                          <li key={`${it.productId}-${it.title}`}>
                            {it.qty}× {it.title} · R{Number(it.storeUnitPrice || 0).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        Store total R{Number(o.storeCreditZar || 0).toFixed(2)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {PREP_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={busy || o.prepStatus === opt.value}
                            onClick={() => void updatePrep(o, opt.value)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${
                              o.prepStatus === opt.value
                                ? 'bg-sky-600 text-white'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </main>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

export default function ShopOrdersPage() {
  return (
    <ProtectedRoute>
      <ShopOrdersContent />
    </ProtectedRoute>
  );
}
