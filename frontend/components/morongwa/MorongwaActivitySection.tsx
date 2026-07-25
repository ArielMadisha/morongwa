'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Loader2 } from 'lucide-react';
import { notificationsAPI } from '@/lib/api';

type NotificationRow = {
  _id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export function MorongwaActivitySection() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsAPI.getAll({ limit: 50 });
      const list = res.data?.notifications ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      await notificationsAPI.markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success('All marked read');
    } catch {
      toast.error('Failed');
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col overflow-hidden min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0 lg:flex-row">
      <aside className="w-full max-w-xs shrink-0 border-r border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-slate-900">Activity</h1>
          <button type="button" onClick={() => void markAll()} className="text-xs font-semibold text-violet-600 hover:underline">
            Mark all read
          </button>
        </div>
        <p className="text-xs text-slate-600 mb-4">You will see @mentions, reactions and other notifications here.</p>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet</p>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {items.map((n) => (
              <li key={n._id}>
                <button
                  type="button"
                  onClick={() => void markRead(n._id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    n.read ? 'border-slate-200 bg-white text-slate-600' : 'border-violet-200 bg-white font-medium text-slate-900'
                  }`}
                >
                  {n.message}
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="hidden sm:flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Bell className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-slate-500 text-sm">Select a notification to mark it read</p>
        </div>
      </div>
    </div>
  );
}
