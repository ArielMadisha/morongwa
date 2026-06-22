'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/api';
import { getSocketAuth } from '@/lib/socketAuth';

/**
 * Subscribes to `/notifications` `wallet_balance` events for the logged-in user (same room join as other realtime alerts).
 * Refreshes wallet UI when the balance changes from another device, WhatsApp, checkout, commission, etc.
 */
export function useWalletBalanceSocket(userId: string | undefined, onRefresh: () => void): void {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    let socket: Socket | null = null;
    try {
      socket = io(`${SOCKET_URL}/notifications`, {
        auth: getSocketAuth(),
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
      });
    } catch {
      return;
    }

    const connectHandler = () => {
      socket?.emit('join', userId);
    };

    socket.on('connect', connectHandler);
    socket.on('wallet_balance', () => {
      refreshRef.current();
    });

    return () => {
      socket.off('connect', connectHandler);
      socket.off('wallet_balance');
      socket.disconnect();
    };
  }, [userId]);
}
