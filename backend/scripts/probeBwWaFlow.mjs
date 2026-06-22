#!/usr/bin/env node
/**
 * Probe Botswana WhatsApp flow: sender wiring, Studio definition parity, credential routing, API smoke.
 */
import "dotenv/config";
import twilio from "twilio";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { resolveWhatsappSendProfile, getBotswanaWhatsappSendProfile } = require("../dist/src/utils/twilioWaCredentials.js");

const SUB_SID = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
const SUB_TOK = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
const PARENT_SID = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const PARENT_TOK = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const SA_FLOW = "FWf34c58aa289c4ea3237d09c423f94ef1";
const BW_FLOW = String(process.env.TWILIO_STUDIO_FLOW_SID_BW || "FW0076f6cf2c8671ca68f7bd2d9a345986").trim();
const BW_FROM = String(process.env.TWILIO_WHATSAPP_FROM_BW || "+26775184537").trim();
const API = (process.env.SMOKE_API_BASE || "https://api.qwertymates.com/api").replace(/\/$/, "");

function summarizeMainMenu(def) {
  const main = def?.states?.find((s) => s.name === "main_menu");
  const body = main?.properties?.body ?? "";
  return { bodyLen: body.length, bodyPreview: JSON.stringify(body).slice(0, 80) };
}

async function fetchFlow(client, sid) {
  const row = await client.studio.v2.flows(sid).fetch();
  const raw = row.definition;
  const def = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
  return { status: row.status, friendlyName: row.friendlyName, def };
}

async function postForm(path, fields) {
  const body = new URLSearchParams(fields).toString();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
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

async function main() {
  console.log("=== Credential routing ===");
  const bwProfile = getBotswanaWhatsappSendProfile();
  console.log("BW profile:", bwProfile ? { from: bwProfile.whatsappFrom, accountSid: bwProfile.accountSid.slice(0, 8) + "…" } : null);
  const resolved = resolveWhatsappSendProfile(
    `whatsapp:+${BW_FROM.replace(/\D/g, "")}`,
    "26771234567",
    SUB_SID
  );
  console.log("resolveWhatsappSendProfile(BW To, +267 user, sub SID):", resolved ? { from: resolved.whatsappFrom, accountSid: resolved.accountSid.slice(0, 8) + "…" } : null);

  console.log("\n=== Studio flows ===");
  if (PARENT_SID && PARENT_TOK) {
    const sa = await fetchFlow(twilio(PARENT_SID, PARENT_TOK), SA_FLOW);
    console.log("SA flow:", sa.status, sa.friendlyName, summarizeMainMenu(sa.def));
  }
  if (SUB_SID && SUB_TOK) {
    const bw = await fetchFlow(twilio(SUB_SID, SUB_TOK), BW_FLOW);
    console.log("BW flow:", bw.status, bw.friendlyName, summarizeMainMenu(bw.def));
  }

  console.log("\n=== API check-user (fake +267 user) ===");
  const digits = BW_FROM.replace(/\D/g, "");
  const check = await postForm("/wa/flow/check-user", {
    phone: "whatsapp:+26771234567",
    waId: "26771234567",
    accountSid: SUB_SID,
    to: `whatsapp:+${digits}`,
    option: "hi",
  });
  console.log("status", check.status, "code", check.body?.code, "menuLen", String(check.body?.menu || "").length);

  console.log("\n=== API menu INVALID (needs registered user for full test) ===");
  const menu = await postForm("/wa/flow/menu", {
    phone: "whatsapp:+26771234567",
    waId: "26771234567",
    accountSid: SUB_SID,
    to: `whatsapp:+${digits}`,
    option: "hi",
  });
  console.log("status", menu.status, "code", menu.body?.code, "msgLen", String(menu.body?.message || "").length);

  const probePhone = String(process.env.WA_PROBE_PHONE || "26775006466").trim();
  if (probePhone) {
    console.log("\n=== Production API registered BW probe ===");
    const check2 = await postForm("/wa/flow/check-user", {
      phone: `whatsapp:+${probePhone}`,
      waId: probePhone,
      accountSid: SUB_SID,
      to: `whatsapp:+${digits}`,
      option: "hi",
    });
    console.log("check-user probe", check2.status, check2.body?.code, "menuLen", String(check2.body?.menu || "").length);
    const menuHi = await postForm("/wa/flow/menu", {
      phone: `whatsapp:+${probePhone}`,
      waId: probePhone,
      accountSid: SUB_SID,
      to: `whatsapp:+${digits}`,
      option: "hi",
    });
    console.log("menu hi probe", menuHi.status, menuHi.body?.code, "msgLen", String(menuHi.body?.message || "").length);
    const menu1 = await postForm("/wa/flow/menu", {
      phone: `whatsapp:+${probePhone}`,
      waId: probePhone,
      accountSid: SUB_SID,
      to: `whatsapp:+${digits}`,
      option: "1",
    });
    console.log("menu 1 probe", menu1.status, menu1.body?.code, "msgLen", String(menu1.body?.message || "").length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
