'use client';

import { useState, useEffect, useCallback } from 'react';
import { cartAPI, storesAPI } from '@/lib/api';

const CACHE_TTL_MS = 60 * 1000; // 60 seconds - avoid refetching cart/stores too often

let cache: {
  cartCount: number;
  hasStore: boolean;
  fetchedAt: number;
} | null = null;

/** MyStore shows when user has a store. Store is created by: (1) user reselling a product (auto-created, never disappears),
 *  or (2) admin creating a supplier store. Once created, the store stays forever. */
export function useCartAndStores(isAuthenticated: boolean) {
  const [cartCount, setCartCount] = useState(cache?.cartCount ?? 0);
  const [hasStore, setHasStore] = useState(cache?.hasStore ?? false);

  const fetchData = useCallback(() => {
    if (!isAuthenticated) {
      setCartCount(0);
      setHasStore(false);
      return;
    }
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      setCartCount(cache.cartCount);
      setHasStore(cache.hasStore);
      return;
    }
    Promise.all([
      cartAPI.get().catch(() => ({ data: { data: { items: [] } } })),
      storesAPI.getMyStores().catch(() => ({ data: [] })),
    ]).then(([cartRes, storesRes]) => {
      const cartData = (cartRes.data as any)?.data ?? cartRes.data ?? {};
      const items = Array.isArray(cartData?.items) ? cartData.items : [];
      const list = (storesRes.data as any)?.data ?? storesRes.data ?? [];
      const storeList = Array.isArray(list) ? list : [];
      const nextCartCount = items.length;
      const nextHasStore = storeList.length > 0;
      cache = {
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
