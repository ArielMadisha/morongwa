/**
 * Smoke test: GET /api/admin/wa-premenu-advert (WhatsApp pre-menu advert config).
 *
 * Usage:
 *   ADMIN_JWT=<bearer> node scripts/smokeWaPremenuAdvert.mjs
 *   or
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smokeWaPremenuAdvert.mjs
 *
 * Env:
 *   SMOKE_API_BASE — default https://api.qwertymates.com/api
 */

const base = (process.env.SMOKE_API_BASE || "https://api.qwertymates.com/api").replace(/\/$/, "");

async function postJson(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function getJson(path, token) {
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

(async () => {
  let token = String(process.env.ADMIN_JWT || "").trim();
  if (!token) {
    const email = String(process.env.ADMIN_EMAIL || "").trim();
    const password = String(process.env.ADMIN_PASSWORD || "").trim();
    if (!email || !password) {
      console.log("Skip: set ADMIN_JWT or ADMIN_EMAIL+ADMIN_PASSWORD to hit GET /admin/wa-premenu-advert.");
      console.log("Example: ADMIN_JWT=eyJ... node scripts/smokeWaPremenuAdvert.mjs");
      process.exit(0);
    }
    const login = await postJson("/auth/login", { email, password });
    if (login.status !== 200 || !login.body?.token) {
      console.error("Login failed", login.status, login.body);
      process.exit(1);
    }
    token = login.body.token;
    console.log("OK: logged in as", email);
  } else {
    console.log("OK: using ADMIN_JWT");
  }

  const r = await getJson("/admin/wa-premenu-advert", token);
  if (r.status !== 200) {
    console.error("GET /admin/wa-premenu-advert failed", r.status, r.body);
    process.exit(1);
  }
  const data = r.body?.data;
  if (!data || typeof data.tier !== "string" || typeof data.campaignMode !== "string") {
    console.error("Unexpected payload", r.body);
    process.exit(1);
  }
  console.log("OK: wa-premenu-advert", { tier: data.tier, campaignMode: data.campaignMode });
  console.log(
    "Manual WA check: open WhatsApp to your bot, pick a menu option other than 1/2/8 (e.g. 5), confirm pre-roll matches Admin → Adverts tier (bronze text vs silver/gold media then menu)."
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
