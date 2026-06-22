'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getSocketBaseUrl } from '@/lib/socketUrl';
import { getSocketAuth } from '@/lib/socketAuth';

export type WalletPendingPaymentEvent = {
  paymentRequestId: string;
  amount: number;
  merchantName: string;
};

export type WalletMoneyRequestEvent = {
  requestId: string;
  amount: number;
  requesterName: string;
};

export type WalletPaymentCompletedEvent = {
  paymentRequestId: string;
  amount: number;
  status: string;
};

type Handlers = {
  onPendingPayment?: (payload: WalletPendingPaymentEvent) => void;
  onMoneyRequest?: (payload: WalletMoneyRequestEvent) => void;
  onPaymentCompleted?: (payload: WalletPaymentCompletedEvent) => void;
  onRefreshBalance?: () => void;
};

/**
 * Realtime wallet payment alerts on `/notifications` (store scan + P2P request).
 */
export function useWalletPaymentSocket(userId: string | undefined, handlers: Handlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    let socket: Socket | null = null;
    try {
      socket = io(`${getSocketBaseUrl()}/notifications`, {
        auth: getSocketAuth(),
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
      });
    } catch {
      return;
    }

    const onConnect = () => {
      socket?.emit('join', userId);
    };

    const onPending = (payload: WalletPendingPaymentEvent) => {
      handlersRef.current.onPendingPayment?.(payload);
    };
    const onMoney = (payload: WalletMoneyRequestEvent) => {
      handlersRef.current.onMoneyRequest?.(payload);
    };
    const onCompleted = (payload: WalletPaymentCompletedEvent) => {
      handlersRef.current.onPaymentCompleted?.(payload);
    };
    const onBalance = () => {
      handlersRef.current.onRefreshBalance?.();
    };

    socket.on('connect', onConnect);
    if (socket.connected) onConnect();
    socket.on('wallet_pending_payment', onPending);
    socket.on('wallet_money_request', onMoney);
    socket.on('wallet_payment_completed', onCompleted);
    socket.on('wallet_balance', onBalance);

    return () => {
      socket?.off('connect', onConnect);
      socket?.off('wallet_pending_payment', onPending);
      socket?.off('wallet_money_request', onMoney);
      socket?.off('wallet_payment_completed', onCompleted);
      socket?.off('wallet_balance', onBalance);
      socket?.disconnect();
    };
  }, [userId]);
}
