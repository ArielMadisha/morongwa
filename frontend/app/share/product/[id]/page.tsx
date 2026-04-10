import type { Metadata } from "next";
import Link from "next/link";
import { buildProductMetadata, fetchProductForOg } from "@/lib/productShareMetadata";

type ProductDto = {
  _id?: string;
  title?: string;
  description?: string;
  images?: string[];
  price?: number;
  discountPrice?: number;
  currency?: string;
};

function effectivePrice(p: ProductDto): number {
  const price = Number(p.price || 0);
  const d = p.discountPrice;
  if (d != null && Number.isFinite(d) && d >= 0 && d < price) return d;
  return price;
}

function formatPriceForDisplay(p: ProductDto, resellerCommissionPct?: number): string {
  const cur = String(p.currency || "USD").toUpperCase();
  const base = effectivePrice(p);
  const pct =
    resellerCommissionPct != null && Number.isFinite(resellerCommissionPct) ? Number(resellerCommissionPct) : 0;
  const sell = pct > 0 ? Math.round(base * (1 + pct / 100) * 100) / 100 : base;
  return `${cur} ${sell.toFixed(2)}`;
}

type MetaProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resellerId?: string; resellerCommissionPct?: string }>;
};

export async function generateMetadata({ params, searchParams }: MetaProps): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  return buildProductMetadata({
    id,
    path: `/share/product/${id}`,
    resellerId: sp?.resellerId,
    resellerCommissionPct: sp?.resellerCommissionPct,
  });
}

export default async function ShareProductPage({ params, searchParams }: MetaProps) {
  const { id } = await params;
  const sp = await searchParams;
  const p = await fetchProductForOg(id);
  const q = new URLSearchParams();
  if (sp?.resellerId) q.set("resellerId", String(sp.resellerId));
  if (sp?.resellerCommissionPct) q.set("resellerCommissionPct", String(sp.resellerCommissionPct));
  const target = `/marketplace/product/${encodeURIComponent(id)}${q.toString() ? `?${q}` : ""}`;
  const resellerPct = sp?.resellerCommissionPct != null ? Number(sp.resellerCommissionPct) : undefined;
  const priceLine = p ? formatPriceForDisplay(p, resellerPct) : "";

  return (
    <main className="min-h-screen bg-white text-slate-900 px-6 py-10">
      <h1 className="text-xl font-semibold">Buy on QwertyHub</h1>
      {priceLine ? <p className="mt-2 text-lg font-medium text-emerald-700">{priceLine}</p> : null}
      <p className="mt-2 text-slate-700">{String(p?.title || "Product")}</p>
      <Link className="inline-block mt-6 rounded-lg bg-sky-600 text-white px-4 py-2" href={target}>
        Open product
      </Link>
    </main>
  );
}
