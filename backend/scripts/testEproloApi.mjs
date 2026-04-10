/**
 * Quick test of EPROLO API - run: node scripts/testEproloApi.mjs
 * Requires EPROLO_API_KEY and EPROLO_API_SECRET in .env
 */
import "dotenv/config";
import crypto from "crypto";

const apiKey = process.env.EPROLO_API_KEY;
const apiSecret = process.env.EPROLO_API_SECRET;
const base = "https://openapi.eprolo.com";

if (!apiKey || !apiSecret) {
  console.error("Missing EPROLO_API_KEY or EPROLO_API_SECRET in .env");
  process.exit(1);
}

function buildSign(apiKey, timestamp, apiSecret) {
  return crypto.createHash("md5").update(apiKey + timestamp + apiSecret).digest("hex").toLowerCase();
}

async function test() {
  const timestamp = String(Date.now());
  const sign = buildSign(apiKey, timestamp, apiSecret);
  const headers = {
    "Content-Type": "application/json",
    apiKey,
    sign,
    timestamp,
  };

  console.log("Testing EPROLO API...\n");

  // 1. eprolo_product_list - try with page_size=100
  console.log("1. GET /eprolo_product_list.html?page_index=0&page_size=100");
  try {
    const url = `${base}/eprolo_product_list.html?sign=${sign}&timestamp=${timestamp}&page_index=0&page_size=100`;
    const r1 = await fetch(url, { headers: { "Content-Type": "application/json", apiKey } });
    const j1 = await r1.json();
    console.log("   Status:", r1.status);
    console.log("   Response:", JSON.stringify(j1, null, 2).slice(0, 500));
    if (Array.isArray(j1.data)) {
      console.log("   Products count:", j1.data.length);
      if (j1.data[0]) console.log("   First product id:", j1.data[0].id);
    }
  } catch (e) {
    console.error("   Error:", e.message);
  }

  // 2. add_product (add product from platform list)
  const productIdToAdd = "31254278"; // from eprolo_product_list
  console.log("\n2. POST /add_product.html with ids: [" + productIdToAdd + "]");
  try {
    const url2 = `${base}/add_product.html?sign=${sign}&timestamp=${timestamp}`;
    const r2 = await fetch(url2, {
      method: "POST",
      headers: { "Content-Type": "application/json", apiKey },
      body: JSON.stringify({ ids: [productIdToAdd] }),
    });
    const j2 = await r2.json();
    console.log("   Status:", r2.status);
    console.log("   Response code:", j2.code, "msg:", j2.msg);
    if (j2.data) {
      const arr = Array.isArray(j2.data) ? j2.data : [j2.data];
      console.log("   Data length:", arr.length);
      if (arr[0]) console.log("   First product id:", arr[0].id, "title:", arr[0].title?.slice(0, 50));
    }
  } catch (e) {
    console.error("   Error:", e.message);
  }
}

test().catch(console.error);
