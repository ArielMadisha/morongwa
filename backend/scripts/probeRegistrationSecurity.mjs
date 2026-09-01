#!/usr/bin/env node
/**
 * Lightweight public registration / auth security probes (read-only + safe rejects).
 *   node scripts/probeRegistrationSecurity.mjs
 */
const API = (process.env.API_BASE || "https://api.qwertymates.com/api").replace(/\/$/, "");

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 300) };
}

async function main() {
  const findings = [];

  // 1) Reserved / fake domain must be rejected
  const fake = await post("/auth/register", {
    name: "Probe User",
    email: "priyanka_test@example.com",
    password: "11111111",
    dateOfBirth: "1995-01-01",
    role: ["client"],
  });
  findings.push({
    id: "block-example-com",
    ok: fake.status >= 400,
    detail: `status=${fake.status} msg=${fake.json?.message || fake.json?.error || fake.text}`,
  });

  // 2) Email register without emailToken must be rejected
  const noToken = await post("/auth/register", {
    name: "Probe User",
    email: `probe_${Date.now()}@gmail.com`,
    password: "11111111",
    dateOfBirth: "1995-01-01",
    role: ["client"],
  });
  findings.push({
    id: "require-email-token",
    ok: noToken.status >= 400,
    detail: `status=${noToken.status} msg=${noToken.json?.message || noToken.json?.error || noToken.text}`,
  });

  // 3) Disposable domain blocked at send-email-otp
  const disp = await post("/auth/send-email-otp", { email: "someone@mailinator.com" });
  findings.push({
    id: "block-mailinator-otp",
    ok: disp.status >= 400,
    detail: `status=${disp.status} msg=${disp.json?.message || disp.json?.error || disp.text}`,
  });

  // 4) Basic headers on public site
  const www = await fetch("https://www.qwertymates.com/");
  const csp = www.headers.get("content-security-policy") || "";
  const xfo = www.headers.get("x-frame-options") || "";
  findings.push({
    id: "www-security-headers",
    ok: www.status === 200 && Boolean(csp || xfo),
    detail: `status=${www.status} csp=${csp ? "yes" : "no"} xfo=${xfo || "none"}`,
  });

  const failed = findings.filter((f) => !f.ok);
  console.log(JSON.stringify({ api: API, findings, failed: failed.length }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
