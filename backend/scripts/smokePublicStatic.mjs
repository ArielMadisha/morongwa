/**
 * Verify public site serves HTML + referenced _next/static assets (no 502).
 * Run: cd backend && node scripts/smokePublicStatic.mjs
 */
const ORIGIN = (process.env.SMOKE_ORIGIN || "https://www.qwertymates.com").replace(/\/$/, "");

async function head(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "follow" });
  return res.status;
}

async function main() {
  const paths = ["/", "/wall", "/login"];
  for (const p of paths) {
    const code = await head(`${ORIGIN}${p}`);
    if (code !== 200) {
      console.error(`FAIL ${p} -> ${code}`);
      process.exit(1);
    }
    console.log(`OK ${p} -> ${code}`);
  }

  const html = await (await fetch(`${ORIGIN}/`, { headers: { "Cache-Control": "no-cache" } })).text();
  const chunks = [...new Set(html.match(/_next\/static\/chunks\/[^" ]+\.js/g) || [])].slice(0, 15);
  if (!chunks.length) {
    console.error("FAIL: no JS chunks found in homepage HTML");
    process.exit(1);
  }
  for (const rel of chunks) {
    const code = await head(`${ORIGIN}/${rel}`);
    if (code !== 200) {
      console.error(`FAIL ${rel} -> ${code}`);
      process.exit(1);
    }
    console.log(`OK ${rel} -> ${code}`);
  }
  const css = html.match(/_next\/static\/chunks\/[^" ]+\.css/);
  if (css) {
    const code = await head(`${ORIGIN}/${css[0]}`);
    if (code !== 200) {
      console.error(`FAIL ${css[0]} -> ${code}`);
      process.exit(1);
    }
    console.log(`OK ${css[0]} -> ${code}`);
  }
  console.log("Public static smoke passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
