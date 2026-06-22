/**
 * Public storefront search — used by /api/stores/search and Ask MacGyver.
 */

import Store from "../data/models/Store";
import Supplier from "../data/models/Supplier";

export type PublicStoreSearchHit = {
  _id: string;
  name: string;
  slug: string;
  type: "supplier" | "reseller";
  country?: string;
  countryCode?: string;
};

export function buildStoreSearchRegex(query: string): RegExp | null {
  const q = (query || "").trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function publicWebBase(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_WEB_URL ||
    process.env.WEB_URL ||
    "https://www.qwertymates.com"
  ).replace(/\/$/, "");
}

export function formatMarketplaceStoreAnswer(query: string, stores: PublicStoreSearchHit[]): string | null {
  if (stores.length === 0) return null;
  const base = publicWebBase();
  if (stores.length === 1) {
    const s = stores[0];
    const kind = s.type === "supplier" ? "verified supplier store" : "reseller store";
    const loc = s.country ? ` (${s.country})` : "";
    return `**${s.name}**${loc} is a ${kind} on Qwertymates (QwertyHub). Open their storefront: ${base}/store/${s.slug}`;
  }
  const lines = stores.map((s) => {
    const loc = s.country ? ` (${s.country})` : "";
    return `• **${s.name}**${loc} — ${base}/store/${s.slug}`;
  });
  return `QwertyHub stores matching "${query}":\n${lines.join("\n")}\n\nOpen a store link to browse products.`;
}

export async function searchPublicStores(query: string, limit = 20): Promise<PublicStoreSearchHit[]> {
  const regex = buildStoreSearchRegex(query);
  if (!regex) return [];

  const cap = Math.min(Math.max(limit, 1), 40);
  const seen = new Set<string>();
  const out: PublicStoreSearchHit[] = [];

  const push = (raw: {
    _id?: unknown;
    name?: unknown;
    slug?: unknown;
    type?: unknown;
    country?: unknown;
    countryCode?: unknown;
  }) => {
    const id = raw._id != null ? String(raw._id) : "";
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({
      _id: id,
      name: String(raw.name || ""),
      slug: String(raw.slug || ""),
      type: raw.type === "reseller" ? "reseller" : "supplier",
      country: raw.country ? String(raw.country) : undefined,
      countryCode: raw.countryCode ? String(raw.countryCode) : undefined,
    });
  };

  const approvedSupplierIds = await Supplier.find({ status: "approved" })
    .select("_id")
    .lean()
    .then((docs) => docs.map((d) => d._id));
  const approvedSet = new Set(approvedSupplierIds.map((id) => String(id)));

  const directStores = await Store.find({
    $or: [{ name: regex }, { slug: regex }],
  })
    .select("name slug type country countryCode supplierId")
    .limit(cap * 2)
    .lean();

  for (const s of directStores) {
    if (s.type === "reseller") {
      push(s);
      continue;
    }
    if (s.supplierId && approvedSet.has(String(s.supplierId))) {
      push(s);
    }
  }

  const suppliers = await Supplier.find({ status: "approved", storeName: regex })
    .select("_id storeName")
    .limit(cap)
    .lean();

  if (suppliers.length > 0) {
    const supplierOids = suppliers.map((s) => s._id);
    const linked = await Store.find({ supplierId: { $in: supplierOids } })
      .select("name slug type country countryCode")
      .limit(cap)
      .lean();
    for (const s of linked) push(s);
  }

  return out.slice(0, cap);
}
