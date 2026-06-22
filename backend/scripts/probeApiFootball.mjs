/**
 * Probe API-Sports key + account quota (no secrets printed).
 */
import dotenv from "dotenv";
import path from "path";
import axios from "axios";

dotenv.config({ path: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../.env") });

const key = String(process.env.API_FOOTBALL_API_KEY || process.env.API_FOOTBALL_KEY || "").trim();
const creator = String(process.env.API_FOOTBALL_TV_CREATOR_USERNAME || "worldofsport").trim();
const loopMin = String(process.env.API_FOOTBALL_LOOP_MINUTES || "0").trim();

async function main() {
  console.log("API-Football probe");
  console.log("  API_FOOTBALL_API_KEY:", key ? `set (${key.length} chars)` : "MISSING");
  console.log("  API_FOOTBALL_TV_CREATOR_USERNAME:", creator);
  console.log("  API_FOOTBALL_LOOP_MINUTES:", loopMin || "0 (single run only)");

  if (!key) {
    process.exit(1);
  }

  try {
    const status = await axios.get("https://v3.football.api-sports.io/status", {
      headers: { "x-apisports-key": key },
      timeout: 20000,
    });
    const acc = status.data?.response?.account || {};
    const reqs = status.data?.response?.requests || {};
    console.log("\nAccount status:");
    console.log("  plan:", acc.plan || "?");
    console.log("  active:", acc.active);
    console.log("  requests today:", `${reqs.current ?? "?"} / ${reqs.limit_day ?? "?"}`);
    console.log("  requests this minute:", `${reqs.current_minute ?? "?"} / ${reqs.limit_minute ?? "?"}`);
  } catch (e) {
    const msg = e?.response?.data?.errors || e?.response?.data?.message || e?.message;
    console.error("\nStatus check failed:", JSON.stringify(msg));
    process.exit(1);
  }

  try {
    const live = await axios.get("https://v3.football.api-sports.io/fixtures", {
      headers: { "x-apisports-key": key },
      params: { live: "all" },
      timeout: 20000,
    });
    const n = Array.isArray(live.data?.response) ? live.data.response.length : 0;
    console.log("\nLive fixtures now:", n);
    if (n > 0) {
      const sample = live.data.response.slice(0, 3).map((r) => {
        const h = r?.teams?.home?.name || "?";
        const a = r?.teams?.away?.name || "?";
        const g = r?.goals;
        const sc = typeof g?.home === "number" ? `${g.home}-${g.away}` : "vs";
        return `${h} ${sc} ${a}`;
      });
      for (const s of sample) console.log("  -", s);
    }
  } catch (e) {
    console.error("Live fixtures failed:", e?.response?.data?.errors || e?.message);
  }
}

main();
