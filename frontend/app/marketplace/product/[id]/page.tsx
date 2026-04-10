import type { Metadata } from "next";
import { buildProductMetadata } from "@/lib/productShareMetadata";
import ProductPageClient from "./ProductPageClient";

/**
 * Server-side Open Graph so WhatsApp / Facebook crawlers receive og:image, title, price.
 * (Client-only pages emit no OG tags — links were plain text.)
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  const resellerId = typeof sp.resellerId === "string" ? sp.resellerId : undefined;
  const resellerCommissionPct = typeof sp.resellerCommissionPct === "string" ? sp.resellerCommissionPct : undefined;
  return buildProductMetadata({
    id,
    path: `/marketplace/product/${id}`,
    resellerId,
    resellerCommissionPct,
  });
}

export default function MarketplaceProductPage() {
  return <ProductPageClient />;
}
