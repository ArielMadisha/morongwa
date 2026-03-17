'use client';

import { useState, useEffect, useCallback } from 'react';
import { cartAPI, storesAPI } from '@/lib/api';

const CACHE_TTL_MS = 60 * 1000; // 60 seconds - avoid refetching cart/stores too often

let cache: {
  userKey: string;
  cartCount: number;
  hasStore: boolean;
  fetchedAt: number;
} | null = null;

/** MyStore shows when user has a store. Store is created by: (1) user reselling a product (auto-created, never disappears),
 *  or (2) admin creating a supplier store. Once created, the store stays forever. */
export function useCartAndStores(isAuthenticated: boolean) {
  const getUserKey = () => {
    if (typeof window === "undefined") return "anonymous";
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return "anonymous";
      const parsed = JSON.parse(raw) as { _id?: string; id?: string; email?: string };
      return String(parsed?._id || parsed?.id || parsed?.email || "anonymous");
    } catch {
      return "anonymous";
    }
  };

  const [cartCount, setCartCount] = useState(cache?.cartCount ?? 0);
  const [hasStore, setHasStore] = useState(cache?.hasStore ?? false);

  const fetchData = useCallback(() => {
    if (!isAuthenticated) {
      setCartCount(0);
      setHasStore(false);
      return;
    }
    const userKey = getUserKey();
    const now = Date.now();
    if (cache && cache.userKey === userKey && now - cache.fetchedAt < CACHE_TTL_MS) {
      setCartCount(cache.cartCount);
      setHasStore(cache.hasStore);
      // Keep UI snappy from cache, but still revalidate in background.
    }
    Promise.all([
      cartAPI.get().catch(() => ({ data: { data: { items: [] } } })),
      storesAPI.getMyStores().catch(() => ({ data: [] })),
    ]    ).then(([cartRes, storesRes]) => {
      const cartData = (cartRes.data as any)?.data ?? cartRes.data ?? {};
      const items = Array.isArray(cartData?.items) ? cartData.items : [];
      const musicItems = Array.isArray(cartData?.musicItems) ? cartData.musicItems : [];
      const list = (storesRes.data as any)?.data ?? storesRes.data ?? [];
      const storeList = Array.isArray(list) ? list : [];
      const productCount = items.reduce((sum: number, i: any) => sum + Number(i?.qty || 0), 0);
      const musicCount = musicItems.reduce((sum: number, i: any) => sum + Number(i?.qty || 0), 0);
      const nextCartCount = productCount + musicCount;
      const nextHasStore = storeList.length > 0;
      cache = {
        userKey,
        cartCount: nextCartCount,
        hasStore: nextHasStore,
        fetchedAt: Date.now(),
      };
      setCartCount(nextCartCount);
      setHasStore(nextHasStore);
    });
  }, [isAuthenticated]);

  useEffect(() => {
    // Short delay to avoid race: ensure token is persisted before first auth request
    const t = setTimeout(fetchData, 100);
    return () => clearTimeout(t);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    cache = null;
    fetchData();
  }, [fetchData]);

  return { cartCount, hasStore, invalidate };
}

/** Call after cart mutations (add, remove, etc.) to refresh cached cart count */
export function invalidateCartStoresCache() {
  cache = null;
}
