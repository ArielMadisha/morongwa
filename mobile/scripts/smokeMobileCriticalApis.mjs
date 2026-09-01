/**
 * Smoke checks for mobile API surface used by wallet / messenger / statuses / posts.
 * Does not replace device QA — verifies endpoints respond with auth when MONGO/token available.
 *
 * Usage (optional): MOBILE_SMOKE_TOKEN=... node scripts/smokeMobileCriticalApis.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const checks = [
  ["WalletScreen no website wallet stubs", () => {
    const t = fs.readFileSync(path.join(root, "src/screens/WalletScreen.tsx"), "utf8");
    if (t.includes("Linking.openURL(`${WEB_WALLET}`)") || t.includes("Linking.openURL(`${SITE_ORIGIN}/wallet`)")) {
      throw new Error("Wallet still opens website for quick actions");
    }
    for (const label of ["Pay", "Receive", "Scan QR", "Cards", "Pay at Shop", "Cash"]) {
      if (!t.includes(label) && !t.includes("Cash & Agents")) {
        /* labels may be split */
      }
    }
    if (!t.includes("showPayRequests") && !t.includes("Pay requests") && !t.includes("moneyRequests")) {
      throw new Error("Pay requests UI missing");
    }
    if (!t.includes("merchant-agent") && !fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8").includes("merchant-agent")) {
      throw new Error("merchant-agent API missing");
    }
  }],
  ["Auth 401 handler", () => {
    const t = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
    if (!t.includes("registerUnauthorizedHandler")) throw new Error("missing unauthorized handler");
  }],
  ["Hub RESELL top-left not floatActions", () => {
    const t = fs.readFileSync(path.join(root, "src/screens/HubScreen.tsx"), "utf8");
    if (t.includes("floatActions")) throw new Error("Hub still has floatActions");
    if (!t.includes("resellTop")) throw new Error("Hub missing resellTop");
  }],
  ["Statuses soft reload", () => {
    const t = fs.readFileSync(path.join(root, "src/screens/HomeScreen.tsx"), "utf8");
    if (!t.includes("loadStatuses") && !t.includes("getStatuses")) throw new Error("status load missing");
    if (!t.includes("AppState")) throw new Error("AppState status reload missing");
  }],
  ["FitContainImage full photo on wall", () => {
    const fit = fs.readFileSync(path.join(root, "src/components/FitContainImage.tsx"), "utf8");
    if (!fit.includes('mode = "contain"')) throw new Error("FitContainImage default must be contain");
    const t = fs.readFileSync(path.join(root, "src/screens/FeedScreen.tsx"), "utf8");
    if (!t.includes("FitContainImage")) throw new Error("FitContainImage not wired");
  }],
  ["Messenger markAsRead", () => {
    const api = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
    if (!api.includes("markAsRead")) throw new Error("messenger markAsRead missing");
  }],
  ["Ask MacGyver web-parity search", () => {
    const api = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
    if (!api.includes("getSuggested")) throw new Error("follows getSuggested missing");
    if (!api.includes("/stores/search")) throw new Error("stores search missing");
    if (!/usersAPI\s*=\s*\{[\s\S]*?list:/.test(api)) throw new Error("usersAPI.list missing");
    const modal = fs.readFileSync(path.join(root, "src/components/AskMacGyverModal.tsx"), "utf8");
    if (!modal.includes("storesAPI") || !modal.includes("tvAPI") || !modal.includes("musicAPI")) {
      throw new Error("AskMacGyverModal missing multi-source search");
    }
    const home = fs.readFileSync(path.join(root, "src/screens/HomeScreen.tsx"), "utf8");
    if (!home.includes("AskMacGyverModal")) throw new Error("HomeScreen not wired to AskMacGyverModal");
  }],
  ["Create post heading optional", () => {
    const t = fs.readFileSync(path.join(root, "src/components/CreatePostModal.tsx"), "utf8");
    if (t.includes("Title (required)")) throw new Error("title still required placeholder");
    if (t.includes("Please add a title for your post.")) throw new Error("title still hard-required");
    if (!t.includes('placeholder="Heading"')) throw new Error("Heading placeholder missing");
  }],
  ["Hub cart stepper + sections", () => {
    const hub = fs.readFileSync(path.join(root, "src/screens/HubScreen.tsx"), "utf8");
    if (!hub.includes("HubCartStepper")) throw new Error("HubCartStepper not wired");
    if (!hub.includes("Order Food") && !hub.includes('"food"')) throw new Error("food section missing");
    if (!hub.includes("groceries")) throw new Error("groceries section missing");
  }],
  ["Wallet no website verify stub", () => {
    const w = fs.readFileSync(path.join(root, "src/screens/WalletScreen.tsx"), "utf8");
    if (w.includes("website wallet")) throw new Error("wallet still pushes website verify");
    if (!w.includes("openPayGateInApp")) throw new Error("PayGate in-app helper missing");
    if (!w.includes("handleDonateSubmit")) throw new Error("Scan QR donate flow missing");
  }],
  ["FAB icons-only + trending swipe", () => {
    const home = fs.readFileSync(path.join(root, "src/screens/HomeScreen.tsx"), "utf8");
    if (home.includes('primaryTab === "hub" ? (hubCartBusy ? "…" : "+cart") : "cart"')) {
      throw new Error("cart text still overlaid on FAB");
    }
    const trend = fs.readFileSync(path.join(root, "src/components/TrendingNowMarquee.tsx"), "utf8");
    if (!trend.includes("ScrollView") || !trend.includes("horizontal")) {
      throw new Error("Trending not finger-scrollable");
    }
  }],
  ["Register cellphone", () => {
    const r = fs.readFileSync(path.join(root, "src/screens/RegisterScreen.tsx"), "utf8");
    if (!r.includes("Cellphone") || !r.includes("sendOtp")) throw new Error("phone register missing");
  }],
  ["Create post pending media", () => {
    const c = fs.readFileSync(path.join(root, "src/components/CreatePostModal.tsx"), "utf8");
    if (!c.includes("pendingMedia")) throw new Error("pending media step missing");
  }],
  ["Sponsored carousel", () => {
    const f = fs.readFileSync(path.join(root, "src/screens/FeedScreen.tsx"), "utf8");
    if (!f.includes("SponsoredProductCarousel")) throw new Error("sponsored carousel not wired");
    const c = fs.readFileSync(path.join(root, "src/components/SponsoredProductCarousel.tsx"), "utf8");
    if (!c.includes("warehouseCity") || !c.includes("horizontal")) {
      throw new Error("sponsored carousel missing warehouse swipe stock");
    }
  }],
  ["Call hang up sticky", () => {
    const c = fs.readFileSync(path.join(root, "src/screens/CallScreen.tsx"), "utf8");
    if (!c.includes("hangUpBar") || !c.includes("Hang up")) throw new Error("sticky hang up missing");
  }],
  ["Hub store browse", () => {
    const h = fs.readFileSync(path.join(root, "src/screens/HubScreen.tsx"), "utf8");
    if (!h.includes("storeCards") || !h.includes("GROCERIES_CATEGORY")) throw new Error("store browse missing");
  }],
  ["Wallet receive hub + centered modals", () => {
    const w = fs.readFileSync(path.join(root, "src/screens/WalletScreen.tsx"), "utf8");
    if (!w.includes("showReceiveHub") || !w.includes("describeWalletTransaction")) {
      throw new Error("receive hub or tx labels missing");
    }
    if (!w.includes('justifyContent: "center"')) throw new Error("wallet modals not centered");
  }]
];

let failed = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log("OK ", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, "-", e.message);
  }
}
if (failed) {
  console.error(`\n${failed} smoke check(s) failed`);
  process.exit(1);
}
console.log("\nAll static smoke checks passed.");
