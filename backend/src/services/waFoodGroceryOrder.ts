/**
 * WhatsApp food order — Place Your Order (Food / Restaurant / Groceries / Bakeries).
 * Store list (name - area - address) → menu product cards with CART ADD links.
 */
import mongoose from "mongoose";
import Product from "../data/models/Product";
import Store from "../data/models/Store";
import Supplier from "../data/models/Supplier";
import {
  FOOD_HUB_EXCLUDED_CATEGORIES,
  FOOD_TAG_MENU,
  FOOD_TAG_EXTRA,
  FOOD_TAG_PICKUP,
  GROCERY_CATEGORY,
  GROCERY_TAG_PICKUP,
  productIsFoodExtra,
} from "../config/foodMarketplace";
import { enrichProductsWithStoreFields } from "./enrichProductStoreFields";
import { getProductPriceForQty } from "../utils/productPricing";
import { getFxRates } from "./fxService";
import { resolveWaCatalogPriceDisplay } from "../utils/waCatalogPrice";

export type WaFoodOrderVertical = "restaurant" | "grocery" | "all";

export type WaFoodStoreRow = {
  key: string;
  storeId?: string;
  supplierId: string;
  name: string;
  area: string;
  address: string;
  /** Catalog vertical used when loading this store's menu cards. */
  productVertical: "restaurant" | "grocery";
};

/** Known restaurant addresses when Store.address is missing or coords-only. */
const FALLBACK_ADDRESS: Record<string, string> = {
  "caliba's township burger": "Mosimegi Street, Temba, Pretoria, Gauteng, 0407",
  calibastownshipburger: "Mosimegi Street, Temba, Pretoria, Gauteng, 0407",
  "bunnie bakers": "26402 Tilo Street Extension 6",
  bunniebakers: "26402 Tilo Street Extension 6",
  "qwertyhub test shop": "4235B Majaneng - Food/Restaurant test shop",
  qwertyhubtestshop: "4235B Majaneng - Food/Restaurant test shop",
};

/** Known area labels when Store.area is missing. */
const FALLBACK_AREA: Record<string, string> = {
  "caliba's township burger": "Temba Location",
  calibastownshipburger: "Temba Location",
  "mma lerato fast food": "Temba Unit 5",
  mmaleratofastfood: "Temba Unit 5",
  "bunnie bakers": "Soshanguve",
  bunniebakers: "Soshanguve",
  "qwertyhub test shop": "Majaneng",
  qwertyhubtestshop: "Majaneng",
};

function storeNameKeys(name: string): { key: string; compact: string } {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  const compact = key.replace(/[^a-z0-9]/g, "");
  return { key, compact };
}

function looksLikeCoordsOnly(address: string): boolean {
  const a = address.trim().toLowerCase();
  if (!a) return true;
  if (a.includes("customer collection") && /[°']/.test(a)) return true;
  if (/^\d{1,3}°/.test(a) || /\d{1,3}°\d{1,2}'/.test(a)) return true;
  return false;
}

function resolveDisplayAddress(raw: string | undefined, name: string): string {
  const trimmed = String(raw || "").trim();
  if (trimmed && !looksLikeCoordsOnly(trimmed)) return trimmed;
  const { key, compact } = storeNameKeys(name);
  return FALLBACK_ADDRESS[key] || FALLBACK_ADDRESS[compact] || trimmed || "Address on request";
}

function resolveDisplayArea(raw: string | undefined, name: string, address: string): string {
  const trimmed = String(raw || "").trim();
  if (trimmed) return trimmed;
  const { key, compact } = storeNameKeys(name);
  const known = FALLBACK_AREA[key] || FALLBACK_AREA[compact];
  if (known) return known;
  const addr = String(address || "").trim();
  if (/customer collection/i.test(addr)) return "Collection";
  const parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[1];
  if (parts.length === 1 && parts[0].length <= 40) return parts[0];
  return "Area on request";
}

export function buildWaFoodOrderVerticalMenu(): string {
  return [
    "🍽️ Place Your Order",
    "",
    "Choose an option (reply with the number):",
    "",
    "1️⃣ Order Food / Restaurant / Groceries / Bakeries",
    "2️⃣ List your Store",
    "",
    "0️⃣ Back to main menu",
  ].join("\n");
}

export function buildWaFoodStoreListMessage(
  _vertical: WaFoodOrderVertical,
  stores: WaFoodStoreRow[]
): string {
  const title = "🍽️ Order Food / Restaurant / Groceries / Bakeries";
  if (!stores.length) {
    return [
      title,
      "",
      "No food or grocery stores are listed yet. Check back soon.",
      "",
      "0️⃣ Back to main menu",
    ].join("\n");
  }
  const lines = stores.map((s, i) => {
    const area = s.area || "Area on request";
    const addr = s.address || "Address on request";
    // Always: Store Name - Area - Address
    return `${i + 1}. ${s.name} - ${area} - ${addr}`;
  });
  return [
    title,
    "",
    "Reply with the store number to see the menu:",
    "",
    ...lines,
    "",
    "0️⃣ Back to main menu",
  ].join("\n");
}

function foodProductMatch(vertical: "restaurant" | "grocery"): Record<string, unknown> {
  if (vertical === "restaurant") {
    return {
      active: true,
      $or: [
        { categories: { $in: [...FOOD_HUB_EXCLUDED_CATEGORIES] } },
        { tags: { $in: [FOOD_TAG_MENU, FOOD_TAG_PICKUP, "kota", "bunny-chow"] } },
      ],
    };
  }
  return {
    active: true,
    $or: [{ categories: GROCERY_CATEGORY }, { tags: { $in: [GROCERY_TAG_PICKUP, "grocery"] } }],
  };
}

/**
 * List every approved restaurant/grocery store that has products (or is tagged with the vertical).
 * Uses Product.distinct(supplierId) so we do not depend on enrich() mutating supplierId.
 */
export async function listWaFoodGroceryStores(
  vertical: "restaurant" | "grocery"
): Promise<WaFoodStoreRow[]> {
  const bySupplier = new Map<string, WaFoodStoreRow>();

  const verticalStores = await Store.find({
    type: "supplier",
    vertical: vertical === "restaurant" ? "restaurant" : "grocery",
  })
    .select("_id name address area supplierId")
    .lean();

  for (const st of verticalStores) {
    const supplierId = st.supplierId ? String(st.supplierId) : "";
    if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) continue;
    const name = String(st.name || "Store").trim() || "Store";
    const address = resolveDisplayAddress(st.address ? String(st.address) : undefined, name);
    bySupplier.set(supplierId, {
      key: String(st._id),
      storeId: String(st._id),
      supplierId,
      name,
      address,
      area: resolveDisplayArea(st.area ? String(st.area) : undefined, name, address),
      productVertical: vertical,
    });
  }

  const supplierObjectIds = await Product.distinct("supplierId", foodProductMatch(vertical));
  const supplierIdStrs = [
    ...new Set(
      supplierObjectIds
        .map((id) => String(id || ""))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    ),
  ];

  const allSupplierIds = [
    ...new Set([...bySupplier.keys(), ...supplierIdStrs].filter((id) => mongoose.Types.ObjectId.isValid(id))),
  ];
  if (!allSupplierIds.length) return [];

  const oids = allSupplierIds.map((id) => new mongoose.Types.ObjectId(id));
  const [stores, suppliers] = await Promise.all([
    Store.find({ type: "supplier", supplierId: { $in: oids } })
      .select("_id name address area supplierId vertical")
      .lean(),
    Supplier.find({ _id: { $in: oids }, status: "approved" }).select("_id storeName").lean(),
  ]);

  const approved = new Set(suppliers.map((s) => String(s._id)));
  const storeBySupplier = new Map(stores.map((s) => [String(s.supplierId), s]));
  const supplierName = new Map(
    suppliers.map((s) => [String(s._id), String(s.storeName || "").trim()])
  );

  for (const sid of allSupplierIds) {
    if (!approved.has(sid)) {
      bySupplier.delete(sid);
      continue;
    }
    const st = storeBySupplier.get(sid);
    const existing = bySupplier.get(sid);
    const name =
      String(existing?.name || st?.name || "").trim() ||
      supplierName.get(sid) ||
      "Store";
    const address = resolveDisplayAddress(
      existing?.address && existing.address !== "Address on request"
        ? existing.address
        : st?.address
          ? String(st.address)
          : undefined,
      name
    );
    const area = resolveDisplayArea(
      existing?.area && existing.area !== "Area on request"
        ? existing.area
        : st?.area
          ? String(st.area)
          : undefined,
      name,
      address
    );
    bySupplier.set(sid, {
      key: existing?.key || (st?._id ? String(st._id) : `sup:${sid}`),
      storeId: existing?.storeId || (st?._id ? String(st._id) : undefined),
      supplierId: sid,
      name,
      address,
      area,
      productVertical: vertical,
    });
  }

  const rows = [...bySupplier.values()].filter((r) => approved.has(r.supplierId));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows.slice(0, 40);
}

/** Combined Food / Restaurant / Groceries / Bakeries list (deduped by supplier). */
export async function listWaFoodAllStores(): Promise<WaFoodStoreRow[]> {
  const [restaurants, groceries] = await Promise.all([
    listWaFoodGroceryStores("restaurant"),
    listWaFoodGroceryStores("grocery"),
  ]);
  const bySupplier = new Map<string, WaFoodStoreRow>();
  for (const row of restaurants) bySupplier.set(row.supplierId, row);
  for (const row of groceries) {
    const existing = bySupplier.get(row.supplierId);
    if (!existing) {
      bySupplier.set(row.supplierId, row);
      continue;
    }
    bySupplier.set(row.supplierId, {
      ...existing,
      area: existing.area && existing.area !== "Area on request" ? existing.area : row.area,
      address:
        existing.address && existing.address !== "Address on request"
          ? existing.address
          : row.address,
    });
  }
  const rows = [...bySupplier.values()];
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows.slice(0, 40);
}

export function buildWaFoodMenuCardCaption(opts: {
  title: string;
  targetCurrency: string;
  price: string;
  shortCode: string;
  addToCartLink: string;
  categoryLine?: string;
}): string {
  const lines = [
    `📦 ${opts.title}`,
    `💰 ${opts.targetCurrency} ${opts.price}`,
    `🏷️ code: ${opts.shortCode}`,
    "",
    "Buy / Add to cart:",
    opts.addToCartLink,
  ];
  let body = lines.join("\n");
  if (body.length > 1024) body = `${body.slice(0, 1023)}…`;
  return body;
}

/** Prefer 12+ hex chars so consecutive ObjectIds do not collide on CART ADD. */
export function waFoodProductShortCode(productId: string, used: Set<string>): string {
  const full = String(productId || "").toLowerCase().replace(/[^a-f0-9]/g, "");
  for (let n = 12; n <= 24; n += 2) {
    const code = full.slice(0, n);
    if (code.length >= 6 && !used.has(code)) {
      used.add(code);
      return code;
    }
  }
  if (full) used.add(full);
  return full || "unknown";
}

function menuSortKey(title: string, sku?: string): number {
  const fromSku = String(sku || "").match(/(?:MENU|EXTRA)-(\d+)/i);
  if (fromSku) return Number(fromSku[1]);
  const m = String(title || "").match(/^#?\s*(\d+)/);
  return m ? Number(m[1]) : 9999;
}

/** Max photo cards per WhatsApp food menu (menu items first, then extras). */
export const WA_FOOD_MENU_CARD_LIMIT = 20;

async function loadWaFoodExtrasProducts(supplierId: string): Promise<any[]> {
  if (!mongoose.Types.ObjectId.isValid(supplierId)) return [];
  const sid = new mongoose.Types.ObjectId(supplierId);
  const products = await Product.find({
    active: true,
    supplierId: { $in: [sid, String(supplierId)] },
    tags: FOOD_TAG_EXTRA,
  })
    .select("title slug description price discountPrice currency images categories tags supplierId supplierSource sku")
    .lean();
  products.sort((a, b) => {
    const ka = menuSortKey(String((a as any).title || ""), String((a as any).sku || ""));
    const kb = menuSortKey(String((b as any).title || ""), String((b as any).sku || ""));
    if (ka !== kb) return ka - kb;
    return String((a as any).title || "").localeCompare(String((b as any).title || ""));
  });
  return products.slice(0, 15);
}

function resolveMenuProductVertical(
  vertical: WaFoodOrderVertical,
  preferred?: "restaurant" | "grocery"
): "restaurant" | "grocery" {
  if (preferred === "restaurant" || preferred === "grocery") return preferred;
  if (vertical === "grocery") return "grocery";
  return "restaurant";
}

export async function loadWaFoodGroceryMenuProducts(
  vertical: WaFoodOrderVertical,
  supplierId: string,
  preferred?: "restaurant" | "grocery"
): Promise<any[]> {
  if (!mongoose.Types.ObjectId.isValid(supplierId)) return [];
  const sid = new mongoose.Types.ObjectId(supplierId);
  const primary = resolveMenuProductVertical(vertical, preferred);
  const tryOrder: Array<"restaurant" | "grocery"> =
    vertical === "all" ? [primary, primary === "restaurant" ? "grocery" : "restaurant"] : [primary];

  for (const v of tryOrder) {
    const match =
      v === "restaurant"
        ? {
            active: true,
            supplierId: { $in: [sid, String(supplierId)] },
            $or: [
              { categories: { $in: [...FOOD_HUB_EXCLUDED_CATEGORIES] } },
              { tags: { $in: [FOOD_TAG_MENU, FOOD_TAG_PICKUP, "kota", "bunny-chow"] } },
            ],
          }
        : {
            active: true,
            supplierId: { $in: [sid, String(supplierId)] },
            $or: [{ categories: GROCERY_CATEGORY }, { tags: { $in: [GROCERY_TAG_PICKUP, "grocery"] } }],
          };

    const products = await Product.find(match)
      .select(
        "title slug description price discountPrice currency images categories tags supplierId supplierSource sku"
      )
      .lean();

    const filtered = products.filter((p) => {
      if (v === "restaurant") return !productIsFoodExtra(p as any);
      return true;
    });
    if (!filtered.length) continue;
    filtered.sort((a, b) => {
      const ka = menuSortKey(String((a as any).title || ""), String((a as any).sku || ""));
      const kb = menuSortKey(String((b as any).title || ""), String((b as any).sku || ""));
      if (ka !== kb) return ka - kb;
      return String((a as any).title || "").localeCompare(String((b as any).title || ""));
    });
    return filtered.slice(0, 30);
  }
  return [];
}

export async function buildWaFoodGroceryMenuCards(opts: {
  vertical: WaFoodOrderVertical;
  supplierId: string;
  productVertical?: "restaurant" | "grocery";
  phoneInputForGeo: string;
  waMeBotLink: (fromDigits: string, text: string) => string | null;
  waChatCommandFallback: (kind: string, code: string, qty: number) => string;
  ensurePublicWaLink: (url: string) => string;
  getTwilioWhatsAppFromDigits: (override: undefined, phone: string) => string;
  resolveImageUrl: (path: string) => string;
  fallbackImageUrl: string;
  compactText: (s: string, n: number) => string;
}): Promise<{
  cards: Array<{ mediaUrl: string; caption: string }>;
  storeName: string;
  textMenu: string;
  products: any[];
}> {
  const menuProducts = await loadWaFoodGroceryMenuProducts(
    opts.vertical,
    opts.supplierId,
    opts.productVertical
  );
  const isRestaurant =
    opts.productVertical === "restaurant" ||
    opts.vertical === "restaurant" ||
    opts.vertical === "all";
  const extras =
    isRestaurant && opts.productVertical !== "grocery"
      ? await loadWaFoodExtrasProducts(opts.supplierId)
      : [];
  // Menu first (board order), then extras — fits Mma Lerato 12+8 within WA_FOOD_MENU_CARD_LIMIT.
  const products = [...menuProducts, ...extras];
  if (!products.length) {
    return { cards: [], storeName: "", textMenu: "", products: [] };
  }
  const enriched = await enrichProductsWithStoreFields(products as Record<string, unknown>[]);
  const rates = (await getFxRates()).rates;
  const waFromDigits = opts.getTwilioWhatsAppFromDigits(undefined, opts.phoneInputForGeo);
  const storeName =
    String((enriched[0] as any)?.store?.name || (enriched[0] as any)?.storeName || "").trim() ||
    "Store";

  const usedCodes = new Set<string>();
  const cards: Array<{ mediaUrl: string; caption: string }> = [];
  const textLines: string[] = [];
  let itemNo = 0;
  let extrasHeaderAdded = false;
  for (const p of enriched.slice(0, WA_FOOD_MENU_CARD_LIMIT)) {
    const isExtra = productIsFoodExtra(p as any);
    if (isExtra && !extrasHeaderAdded) {
      textLines.push("", "Extras:");
      extrasHeaderAdded = true;
    }
    const title = opts.compactText(String((p as any)?.title || "Item"), 48);
    const shortCode = waFoodProductShortCode(String((p as any)?._id || ""), usedCodes);
    const unitBase = getProductPriceForQty(p as any, 1);
    const display = resolveWaCatalogPriceDisplay(p as any, rates, unitBase);
    const image =
      opts.resolveImageUrl(Array.isArray((p as any)?.images) ? String((p as any).images[0] || "") : "") ||
      opts.fallbackImageUrl;
    const addToCartLink = opts.ensurePublicWaLink(
      opts.waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) ||
        opts.waChatCommandFallback("cart", shortCode, 1)
    );
    cards.push({
      mediaUrl: image,
      caption: buildWaFoodMenuCardCaption({
        title,
        targetCurrency: display.currency,
        price: display.amount.toFixed(2),
        shortCode,
        addToCartLink,
      }),
    });
    itemNo += 1;
    textLines.push(
      `${itemNo}. ${title} — ${display.currency} ${display.amount.toFixed(2)}`,
      `   CART ADD ${shortCode} 1`,
      `   ${addToCartLink}`
    );
  }
  const textMenu = [
    "Menu:",
    "",
    ...textLines,
    "",
    "Tap a link or reply: CART ADD <code> 1",
    "Then reply 7 to view cart & pay",
  ].join("\n");
  return { cards, storeName, textMenu, products: enriched };
}
