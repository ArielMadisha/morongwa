/** Support ticket categories - used across the site for consistent categorization */

export const SUPPORT_CATEGORIES = {
  music: {
    label: 'Music',
    subcategories: [
      { value: 'music:upload', label: 'Music upload' },
      { value: 'music:streaming', label: 'Streaming' },
      { value: 'music:purchases', label: 'Purchases & downloads' },
      { value: 'music:other', label: 'Other' },
    ],
  },
  videos: {
    label: 'Videos',
    subcategories: [
      { value: 'videos:morongwa_tv', label: 'Morongwa TV' },
      { value: 'videos:qwertz', label: 'Qwertz' },
      { value: 'videos:live', label: 'Live streaming' },
      { value: 'videos:upload', label: 'Video upload' },
      { value: 'videos:other', label: 'Other' },
    ],
  },
  wallet: {
    label: 'Wallet',
    subcategories: [
      { value: 'wallet:topup', label: 'Top-up' },
      { value: 'wallet:withdrawal', label: 'Withdrawal' },
      { value: 'wallet:payments', label: 'Payments' },
      { value: 'wallet:transfers', label: 'Transfers' },
      { value: 'wallet:other', label: 'Other' },
    ],
  },
  products: {
    label: 'Products',
    subcategories: [
      { value: 'products:marketplace', label: 'Marketplace' },
      { value: 'products:orders', label: 'Orders' },
      { value: 'products:cart', label: 'Cart & checkout' },
      { value: 'products:suppliers', label: 'Suppliers & stores' },
      { value: 'products:listing', label: 'Product listing' },
      { value: 'products:returns', label: 'Returns & refunds' },
      { value: 'products:other', label: 'Other' },
    ],
  },
  general: {
    label: 'General',
    subcategories: [
      { value: 'general:account', label: 'Account' },
      { value: 'general:tasks', label: 'Tasks & errands' },
      { value: 'general:messages', label: 'Messages' },
      { value: 'general:billing', label: 'Billing' },
      { value: 'general:technical', label: 'Technical' },
      { value: 'general:other', label: 'Other' },
    ],
  },
} as const;

/** All category values for validation */
export const SUPPORT_CATEGORY_VALUES = [
  ...Object.values(SUPPORT_CATEGORIES).flatMap((c) => c.subcategories.map((s) => s.value)),
];

/** Get category label for display */
export function getSupportCategoryLabel(value: string): string {
  for (const cat of Object.values(SUPPORT_CATEGORIES)) {
    const sub = cat.subcategories.find((s) => s.value === value);
    if (sub) return `${cat.label} › ${sub.label}`;
  }
  return value;
}
