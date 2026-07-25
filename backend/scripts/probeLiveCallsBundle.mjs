/**
 * Probe production /calls HTML + JS chunks for isStaleCallStatus / old broken chunk.
 */
import https from "https";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers })
        );
      })
      .on("error", reject);
  });
}

const base = "https://www.qwertymates.com";
const page = await get(`${base}/calls?nocache=${Date.now()}`);
console.log("calls page", page.status, "bytes", page.body.length);
console.log("cache-control", page.headers["cache-control"]);
console.log("snippet:", page.body.slice(0, 800).replace(/\s+/g, " "));

const patterns = [
  /\/_next\/static\/[^"'\\\s>]+/g,
  /_next\/static\/chunks\/[^"'\\\s>]+/g,
  /"\/_next\/[^"]+"/g,
];
let found = new Set();
for (const re of patterns) {
  for (const m of page.body.matchAll(re)) found.add(m[0].replace(/^"|"$/g, ""));
}
console.log("asset refs", found.size);
[...found].slice(0, 25).forEach((x) => console.log(" ", x));

const scripts = [...found].filter((x) => x.includes(".js"));
let hits = 0;
let oldBroken = 0;
for (const path of scripts) {
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const r = await get(url);
  if (path.includes("0oghf4blu") || (r.body && r.body.includes("isStaleCallStatus") && !r.body.includes("calling"))) {
    // keep scanning
  }
  if (r.body.includes("isStaleCallStatus")) {
    hits += 1;
    const hasImportOrDef =
      /from\s*["'][^"']*callStatus/.test(r.body) ||
      /function isStaleCallStatus/.test(r.body) ||
      /isStaleCallStatus\s*=/.test(r.body) ||
      /exports\.isStaleCallStatus/.test(r.body);
    console.log("HIT isStaleCallStatus", path, "defish", hasImportOrDef);
  }
  if (path.includes("0oghf4blu~460")) {
    oldBroken += 1;
    console.log("OLD chunk still referenced:", path);
  }
}
console.log("summary hits", hits, "oldBrokenRefs", oldBroken);

// Directly try the old chunk the user keeps hitting
const old = await get(`${base}/_next/static/chunks/0oghf4blu~460.js`).catch(() => null);
if (old) console.log("direct old chunk status", old.status, "bytes", old.body?.length || 0);
else console.log("direct old chunk not fetchable");
