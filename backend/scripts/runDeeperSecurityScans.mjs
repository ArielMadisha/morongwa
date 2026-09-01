#!/usr/bin/env node
/**
 * Deeper security scan pack (owner-scheduled):
 *  - HTTP health / security header spot-checks
 *  - Registration security probes
 *  - OWASP ZAP baseline (Docker) against public site + API
 *  - Paid bug-bounty launch checklist (owner action — no auto-spend)
 *
 * Usage:
 *   node scripts/runDeeperSecurityScans.mjs
 *   node scripts/runDeeperSecurityScans.mjs --skip-zap
 *   node scripts/runDeeperSecurityScans.mjs --no-email
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(__dirname, "..");
dotenv.config({ path: path.join(BACKEND, ".env") });

const EXPORTS = path.join(BACKEND, "exports");
const OUT_DIR = path.join(EXPORTS, "deeper-security-scans");
const LOG_PATH = path.join(EXPORTS, "deeper-security-scan-task.log");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

const SKIP_ZAP = process.argv.includes("--skip-zap");
const NO_EMAIL = process.argv.includes("--no-email");

function log(line) {
  const row = `[${new Date().toISOString()}] ${line}`;
  console.log(row);
  try {
    fs.mkdirSync(EXPORTS, { recursive: true });
    fs.appendFileSync(LOG_PATH, row + "\n", "utf8");
  } catch {
    /* ignore */
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: false,
    ...opts
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    error: r.error ? String(r.error.message || r.error) : ""
  };
}

async function fetchHeaders(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Qwertymates-DeeperSecurityScan/1.0" }
    });
    const interesting = [
      "strict-transport-security",
      "content-security-policy",
      "x-content-type-options",
      "x-frame-options",
      "referrer-policy",
      "permissions-policy",
      "server"
    ];
    const headers = {};
    for (const k of interesting) {
      const v = res.headers.get(k);
      if (v) headers[k] = v;
    }
    return { url, status: res.status, ok: res.ok, headers };
  } catch (err) {
    return { url, status: 0, ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

function runRegistrationProbes() {
  const script = path.join(__dirname, "probeRegistrationSecurity.mjs");
  if (!fs.existsSync(script)) {
    return { skipped: true, reason: "probeRegistrationSecurity.mjs missing" };
  }
  const r = run(process.execPath, [script], { cwd: BACKEND, env: process.env });
  return {
    skipped: false,
    status: r.status,
    stdout: (r.stdout || "").slice(-4000),
    stderr: (r.stderr || "").slice(-2000),
    error: r.error
  };
}

function dockerAvailable() {
  const r = run("docker", ["version", "--format", "{{.Server.Version}}"]);
  return r.status === 0 && !r.error;
}

function zapBaseline(targetUrl, label) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const reportJson = `zap-${label}-${STAMP}.json`;
  const reportHtml = `zap-${label}-${STAMP}.html`;
  // Baseline is intentionally time-boxed; fail open so other targets still run.
  const args = [
    "run",
    "--rm",
    "-v",
    `${OUT_DIR}:/zap/wrk/:rw`,
    "-t",
    "ghcr.io/zaproxy/zaproxy:stable",
    "zap-baseline.py",
    "-t",
    targetUrl,
    "-J",
    reportJson,
    "-r",
    reportHtml,
    "-m",
    "3",
    "-I"
  ];
  log(`ZAP baseline start: ${targetUrl}`);
  const r = run("docker", args, {
    cwd: BACKEND,
    env: process.env,
    timeout: 25 * 60 * 1000
  });
  const jsonPath = path.join(OUT_DIR, reportJson);
  const htmlPath = path.join(OUT_DIR, reportHtml);
  return {
    targetUrl,
    label,
    status: r.status,
    error: r.error,
    stderrTail: (r.stderr || "").slice(-2500),
    stdoutTail: (r.stdout || "").slice(-2500),
    reportJson: fs.existsSync(jsonPath) ? jsonPath : null,
    reportHtml: fs.existsSync(htmlPath) ? htmlPath : null
  };
}

function bountyChecklist() {
  return [
    "Confirm scope: www.qwertymates.com, api.qwertymates.com, mobile apps (exclude admin unless invited).",
    "Choose platform: HackerOne / Bugcrowd / Intigriti (paid program requires billing on that platform).",
    "Publish brief + in-scope assets + out-of-scope (DoS, social eng, third-party CJ/PayGate).",
    "Set severity payout table (Critical → Low) and SLA for triage.",
    "Enable safe harbor language and require report before public disclosure.",
    "After launch: triage weekly; patch Critical/High within 7 days when feasible.",
    "Do NOT auto-charge cards from this job — paid bounty needs owner login + budget approval."
  ];
}

async function sendOpsEmail(reportPath) {
  const mailer = path.join(__dirname, "sendPlatformOpsEmail.mjs");
  const r = run(
    process.execPath,
    [
      mailer,
      "--subject",
      `[Qwertymates] Deeper security scans ${new Date().toISOString().slice(0, 10)}`,
      "--file",
      reportPath
    ],
    { cwd: BACKEND, env: process.env }
  );
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log("=== Deeper security scans start ===");

  const headerChecks = [];
  for (const url of [
    "https://www.qwertymates.com/",
    "https://www.qwertymates.com/wall",
    "https://api.qwertymates.com/api/health"
  ]) {
    const row = await fetchHeaders(url);
    headerChecks.push(row);
    log(`HTTP ${row.status} ${url}${row.error ? ` err=${row.error}` : ""}`);
  }

  log("Running registration security probes…");
  const probes = runRegistrationProbes();

  const zapResults = [];
  if (SKIP_ZAP) {
    log("Skipping ZAP (--skip-zap)");
  } else if (!dockerAvailable()) {
    log("Docker not available — ZAP skipped");
    zapResults.push({ skipped: true, reason: "docker unavailable" });
  } else {
    const zapTargets = [
      { url: "https://www.qwertymates.com", label: "www" },
      { url: "https://api.qwertymates.com", label: "api" }
    ];
    for (const t of zapTargets) {
      try {
        zapResults.push(zapBaseline(t.url, t.label));
      } catch (err) {
        zapResults.push({
          targetUrl: t.url,
          label: t.label,
          status: 1,
          error: String(err?.message || err)
        });
      }
    }
  }

  const bounty = bountyChecklist();
  const report = {
    startedAt: new Date().toISOString(),
    host: process.env.COMPUTERNAME || process.env.HOSTNAME || "unknown",
    headerChecks,
    registrationProbes: probes,
    zap: zapResults,
    paidBugBountyChecklist: bounty,
    notes: [
      "ZAP baseline is passive/light active — not a full pentest.",
      "Paid bug bounty requires owner action on the bounty platform (no auto-spend from this job)."
    ]
  };

  const jsonPath = path.join(OUT_DIR, `deeper-scan-summary-${STAMP}.json`);
  const txtPath = path.join(OUT_DIR, `deeper-scan-summary-${STAMP}.txt`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [];
  lines.push("Qwertymates — Deeper security scan report");
  lines.push(`When: ${report.startedAt}`);
  lines.push("");
  lines.push("## HTTP / headers");
  for (const h of headerChecks) {
    lines.push(`- ${h.status} ${h.url}`);
    if (h.error) lines.push(`  error: ${h.error}`);
    for (const [k, v] of Object.entries(h.headers || {})) lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  lines.push("## Registration probes");
  if (probes.skipped) lines.push(`skipped: ${probes.reason}`);
  else {
    lines.push(`exit=${probes.status}`);
    if (probes.stdout) lines.push(probes.stdout.trim());
    if (probes.stderr) lines.push(probes.stderr.trim());
  }
  lines.push("");
  lines.push("## OWASP ZAP baseline");
  if (!zapResults.length) lines.push("(none)");
  for (const z of zapResults) {
    if (z.skipped) {
      lines.push(`skipped: ${z.reason}`);
      continue;
    }
    lines.push(`- ${z.label || "?"} ${z.targetUrl} exit=${z.status}`);
    if (z.reportHtml) lines.push(`  html: ${z.reportHtml}`);
    if (z.reportJson) lines.push(`  json: ${z.reportJson}`);
    if (z.error) lines.push(`  error: ${z.error}`);
    if (z.stderrTail) lines.push(`  stderr: ${z.stderrTail.slice(0, 800)}`);
  }
  lines.push("");
  lines.push("## Paid bug bounty (owner action)");
  for (const item of bounty) lines.push(`- [ ] ${item}`);
  lines.push("");
  lines.push(`JSON: ${jsonPath}`);
  lines.push(`Log: ${LOG_PATH}`);

  const body = lines.join("\n");
  fs.writeFileSync(txtPath, body, "utf8");
  log(`Wrote ${txtPath}`);

  if (!NO_EMAIL) {
    log("Sending ops email…");
    const mail = await sendOpsEmail(txtPath);
    log(`Email exit=${mail.status} ${mail.stdout || mail.stderr || mail.error || ""}`.trim());
  } else {
    log("Email skipped (--no-email)");
  }

  log("=== Deeper security scans done ===");
  console.log(body);
}

main().catch((err) => {
  log(`FATAL: ${err?.stack || err}`);
  process.exit(1);
});
