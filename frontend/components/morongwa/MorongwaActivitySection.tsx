'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Bell, ClipboardList, Loader2 } from 'lucide-react';
import { notificationsAPI } from '@/lib/api';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { useAuth } from '@/contexts/AuthContext';

type NotificationRow = {
  _id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  meta?: {
    orderId?: string;
    supplierId?: string;
    orderNumber?: string;
    storeName?: string;
    url?: string;
    itemSummary?: string;
    fulfilment?: string;
    postId?: string;
  };
};

const SHOP_TYPES = new Set(['food_shop_order', 'shop_order', 'order_purchase']);

function isShopOrderNotif(n: NotificationRow): boolean {
  return SHOP_TYPES.has(String(n.type || ''));
}

export function MorongwaActivitySection() {
  const { user } = useAuth();
  const router = useRouter();
  const { hasStore } = useCartAndStores(!!user);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'orders'>('all');
  const [shopUnread, setShopUnread] = useState(0);
  const [isShopOwner, setIsShopOwner] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, unreadRes] = await Promise.all([
        notificationsAPI.getAll({ limit: 50 }),
        notificationsAPI.getUnreadCount(),
      ]);
      const list = listRes.data?.notifications ?? [];
      setItems(Array.isArray(list) ? list : []);
      const owner = Boolean(unreadRes.data?.isShopOwner) || hasStore;
      setIsShopOwner(owner);
      setShopUnread(Number(unreadRes.data?.shopOrderUnreadCount ?? 0) || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [hasStore]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    let list = items;
    if (filter === 'unread') list = list.filter((n) => !n.read);
    if (filter === 'orders') list = list.filter(isShopOrderNotif);
    return list;
  }, [items, filter]);

  const markRead = async (id: string) => {
    try {
      await notificationsAPI.markAsRead(id);
      setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    } catch {
      toast.error('Could not mark as read');
    }
  };

  const markAll = async () => {
    try {
      if (filter === 'orders') {
        await notificationsAPI.markAllAsRead({ shopOrders: true });
        setItems((prev) =>
          prev.map((n) => (isShopOrderNotif(n) ? { ...n, read: true } : n))
        );
        setShopUnread(0);
      } else {
        await notificationsAPI.markAllAsRead();
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        setShopUnread(0);
      }
      toast.success('All marked read');
    } catch {
      toast.error('Failed');
    }
  };

  const openNotification = async (n: NotificationRow) => {
    if (!n.read) await markRead(n._id);
    if (isShopOrderNotif(n)) {
      const path = String(n.meta?.url || '/store/orders').trim() || '/store/orders';
      router.push(path.startsWith('/') ? path : `/${path}`);
      return;
    }
    const tagUrl = String(n.meta?.url || '').trim();
    if ((n.type === 'post_tag' || n.type === 'comment_mention') && tagUrl) {
      router.push(tagUrl.startsWith('/') ? tagUrl : `/${tagUrl}`);
      return;
    }
    if (n.meta?.postId) {
      router.push(`/morongwa-tv/post/${n.meta.postId}`);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col overflow-hidden min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0 lg:flex-row">
      <aside className="w-full max-w-md shrink-0 border-r border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-slate-900">Activity</h1>
          <button
            type="button"
            onClick={() => void markAll()}
            className="text-xs font-semibold text-violet-600 hover:underline"
          >
            Mark all read
          </button>
        </div>

        {isShopOwner ? (
          <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-sky-900">Shop owner</p>
              {shopUnread > 0 ? (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {shopUnread} order{shopUnread === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-sky-800">
              New paid orders appear here and in Shop Orders — even if WhatsApp is pending.
            </p>
            <Link
              href="/store/orders"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:underline"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Open Shop Orders
            </Link>
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
              ...(isShopOwner ? [{ id: 'orders' as const, label: 'Orders' }] : []),
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                filter === f.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-600 mb-4">
          Mentions, reactions
          {isShopOwner ? ', and your store order alerts' : ''} appear here.
        </p>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet</p>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {visible.map((n) => {
              const shop = isShopOrderNotif(n);
              return (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(n)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      n.read
                        ? 'border-slate-200 bg-white text-slate-600'
                        : shop
                          ? 'border-sky-300 bg-sky-50 font-medium text-slate-900'
                          : 'border-violet-200 bg-white font-medium text-slate-900'
                    }`}
                  >
                    {shop ? (
                      <span className="mb-1 inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
                        <ClipboardList className="h-3 w-3" />
                        Shop order
                        {n.meta?.orderNumber ? ` · ${n.meta.orderNumber}` : ''}
                      </span>
                    ) : null}
                    <span className="block">{n.message}</span>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      {new Date(n.createdAt).toLocaleString()}
                      {shop
                        ? ' · Tap to open Shop Orders'
                        : n.type === 'post_tag' || n.type === 'comment_mention'
                          ? ' · Tap to open post'
                          : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <div className="hidden sm:flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Bell className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-slate-500 text-sm">
            {isShopOwner
              ? 'Select an order notification to open Shop Orders and prepare'
              : 'Select a notification to mark it read'}
          </p>
        </div>
      </div>
    </div>
  );
}
