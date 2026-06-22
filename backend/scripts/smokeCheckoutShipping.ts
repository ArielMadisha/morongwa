/**
 * Verify checkout courier catalog + quote logic (PAXI options, auto bag upgrade).
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/smokeCheckoutShipping.ts
 *
 * Optional API smoke (needs reachable API + DB for product lookup):
 *   SMOKE_API_BASE=https://api.qwertymates.com/api npx ts-node-dev --transpile-only --exit-child scripts/smokeCheckoutShipping.ts --api
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import Store from "../src/data/models/Store";
import Cart from "../src/data/models/Cart";
import User from "../src/data/models/User";
import { ensureCourierCatalogSeed } from "../src/services/courierSeed";
import {
  buildAggregatedCheckoutCourierOptions,
  inferParcelTierForStoreGroup,
} from "../src/services/courierServiceCatalog";
import {
  buildInternalShippingStoreGroups,
  computeInternalCourierShipping,
} from "../src/services/checkoutShipping";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const RUN_API = process.argv.includes("--api");
const API_BASE = (process.env.SMOKE_API_BASE || "https://api.qwertymates.com/api").replace(/\/$/, "");

const EXPECTED_PAXI = [
  { label: "Standard — Economy", price: 59.95 },
  { label: "Standard — Speed", price: 109.95 },
  { label: "Large — Economy", price: 119.95 },
  { label: "Large — Speed", price: 139.95 },
  { label: "Store to Home — Standard", price: 119.95 },
  { label: "Store to Home — Large", price: 149.95 },
];

function fail(msg: string): never {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg: string) {
  console.log("OK:", msg);
}

const VEST_PRODUCT_ID = "6a1592cb85e19784c80d06ed";

async function findSampleInternalProduct(): Promise<{
  product: Record<string, unknown>;
  productId: string;
}> {
  const vest = await Product.findById(VEST_PRODUCT_ID).lean();
  if (vest && String(vest.supplierSource || "internal") === "internal") {
    return { product: vest as Record<string, unknown>, productId: String(vest._id) };
  }
  const stores = await Store.find({
    $or: [{ slug: /cheap/i }, { name: /cheap/i }],
    type: "supplier",
  })
    .select("supplierId")
    .lean();
  const supplierIds = stores.map((s) => s.supplierId).filter(Boolean);
  const q: Record<string, unknown> = {
    active: true,
    supplierSource: "internal",
  };
  if (supplierIds.length) q.supplierId = { $in: supplierIds };
  let product = await Product.findOne(q).sort({ updatedAt: -1 }).lean();
  if (!product) {
    product = await Product.findOne({ active: true, supplierSource: "internal" }).sort({ updatedAt: -1 }).lean();
  }
  if (!product) fail("No active internal product found in DB");
  return { product: product as Record<string, unknown>, productId: String(product._id) };
}

async function runServiceSmoke() {
  await ensureCourierCatalogSeed();

  const { product, productId } = await findSampleInternalProduct();
  const productMap = new Map([[productId, product]]);
  const cartItems = [{ productId, qty: 3 }];
  const storeGroups = await buildInternalShippingStoreGroups(cartItems, productMap);
  if (!storeGroups.length) fail("buildInternalShippingStoreGroups returned empty");

  const options = await buildAggregatedCheckoutCourierOptions("ZA", storeGroups, cartItems, productMap);
  const paxi = options.filter((o) => o.providerSlug === "paxi" || o.providerName.toLowerCase().includes("paxi"));
  if (paxi.length < 6) {
    fail(`Expected 6 PAXI options, got ${paxi.length}. Labels: ${paxi.map((o) => o.serviceLabel).join(" | ")}`);
  }
  ok(`PAXI options listed: ${paxi.length}`);

  for (const exp of EXPECTED_PAXI) {
    const match = paxi.find((o) => o.serviceLabel.includes(exp.label));
    if (!match) fail(`Missing PAXI option: ${exp.label}`);
    if (Math.abs(match.priceZar - exp.price * storeGroups.length) > 0.02) {
      fail(`${exp.label}: expected R${exp.price * storeGroups.length}, got R${match.priceZar}`);
    }
  }
  ok("All six PAXI catalog prices match");

  const tier = inferParcelTierForStoreGroup(storeGroups[0], cartItems, productMap);
  if (tier !== "large") {
    console.warn(`WARN: qty=3 expected large parcel tier for sizing test, got ${tier} (product: ${product.title})`);
  } else {
    ok("Qty 3 infers large parcel tier");
  }

  const stdEconomy = paxi.find((o) => o.serviceLabel.includes("Standard — Economy"));
  if (!stdEconomy) fail("Standard Economy tariff missing");

  const quoted = await computeInternalCourierShipping(
    "ZA",
    storeGroups,
    stdEconomy.tariffId,
    undefined,
    cartItems,
    productMap
  );
  if (!quoted.courierUsed) fail("computeInternalCourierShipping did not use courier");
  if (quoted.internalShippingZar < 119.94) {
    fail(
      `Auto-upgrade: Standard Economy with large cart should charge >= R119.95, got R${quoted.internalShippingZar}`
    );
  }
  ok(`Auto-upgrade on Standard Economy selection: R${quoted.internalShippingZar}`);

  const largeEconomy = paxi.find((o) => o.serviceLabel.includes("Large — Economy"));
  if (!largeEconomy) fail("Large Economy missing");
  const quotedLarge = await computeInternalCourierShipping(
    "ZA",
    storeGroups,
    largeEconomy.tariffId,
    undefined,
    cartItems,
    productMap
  );
  if (Math.abs(quotedLarge.internalShippingZar - 119.95 * storeGroups.length) > 0.02) {
    fail(`Large Economy expected R${119.95 * storeGroups.length}, got R${quotedLarge.internalShippingZar}`);
  }
  ok("Large Economy explicit selection priced correctly");

  const noSelection = await computeInternalCourierShipping(
    "ZA",
    storeGroups,
    undefined,
    undefined,
    cartItems,
    productMap
  );
  if (!noSelection.requiresCourierSelection || noSelection.availableOptions.length < 6) {
    fail("Without courierTariffId, quote should require selection with 6+ options");
  }
  ok("Requires courier selection when tariff not chosen");
}

async function runApiSmoke(productId: string) {
  const ts = Date.now();
  const email = `ship-smoke+${ts}@example.com`;
  const password = "Passw0rd!";

  async function post(route: string, body: Record<string, unknown>, token?: string) {
    const res = await fetch(`${API_BASE}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      fail(`API ${route} ${res.status}: ${JSON.stringify(parsed)}`);
    }
    return parsed;
  }

  await post("/auth/register", {
    name: "Shipping Smoke",
    email,
    password,
    role: ["client"],
    dateOfBirth: "1990-01-15",
  });
  const login = await post("/auth/login", { email, password });
  const token = String((login as { token?: string }).token || "");
  if (!token) fail("No auth token from login");

  await post("/cart", { productId, qty: 3 }, token);
  const quoteRes = await post("/checkout/quote", { deliveryCountry: "ZA" }, token);
  const data = (quoteRes.data ?? quoteRes) as Record<string, unknown>;
  const opts = (data.courierOptions as Array<Record<string, unknown>>) || [];
  if (opts.length < 6) {
    fail(`API quote returned ${opts.length} courier options (expected >= 6)`);
  }
  ok(`API /checkout/quote returned ${opts.length} courier options`);

  const std = opts.find((o) => String(o.serviceLabel || "").includes("Standard — Economy"));
  if (!std?.tariffId) fail("API quote missing Standard Economy");
  const withCourier = await post(
    "/checkout/quote",
    { deliveryCountry: "ZA", courierTariffId: std.tariffId },
    token
  );
  const d2 = (withCourier.data ?? withCourier) as Record<string, unknown>;
  const shipping = Number(d2.shipping);
  if (!Number.isFinite(shipping) || shipping < 59.95) {
    fail(`API quote with courier selected: invalid shipping ${shipping}`);
  }
  ok(`API quote with Standard Economy selected: shipping=R${shipping}, total=R${d2.total}`);

  const user = await User.findOne({ email }).select("_id").lean();
  if (user) await Cart.deleteOne({ user: user._id });
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) fail("MONGODB_URI not set");
  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n=== Service-level shipping smoke ===");
  await runServiceSmoke();

  if (RUN_API) {
    console.log("\n=== API checkout quote smoke ===");
    const { productId } = await findSampleInternalProduct();
    await runApiSmoke(productId);
  } else {
    console.log("\n(Skip API smoke; pass --api to run against SMOKE_API_BASE)");
  }

  await mongoose.disconnect();
  console.log("\nAll shipping smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
