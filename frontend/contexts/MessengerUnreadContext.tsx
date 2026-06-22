'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { messengerAPI } from '@/lib/api';

type MessengerUnreadContextValue = {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
};

const MessengerUnreadContext = createContext<MessengerUnreadContextValue>({
  unreadCount: 0,
  refreshUnread: async () => {},
});

function userIdOf(user: { _id?: string; id?: string } | null | undefined): string {
  if (!user) return '';
  return String(user._id || user.id || '');
}

export function MessengerUnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname() || '';
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    const uid = userIdOf(user);
    if (!uid) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await messengerAPI.getUnreadCount();
      const n = Number(res.data?.unreadCount ?? 0);
      setUnreadCount(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    } catch {
      /* keep last count on transient errors */
    }
  }, [user]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, pathname]);

  useEffect(() => {
    const uid = userIdOf(user);
    if (!uid) {
      setUnreadCount(0);
      return;
    }
    const id = window.setInterval(() => void refreshUnread(), 20000);
    return () => window.clearInterval(id);
  }, [user, refreshUnread]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshUnread();
    };
    const onFocus = () => void refreshUnread();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshUnread]);

  return (
    <MessengerUnreadContext.Provider value={{ unreadCount, refreshUnread }}>
      {children}
    </MessengerUnreadContext.Provider>
  );
}

export function useMessengerUnread() {
  return useContext(MessengerUnreadContext);
}
