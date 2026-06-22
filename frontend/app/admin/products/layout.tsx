import type { ReactNode } from 'react';

/**
 * Avoid aggressive CDN/HTML caching on admin product tooling after deploys.
 * (Client JS still updates, but this keeps the document shell fresh.)
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminProductsLayout({ children }: { children: ReactNode }) {
  return children;
}
