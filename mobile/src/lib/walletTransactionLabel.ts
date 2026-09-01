/** Wallet ledger row (embedded on User wallet or API /wallet/transactions). */
export type WalletTxLike = {
  type: string;
  amount: number;
  reference?: string;
  createdAt?: string | Date;
};

export type WalletTransactionDescription = {
  title: string;
  subtitle?: string;
  href?: string;
};

/**
 * Human-readable label from type + reference prefix (matches backend reference conventions).
 */
export function describeWalletTransaction(tx: WalletTxLike): WalletTransactionDescription {
  const ref = String(tx.reference || '').trim();
  const refUp = ref.toUpperCase();
  const type = String(tx.type || '').toLowerCase();
  const subtitle = ref ? (ref.length > 36 ? `Ref ${ref.slice(0, 36)}…` : `Ref ${ref}`) : undefined;

  if (refUp.startsWith('DONATE-')) {
    return {
      title: type === 'credit' ? 'Donation received' : 'Donation sent',
      subtitle,
    };
  }
  if (type === 'topup' || refUp.startsWith('TOPUP-')) {
    return { title: 'Wallet top-up', subtitle: subtitle || 'Card / PayGate' };
  }
  if (type === 'payout' || refUp.startsWith('PAYOUT-')) {
    return { title: 'Withdrawal to bank', subtitle };
  }
  if (refUp.startsWith('ORDER-')) {
    const orderId = ref.replace(/^ORDER-/i, '');
    return {
      title: 'QwertyHub order',
      subtitle,
      href: orderId ? `/checkout/order/${orderId}` : undefined,
    };
  }
  if (refUp.startsWith('QR-')) {
    return {
      title: type === 'credit' ? 'In-store sale (customer QR)' : 'Paid at store (QR scan)',
      subtitle,
    };
  }
  if (refUp.startsWith('CHECKOUT-')) {
    return {
      title: type === 'credit' ? 'Checkout payment received' : 'Paid merchant (checkout)',
      subtitle,
    };
  }
  if (refUp.startsWith('REQ-SCAN-') || refUp.startsWith('REQ-')) {
    return {
      title: type === 'credit' ? 'Money request — received' : 'Money request — sent',
      subtitle,
    };
  }
  if (refUp.startsWith('AGENT-WD-')) {
    return {
      title: type === 'debit' ? 'Cash withdrawal (agent)' : 'Agent cash handover',
      subtitle,
    };
  }
  if (refUp.startsWith('AGENT-')) {
    return {
      title: type === 'credit' ? 'Cash deposit credited' : 'Cash deposit (agent)',
      subtitle,
    };
  }
  if (type === 'escrow') {
    return { title: 'Errand escrow', subtitle };
  }
  if (type === 'refund') {
    return { title: 'Refund to wallet', subtitle };
  }

  const byType: Record<string, string> = {
    credit: 'Money received',
    debit: 'Payment sent',
    topup: 'Wallet top-up',
    payout: 'Withdrawal',
    escrow: 'Escrow',
    refund: 'Refund',
  };
  return { title: byType[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Transaction'), subtitle };
}
