#!/usr/bin/env node
/**
 * Create (or reuse) the Twilio Content template used as WhatsApp fallback for
 * food/grocery merchant order alerts outside the 24h session window.
 *
 * Variables (must match foodOrderSettlement.ts contentVariables):
 *   1 = storeName
 *   2 = orderNumber
 *   3 = buyerName
 *   4 = itemSummary
 *
 * Usage (from backend/):
 *   node scripts/createWaOrderAlertContentTemplate.mjs
 *   node scripts/createWaOrderAlertContentTemplate.mjs --submit-only HX...
 *   node scripts/createWaOrderAlertContentTemplate.mjs --status HX...
 *
 * Writes SID to stdout; does not modify .env unless --write-env is passed.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

/** Bump when Meta rejects and we must create a new Content resource (HX…). */
const TEMPLATE_VERSION = "v2";
const FRIENDLY_NAME = `food_grocery_merchant_order_alert_${TEMPLATE_VERSION}`;
const APPROVAL_NAME = `food_grocery_merchant_order_alert_${TEMPLATE_VERSION}`;
const LANGUAGE = "en";

/** Sample defaults shown to Meta during approval review. */
const VARIABLES = {
  "1": "Sunrise Cafe",
  "2": "ORD-12345",
  "3": "Thabo Molefe",
  "4": "2x Beef burger, 1x Chips (Collection)",
};

/**
 * Meta rejects templates that start or end with a variable (subCode 2388299).
 * Keep fixed text at both ends; variables match foodOrderSettlement.ts (1–4).
 */
const BODY = [
  "Qwertymates paid order for store {{1}}.",
  "Order number: {{2}}.",
  "Customer: {{3}}.",
  "Items: {{4}}.",
  "Please open QwertyHub Shop Orders to prepare this order.",
].join("\n");

function args() {
  const a = process.argv.slice(2);
  return {
    submitOnly: a.includes("--submit-only") ? a[a.indexOf("--submit-only") + 1] : null,
    status: a.includes("--status") ? a[a.indexOf("--status") + 1] : null,
    writeEnv: a.includes("--write-env"),
    skipSubmit: a.includes("--skip-submit"),
  };
}

function authHeader() {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing in backend/.env");
  }
  return {
    sid,
    header: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
  };
}

async function twilioJson(method, url, body) {
  const { header } = authHeader();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: header,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Twilio ${method} ${url} → ${res.status}: ${text.slice(0, 800)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function listMatching() {
  const j = await twilioJson(
    "GET",
    "https://content.twilio.com/v1/ContentAndApprovals?PageSize=100"
  );
  const items = j.contents || [];
  return items.filter((c) => String(c.friendly_name || "") === FRIENDLY_NAME);
}

async function createContent() {
  return twilioJson("POST", "https://content.twilio.com/v1/Content", {
    friendly_name: FRIENDLY_NAME,
    language: LANGUAGE,
    variables: VARIABLES,
    types: {
      "twilio/text": { body: BODY },
    },
  });
}

async function submitApproval(contentSid) {
  return twilioJson(
    "POST",
    `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
    {
      name: APPROVAL_NAME,
      category: "UTILITY",
      allow_category_change: true,
    }
  );
}

async function fetchApproval(contentSid) {
  return twilioJson(
    "GET",
    `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`
  );
}

function upsertLocalEnv(contentSid) {
  const envPath = path.join(backendRoot, ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}`);
  }
  const raw = fs.readFileSync(envPath, "utf8");
  const line = `TWILIO_WA_ORDER_ALERT_CONTENT_SID=${contentSid}`;
  const re = /^TWILIO_WA_ORDER_ALERT_CONTENT_SID=.*$/m;
  let next;
  if (re.test(raw)) {
    next = raw.replace(re, line);
  } else {
    const pad = raw.endsWith("\n") || !raw.length ? "" : "\n";
    next = `${raw}${pad}\n# Food/grocery merchant WA order alert (Content template)\n${line}\n`;
  }
  fs.writeFileSync(envPath, next, "utf8");
  console.log(`Updated local backend/.env with TWILIO_WA_ORDER_ALERT_CONTENT_SID=${contentSid}`);
}

async function main() {
  const opts = args();

  if (opts.status) {
    const appr = await fetchApproval(opts.status);
    console.log(JSON.stringify(appr, null, 2));
    return;
  }

  if (opts.submitOnly) {
    const sid = opts.submitOnly;
    console.log(`Submitting ${sid} for WhatsApp UTILITY approval…`);
    try {
      const appr = await submitApproval(sid);
      console.log("Approval response:", JSON.stringify(appr, null, 2));
    } catch (e) {
      console.error(e.message || e);
      if (e.body) console.error(JSON.stringify(e.body, null, 2));
      process.exit(1);
    }
    const status = await fetchApproval(sid);
    console.log("Current status:", JSON.stringify(status, null, 2));
    if (opts.writeEnv) upsertLocalEnv(sid);
    console.log(`CONTENT_SID=${sid}`);
    return;
  }

  const existing = await listMatching();
  let content;
  const approved = existing.find(
    (c) => String(c.approval_requests?.status || "").toLowerCase() === "approved"
  );
  const pending = existing.find((c) =>
    ["pending", "received", "submitted"].includes(
      String(c.approval_requests?.status || "").toLowerCase()
    )
  );
  const forceNew = process.argv.includes("--force-new");

  if (!forceNew && approved) {
    content = approved;
    console.log(`Reusing approved template ${content.sid}`);
  } else if (!forceNew && pending) {
    content = pending;
    console.log(
      `Reusing pending template ${content.sid} (status=${content.approval_requests?.status})`
    );
  } else if (!forceNew && existing.length) {
    const usable = existing.find((c) => {
      const s = String(c.approval_requests?.status || "").toLowerCase();
      return s !== "rejected" && s !== "paused" && s !== "disabled";
    });
    if (usable) {
      content = usable;
      console.log(
        `Reusing existing template ${content.sid} (status=${content.approval_requests?.status || "unsubmitted"})`
      );
    }
  }

  if (!content) {
    console.log(`Creating Content template (${FRIENDLY_NAME})…`);
    content = await createContent();
    console.log(`Created ${content.sid}`);
  }

  const sid = content.sid;
  if (!opts.skipSubmit) {
    const statusNow = String(content.approval_requests?.status || "").toLowerCase();
    if (statusNow === "approved") {
      console.log("Already Meta-approved — skip submit.");
    } else if (["pending", "received", "submitted"].includes(statusNow)) {
      console.log(`Approval already ${statusNow} — skip re-submit.`);
    } else {
      console.log("Submitting for WhatsApp UTILITY approval…");
      try {
        const appr = await submitApproval(sid);
        console.log("Approval submit:", JSON.stringify(appr, null, 2));
      } catch (e) {
        console.error("Approval submit failed:", e.message || e);
        if (e.body) console.error(JSON.stringify(e.body, null, 2));
        // Still wire SID so env is ready once Meta approves.
      }
    }
  }

  const status = await fetchApproval(sid);
  console.log("Approval status:", JSON.stringify(status, null, 2));

  if (opts.writeEnv) upsertLocalEnv(sid);

  console.log(`CONTENT_SID=${sid}`);
  console.log(
    `WA_APPROVAL_STATUS=${status?.whatsapp?.status || content.approval_requests?.status || "unknown"}`
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
