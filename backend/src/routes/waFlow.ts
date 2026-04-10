import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import axios from "axios";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../data/models/User";
import Wallet from "../data/models/Wallet";
import Payment from "../data/models/Payment";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import ExternalSupplier from "../data/models/ExternalSupplier";
import ResellerWall from "../data/models/ResellerWall";
import Store from "../data/models/Store";
import TVPost from "../data/models/TVPost";
import Cart from "../data/models/Cart";
import MoneyRequest from "../data/models/MoneyRequest";
import MerchantAgentCashTx from "../data/models/MerchantAgentCashTx";
import WaConversationState from "../data/models/WaConversationState";
import { normalizePhone } from "../utils/phoneValidation";
import { getFxRates } from "../services/fxService";
import { logger } from "../services/monitoring";
import { slugify } from "../utils/helpers";
import { initiatePayment } from "../services/payment";
import { sendSms } from "../services/otpDelivery";
import { normalizeWaPublicLinkUrl } from "../utils/waSignedLink";
import { generateMoneyRequestActionToken, settleMoneyRequestFromWallet, initiateTopupForMoneyRequest } from "../services/moneyRequestService";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.qwertymates.com";
const API_PUBLIC_URL = process.env.BACKEND_URL || "https://api.qwertymates.com";
const LEGACY_MOCHINA_API_BASE = String(process.env.LEGACY_MOCHINA_API_BASE || "http://165.227.237.142:9113").replace(/\/$/, "");
/** Default markup % shown in QwertyHub WA cards and share prefills (must stay within RESELL 3–7 handler). */
const DEFAULT_RESELL_MARKUP_PCT = 3;
const WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER = 100;
const WA_WALLET_INACTIVITY_TIMEOUT_MIN = 3;
const WA_PENDING_CONTINUE_TTL_MS = 60 * 60 * 1000;
const WA_PENDING_CONTINUE_SCOPE = "wa_pending_continue";
const WA_PENDING_CONTINUE_STEP = "resume_command";

function waPhoneToDigits(input: string): string {
  const raw = String(input || "").trim().replace(/^whatsapp:/i, "");
  let digits = normalizePhone(raw);
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  return digits;
}

function waEmailFromPhoneDigits(phoneDigits: string): string {
  return `wa_${phoneDigits}@morongwa.local`;
}

function waPendingContinuePhoneKey(phoneInput: string): mongoose.Types.ObjectId | null {
  const phoneDigits = waPhoneToDigits(phoneInput);
  if (!phoneDigits) return null;
  const hex = crypto.createHash("sha1").update(`wa-pending:${phoneDigits}`).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

async function setWaPendingContinueAction(phoneInput: string, command: string): Promise<void> {
  const cmd = String(command || "").replace(/\s+/g, " ").trim();
  if (!cmd) return;
  const phoneKey = waPendingContinuePhoneKey(phoneInput);
  if (!phoneKey) return;
  await WaConversationState.findOneAndUpdate(
    { user: phoneKey, scope: WA_PENDING_CONTINUE_SCOPE },
    {
      $set: {
        step: WA_PENDING_CONTINUE_STEP,
        payload: { command: cmd },
        expiresAt: new Date(Date.now() + WA_PENDING_CONTINUE_TTL_MS),
      },
    },
    { upsert: true, new: true }
  );
}

async function getWaPendingContinueAction(phoneInput: string): Promise<string> {
  const phoneKey = waPendingContinuePhoneKey(phoneInput);
  if (!phoneKey) return "";
  const st = await WaConversationState.findOne({
    user: phoneKey,
    scope: WA_PENDING_CONTINUE_SCOPE,
  }).lean();
  if (!st) return "";
  if (new Date(st.expiresAt).getTime() <= Date.now()) {
    await WaConversationState.deleteOne({ _id: (st as any)._id });
    return "";
  }
  return String((st as any)?.payload?.command || "").trim();
}

async function clearWaPendingContinueAction(phoneInput: string): Promise<void> {
  const phoneKey = waPendingContinuePhoneKey(phoneInput);
  if (!phoneKey) return;
  await WaConversationState.deleteOne({ user: phoneKey, scope: WA_PENDING_CONTINUE_SCOPE });
}

function calculateAge(dateOfBirth?: Date): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

async function findWaUserByPhone(phoneInput: string) {
  const phoneDigits = waPhoneToDigits(phoneInput);
  if (!phoneDigits) return null;
  const waEmail = waEmailFromPhoneDigits(phoneDigits);
  return User.findOne({
    $or: [{ phone: phoneDigits }, { email: waEmail }],
  });
}

function extractPhoneFromBody(body: any): string {
  const candidates = [
    body?.phone,
    body?.from,
    body?.From,
    body?.waFrom,
    body?.wa_from,
    body?.sender,
    body?.Sender,
  ];
  for (const val of candidates) {
    const s = String(val || "").trim();
    if (s) return s;
  }
  return "";
}

function getTwilioWaConfig() {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const fromRaw = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
  const from = fromRaw ? (fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`) : "";
  if (!sid || !token || !from) return null;
  return { client: twilio(sid, token), from };
}

type WaMediaCard = { mediaUrl: string; caption: string };

const QWERTYHUB_SELL_MEDIA_LIMIT = 10;
const QWERTYHUB_MARKETPLACE_MEDIA_LIMIT = 50;
const QWERTYHUB_MEDIA_SEND_GAP_MS = 2200;
const QWERTYHUB_MENU_AFTER_MEDIA_BASE_MS = 90000;
const QWERTYHUB_MENU_AFTER_MEDIA_PER_CARD_MS = 8000;
const QWERTYHUB_FALLBACK_IMAGE_URL = `${FRONTEND_URL.replace(/\/$/, "")}/qwertymates-logo-icon.png`;

function computeQwertyHubMenuDelayMs(cardCount: number): number {
  const safeCount = Number.isFinite(cardCount) ? Math.max(0, Math.floor(cardCount)) : 0;
  if (safeCount <= 0) return 300;
  return QWERTYHUB_MENU_AFTER_MEDIA_BASE_MS + safeCount * QWERTYHUB_MENU_AFTER_MEDIA_PER_CARD_MS;
}

async function sendWhatsAppMediaGallery(
  phoneInput: string,
  mediaCards: WaMediaCard[],
  opts?: { limit?: number; gapMs?: number }
): Promise<void> {
  const cfg = getTwilioWaConfig();
  if (!cfg) return;
  const digits = waPhoneToDigits(phoneInput);
  if (!digits) return;
  const to = `whatsapp:+${digits}`;
  const limit = Number.isFinite(Number(opts?.limit)) ? Math.max(1, Math.floor(Number(opts?.limit))) : QWERTYHUB_SELL_MEDIA_LIMIT;
  const gapMs = Number.isFinite(Number(opts?.gapMs)) ? Math.max(0, Math.floor(Number(opts?.gapMs))) : QWERTYHUB_MEDIA_SEND_GAP_MS;
  const normalized: WaMediaCard[] = mediaCards
    .map((c) => ({ mediaUrl: String(c?.mediaUrl || "").trim(), caption: String(c?.caption || "").trim() }))
    .filter((c) => Boolean(c.mediaUrl))
    .slice(0, limit);
  for (let i = 0; i < normalized.length; i++) {
    const card = normalized[i];
    await cfg.client.messages.create({
      from: cfg.from,
      to,
      mediaUrl: [card.mediaUrl],
      body: card.caption || "QwertyHub product preview",
    });
    if (i < normalized.length - 1) {
      await delay(gapMs);
    }
  }
}

async function sendWhatsAppText(phoneInput: string, text: string): Promise<void> {
  const cfg = getTwilioWaConfig();
  if (!cfg) return;
  const digits = waPhoneToDigits(phoneInput);
  if (!digits) return;
  const to = `whatsapp:+${digits}`;
  const body = String(text || "").trim();
  if (!body) return;
  await cfg.client.messages.create({
    from: cfg.from,
    to,
    body,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalize WhatsApp keycap digits (e.g. 2️⃣) so menu routing matches case "2". */
function normalizeWaMenuDigitInput(raw: string): string {
  const s = String(raw || "").trim().replace(/\uFE0F/g, "");
  const keycap = s.match(/^([0-9])\u20E3$/);
  if (keycap) return keycap[1];
  return s;
}

/**
 * QwertyHub (options 1 & 2): intro + product images + main menu are sent only via Twilio REST API in order.
 * Studio uses code SELL_INFO_SILENT + invisible body so it does not send the long intro (which caused menu
 * to appear mid-thread via main_menu_response → main_menu) or duplicate text before REST messages.
 */
function _scheduleQwertyHubMediaThenMainMenu(params: {
  phone: string;
  cards: WaMediaCard[];
  introText: string;
  menuText: string;
  logLabel: string;
}): void {
  void (async () => {
    const { phone, cards, introText, menuText, logLabel } = params;
    try {
      await delay(500);
      const intro = String(introText || "").trim();
      const menu = String(menuText || "").trim();
      if (!cards.length) {
        if (intro) await sendWhatsAppText(phone, intro);
        await delay(300);
        if (menu) await sendWhatsAppText(phone, menu);
        return;
      }
      if (intro) await sendWhatsAppText(phone, intro);
      await sendWhatsAppMediaGallery(phone, cards);
      await delay(computeQwertyHubMenuDelayMs(cards.length));
      if (menu) await sendWhatsAppText(phone, menu);
    } catch (err) {
      logger.warn("QwertyHub follow-up sequence failed", {
        logLabel,
        error: String((err as any)?.message || err),
      });
    }
  })();
}

function getTwilioWhatsAppFromDigits(): string {
  const fromRaw = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
  return fromRaw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

/** Same as your working screenshot: `https://wa.me/<digits>?text=CART…` / `RESELL…` — prefills the chat box. */
function waMeBotLink(waDigits: string, plainTextCommand: string): string {
  const d = String(waDigits || "").replace(/\D/g, "");
  if (!d) return "";
  return `https://wa.me/${d}?text=${encodeURIComponent(plainTextCommand.trim())}`;
}

/** If the business number is not configured, never fall back to marketplace URLs — stay in WhatsApp. */
function waChatCommandFallback(kind: "cart" | "resell", shortCode: string, n: number): string {
  if (kind === "cart") return `Reply in this chat: CART ADD ${shortCode} ${n}`;
  return `Reply in this chat: RESELL ${shortCode} ${n}`;
}

function buildUnregisteredGuidedMessage(commandToContinue: string): string {
  const continueCmd = String(commandToContinue || "").replace(/\s+/g, " ").trim();
  const waFromDigits = getTwilioWhatsAppFromDigits();
  const registerLink = ensurePublicWaLink(waMeBotLink(waFromDigits, "REGISTER"));
  const continueLink = continueCmd ? ensurePublicWaLink(waMeBotLink(waFromDigits, continueCmd)) : "";
  return [
    "User not registered.",
    "Please register first, then continue from the same WhatsApp flow:",
    "",
    registerLink ? `1) Tap to register: ${registerLink}` : "1) Reply in this chat: REGISTER",
    continueLink ? `2) After registration, tap continue: ${continueLink}` : `2) After registration, reply: ${continueCmd}`,
  ].join("\n");
}

function shouldAttemptPendingContinue(rawInput: string): boolean {
  const normalized = String(rawInput || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "register" || normalized === "continue" || normalized === "start";
}

function detectCurrencyFromPhoneDigits(phoneDigits: string): string {
  const p = String(phoneDigits || "");
  if (p.startsWith("27")) return "ZAR";
  if (p.startsWith("267")) return "BWP";
  if (p.startsWith("264")) return "NAD";
  if (p.startsWith("266")) return "LSL";
  if (p.startsWith("260")) return "ZMW";
  if (p.startsWith("263")) return "ZWL";
  if (p.startsWith("254")) return "KES";
  if (p.startsWith("255")) return "TZS";
  if (p.startsWith("256")) return "UGX";
  if (p.startsWith("250")) return "RWF";
  if (p.startsWith("251")) return "ETB";
  if (p.startsWith("234")) return "NGN";
  if (p.startsWith("233")) return "GHS";
  return "USD";
}

function detectCountryCodeFromPhoneDigits(phoneDigits: string): string {
  const p = String(phoneDigits || "");
  if (p.startsWith("27")) return "ZA";
  if (p.startsWith("267")) return "BW";
  if (p.startsWith("264")) return "NA";
  if (p.startsWith("266")) return "LS";
  if (p.startsWith("268")) return "SZ";
  if (p.startsWith("263")) return "ZW";
  if (p.startsWith("260")) return "ZM";
  return "ZA";
}

function convertAmount(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): number {
  const from = String(fromCurrency || "USD").toUpperCase();
  const to = String(toCurrency || "USD").toUpperCase();
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return Math.round(amount * 100) / 100;
  const fromRate = rates[from] || 1;
  const toRate = rates[to] || 1;
  const amountUsd = amount / fromRate;
  return Math.round(amountUsd * toRate * 100) / 100;
}

/**
 * Resolve source currency for WA cards.
 * External supplier feeds are primarily USD; some rows can be mislabeled as ZAR while value is still USD.
 */
function resolveWaSourceCurrency(product: any): string {
  const raw = String(product?.currency || "").trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(raw) ? raw : "";
  const source = String(product?.supplierSource || "").trim().toLowerCase();
  const price = Number(product?.price || 0);
  const isExternal = source === "cj" || source === "spocket" || source === "eprolo";
  if (!isExternal) return currency || "USD";
  if (!currency) return "USD";
  if (currency === "ZAR" && Number.isFinite(price) && price > 0 && price < 20) return "USD";
  return currency;
}

/** Same base price as web `getEffectivePrice` (discount when set). */
function getEffectiveProductPrice(p: { price?: number; discountPrice?: number }): number {
  const price = Number(p?.price || 0);
  const d = p?.discountPrice;
  if (d != null && Number.isFinite(d) && d >= 0 && d < price) return d;
  return price;
}

/**
 * Prefills WhatsApp with arbitrary text (e.g. buyer-facing `/share/product/...` URL).
 * Uses `wa.me/<business digits>?text=...` when TWILIO_WHATSAPP_FROM is set (same pattern as cart/resell).
 * Never use signed `https://www.../wa/g/...` redirects for this — buyers tap `wa.me` only.
 */
function buildWaMeShareFromText(body: string): string {
  const b = String(body || "").trim();
  if (!b) return "";
  const digits = getTwilioWhatsAppFromDigits();
  const t = encodeURIComponent(b);
  if (digits) return `https://wa.me/${digits}?text=${t}`;
  return `https://wa.me/?text=${t}`;
}

/** Safety: never return localhost/private or raw api.* links to WhatsApp users. */
function ensurePublicWaLink(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  let feOrigin = "https://www.qwertymates.com";
  try {
    const u = new URL(FRONTEND_URL.startsWith("http") ? FRONTEND_URL : `https://${FRONTEND_URL}`);
    feOrigin = u.origin;
  } catch {
    /* keep default */
  }
  const out = raw
    .replace(/^http:\/\/localhost:4000\/api\/wa/i, `${feOrigin}/wa`)
    .replace(/^http:\/\/127\.0\.0\.1:4000\/api\/wa/i, `${feOrigin}/wa`)
    .replace(/^http:\/\/0\.0\.0\.0:4000\/api\/wa/i, `${feOrigin}/wa`);
  return normalizeWaPublicLinkUrl(out);
}

function resolveImageUrl(raw: string): string {
  const val = String(raw || "").trim();
  if (!val) return "";
  if (/^https?:\/\//i.test(val)) return val;
  if (val.startsWith("/")) return `${API_PUBLIC_URL.replace(/\/$/, "")}${val}`;
  return `${API_PUBLIC_URL.replace(/\/$/, "")}/${val}`;
}

function compactText(input: string, maxLen: number): string {
  const t = String(input || "").replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

function stripHtml(input: string): string {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQwertyHubSharePreviewUrl(opts: {
  productSlugOrId: string;
  resellerId?: string;
  resellerCommissionPct?: number;
}): string {
  const base = FRONTEND_URL.replace(/\/$/, "");
  const productId = encodeURIComponent(String(opts.productSlugOrId || "").trim());
  const query = new URLSearchParams();
  if (opts.resellerId) query.set("resellerId", String(opts.resellerId));
  if (opts.resellerCommissionPct != null && Number.isFinite(opts.resellerCommissionPct)) {
    query.set("resellerCommissionPct", String(Math.round(opts.resellerCommissionPct)));
  }
  return `${base}/share/product/${productId}${query.toString() ? `?${query.toString()}` : ""}`;
}

/** Website one-click resell URL: opens product and auto-adds to wall/feed for logged-in user. */
function buildQwertyHubAutoResellUrl(productUrl: string): string {
  const sep = productUrl.includes("?") ? "&" : "?";
  return `${productUrl}${sep}view=resell&autoResell=1&markup=${DEFAULT_RESELL_MARKUP_PCT}`;
}

function buildQwertyHubProductCardCaption(opts: {
  index: number;
  title: string;
  targetCurrency: string;
  price: string;
  descriptionRaw: string;
  shortCode: string;
  resellTapLink: string;
  autoResellUrl: string;
  shareLink?: string;
  buyLink?: string;
  includeResellActions?: boolean;
}): string {
  const maxCaption = 1024;
  let descMax = 420;
  let lastBody = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const description = compactText(opts.descriptionRaw, Math.min(descMax, 520));
    const lines = [
      `📦 ${opts.title}`,
      `💰 ${opts.targetCurrency} ${opts.price}`,
      `📝 Product information: ${description}`,
    ];
    if (opts.buyLink) {
      lines.push("", "*Add to cart*", opts.buyLink);
    }
    if (opts.includeResellActions !== false) {
      lines.push(
        "",
        "*Tap the link below to resell*",
        ...(opts.resellTapLink ? [opts.resellTapLink] : [])
      );
    }
    if (opts.shareLink) {
      lines.push("", "Share to WhatsApp group/channel/contact:", opts.shareLink);
    }
    lastBody = lines.join("\n");
    if (lastBody.length <= maxCaption) return lastBody;
    descMax = Math.max(90, Math.floor(descMax * 0.8));
  }
  return lastBody.length > maxCaption ? `${lastBody.slice(0, maxCaption - 1)}…` : lastBody;
}

async function getResellerQwertyHubPicks(limit = 3): Promise<Array<{ product: any; resellerId: string; markupPct: number }>> {
  const approvedSupplierIds = await getApprovedSupplierIdsForWa();
  const walls = await ResellerWall.find({ "products.0": { $exists: true } })
    .select("resellerId products")
    .lean();
  const flattened: Array<{ resellerId: string; productId: string; markupPct: number }> = [];
  for (const w of walls as any[]) {
    const resellerId = String(w?.resellerId || "").trim();
    for (const p of Array.isArray(w?.products) ? w.products : []) {
      const productId = String(p?.productId || "").trim();
      if (!productId) continue;
      const m = Number(p?.resellerCommissionPct);
      const markupPct = Number.isFinite(m) && m >= 3 && m <= 7 ? Math.round(m) : DEFAULT_RESELL_MARKUP_PCT;
      flattened.push({ resellerId, productId, markupPct });
    }
  }
  if (!flattened.length) return [];
  flattened.sort(() => Math.random() - 0.5);
  const uniqueByProduct = new Map<string, { resellerId: string; markupPct: number }>();
  for (const row of flattened) {
    if (!uniqueByProduct.has(row.productId)) uniqueByProduct.set(row.productId, { resellerId: row.resellerId, markupPct: row.markupPct });
    if (uniqueByProduct.size >= limit * 3) break;
  }
  const ids = Array.from(uniqueByProduct.keys());
  const products = await Product.find({
    _id: { $in: ids },
    active: true,
    allowResell: true,
    outOfStock: { $ne: true },
  })
    .select("title slug description price currency images supplierSource supplierId")
    .lean();

  const allowed = products.filter((p: any) => {
    const src = String(p?.supplierSource || "");
    if (["cj", "spocket", "eprolo"].includes(src)) return true;
    return approvedSupplierIds.some((id: any) => String(id) === String(p?.supplierId));
  });

  const out: Array<{ product: any; resellerId: string; markupPct: number }> = [];
  for (const p of allowed) {
    const key = String((p as any)?._id || "");
    const meta = uniqueByProduct.get(key);
    if (!meta) continue;
    out.push({ product: p, resellerId: meta.resellerId, markupPct: meta.markupPct });
    if (out.length >= limit) break;
  }
  return out;
}

async function addProductToResellerWall(params: {
  user: any;
  product: any;
  resellerCommissionPct: number;
}) {
  const { user, product, resellerCommissionPct } = params;
  let store = await Store.findOne({ userId: user._id, type: "reseller" });
  if (!store) {
    const userDoc = await User.findById(user._id).select("username").lean();
    const username = String((userDoc as any)?.username || "").trim();
    const existingSupplierStore = await Store.findOne({ userId: user._id, type: "supplier" }).lean();
    const baseName = existingSupplierStore?.name ?? (username ? `${username}'s Store` : "My Store");
    const baseSlug = username ? `${username}-store` : "my-store";
    let slug = slugify(baseSlug);
    let n = 1;
    while (await Store.findOne({ slug })) slug = `${slugify(baseSlug)}-${++n}`;
    store = await Store.create({
      userId: user._id,
      name: baseName,
      slug,
      type: "reseller",
    });
  }

  let wall = await ResellerWall.findOne({ resellerId: user._id });
  if (!wall) wall = await ResellerWall.create({ resellerId: user._id, products: [] });

  const productIdStr = String(product._id);
  const existingEntry = wall.products.find((p) => String((p.productId as any)) === productIdStr);
  if (existingEntry) {
    existingEntry.resellerCommissionPct = resellerCommissionPct;
    await wall.save();
  } else {
    wall.products.push({ productId: product._id, resellerCommissionPct, addedAt: new Date() });
    await wall.save();
  }

  const existingPost = await TVPost.findOne({
    creatorId: user._id,
    type: "product",
    productId: product._id,
    status: "approved",
  });
  if (!existingPost) {
    await TVPost.create({
      creatorId: user._id,
      type: "product",
      mediaUrls: Array.isArray(product.images) ? product.images : [],
      productId: product._id,
      caption: product.title || "Reselling product",
      status: "approved",
      fromResellerWall: true,
    }).catch(() => {});
  }

  return store;
}

async function handleWhatsappResellCommand(phone: string, rawInput: string): Promise<{
  handled: boolean;
  payload?: { code: string; message: string };
}> {
  const normalized = String(rawInput || "").replace(/\s+/g, " ").trim();
  const lowered = normalized.toLowerCase();
  const match = normalized.match(/(?:resell|ressell|resel)\s+([a-f0-9]{6,24})\s+([0-9]{1,2})/i);
  if (!match) {
    if (/^res+e?l+/i.test(lowered)) {
      return {
        handled: true,
        payload: {
          code: "RESELL_FORMAT_INVALID",
          message: "Use this format: RESELL <code> <3-7>. Example: RESELL ab12cd34 3",
        },
      };
    }
    return { handled: false };
  }

  const code = String(match[1] || "").toLowerCase();
  const markup = Number(match[2]);
  if (!Number.isFinite(markup) || markup < 3 || markup > 7) {
    return {
      handled: true,
      payload: {
        code: "RESELL_INVALID_MARKUP",
        message: `Markup must be between 3% and 7%. Example: RESELL ab12cd ${DEFAULT_RESELL_MARKUP_PCT}`,
      },
    };
  }

  const user = await findWaUserByPhone(phone);
  if (!user) {
    await setWaPendingContinueAction(phone, `RESELL ${code} ${Math.round(markup)}`);
    return {
      handled: true,
      payload: { code: "USER_NOT_FOUND", message: buildUnregisteredGuidedMessage(`RESELL ${code} ${Math.round(markup)}`) },
    };
  }

  const productRows = await Product.aggregate([
    {
      $match: {
        active: true,
        allowResell: true,
      },
    },
    {
      $addFields: {
        _idStr: { $toString: "$_id" },
      },
    },
    {
      $match: {
        _idStr: { $regex: `^${code}`, $options: "i" },
      },
    },
    { $limit: 1 },
  ]);
  const product = productRows[0] || null;

  if (!product) {
    return {
      handled: true,
      payload: {
        code: "RESELL_PRODUCT_NOT_FOUND",
        message: "Product code not found. Reply 1 to refresh products, then use RESELL <code> <3-7>.",
      },
    };
  }

  const supplierSource = String((product as any).supplierSource || "");
  const isExternal = ["cj", "spocket", "eprolo"].includes(supplierSource);
  if (!isExternal) {
    const supplier = await Supplier.findById((product as any).supplierId).select("status").lean();
    if (!supplier || String((supplier as any).status || "") !== "approved") {
      return {
        handled: true,
        payload: {
          code: "RESELL_SUPPLIER_NOT_APPROVED",
          message: "This product cannot be resold right now.",
        },
      };
    }
  }

  const store = await addProductToResellerWall({
    user,
    product,
    resellerCommissionPct: Math.round(markup),
  });
  const shareStoreLink = `${FRONTEND_URL.replace(/\/$/, "")}/store/${store.slug}`;
  const productSlug = String((product as any).slug || "").trim();
  const productId = String((product as any)._id || "").trim();
  const slugOrId = productSlug || productId;
  const sharePreviewUrl = buildQwertyHubSharePreviewUrl({
    productSlugOrId: slugOrId,
    resellerId: String((user as any)._id),
    resellerCommissionPct: Math.round(markup),
  });
  const shareProductLink = buildWaMeShareFromText(sharePreviewUrl);
  const successMessage = [
    "Product Added Successfully",
    "",
    "Adjust the Mark-up on the web using the below link",
    shareStoreLink,
    "",
    "Share the product to your buyers using the link below",
    shareProductLink,
  ].join("\n");

  return {
    handled: true,
    payload: {
      code: "RESELL_ADDED",
      message: successMessage,
    },
  };
}

/** Tap-to-pay: `PAYREQ <actionToken>` — settles from wallet in WhatsApp, or returns PayGate link if short on funds. */
async function handleWhatsappPayMoneyRequestCommand(phone: string, rawInput: string): Promise<{
  handled: boolean;
  payload?: { code: string; message: string };
}> {
  const normalized = String(rawInput || "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^payreq\s+([a-f0-9]{16,64})\s*$/i);
  if (!match) {
    if (/^payreq\b/i.test(normalized)) {
      return {
        handled: true,
        payload: { code: "PAYREQ_FORMAT", message: "Invalid payment link. Open the latest request message from the sender." },
      };
    }
    return { handled: false };
  }
  const token = String(match[1] || "").trim().toLowerCase();
  const user = await findWaUserByPhone(phone);
  if (!user) {
    await setWaPendingContinueAction(phone, `PAYREQ ${token}`);
    return {
      handled: true,
      payload: { code: "USER_NOT_FOUND", message: buildUnregisteredGuidedMessage(`PAYREQ ${token}`) },
    };
  }
  const mr = await MoneyRequest.findOne({ actionToken: token }).exec();
  if (!mr) {
    return { handled: true, payload: { code: "PAYREQ_NOT_FOUND", message: "This payment request is invalid or already used." } };
  }
  if (mr.status !== "pending") {
    return {
      handled: true,
      payload: { code: "PAYREQ_DONE", message: "This request was already paid or is no longer active." },
    };
  }
  if (new Date() > mr.expiresAt) {
    mr.status = "expired";
    await mr.save();
    return { handled: true, payload: { code: "PAYREQ_EXPIRED", message: "This payment request has expired." } };
  }
  if (String(mr.toUser) !== String((user as any)._id)) {
    return { handled: true, payload: { code: "PAYREQ_WRONG_USER", message: "This payment request is not for your account." } };
  }

  const settled = await settleMoneyRequestFromWallet({ mr, payeeId: (user as any)._id });
  if (settled.ok) {
    return {
      handled: true,
      payload: {
        code: "PAYREQ_PAID",
        message: `Payment sent. R${Number(mr.amount).toFixed(2)} transferred. Your new balance: R${settled.payerBalance.toFixed(2)}.`,
      },
    };
  }
  if (settled.reason === "INSUFFICIENT_BALANCE") {
    const payerUser = await User.findById((user as any)._id).select("email").lean();
    const top = await initiateTopupForMoneyRequest({
      mr,
      payeeId: (user as any)._id,
      payeeEmail: String((payerUser as any)?.email || (user as any)?.email || ""),
    });
    if (!top.paymentUrl && !top.payGateRedirect && top.shortfall <= 0) {
      const w = await Wallet.findOne({ user: (user as any)._id });
      return {
        handled: true,
        payload: {
          code: "PAYREQ_PAID",
          message: `Payment sent. R${Number(mr.amount).toFixed(2)} transferred. Your new balance: R${Number(w?.balance ?? 0).toFixed(2)}.`,
        },
      };
    }
    if (!top.paymentUrl && !top.payGateRedirect) {
      return {
        handled: true,
        payload: {
          code: "PAYREQ_TOPUP_FAIL",
          message: `Insufficient balance. You need R${Number(mr.amount).toFixed(2)} or more. A payment link could not be started. Please try again later or top up from the website.`,
        },
      };
    }
    const payLink = top.paymentUrl || "";
    return {
      handled: true,
      payload: {
        code: "PAYREQ_TOPUP",
        message: `Insufficient balance. You need R${Number(mr.amount).toFixed(2)} or more. A payment link will be sent to you shortly. Use PayGate here (funds go directly to the requester's wallet):\n${payLink}`,
      },
    };
  }
  return { handled: true, payload: { code: "PAYREQ_ERROR", message: settled.reason } };
}

async function handleWhatsappCartAddCommand(phone: string, rawInput: string): Promise<{
  handled: boolean;
  payload?: { code: string; message: string };
}> {
  const normalized = String(rawInput || "").replace(/\s+/g, " ").trim();
  const lowered = normalized.toLowerCase();
  let match = normalized.match(/(?:cart|add(?:\s+to)?\s+cart)\s+([a-f0-9]{6,24})(?:\s+([0-9]{1,2}))?/i);
  // Legacy signed links used "CART ADD <code> <qty>" — parse so old tap-to-cart links still work.
  if (!match) {
    match = normalized.match(/cart\s+add\s+([a-f0-9]{6,24})(?:\s+([0-9]{1,2}))?/i);
  }
  if (!match) {
    if (/^(?:cart|add(?:\s+to)?\s+cart)\b/i.test(lowered)) {
      return {
        handled: true,
        payload: {
          code: "CART_FORMAT_INVALID",
          message: "Use: CART ADD <code> <qty>. Example: CART ADD ab12cd34 1",
        },
      };
    }
    return { handled: false };
  }

  const code = String(match[1] || "").toLowerCase();
  const qtyRaw = Number(match[2] || 1);
  const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(20, Math.floor(qtyRaw))) : 1;
  const user = await findWaUserByPhone(phone);
  if (!user) {
    await setWaPendingContinueAction(phone, `CART ADD ${code} ${qty}`);
    return {
      handled: true,
      payload: { code: "USER_NOT_FOUND", message: buildUnregisteredGuidedMessage(`CART ADD ${code} ${qty}`) },
    };
  }

  const productRows = await Product.aggregate([
    { $match: { active: true, outOfStock: { $ne: true } } },
    { $addFields: { _idStr: { $toString: "$_id" } } },
    { $match: { _idStr: { $regex: `^${code}`, $options: "i" } } },
    { $limit: 1 },
  ]);
  const product = productRows[0] || null;
  if (!product) {
    return {
      handled: true,
        payload: {
          code: "CART_PRODUCT_NOT_FOUND",
          message: "Product code not found. Reply 1 to refresh products, then use CART ADD <code> <qty>.",
        },
    };
  }

  const stock = Number((product as any).stock || 0);
  if (stock > 0 && qty > stock) {
    return { handled: true, payload: { code: "CART_STOCK_LIMIT", message: `Only ${stock} left. Use CART ADD ${code} ${stock}.` } };
  }

  let cart = await Cart.findOne({ user: (user as any)._id });
  if (!cart) cart = await Cart.create({ user: (user as any)._id, items: [], musicItems: [] });
  const productId = String((product as any)._id || "");
  const existing = cart.items.find((i: any) => String(i?.productId || "") === productId);
  if (existing) existing.qty = Math.max(1, Number(existing.qty || 1) + qty);
  else cart.items.push({ productId: (product as any)._id, qty });
  await cart.save();

  return {
    handled: true,
    payload: {
      code: "CART_ADDED",
      message: `Product added to cart.\n${compactText(String((product as any).title || "Product"), 48)} x${qty}\n\nReply 7 to view cart summary.`,
    },
  };
}

function extractUserInputFromBody(body: any): string {
  const direct = [
    body?.option,
    body?.Option,
    body?.body,
    body?.Body,
    body?.message,
    body?.Message,
    body?.input,
    body?.Input,
    body?.userInput,
    body?.user_input,
    body?.inboundMessage,
    body?.inbound_message,
    body?.text,
    body?.Text,
    body?.query,
    body?.Query,
    body?.Digits,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find(Boolean);
  if (direct) return direct;
  const serialized = JSON.stringify(body || {});
  const embedded = serialized.match(/resell\s+[a-f0-9]{6,24}\s+[0-9]{1,2}/i);
  if (embedded) return embedded[0];
  const menuDigit = serialized.match(/(?:^|[^0-9])(10|[1-9])(?:[^0-9]|$)/);
  return menuDigit ? menuDigit[1] : "";
}

function menuDisplayName(user: { username?: string; name?: string }): string {
  const u = String((user as any).username || "").trim();
  return u || String((user as any).name || "friend").trim() || "friend";
}

async function generateUniqueUsername(name: string): Promise<string> {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30) || "user";
  let candidate = base;
  let n = 0;
  while (await User.findOne({ username: candidate })) {
    n++;
    candidate = `${base}${n}`.slice(0, 30);
  }
  return candidate;
}

async function getApprovedSupplierIdsForWa(): Promise<any[]> {
  const rows = await Supplier.find({ status: "approved" }).select("_id").lean();
  return rows.map((r: any) => r?._id).filter(Boolean);
}

async function buildWaPublicResellMatch(extra: Record<string, any> = {}): Promise<Record<string, any>> {
  const approvedSupplierIds = await getApprovedSupplierIdsForWa();
  return {
    active: true,
    allowResell: true,
    outOfStock: { $ne: true },
    $and: [
      {
        $or: [
          { supplierSource: { $in: ["cj", "spocket", "eprolo"] } },
          ...(approvedSupplierIds.length ? [{ supplierId: { $in: approvedSupplierIds } }] : []),
        ],
      },
      extra,
    ],
  };
}

async function userHasResellerProfile(userId: any): Promise<boolean> {
  const [store, wall] = await Promise.all([
    Store.findOne({ userId, type: "reseller" }).select("_id").lean(),
    ResellerWall.findOne({ resellerId: userId }).select("_id products").lean(),
  ]);
  return Boolean(store || (Array.isArray((wall as any)?.products) && (wall as any).products.length > 0));
}

/** Display name should be username when available (passed from User.username or name). */
function buildMainMenu(displayName: string, _includeAdjustMarkup: boolean): string {
  const who = String(displayName || "friend").trim() || "friend";
  return [
    `Welcome to Qwertymates, ${who}!`,
    "",
    "Choose an option (reply with the number):",
    "1️⃣ About Qwertymates",
    "2️⃣ QwertyHub(Marketplace)",
    "3️⃣ MyStore",
    "4️⃣ Join Errands Runners",
    "5️⃣ ACBPayWallet",
    "6️⃣ Employment",
    "7️⃣ Cart",
    "8️⃣ Yesplay",
  ].join("\n");
}

function buildAboutQwertymatesMessage(): string {
  return [
    "About Qwertymates",
    "",
    "Qwertymates is a powerful all-in-one digital ecosystem that combines commerce, services, payments, media, communication, social interaction, and AI assistance into a single platform. It is built to empower individuals and businesses to earn, transact, create, communicate, and connect-all without the complexity of managing inventory, logistics, or multiple disconnected applications.",
    "",
    "Qwertymates is designed to be a complete digital lifestyle platform, supporting entrepreneurship, gig work, content creation, entertainment, and everyday communication.",
    "",
    "Core Components",
    "QwertyHub - Marketplace & Reselling Engine",
    "QwertyHub is the marketplace foundation of Qwertymates. Suppliers upload and manage their products on the platform. Users browse and resell products instantly. Users do not handle stock, shipping, or inventory. Products are fulfilled directly by suppliers. Once a user starts reselling, a personal store is automatically created. This allows anyone to become a digital seller with zero inventory risk and minimal setup.",
    "",
    "MyStore - Automatically Created Online Stores",
    "MyStore is a personal digital storefront created automatically for users who resell products. No manual setup required. Products selected from QwertyHub appear instantly. Orders, earnings, and transactions are managed seamlessly. Users can focus entirely on selling, promotion, and growth, while the platform handles the rest.",
    "",
    "Errands - Task & Service Marketplace",
    "The Errands feature connects people who need tasks completed with people willing to do them. Clients post errands or tasks. Errand Runners browse and choose tasks. Funds are securely held until task completion. Payment is released to the runner once the task is completed and confirmed. This creates a trusted, transparent, and fair system for service-based work.",
    "",
    "ACBPayWallet - Integrated Digital Wallet",
    "ACBPayWallet is the financial backbone of Qwertymates, handling all monetary transactions across the platform. It supports payments for products and services, donations, peer-to-peer transfers, wallet top-ups, payment requests, and disbursements and withdrawals. ACBPayWallet ensures secure, centralized, and seamless financial operations across all features.",
    "",
    "Morongwa - Messaging & Communication Hub",
    "Morongwa is Qwertymates' built-in messenger, designed for both business and social communication. Chat about orders, deliveries, and errands. Communicate between buyers, sellers, clients, and runners. Send normal social messages. Make voice and video calls. Keep all platform-related communication in one place. By integrating messaging directly into the platform, Morongwa eliminates the need for external chat apps.",
    "",
    "QwertyTV - Video & Live Streaming Hub",
    "QwertyTV is the centralized home for all video content on Qwertymates: live streams, movies, short videos and reels, and creator-driven video content. QwertyTV serves as an entertainment and engagement hub for both creators and viewers.",
    "",
    "QwertyMusic - Music Streaming & Distribution Platform",
    "QwertyMusic hosts the platform's full music ecosystem. Users can stream music and buy and download songs. Artists, publishers, and record companies can upload and publish music and monetize their content directly. This creates a creator-friendly, monetized music platform for artists and listeners alike.",
    "",
    "Media Content & Social Posts",
    "Qwertymates also functions as a social platform where users can create text posts, share images, like and comment on posts, and report inappropriate or harmful content. This social layer strengthens community engagement and content discovery.",
    "",
    "Ask MacGyver - AI Copilot",
    "Ask MacGyver is Qwertymates' built-in AI Copilot, designed to assist users across the entire platform. Navigate features and services. Discover products, errands, and content. Get recommendations and insights. Answer questions about stores, payments, media, and tasks. Improve productivity and decision-making. Ask MacGyver brings intelligent, real-time assistance directly into the user experience.",
    "",
    "One Platform. Everything Connected.",
    "Qwertymates uniquely brings together: inventory-free e-commerce, task-based earning (Errands), secure digital payments (ACBPayWallet), built-in messaging and video calls (Morongwa), music and video streaming (QwertyMusic & QwertyTV), social media features, and AI-powered assistance (Ask MacGyver).",
    "",
    "All within a single, unified, easy-to-use platform: QwertyHub, MyStore, Errands, Cart, ACBPayWallet, Morongwa, QwertyTV, QwertyMusic, and Ask MacGyver.",
  ].join("\n");
}

function chunkLongMessageByLines(input: string, maxLen = 1200): string[] {
  const text = String(input || "").trim();
  if (!text) return [];
  if (text.length <= maxLen) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildWalletMenu(): string {
  return [
    "ACBPayWallet — choose:",
    "1️⃣ Wallet balance",
    "2️⃣ Send money",
    "3️⃣ Request money",
    "4️⃣ Withdraw from agent",
    "5️⃣ My QR code",
    "0️⃣ Back to main menu",
  ].join("\n");
}

function isWalletMerchantAgentApproved(u: any): boolean {
  const ma = u?.merchantAgent;
  if (!ma) return false;
  if (ma.applicationStatus === "suspended" || ma.applicationStatus === "rejected" || ma.applicationStatus === "pending") {
    return false;
  }
  if (ma.applicationStatus === "approved") return true;
  if (ma.enabled && (ma.applicationStatus === undefined || ma.applicationStatus === null)) return true;
  return false;
}

function canOperateAsMerchantAgent(u: any): boolean {
  if (!u?.isVerified) return false;
  if (u.suspended || u.locked || !u.active) return false;
  return isWalletMerchantAgentApproved(u);
}

function isValidInternationalPhone(input: string): boolean {
  return /^\+\d{10,15}$/.test(String(input || "").trim());
}

function parsePositiveAmount(input: string): number | null {
  const n = Number(String(input || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function randomOtp6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function saveWalletState(
  userId: any,
  step: string,
  payload: Record<string, any> = {},
  ttlMinutes = WA_WALLET_INACTIVITY_TIMEOUT_MIN
) {
  await WaConversationState.findOneAndUpdate(
    { user: userId, scope: "wallet" },
    {
      $set: {
        step,
        payload,
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    },
    { upsert: true, new: true }
  );
}

async function clearWalletState(userId: any) {
  await WaConversationState.deleteOne({ user: userId, scope: "wallet" });
}

async function saveMochinaState(userId: any, step: string, payload: Record<string, any> = {}, ttlMinutes = 30) {
  await WaConversationState.findOneAndUpdate(
    { user: userId, scope: "mochina" },
    {
      $set: {
        step,
        payload,
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    },
    { upsert: true, new: true }
  );
}

async function clearMochinaState(userId: any) {
  await WaConversationState.deleteOne({ user: userId, scope: "mochina" });
}

function buildMochinaMenu(): string {
  return [
    "Welcom to Mochina.",
    "Reply with:",
    "1 - List bet values",
    "BET <number> - View open games for that bet",
    "JOIN <game number> <lucky number 1-36> - Join game",
    "RUNNER - Convert to runner",
    "CREATE <bet number> - Create runner game",
    "WALLET - Check Mochina wallet balance",
    "TOPUP <amount> - Get PayGate payment link",
    "TRANSFER <+cellphone> <amount> - Wallet to wallet",
    "0 - Back to main menu",
  ].join("\n");
}

async function legacyMochinaPost(path: string, payload: Record<string, any>, asJson = false): Promise<any> {
  const url = `${LEGACY_MOCHINA_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (asJson) {
    const resp = await axios.post(url, payload, {
      timeout: 20000,
      headers: { "Content-Type": "application/json" },
    });
    return resp.data;
  }
  const body = new URLSearchParams();
  Object.entries(payload || {}).forEach(([k, v]) => body.set(k, String(v ?? "")));
  const resp = await axios.post(url, body.toString(), {
    timeout: 20000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return resp.data;
}

async function handleMochinaConversationState(user: any, phone: string, rawInput: string): Promise<{ handled: boolean; payload?: any }> {
  const input = String(rawInput || "").trim();
  const lower = input.toLowerCase();
  const st = await WaConversationState.findOne({ user: user._id, scope: "mochina" }).lean();

  if (!st) return { handled: false };
  if (new Date(st.expiresAt).getTime() < Date.now()) {
    await clearMochinaState(user._id);
    return { handled: true, payload: { code: "MOCHINA_SESSION_EXPIRED", message: "Mochina session expired. Reply 9 to start again." } };
  }

  if (input === "0") {
    await clearMochinaState(user._id);
    return { handled: true, payload: { code: "MOCHINA_BACK", message: "Back to main menu. Reply any option number." } };
  }

  try {
    if (input === "1") {
      const bets = await legacyMochinaPost("/game/listBetValues", {}, true);
      const betvalues = Array.isArray(bets?.betvalues) ? bets.betvalues : [];
      await saveMochinaState(user._id, "main", { betvalues }, 30);
      return {
        handled: true,
        payload: {
          code: "MOCHINA_BETS",
          message: `Mochina bet values:\n${String(bets?.msg || "").trim()}\nReply BET <number>`,
        },
      };
    }

    const betMatch = lower.match(/^bet\s+(\d{1,2})$/);
    if (betMatch) {
      let betvalues = (st.payload as any)?.betvalues;
      if (!Array.isArray(betvalues) || !betvalues.length) {
        const bets = await legacyMochinaPost("/game/listBetValues", {}, true);
        betvalues = Array.isArray(bets?.betvalues) ? bets.betvalues : [];
      }
      const betNo = betMatch[1];
      const games = await legacyMochinaPost("/game/listGames", {
        phone,
        betvalue: betNo,
        betvalues: JSON.stringify({ betvalues }),
      });
      if (String(games?.MSGCODE || "") !== "SUCCESS") {
        return { handled: true, payload: { code: "MOCHINA_NO_GAMES", message: "No open games for that bet. Reply BET <number> to try another bet." } };
      }
      await saveMochinaState(user._id, "main", { betvalues, games: games.games || [] }, 30);
      return {
        handled: true,
        payload: {
          code: "MOCHINA_GAMES",
          message: `Open games:\n${String(games?.gamesStr || "").trim()}\nReply JOIN <game number> <lucky number 1-36>`,
        },
      };
    }

    const joinMatch = lower.match(/^join\s+(\d{1,2})\s+(\d{1,2})$/);
    if (joinMatch) {
      const selectedGame = joinMatch[1];
      const chooseNo = joinMatch[2];
      const games = (st.payload as any)?.games;
      if (!Array.isArray(games) || !games.length) {
        return { handled: true, payload: { code: "MOCHINA_GAMES_REQUIRED", message: "First reply BET <number> to load open games, then JOIN <game number> <lucky number>." } };
      }
      const joinResp = await legacyMochinaPost("/game/joinGame", {
        phone,
        games: JSON.stringify({ games }),
        selectedGame,
        chooseNo,
      });
      const code = String(joinResp?.MSGCODE || "UNKNOWN");
      if (code === "SUCCESS" || code === "SUCCESS_WITH_RESULT") {
        return { handled: true, payload: { code: "MOCHINA_JOINED", message: "Joined successfully. Good luck!" } };
      }
      if (code === "INSUFFICIANT_BALANCE") {
        return { handled: true, payload: { code: "MOCHINA_LOW_BALANCE", message: "Insufficient Mochina wallet balance. Reply TOPUP <amount> to add funds." } };
      }
      return { handled: true, payload: { code: "MOCHINA_JOIN_FAILED", message: `Could not join game (${code}). Try another game or number.` } };
    }

    if (lower === "wallet") {
      const w = await legacyMochinaPost("/game/loadWallet", { phone });
      return { handled: true, payload: { code: "MOCHINA_WALLET", message: `Mochina wallet balance: ${String(w?.BALANCE || "R 0.00")}` } };
    }

    const topupMatch = lower.match(/^topup\s+(\d+(?:\.\d{1,2})?)$/);
    if (topupMatch) {
      const amount = Number(topupMatch[1]);
      const t = await legacyMochinaPost("/funds/generatePaymentLink", { phone, amount: amount.toFixed(2) });
      if (String(t?.MSGCODE || "") === "SUCCESS" && t?.url) {
        return { handled: true, payload: { code: "MOCHINA_TOPUP_LINK", message: `PayGate top-up link:\n${String(t.url)}` } };
      }
      return { handled: true, payload: { code: "MOCHINA_TOPUP_FAILED", message: "Could not generate top-up link right now." } };
    }

    const transferMatch = input.match(/^TRANSFER\s+(\+\d{10,15})\s+(\d+(?:\.\d{1,2})?)$/i);
    if (transferMatch) {
      const to = transferMatch[1];
      const amount = Number(transferMatch[2]);
      const tr = await legacyMochinaPost("/funds/walletToWalletTransfer", {
        phone,
        userphone: `whatsapp:${to}`,
        amount: amount.toFixed(2),
      });
      if (String(tr?.MSGCODE || "") === "SUCCESS") {
        return { handled: true, payload: { code: "MOCHINA_TRANSFER_SUCCESS", message: "Transfer successful." } };
      }
      if (String(tr?.MSGCODE || "") === "INSUFFICIANT_BALANCE") {
        return { handled: true, payload: { code: "MOCHINA_TRANSFER_LOW_BALANCE", message: "Insufficient balance. Reply TOPUP <amount> to add funds." } };
      }
      return { handled: true, payload: { code: "MOCHINA_TRANSFER_FAILED", message: "Transfer failed. Check number format and try again." } };
    }

    if (lower === "runner") {
      const r = await legacyMochinaPost("/runner/convertToRunner", { phone });
      const code = String(r?.MSGCODE || "");
      if (code === "SUCCESS" || code === "USER_ALREADY_RUNNER") {
        return { handled: true, payload: { code: "MOCHINA_RUNNER_OK", message: String(r?.msg || "Runner profile ready.") } };
      }
      return { handled: true, payload: { code: "MOCHINA_RUNNER_FAILED", message: "Could not convert to runner right now." } };
    }

    const createMatch = lower.match(/^create\s+(\d{1,2})$/);
    if (createMatch) {
      let betvalues = (st.payload as any)?.betvalues;
      if (!Array.isArray(betvalues) || !betvalues.length) {
        const bets = await legacyMochinaPost("/game/listBetValues", {}, true);
        betvalues = Array.isArray(bets?.betvalues) ? bets.betvalues : [];
      }
      const c = await legacyMochinaPost("/runner/createGame", {
        phone,
        betvalue: createMatch[1],
        betvalues: JSON.stringify({ betvalues }),
      });
      if (String(c?.MSGCODE || "") === "SUCCESS" && c?.gameCode) {
        return { handled: true, payload: { code: "MOCHINA_GAME_CREATED", message: `Game created successfully.\nCode: ${String(c.gameCode)}` } };
      }
      return { handled: true, payload: { code: "MOCHINA_CREATE_FAILED", message: "Could not create game. Use CREATE <bet number>." } };
    }

    return { handled: true, payload: { code: "MOCHINA_MENU", message: buildMochinaMenu() } };
  } catch (e: any) {
    logger.warn("Mochina flow proxy failed", { error: String(e?.message || e) });
    return {
      handled: true,
      payload: {
        code: "MOCHINA_TEMP_ERROR",
        message: "Mochina service is temporarily unavailable. Please try again.",
      },
    };
  }
}

async function _buildQwertyHubSellMessage(
  phoneInputForGeo: string,
  opts?: { refreshHintDigit?: string }
): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const refreshDigit = String(opts?.refreshHintDigit || "1").trim() || "1";
  const intro = [
    "QwertyHub - Sell without stock",
    "",
    "Simple steps:",
    "1) Open a product card",
    "2) Add to MyStore or set markup",
    "3) Share to your WhatsApp group/channel",
  ];

  const match = await buildWaPublicResellMatch();
  const sample = await Product.find(match)
    .select("title slug description price discountPrice currency images supplierSource")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const picksPool = sample.slice(0, QWERTYHUB_SELL_MEDIA_LIMIT);
  if (picksPool.length < QWERTYHUB_SELL_MEDIA_LIMIT) {
    const existing = new Set(picksPool.map((p: any) => String(p?._id || "")));
    const need = QWERTYHUB_SELL_MEDIA_LIMIT - picksPool.length;
    const backup = await Product.find({
      active: true,
      outOfStock: { $ne: true },
      _id: { $nin: Array.from(existing).filter(Boolean) },
    })
      .select("title slug description price currency images")
      .sort({ createdAt: -1 })
      .limit(need * 4)
      .lean();
    for (const p of backup) {
      picksPool.push(p);
      if (picksPool.length >= QWERTYHUB_SELL_MEDIA_LIMIT) break;
    }
  }

  if (!picksPool.length) {
    return {
      message: [
        ...intro,
        "",
        `Browse products: ${FRONTEND_URL.replace(/\/$/, "")}/marketplace`,
      ].join("\n"),
      mediaCards: [],
    };
  }

  const rates = (await getFxRates()).rates;
  const targetCurrency = detectCurrencyFromPhoneDigits(waPhoneToDigits(phoneInputForGeo));

  const mediaCards: WaMediaCard[] = [];
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const waFromDigits = getTwilioWhatsAppFromDigits();
  const picks = picksPool.map((p: any, i: number) => {
    const title = compactText(String(p?.title || "Product"), 42);
    const slug = String(p?.slug || "").trim();
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const descriptionRaw = stripHtml(String(p?.description || "No description available."));
    const sourceCurrency = resolveWaSourceCurrency(p);
    const basePrice = getEffectiveProductPrice(p as any);
    const converted = convertAmount(basePrice, sourceCurrency, targetCurrency, rates);
    const price = Number(converted).toFixed(2);
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "") || QWERTYHUB_FALLBACK_IMAGE_URL;
    const productSlugOrId = String(p?._id || "").trim() || slug;
    const productUrl = `${baseUrl}/marketplace/product/${encodeURIComponent(productSlugOrId)}`;
    const autoResellUrl = buildQwertyHubAutoResellUrl(productUrl);
    const resellTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${DEFAULT_RESELL_MARKUP_PCT}`) ||
        waChatCommandFallback("resell", shortCode, DEFAULT_RESELL_MARKUP_PCT)
    );
    const addToCartTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) || waChatCommandFallback("cart", shortCode, 1)
    );
    if (image) {
      mediaCards.push({
        mediaUrl: image,
        caption: buildQwertyHubProductCardCaption({
          index: i,
          title,
          targetCurrency,
          price,
          descriptionRaw,
          shortCode,
          resellTapLink,
          autoResellUrl,
          buyLink: addToCartTapLink,
        }),
      });
    }
    return `${i + 1}. ${title} - ${targetCurrency} ${price} [code: ${shortCode}]`;
  });

  const resellerPicks = await getResellerQwertyHubPicks(3);
  resellerPicks.forEach((row, idx) => {
    const p = row.product;
    const title = compactText(String(p?.title || "Product"), 42);
    const sourceCurrency = String(p?.currency || "USD").trim().toUpperCase();
    const base = Number(p?.price || 0);
    const resellerPrice = Math.round(base * (1 + row.markupPct / 100) * 100) / 100;
    const converted = convertAmount(resellerPrice, sourceCurrency, targetCurrency, rates);
    const price = Number(converted).toFixed(2);
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const addToCartTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) || waChatCommandFallback("cart", shortCode, 1)
    );
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "");
    if (image) {
      mediaCards.push({
        mediaUrl: image,
        caption: buildQwertyHubProductCardCaption({
          index: picksPool.length + idx,
          title,
          targetCurrency,
          price,
          descriptionRaw: stripHtml(String(p?.description || "")),
          shortCode,
          resellTapLink: "",
          autoResellUrl: "",
          buyLink: addToCartTapLink,
          includeResellActions: false,
        }),
      });
    }
  });

  return {
    message: [
      ...intro,
      "",
      "Reseller product picks:",
      ...picks,
      "",
      "Use each product card for Add, Markup, and Share.",
      "Need your saved products? Reply: MYSTORE",
      `Browse full catalog: ${FRONTEND_URL.replace(/\/$/, "")}/marketplace`,
      `Reply ${refreshDigit} again anytime to refresh product picks.`,
    ].join("\n"),
    mediaCards: mediaCards.slice(0, QWERTYHUB_SELL_MEDIA_LIMIT),
  };
}

function buildQwertyHubMarketplaceCardCaption(opts: {
  title: string;
  targetCurrency: string;
  price: string;
  shortCode: string;
  addToCartLink: string;
  resellTapLink: string;
}): string {
  return [
    `📦 ${opts.title}`,
    `💰 ${opts.targetCurrency} ${opts.price}`,
    `🔖 code: ${opts.shortCode}`,
    "",
    "Buy / Add to cart:",
    opts.addToCartLink,
    "",
    "Add to MyStore (resell):",
    opts.resellTapLink,
  ].join("\n");
}

async function buildQwertyHubMarketplaceMessage(
  phoneInputForGeo: string
): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const match = await buildWaPublicResellMatch();
  const sample = await Product.find(match)
    .select("title slug description price discountPrice currency images supplierSource")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  const picksPool = sample.slice(0, QWERTYHUB_MARKETPLACE_MEDIA_LIMIT);
  if (picksPool.length < QWERTYHUB_MARKETPLACE_MEDIA_LIMIT) {
    const existing = new Set(picksPool.map((p: any) => String(p?._id || "")));
    const need = QWERTYHUB_MARKETPLACE_MEDIA_LIMIT - picksPool.length;
    const backup = await Product.find({
      active: true,
      outOfStock: { $ne: true },
      _id: { $nin: Array.from(existing).filter(Boolean) },
    })
      .select("title slug description price currency images")
      .sort({ createdAt: -1 })
      .limit(need * 3)
      .lean();
    for (const p of backup) {
      picksPool.push(p);
      if (picksPool.length >= QWERTYHUB_MARKETPLACE_MEDIA_LIMIT) break;
    }
  }

  if (!picksPool.length) {
    return {
      message: `No products available right now. Browse: ${FRONTEND_URL.replace(/\/$/, "")}/marketplace`,
      mediaCards: [],
    };
  }

  const rates = (await getFxRates()).rates;
  const targetCurrency = detectCurrencyFromPhoneDigits(waPhoneToDigits(phoneInputForGeo));
  const waFromDigits = getTwilioWhatsAppFromDigits();
  const mediaCards: WaMediaCard[] = [];

  picksPool.forEach((p: any) => {
    const title = compactText(String(p?.title || "Product"), 36);
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const sourceCurrency = resolveWaSourceCurrency(p);
    const basePrice = getEffectiveProductPrice(p as any);
    const converted = convertAmount(basePrice, sourceCurrency, targetCurrency, rates);
    const price = Number(converted).toFixed(2);
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "") || QWERTYHUB_FALLBACK_IMAGE_URL;
    const addToCartLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) || waChatCommandFallback("cart", shortCode, 1)
    );
    const resellTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${DEFAULT_RESELL_MARKUP_PCT}`) ||
        waChatCommandFallback("resell", shortCode, DEFAULT_RESELL_MARKUP_PCT)
    );

    mediaCards.push({
      mediaUrl: image,
      caption: buildQwertyHubMarketplaceCardCaption({
        title,
        targetCurrency,
        price,
        shortCode,
        addToCartLink,
        resellTapLink,
      }),
    });
  });

  return {
    message: "QwertyHub marketplace products:",
    mediaCards: mediaCards.slice(0, QWERTYHUB_MARKETPLACE_MEDIA_LIMIT),
  };
}

async function listQwertyHubTopCategories(): Promise<string[]> {
  const match = await buildWaPublicResellMatch({ categories: { $exists: true, $ne: [] } });
  const rows = await Product.aggregate([
    { $match: match },
    { $unwind: "$categories" },
    { $project: { c: { $trim: { input: "$categories" } } } },
    { $match: { c: { $ne: "" } } },
    { $group: { _id: { $toLower: "$c" }, label: { $first: "$c" }, count: { $sum: 1 } } },
    { $sort: { count: -1, label: 1 } },
    { $limit: 15 },
  ]);
  return rows.map((r: any) => String(r?.label || "").trim()).filter(Boolean);
}

async function buildQwertyHubCategoryMessage(params: {
  category: string;
  phoneInputForGeo: string;
}): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const category = String(params.category || "").trim();
  if (!category) return { message: "Please provide a category. Example: CATEGORY Fashion", mediaCards: [] };

  const rates = (await getFxRates()).rates;
  const targetCurrency = detectCurrencyFromPhoneDigits(waPhoneToDigits(params.phoneInputForGeo));
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const waFromDigits = getTwilioWhatsAppFromDigits();
  const match = await buildWaPublicResellMatch({
    categories: { $in: [new RegExp(`^${category}$`, "i")] },
  });
  const sample = await Product.find(match)
    .select("title slug description price discountPrice currency images supplierSource")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  if (!sample.length) {
    return {
      message: `No products found for "${category}". Reply 8 to see categories, then use CATEGORY <name>.`,
      mediaCards: [],
    };
  }

  const mediaCards: WaMediaCard[] = [];
  const picks = sample.map((p: any, i: number) => {
    const title = compactText(String(p?.title || "Product"), 42);
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const sourceCurrency = resolveWaSourceCurrency(p);
    const basePrice = getEffectiveProductPrice(p as any);
    const converted = convertAmount(basePrice, sourceCurrency, targetCurrency, rates);
    const price = Number(converted).toFixed(2);
    const slug = String(p?.slug || "").trim();
    const productSlugOrId = String(p?._id || "").trim() || slug;
    const productUrl = `${baseUrl}/marketplace/product/${encodeURIComponent(productSlugOrId)}`;
    const autoResellUrl = buildQwertyHubAutoResellUrl(productUrl);
    const resellTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${DEFAULT_RESELL_MARKUP_PCT}`) ||
        waChatCommandFallback("resell", shortCode, DEFAULT_RESELL_MARKUP_PCT)
    );
    const buyLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) || waChatCommandFallback("cart", shortCode, 1)
    );
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "");
    if (image) {
      mediaCards.push({
        mediaUrl: image,
        caption: buildQwertyHubProductCardCaption({
          index: i,
          title,
          targetCurrency,
          price,
          descriptionRaw: stripHtml(String(p?.description || "")),
          shortCode,
          resellTapLink,
          autoResellUrl,
          buyLink,
        }),
      });
    }
    return `${i + 1}. ${title} - ${targetCurrency} ${price} [code: ${shortCode}]`;
  });

  return {
    message: [
      `Category: ${category}`,
      ...picks,
      "",
      `Browse all: ${baseUrl}/marketplace?category=${encodeURIComponent(category)}`,
      "Reply CATEGORY <name> to switch category.",
    ].join("\n"),
    mediaCards: mediaCards.slice(0, 5),
  };
}

async function buildWaCartMessage(user: any, phoneInputForGeo: string): Promise<string> {
  const cart = await Cart.findOne({ user: user._id }).lean();
  const items = Array.isArray((cart as any)?.items) ? (cart as any).items : [];
  if (!items.length) return "No products in the cart";

  const rates = (await getFxRates()).rates;
  const phoneDigits = waPhoneToDigits(phoneInputForGeo);
  const targetCurrency = detectCurrencyFromPhoneDigits(phoneDigits);
  const deliveryCountry = detectCountryCodeFromPhoneDigits(phoneDigits);
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");

  const productIds = items.map((i: any) => String(i?.productId || "")).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("title price discountPrice currency supplierSource supplierId externalSupplierId externalData")
    .lean();
  const productMap = new Map(products.map((p: any) => [String(p?._id || ""), p]));

  const lines: string[] = ["Cart products:"];
  let subtotal = 0;
  const uniqueSupplierIds = new Set<string>();
  const uniqueExternalSupplierIds = new Set<string>();
  let cjGroupCount = 0;
  items.slice(0, 20).forEach((row: any, idx: number) => {
    const pid = String(row?.productId || "");
    const p = productMap.get(pid);
    if (!p) return;
    const qty = Math.max(1, Number(row?.qty || 1));
    const srcCurrency = String((p as any)?.currency || "USD").toUpperCase();
    const base = getEffectiveProductPrice(p as any);
    const converted = convertAmount(base, srcCurrency, targetCurrency, rates);
    const lineTotal = converted * qty;
    subtotal += lineTotal;
    const supplierSource = String((p as any)?.supplierSource || "internal").toLowerCase();
    if (supplierSource === "internal") {
      const sid = String((p as any)?.supplierId || "").trim();
      if (sid) uniqueSupplierIds.add(sid);
    } else if (supplierSource === "cj") {
      cjGroupCount = 1;
    } else {
      const extId = String((p as any)?.externalSupplierId || "").trim();
      if (extId) uniqueExternalSupplierIds.add(extId);
    }
    lines.push(`${idx + 1}. ${compactText(String((p as any)?.title || "Product"), 42)} x${qty} — ${targetCurrency} ${lineTotal.toFixed(2)}`);
  });

  let shipping = 0;
  const shippingLines: string[] = [];
  let shippingIsEstimated = false;
  const cjProducts: Array<{ vid: string; quantity: number }> = [];
  for (const row of items) {
    const pid = String(row?.productId || "");
    const p = productMap.get(pid);
    if (!p) continue;
    const supplierSource = String((p as any)?.supplierSource || "internal").toLowerCase();
    if (supplierSource !== "cj") continue;
    const qty = Math.max(1, Number(row?.qty || 1));
    const vid = String((p as any)?.externalData?.variants?.[0]?.vid || "").trim();
    if (!vid) {
      shippingIsEstimated = true;
      continue;
    }
    cjProducts.push({ vid, quantity: qty });
  }
  if (uniqueSupplierIds.size) {
    const suppliers = await Supplier.find({ _id: { $in: Array.from(uniqueSupplierIds) } })
      .select("storeName shippingCost")
      .lean();
    for (const s of suppliers as any[]) {
      const cost = Number.isFinite(Number(s?.shippingCost)) ? Number(s.shippingCost) : WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER;
      const localCost = convertAmount(cost, "ZAR", targetCurrency, rates);
      shipping += localCost;
      shippingLines.push(`- ${String(s?.storeName || "Supplier")}: ${targetCurrency} ${localCost.toFixed(2)}`);
    }
  }
  if (uniqueExternalSupplierIds.size) {
    const extRows = await ExternalSupplier.find({ _id: { $in: Array.from(uniqueExternalSupplierIds) } })
      .select("source shippingCost name")
      .lean();
    for (const ext of extRows as any[]) {
      const cost = Number.isFinite(Number(ext?.shippingCost)) ? Number(ext.shippingCost) : WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER;
      const localCost = convertAmount(cost, "ZAR", targetCurrency, rates);
      shipping += localCost;
      shippingLines.push(`- ${String(ext?.name || ext?.source || "Dropship")}: ${targetCurrency} ${localCost.toFixed(2)}`);
    }
  }
  if (cjGroupCount > 0) {
    try {
      if (cjProducts.length > 0) {
        const { getCJAdapter } = await import("../services/suppliers/supplierService");
        const cjAdapter = await getCJAdapter();
        if (cjAdapter?.getFreightQuote) {
          const freight = await cjAdapter.getFreightQuote({
            startCountryCode: "CN",
            endCountryCode: deliveryCountry,
            products: cjProducts,
          });
          if (freight && Number.isFinite(Number(freight.logisticPrice))) {
            const cjLocal = convertAmount(Number(freight.logisticPrice), "USD", targetCurrency, rates);
            shipping += cjLocal;
            shippingLines.push(`- CJ / Dropship (live quote): ${targetCurrency} ${cjLocal.toFixed(2)}`);
          } else {
            shippingIsEstimated = true;
            const fallback = convertAmount(WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER, "ZAR", targetCurrency, rates);
            shipping += fallback;
            shippingLines.push(`- CJ / Dropship (estimated): ${targetCurrency} ${fallback.toFixed(2)}`);
          }
        } else {
          shippingIsEstimated = true;
          const fallback = convertAmount(WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER, "ZAR", targetCurrency, rates);
          shipping += fallback;
          shippingLines.push(`- CJ / Dropship (estimated): ${targetCurrency} ${fallback.toFixed(2)}`);
        }
      } else {
        shippingIsEstimated = true;
        const fallback = convertAmount(WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER, "ZAR", targetCurrency, rates);
        shipping += fallback;
        shippingLines.push(`- CJ / Dropship (estimated): ${targetCurrency} ${fallback.toFixed(2)}`);
      }
    } catch {
      shippingIsEstimated = true;
      const fallback = convertAmount(WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER, "ZAR", targetCurrency, rates);
      shipping += fallback;
      shippingLines.push(`- CJ / Dropship (estimated): ${targetCurrency} ${fallback.toFixed(2)}`);
    }
  }

  const grandTotal = subtotal + shipping;
  lines.push(
    "",
    "Shipping costs:",
    ...(shippingLines.length ? shippingLines : [`- Standard shipping: ${targetCurrency} ${shipping.toFixed(2)}`]),
    shippingIsEstimated
      ? "Shipping is estimated right now and may change after live courier confirmation at checkout."
      : "Shipping is fully calculated from current supplier tariffs and live courier quotes.",
    "",
    `Subtotal: ${targetCurrency} ${subtotal.toFixed(2)}`,
    `Shipping: ${targetCurrency} ${shipping.toFixed(2)}`,
    `Total to pay: ${targetCurrency} ${grandTotal.toFixed(2)}`,
    `Checkout: ${baseUrl}/cart`
  );
  return lines.join("\n");
}

async function buildMyResellChannelMessage(params: { user: any; phoneInputForGeo: string }): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const { user, phoneInputForGeo } = params;
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const resellerId = String((user as any)?._id || "").trim();
  const rates = (await getFxRates()).rates;
  const targetCurrency = detectCurrencyFromPhoneDigits(waPhoneToDigits(phoneInputForGeo));

  const resellerStore = await Store.findOne({ userId: user._id, type: "reseller" }).select("name slug").lean();
  const storeName = String((resellerStore as any)?.name || "My Store").trim() || "My Store";
  const storeSlug = String((resellerStore as any)?.slug || "").trim();
  const storePublicUrl = storeSlug ? `${baseUrl}/store/${encodeURIComponent(storeSlug)}` : "";
  const storeShareLink = storePublicUrl
    ? buildWaMeShareFromText(`Shop my store on QwertyHub:\n${storePublicUrl}`)
    : "";

  const wall = await ResellerWall.findOne({ resellerId: user._id })
    .populate({
      path: "products.productId",
      select: "title slug description price discountPrice currency images active allowResell outOfStock",
    })
    .lean();

  const productsRaw = Array.isArray((wall as any)?.products) ? (wall as any).products : [];
  const activeEntries = productsRaw.filter((entry: any) => {
    const p = entry?.productId;
    return p && p.active !== false && p.allowResell !== false && p.outOfStock !== true;
  });

  const headerLines = [
    "🌐 MyStore",
    `Store: ${storeName}`,
    ...(storePublicUrl ? [`Same as website: ${storePublicUrl}`] : ["Your storefront opens when you add your first product."]),
    ...(storeShareLink ? [`Share whole store: ${storeShareLink}`] : []),
    "",
  ];

  if (!activeEntries.length) {
    return {
      message: [
        ...headerLines,
        "No products in your store yet.",
        "Reply 1 to browse products,",
      ].join("\n"),
      mediaCards: [],
    };
  }

  const mediaCards: WaMediaCard[] = [];
  const lines: string[] = [...headerLines, "Products in your store (same list as the website):"];

  activeEntries.forEach((entry: any, idx: number) => {
    const p = entry.productId || {};
    const title = compactText(String(p?.title || "Product"), 48);
    const productCurrency = String(p?.currency || "ZAR").trim().toUpperCase();
    const basePrice = getEffectiveProductPrice(p as { price?: number; discountPrice?: number });
    const markupPctRaw = Number(entry?.resellerCommissionPct);
    const markupPct = Number.isFinite(markupPctRaw) && markupPctRaw >= 3 && markupPctRaw <= 7
      ? Math.round(markupPctRaw)
      : DEFAULT_RESELL_MARKUP_PCT;
    const resellerPrice = Math.round(basePrice * (1 + markupPct / 100) * 100) / 100;
    const localResellerPrice = convertAmount(resellerPrice, productCurrency, targetCurrency, rates);
    const showPrice = `${localResellerPrice.toFixed(2)} ${targetCurrency}`;
    const productId = String(p?._id || "").trim();
    const slugOrId = productId || String(p?.slug || "").trim();
    const buyerPageUrl = buildQwertyHubSharePreviewUrl({
      productSlugOrId: slugOrId,
      resellerId,
      resellerCommissionPct: markupPct,
    });
    const shareOnWhatsAppLink = buildWaMeShareFromText(buyerPageUrl);

    lines.push(`${idx + 1}. ${title}`);
    lines.push(`   ${showPrice} · ${markupPct}% · Buyer link: ${buyerPageUrl}`);
    lines.push(`   Share on WhatsApp: ${shareOnWhatsAppLink}`);

    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "");
    if (image) {
      const description = compactText(stripHtml(String(p?.description || "")), 72);
      mediaCards.push({
        mediaUrl: image,
        caption: [
          `🌐 MyStore · ${storeName}`,
          `📦 ${title}`,
          `💰 ${showPrice} (${markupPct}% markup)`,
          ...(description ? [`📝 ${description}`] : []),
          "",
          "Buyer link (opens in browser):",
          buyerPageUrl,
          "",
          "Share on WhatsApp:",
          shareOnWhatsAppLink,
        ].join("\n"),
      });
    }
  });

  lines.push("", "Reply 1 for new product picks.");
  return {
    message: lines.join("\n"),
    mediaCards: mediaCards.slice(0, 10),
  };
}

async function _buildAdjustMarkupMessage(user: any): Promise<string> {
  const wall = await ResellerWall.findOne({ resellerId: user._id })
    .populate({ path: "products.productId", select: "title active allowResell outOfStock" })
    .lean();
  const entries = Array.isArray((wall as any)?.products) ? (wall as any).products : [];
  const valid = entries
    .filter((entry: any) => {
      const p = entry?.productId;
      return p && p.active !== false && p.allowResell !== false && p.outOfStock !== true;
    })
    .slice(0, 12);

  if (!valid.length) {
    return [
      "Adjust the Markup",
      "",
      "You do not have resold products yet.",
      "Reply 1 to get products, then use: RESELL <code> <3-7>",
    ].join("\n");
  }

  const lines = [
    "Adjust the Markup",
    "Use: RESELL <code> <3-7>",
    `Example: RESELL ab12cd34 ${DEFAULT_RESELL_MARKUP_PCT}`,
    "",
    "Your product codes:",
  ];

  valid.forEach((entry: any, idx: number) => {
    const p = entry?.productId || {};
    const title = compactText(String(p?.title || "Product"), 42);
    const code = String(p?._id || "").slice(0, 8).toLowerCase();
    const current = Number(entry?.resellerCommissionPct || DEFAULT_RESELL_MARKUP_PCT);
    lines.push(`${idx + 1}. ${title}`);
    lines.push(`   Code: ${code} | Current: ${Math.round(current)}%`);
  });

  return lines.join("\n");
}

async function buildAboutQwertyHubPayload(user: any, phoneInputForGeo: string): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const resellerStore = await Store.findOne({ userId: user._id, type: "reseller" }).select("slug name").lean();
  const storeSlug = String((resellerStore as any)?.slug || "").trim();
  const storeName = String((resellerStore as any)?.name || "My Store").trim() || "My Store";
  const storeLink = storeSlug ? `${baseUrl}/store/${encodeURIComponent(storeSlug)}` : `${baseUrl}/store`;
  const waFromDigits = getTwilioWhatsAppFromDigits();
  const topCategories = await listQwertyHubTopCategories();
  const rates = (await getFxRates()).rates;
  const targetCurrency = detectCurrencyFromPhoneDigits(waPhoneToDigits(phoneInputForGeo));

  const match = await buildWaPublicResellMatch({});
  const sample = await Product.aggregate([
    { $match: match },
    { $sample: { size: 20 } },
    { $project: { title: 1, slug: 1, description: 1, price: 1, discountPrice: 1, currency: 1, images: 1, supplierSource: 1 } },
  ]);

  const mediaCards: WaMediaCard[] = [];
  sample.forEach((p: any, idx: number) => {
    const title = compactText(String(p?.title || "Product"), 42);
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const slug = String(p?.slug || "").trim();
    const descriptionRaw = stripHtml(String(p?.description || ""));
    const sourceCurrency = resolveWaSourceCurrency(p);
    const basePrice = getEffectiveProductPrice(p as any);
    const converted = convertAmount(basePrice, sourceCurrency, targetCurrency, rates);
    const price = Number(converted).toFixed(2);
    const productSlugOrId = String(p?._id || "").trim() || slug;
    const productUrl = `${baseUrl}/marketplace/product/${encodeURIComponent(productSlugOrId)}`;
    const tapToResell = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${DEFAULT_RESELL_MARKUP_PCT}`) ||
        waChatCommandFallback("resell", shortCode, DEFAULT_RESELL_MARKUP_PCT)
    );
    const addToCartTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) || waChatCommandFallback("cart", shortCode, 1)
    );
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "");
    if (image) {
      mediaCards.push({
        mediaUrl: image,
        caption: buildQwertyHubProductCardCaption({
          index: idx,
          title,
          targetCurrency,
          price,
          descriptionRaw,
          shortCode,
          resellTapLink: tapToResell,
          autoResellUrl: buildQwertyHubAutoResellUrl(productUrl),
          buyLink: addToCartTapLink,
        }),
      });
    }
  });

  const message = [
    "About QwertyHub",
    "",
    "1) Get products",
    "Reply 1. The bot sends product cards (image, price, resell code, tap-to-resell link, share link).",
    "",
    "Category search (website + WhatsApp):",
    topCategories.length ? `Top categories: ${topCategories.join(", ")}` : "Top categories: loading...",
    "WhatsApp command: CATEGORY <name> (example: CATEGORY Fashion)",
    "Website: use category filters on marketplace page",
    "",
    "2) Resell a product",
    "Tap 'Tap to resell'. It sends RESELL <code> 3 to the bot.",
    "The product is added to your reseller wall/store automatically.",
    "If you do not have a reseller store, one is created automatically.",
    "Adjust markup anytime from menu: 8",
    "Tip: Go to MYSTORE to see all your products on sale",
    "",
    "3) Default markup and markup adjustment",
    "Default markup is 3%.",
    "To change markup, use menu 8 product codes with RESELL <code> <3-7>.",
    `You can also adjust on web via your store page (${storeName}): ${storeLink}`,
    "",
    "4) See your products on sale",
    "Reply 7 (MyStore).",
    "MyStore shows the same products as your website store.",
    "",
    "5) Share products",
    "Use each product Share link to post to WhatsApp group/channel/contact.",
    "",
    "6) Buyer purchase",
    "Buyers open the product/store links and buy on web checkout.",
    "",
    "Random products you can resell now are sent below as image cards.",
  ].join("\n");

  return { message, mediaCards: mediaCards.slice(0, 20) };
}

router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "wa-flow", version: "v1" });
});

router.post("/check-user", async (req: Request, res: Response, next) => {
  try {
    const phone = extractPhoneFromBody(req.body);
    const optionRaw = extractUserInputFromBody(req.body);
    const user = await findWaUserByPhone(phone);
    if (!user) {
      const continueCmd = String(optionRaw || "").replace(/\s+/g, " ").trim();
      if (continueCmd) await setWaPendingContinueAction(phone, continueCmd);
      return res.json({
        code: "USER_NOT_FOUND",
        message: continueCmd ? buildUnregisteredGuidedMessage(continueCmd) : "User not registered.",
      });
    }

    const age = calculateAge((user as any).dateOfBirth);
    const hasAvatar = !!String((user as any).avatar || "").trim();
    if (!hasAvatar) {
      return res.json({
        code: "PROFILE_PICTURE_REQUIRED",
        message: "Please upload a profile picture to continue.",
      });
    }

    if (shouldAttemptPendingContinue(optionRaw)) {
      const pendingCmd = await getWaPendingContinueAction(phone);
      if (pendingCmd) {
        const cartAddPending = await handleWhatsappCartAddCommand(phone, pendingCmd);
        if (cartAddPending.handled && cartAddPending.payload) {
          await clearWaPendingContinueAction(phone);
          return res.json({
            code: "USER_READY_18_PLUS",
            is18Plus: age !== null ? age >= 18 : false,
            menu: cartAddPending.payload.message,
          });
        }
        const resellPending = await handleWhatsappResellCommand(phone, pendingCmd);
        if (resellPending.handled && resellPending.payload) {
          await clearWaPendingContinueAction(phone);
          return res.json({
            code: "USER_READY_18_PLUS",
            is18Plus: age !== null ? age >= 18 : false,
            menu: resellPending.payload.message,
          });
        }
        const payReqPending = await handleWhatsappPayMoneyRequestCommand(phone, pendingCmd);
        if (payReqPending.handled && payReqPending.payload) {
          await clearWaPendingContinueAction(phone);
          return res.json({
            code: "USER_READY_18_PLUS",
            is18Plus: age !== null ? age >= 18 : false,
            menu: payReqPending.payload.message,
          });
        }
      }
    }

    // Reliability: process CART/RESELL commands even when Studio restarts from Trigger/check-user.
    if (optionRaw) {
      const cartAdd = await handleWhatsappCartAddCommand(phone, optionRaw);
      if (cartAdd.handled && cartAdd.payload) {
        return res.json({
          code: "USER_READY_18_PLUS",
          is18Plus: age !== null ? age >= 18 : false,
          menu: cartAdd.payload.message,
        });
      }
      const resell = await handleWhatsappResellCommand(phone, optionRaw);
      if (resell.handled && resell.payload) {
        return res.json({
          code: "USER_READY_18_PLUS",
          is18Plus: age !== null ? age >= 18 : false,
          menu: resell.payload.message,
        });
      }
      const payReq = await handleWhatsappPayMoneyRequestCommand(phone, optionRaw);
      if (payReq.handled && payReq.payload) {
        return res.json({
          code: "USER_READY_18_PLUS",
          is18Plus: age !== null ? age >= 18 : false,
          menu: payReq.payload.message,
        });
      }
    }

    const username = String((user as any).username || "").trim();
    const name = (user as any).name || "user";
    const displayForWelcome = username || name;
    const is18Plus = age !== null ? age >= 18 : false;
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    return res.json({
      code: is18Plus ? "USER_READY_18_PLUS" : "USER_READY_UNDER_18",
      is18Plus,
      menu: buildMainMenu(displayForWelcome, includeAdjustMarkup),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/register", async (req: Request, res: Response, next) => {
  try {
    const phoneInput = String(req.body?.phone || "");
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    const dateOfBirthRaw = String(req.body?.dateOfBirth || "").trim();
    const avatarUrl = String(req.body?.avatarUrl || req.body?.avatarMediaUrl || "").trim();
    const usernameInput = String(req.body?.username || "").trim().toLowerCase();

    if (!phoneInput || !name || !password || !dateOfBirthRaw) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "phone, name, password and dateOfBirth are required." });
    }
    if (!avatarUrl) {
      return res.status(400).json({ code: "PROFILE_PICTURE_REQUIRED", message: "Profile picture is required for WhatsApp registration." });
    }

    const phoneDigits = waPhoneToDigits(phoneInput);
    if (phoneDigits.length < 10) {
      return res.status(400).json({ code: "INVALID_PHONE", message: "Invalid phone number." });
    }

    const dateOfBirth = new Date(dateOfBirthRaw);
    if (Number.isNaN(dateOfBirth.getTime())) {
      return res.status(400).json({ code: "INVALID_DOB", message: "Invalid dateOfBirth. Use YYYY-MM-DD." });
    }
    const age = calculateAge(dateOfBirth);
    if (age === null || age < 13) {
      return res.status(400).json({ code: "UNDER_MIN_AGE", message: "You must be at least 13 years old to register." });
    }

    const existing = await findWaUserByPhone(phoneDigits);
    if (existing) {
      return res.status(400).json({ code: "USER_EXISTS", message: "Phone already registered." });
    }

    let username = usernameInput;
    if (username) {
      const existsUsername = await User.findOne({ username });
      if (existsUsername) {
        return res.status(400).json({ code: "USERNAME_TAKEN", message: "Username already taken." });
      }
    } else {
      username = await generateUniqueUsername(name);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      username,
      email: waEmailFromPhoneDigits(phoneDigits),
      phone: phoneDigits,
      passwordHash,
      dateOfBirth,
      avatar: avatarUrl,
      role: ["client"],
      isVerified: true,
    });
    await Wallet.create({ user: user._id });
    await clearWaPendingContinueAction(phoneDigits);

    const is18Plus = (age ?? 0) >= 18;
    // 200 (not 201): Twilio Studio HTTP Request treats non-2xx as failure; some configs only accept 200.
    res.status(200).json({
      code: "REGISTER_SUCCESS",
      is18Plus,
      menu: buildMainMenu(username || name, false),
      user: {
        id: user._id,
        username,
        phone: phoneDigits,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/profile-picture/update", async (req: Request, res: Response, next) => {
  try {
    const phone = String(req.body?.phone || "");
    const avatarUrl = String(req.body?.avatarUrl || req.body?.avatarMediaUrl || "").trim();
    if (!phone || !avatarUrl) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "phone and avatar media URL are required." });
    }
    const user = await findWaUserByPhone(phone);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND" });
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    (user as any).avatar = avatarUrl;
    await user.save();
    const age = calculateAge((user as any).dateOfBirth);
    return res.json({
      code: "PROFILE_PICTURE_UPDATED",
      is18Plus: age !== null ? age >= 18 : false,
      menu: buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup),
      message: "Profile picture updated successfully.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/menu", async (req: Request, res: Response, next) => {
  try {
    const phone = extractPhoneFromBody(req.body);
    const raw = extractUserInputFromBody(req.body);
    const option = raw.toLowerCase();
    const categoryMatch = raw.match(/^\s*category\s+(.+)$/i);
    const isMyStoreShortcut =
      option === "mystore" ||
      option === "my store" ||
      option === "my-store" ||
      option === "myresell" ||
      option === "my resell" ||
      option === "channel";
    const cartAdd = await handleWhatsappCartAddCommand(phone, raw);
    if (cartAdd.handled && cartAdd.payload) {
      return res.json(cartAdd.payload);
    }
    const resell = await handleWhatsappResellCommand(phone, raw);
    if (resell.handled && resell.payload) {
      return res.json(resell.payload);
    }
    const payMoneyReq = await handleWhatsappPayMoneyRequestCommand(phone, raw);
    if (payMoneyReq.handled && payMoneyReq.payload) {
      return res.json(payMoneyReq.payload);
    }
    if (shouldAttemptPendingContinue(raw)) {
      const pendingCmd = await getWaPendingContinueAction(phone);
      if (pendingCmd) {
        const pendingCart = await handleWhatsappCartAddCommand(phone, pendingCmd);
        if (pendingCart.handled && pendingCart.payload) {
          await clearWaPendingContinueAction(phone);
          return res.json(pendingCart.payload);
        }
        const pendingResell = await handleWhatsappResellCommand(phone, pendingCmd);
        if (pendingResell.handled && pendingResell.payload) {
          await clearWaPendingContinueAction(phone);
          return res.json(pendingResell.payload);
        }
        const pendingPayReq = await handleWhatsappPayMoneyRequestCommand(phone, pendingCmd);
        if (pendingPayReq.handled && pendingPayReq.payload) {
          await clearWaPendingContinueAction(phone);
          return res.json(pendingPayReq.payload);
        }
      }
    }
    const user = await findWaUserByPhone(phone);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND" });
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);

    const age = calculateAge((user as any).dateOfBirth);
    const is18Plus = age !== null && age >= 18;
    const mochinaState = await handleMochinaConversationState(user, phone, raw);
    if (mochinaState.handled) {
      if (mochinaState.payload?.code === "MOCHINA_BACK") {
        return res.json({
          code: "BACK_TO_MENU",
          message: buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup),
        });
      }
      return res.json(mochinaState.payload);
    }

    const menuKey = normalizeWaMenuDigitInput(raw);

    if (option === "y" || option === "yes" || option === "yes please" || option === "👍") {
      return res.json({
        code: "MORE_HELP",
        message: buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup),
      });
    }
    if (categoryMatch) {
      const categoryName = String(categoryMatch[1] || "").trim();
      const payload = await buildQwertyHubCategoryMessage({ category: categoryName, phoneInputForGeo: phone });
      const cards = Array.isArray(payload.mediaCards) ? payload.mediaCards : [];
      if (cards.length) {
        setTimeout(() => {
          sendWhatsAppMediaGallery(phone, cards).catch((err) => {
            logger.warn("Failed to send WhatsApp category media gallery", { error: String((err as any)?.message || err) });
          });
        }, 900);
      }
      return res.json({
        code: "CATEGORY_RESULTS",
        message: payload.message,
      });
    }
    if (option === "n" || option === "no" || option === "no thanks" || option === "👎") {
      return res.json({
        code: "GOODBYE",
        message: "Thanks for using Qwertymates. See you soon! 👋",
      });
    }

    switch (menuKey) {
      case "1": {
        const aboutText = buildAboutQwertymatesMessage();
        const chunks = chunkLongMessageByLines(aboutText, 1200);
        const menuText = buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup);
        setTimeout(async () => {
          for (const chunk of chunks) {
            try {
              await sendWhatsAppText(phone, chunk);
              await delay(350);
            } catch (err) {
              logger.warn("Failed to send About Qwertymates chunk", {
                error: String((err as any)?.message || err),
              });
              break;
            }
          }
          try {
            await sendWhatsAppText(phone, menuText);
          } catch (err) {
            logger.warn("Failed to send main menu after About Qwertymates", {
              error: String((err as any)?.message || err),
            });
          }
        }, 500);
        return res.json({
          code: "SELL_INFO_SILENT",
          message: "\u200b",
        });
      }
      case "2": {
        const marketplacePayload = await buildQwertyHubMarketplaceMessage(phone);
        const cards = Array.isArray(marketplacePayload.mediaCards) ? marketplacePayload.mediaCards : [];
        const menuText = buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup);
        setTimeout(() => {
          void (async () => {
            try {
              await sendWhatsAppMediaGallery(phone, cards, { limit: QWERTYHUB_MARKETPLACE_MEDIA_LIMIT, gapMs: 700 });
              await delay(1200);
              await sendWhatsAppText(phone, menuText);
            } catch (err) {
              logger.warn("QwertyHub marketplace option 2 sequence failed", {
                error: String((err as any)?.message || err),
              });
            }
          })();
        }, 500);
        return res.json({
          code: "SELL_INFO_SILENT",
          message: "\u200b",
        });
      }
      case "3": {
        const channelPayload = await buildMyResellChannelMessage({ user, phoneInputForGeo: phone });
        const cards = Array.isArray(channelPayload.mediaCards) ? channelPayload.mediaCards : [];
        if (cards.length) {
          setTimeout(() => {
            sendWhatsAppMediaGallery(phone, cards).catch((err) => {
              logger.warn("Failed to send WhatsApp reseller channel media gallery", { error: String((err as any)?.message || err) });
            });
          }, 900);
        }
        return res.json({
          code: "MYSTORE_CHANNEL",
          message: channelPayload.message,
        });
      }
      case "4":
        return res.json({
          code: "RUNNER_INFO",
          message:
            "Join Errands Runners. Complete verification requirements here: https://www.qwertymates.com/dashboard/runner",
        });
      case "5":
        return res.json({
          code: "ACBPAY_MENU",
          message: buildWalletMenu(),
        });
      case "8":
        return res.json({
          code: "YESPLAY_LINK",
          message: "https://goyesplay.com/y076dc110",
        });
      case "9":
        if (!is18Plus) {
          return res.json({
            code: "AGE_RESTRICTED_MOCHINA",
            message: "Mochina is available for users aged 18+ only.",
          });
        }
        await saveMochinaState((user as any)._id, "main", {}, 30);
        return res.json({
          code: "MOCHINA_MENU",
          message: buildMochinaMenu(),
        });
      case "6":
        return res.json({
          code: "EMPLOYMENT_INFO",
          message: [
            "We hire Qwertymates Community Onboarding Agents to do the following",
            "",
            "🏪 Register Stores: Capture store name and contact number.",
            "",
            "📸 Take Store Photo: Upload a clear picture of the storefront.",
            "",
            "📍 Verify Location: Share GPS location to confirm authenticity.",
            "",
            "💳 Enable Wallet Access: Registered stores become ACBPayWallet cash agents.",
            "",
            "🎯 Earn Rewards: Get paid per store and climb the incentive ladder.",
          ].join("\n"),
        });
      case "7":
        return res.json({
          code: "CART_SUMMARY",
          message: await buildWaCartMessage(user, phone),
        });
      case "10": {
        const about = await buildAboutQwertyHubPayload(user, phone);
        const fullText = about.message;
        const chunks = chunkLongMessageByLines(fullText, 1200);
        const rest = chunks;
        const cards = Array.isArray(about.mediaCards) ? about.mediaCards : [];
        if (cards.length || rest.length) {
          setTimeout(async () => {
            if (cards.length) {
              try {
                await sendWhatsAppMediaGallery(phone, cards);
              } catch (err) {
                logger.warn("Failed to send About QwertyHub media cards", { error: String((err as any)?.message || err) });
              }
            }
            for (const chunk of rest) {
              try {
                await sendWhatsAppText(phone, chunk);
              } catch (err) {
                logger.warn("Failed to send About QwertyHub chunk", { error: String((err as any)?.message || err) });
                break;
              }
            }
          }, 900);
        }
        return res.json({
          code: "ABOUT_QWERTYHUB",
          message: "QwertyHub(Marketplace): loading products...",
        });
      }
      default:
        if (isMyStoreShortcut) {
          const channelPayload = await buildMyResellChannelMessage({ user, phoneInputForGeo: phone });
          const cards = Array.isArray(channelPayload.mediaCards) ? channelPayload.mediaCards : [];
          if (cards.length) {
            setTimeout(() => {
              sendWhatsAppMediaGallery(phone, cards).catch((err) => {
                logger.warn("Failed to send WhatsApp MyStore shortcut media gallery", { error: String((err as any)?.message || err) });
              });
            }, 900);
          }
          return res.json({
            code: "MYSTORE_CHANNEL",
            message: channelPayload.message,
          });
        }
        return res.json({
          code: "INVALID_OPTION",
          message: buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup),
        });
    }
  } catch (err) {
    next(err);
  }
});

router.post("/wallet/balance", async (req: Request, res: Response, next) => {
  try {
    const phone = String(req.body?.phone || "");
    const user = await findWaUserByPhone(phone);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND" });
    const wallet = await Wallet.findOne({ user: user._id });
    return res.json({
      code: "SUCCESS",
      balance: Number(wallet?.balance || 0),
      message: `Wallet balance: R${Number(wallet?.balance || 0).toFixed(2)}`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet/send-money-link", async (req: Request, res: Response, next) => {
  try {
    const fromPhone = String(req.body?.phone || "");
    const toPhone = String(req.body?.toPhone || "");
    const amount = Number(req.body?.amount || 0);
    if (!fromPhone || !toPhone || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "phone, toPhone and positive amount required." });
    }
    const fromUser = await findWaUserByPhone(fromPhone);
    const toUser = await findWaUserByPhone(toPhone);
    if (!fromUser || !toUser) return res.status(404).json({ code: "USER_NOT_FOUND", message: "Sender or recipient not found." });
    const link = `${FRONTEND_URL}/wallet?to=${(toUser as any).username || toUser._id}&amount=${amount.toFixed(2)}&source=wa`;
    return res.json({ code: "SUCCESS", payLink: link, message: `Share this pay link with recipient: ${link}` });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet/request-money-link", async (req: Request, res: Response, next) => {
  try {
    const fromPhone = String(req.body?.phone || "");
    const targetPhone = String(req.body?.targetPhone || "");
    const amount = Number(req.body?.amount || 0);
    if (!fromPhone || !targetPhone || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "phone, targetPhone and positive amount required." });
    }
    const requester = await findWaUserByPhone(fromPhone);
    const payer = await findWaUserByPhone(targetPhone);
    if (!requester || !payer) return res.status(404).json({ code: "USER_NOT_FOUND", message: "Requester or payer not found." });
    const link = `${FRONTEND_URL}/wallet?requestFrom=${(payer as any).username || payer._id}&amount=${amount.toFixed(2)}&source=wa`;
    return res.json({ code: "SUCCESS", requestLink: link, message: `Send this request link: ${link}` });
  } catch (err) {
    next(err);
  }
});

async function handleWalletConversationState(user: any, rawInput: string): Promise<{ handled: boolean; payload?: any }> {
  const st = await WaConversationState.findOne({ user: user._id, scope: "wallet" }).lean();
  if (!st) return { handled: false };
  if (new Date(st.expiresAt).getTime() < Date.now()) {
    await clearWalletState(user._id);
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    return {
      handled: true,
      payload: {
        code: "BACK_TO_MENU",
        message: `ACBPayWallet session expired after ${WA_WALLET_INACTIVITY_TIMEOUT_MIN} minutes of inactivity.\n\n${buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup)}`,
      },
    };
  }

  const input = String(rawInput || "").trim();
  const step = String(st.step || "");
  const payload = (st.payload || {}) as Record<string, any>;

  // "0" = back to main menu (same as wallet root menu). Must run before phone/amount validation in sub-steps.
  if (input === "0") {
    await clearWalletState(user._id);
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    return {
      handled: true,
      payload: {
        code: "BACK_TO_MENU",
        message: buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup),
      },
    };
  }

  if (step === "send_money_phone") {
    if (!isValidInternationalPhone(input)) {
      return { handled: true, payload: { code: "INVALID_PHONE", message: "Please enter the number in the correct format: +27123456789" } };
    }
    const recipient = await findWaUserByPhone(input);
    if (!recipient) {
      return { handled: true, payload: { code: "RECIPIENT_NOT_FOUND", message: "User not found for that number. Please enter a registered number in format +27123456789." } };
    }
    if (String((recipient as any)._id) === String(user._id)) {
      return { handled: true, payload: { code: "INVALID_RECIPIENT", message: "You cannot send money to yourself. Enter another number in format +27123456789." } };
    }
    await saveWalletState(user._id, "send_money_amount", { recipientId: String((recipient as any)._id), recipientPhone: String((recipient as any).phone || "") });
    return { handled: true, payload: { code: "SEND_MONEY_AMOUNT_PROMPT", message: "Enter amount in ZAR. Example: 120" } };
  }

  if (step === "send_money_amount") {
    const amount = parsePositiveAmount(input);
    if (!amount) {
      return { handled: true, payload: { code: "INVALID_AMOUNT", message: "Please enter a valid amount. Example: 120" } };
    }
    let senderWallet = await Wallet.findOne({ user: user._id });
    if (!senderWallet) senderWallet = await Wallet.create({ user: user._id });
    let recipientWallet = await Wallet.findOne({ user: payload.recipientId });
    if (!recipientWallet) recipientWallet = await Wallet.create({ user: payload.recipientId });

    const senderBal = Math.round(Number(senderWallet.balance || 0) * 100) / 100;
    const sendAmt = Math.round(amount * 100) / 100;
    const fromWallet = Math.min(Math.max(senderBal, 0), sendAmt);
    const shortfall = Math.round((sendAmt - fromWallet) * 100) / 100;

    if (fromWallet > 0) {
      const partRef = `WA-SEND-PART-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      senderWallet.balance = Math.round((senderWallet.balance - fromWallet) * 100) / 100;
      senderWallet.transactions.push({ type: "debit", amount: -fromWallet, reference: partRef, createdAt: new Date() });
      await senderWallet.save();
      recipientWallet.balance = Math.round((recipientWallet.balance + fromWallet) * 100) / 100;
      recipientWallet.transactions.push({ type: "credit", amount: fromWallet, reference: partRef, createdAt: new Date() });
      await recipientWallet.save();
      if (payload.recipientPhone) {
        const fullByWallet = shortfall <= 0;
        await sendSms({
          phone: String(payload.recipientPhone),
          channel: "whatsapp",
          text: fullByWallet
            ? `You received R${sendAmt.toFixed(2)} in your ACBPayWallet. Ref: ${partRef}`
            : `You received R${fromWallet.toFixed(2)} in your ACBPayWallet (part of R${sendAmt.toFixed(2)}; the rest is paid by card to your wallet). Ref: ${partRef}`,
        }).catch(() => {});
      }
    }

    if (shortfall > 0) {
      const reference = `TOPUP-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      await Payment.create({
        user: payload.recipientId,
        amount: shortfall,
        reference,
        status: "pending",
        metadata: {
          directWalletSend: true,
          senderUserId: String(user._id),
          recipientUserId: String(payload.recipientId),
          senderPhone: String((user as any).phone || ""),
          recipientPhone: String(payload.recipientPhone || ""),
          sendAmount: sendAmt,
          partialFromWallet: fromWallet,
        },
      });
      const paymentResult = await initiatePayment({
        amount: shortfall,
        reference,
        email: String((user as any).email || ""),
        returnUrl: `${FRONTEND_URL.replace(/\/$/, "")}/pay/complete?flow=wa-send&ref=${encodeURIComponent(reference)}`,
        notifyUrl: `${API_PUBLIC_URL.replace(/\/$/, "")}/api/payments/webhook`,
      });
      await clearWalletState(user._id);
      if (!paymentResult.success || (!paymentResult.paymentUrl && !paymentResult.payGateRedirect)) {
        try {
          await Payment.deleteOne({ reference });
        } catch {
          /* ignore */
        }
        return {
          handled: true,
          payload: {
            code: "INSUFFICIENT_BALANCE",
            message: `Insufficient balance. You need R${sendAmt.toFixed(2)} or more. A PayGate link could not be started (${paymentResult.error || "check PayGate and FRONTEND_URL/BACKEND_URL on the server"}).`,
          },
        };
      }
      return {
        handled: true,
        payload: {
          code: "TOPUP_REQUIRED",
          message: `Insufficient balance. You need R${sendAmt.toFixed(2)} or more. A payment link will be sent to you shortly. Use PayGate here (funds go directly to the recipient's wallet):\n${paymentResult.paymentUrl || ""}`,
        },
      };
    }

    await clearWalletState(user._id);

    return {
      handled: true,
      payload: {
        code: "SEND_MONEY_SUCCESS",
        message: `Payment successful. R${sendAmt.toFixed(2)} sent. New balance: R${senderWallet.balance.toFixed(2)}`,
      },
    };
  }

  if (step === "request_money_phone") {
    if (!isValidInternationalPhone(input)) {
      return { handled: true, payload: { code: "INVALID_PHONE", message: "Please enter the number in the correct format: +27123456789" } };
    }
    const payer = await findWaUserByPhone(input);
    if (!payer) {
      return { handled: true, payload: { code: "PAYER_NOT_FOUND", message: "User not found for that number. Please enter a registered number in format +27123456789." } };
    }
    if (String((payer as any)._id) === String(user._id)) {
      return { handled: true, payload: { code: "INVALID_PAYER", message: "You cannot request money from yourself. Enter another number in format +27123456789." } };
    }
    await saveWalletState(user._id, "request_money_amount", { payerId: String((payer as any)._id), payerPhone: String((payer as any).phone || "") });
    return { handled: true, payload: { code: "REQUEST_MONEY_AMOUNT_PROMPT", message: "Enter amount in ZAR. Example: 120" } };
  }

  if (step === "request_money_amount") {
    const amount = parsePositiveAmount(input);
    if (!amount) {
      return { handled: true, payload: { code: "INVALID_AMOUNT", message: "Please enter a valid amount. Example: 120" } };
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const actionToken = generateMoneyRequestActionToken().toLowerCase();
    const moneyRequest = await MoneyRequest.create({
      fromUser: user._id,
      toUser: payload.payerId,
      amount,
      status: "pending",
      notifyChannel: "whatsapp",
      expiresAt,
      reference: `REQ-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      actionToken,
    });
    const baseFe = FRONTEND_URL.replace(/\/$/, "");
    // Single-link flow: always send one public request-payment page URL.
    const webLink = `${baseFe}/pay/request?requestId=${moneyRequest._id}&token=${encodeURIComponent(actionToken)}`;
    if (payload.payerPhone) {
      await sendSms({
        phone: String(payload.payerPhone),
        channel: "whatsapp",
        text: [
          `${menuDisplayName(user)} requested R${amount.toFixed(2)} from you via ACBPayWallet.`,
          `Tap the link to pay: ${webLink}`,
        ]
          .filter(Boolean)
          .join(" "),
      }).catch(() => {});
    }
    await clearWalletState(user._id);
    return {
      handled: true,
      payload: {
        code: "REQUEST_MONEY_SENT",
        message: "Request sent successfully",
      },
    };
  }

  if (step === "withdraw_agent_phone") {
    if (!isValidInternationalPhone(input)) {
      return { handled: true, payload: { code: "INVALID_PHONE", message: "Please enter the agent number in the correct format: +27123456789" } };
    }
    const agent = await findWaUserByPhone(input);
    if (!agent) return { handled: true, payload: { code: "AGENT_NOT_FOUND", message: "Agent not found for that number." } };
    if (String((agent as any)._id) === String(user._id)) {
      return { handled: true, payload: { code: "INVALID_AGENT", message: "You cannot use your own number as agent." } };
    }
    if (!canOperateAsMerchantAgent(agent)) {
      return { handled: true, payload: { code: "AGENT_NOT_APPROVED", message: "That number is not an approved merchant agent." } };
    }
    await saveWalletState(user._id, "withdraw_agent_amount", { agentId: String((agent as any)._id), agentPhone: String((agent as any).phone || ""), agentName: menuDisplayName(agent) });
    return { handled: true, payload: { code: "WITHDRAW_AMOUNT_PROMPT", message: "Enter withdrawal amount in ZAR. Example: 120" } };
  }

  if (step === "withdraw_agent_amount") {
    const amount = parsePositiveAmount(input);
    if (!amount) return { handled: true, payload: { code: "INVALID_AMOUNT", message: "Please enter a valid amount. Example: 120" } };
    const wallet = await Wallet.findOne({ user: user._id });
    if (!wallet || wallet.balance < amount) {
      await clearWalletState(user._id);
      return { handled: true, payload: { code: "INSUFFICIENT_BALANCE", message: "Insufficient wallet balance for this withdrawal." } };
    }
    const otp = randomOtp6();
    await saveWalletState(
      user._id,
      "withdraw_agent_otp",
      { ...payload, amount, otp, otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() },
      6
    );
    if (payload.agentPhone) {
      await sendSms({
        phone: String(payload.agentPhone),
        channel: "whatsapp",
        text: `ACBPayWallet withdrawal OTP: ${otp}. Share this code with customer to complete cash withdrawal.`,
      }).catch(() => {});
    }
    return { handled: true, payload: { code: "WITHDRAW_OTP_SENT", message: "OTP sent to agent. Enter the OTP to complete withdrawal." } };
  }

  if (step === "withdraw_agent_otp") {
    const otp = input.replace(/\D/g, "");
    const expected = String(payload.otp || "");
    const expiryMs = new Date(String(payload.otpExpiresAt || "")).getTime();
    if (!expected || Number.isNaN(expiryMs) || Date.now() > expiryMs) {
      await clearWalletState(user._id);
      return { handled: true, payload: { code: "OTP_EXPIRED", message: "OTP expired. Start option 4 again." } };
    }
    if (otp !== expected) {
      return { handled: true, payload: { code: "OTP_INVALID", message: "Invalid OTP. Enter the correct code sent to the agent." } };
    }

    const customerWallet = await Wallet.findOne({ user: user._id });
    if (!customerWallet || customerWallet.balance < Number(payload.amount || 0)) {
      await clearWalletState(user._id);
      return { handled: true, payload: { code: "INSUFFICIENT_BALANCE", message: "Insufficient wallet balance for this withdrawal." } };
    }
    let agentWallet = await Wallet.findOne({ user: payload.agentId });
    if (!agentWallet) agentWallet = await Wallet.create({ user: payload.agentId });
    const amount = Number(payload.amount || 0);
    const reference = `AGENT-WD-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    customerWallet.balance -= amount;
    customerWallet.transactions.push({ type: "debit", amount: -amount, reference, createdAt: new Date() });
    await customerWallet.save();
    agentWallet.balance += amount;
    agentWallet.transactions.push({ type: "credit", amount, reference, createdAt: new Date() });
    await agentWallet.save();
    await MerchantAgentCashTx.create({
      kind: "cash_withdrawal",
      status: "completed",
      agent: payload.agentId,
      customer: user._id,
      amount,
      reference,
      expiresAt: new Date(),
      completedAt: new Date(),
    });
    if (payload.agentPhone) {
      await sendSms({
        phone: String(payload.agentPhone),
        channel: "whatsapp",
        text: `Withdrawal confirmed. Hand over cash R${amount.toFixed(2)} to customer. Ref ${reference}`,
      }).catch(() => {});
    }
    await clearWalletState(user._id);
    return {
      handled: true,
      payload: {
        code: "WITHDRAW_SUCCESS",
        message: `Withdrawal confirmed. R${amount.toFixed(2)} moved to agent for cash handover. Ref ${reference}`,
      },
    };
  }

  return { handled: false };
}

router.post("/wallet/menu-action", async (req: Request, res: Response, next) => {
  try {
    const phone = extractPhoneFromBody(req.body);
    const raw = extractUserInputFromBody(req.body);
    const optionLower = raw.toLowerCase();
    const cartAdd = await handleWhatsappCartAddCommand(phone, raw);
    if (cartAdd.handled && cartAdd.payload) {
      return res.json(cartAdd.payload);
    }
    const resell = await handleWhatsappResellCommand(phone, raw);
    if (resell.handled && resell.payload) {
      return res.json(resell.payload);
    }
    const payMoneyReq = await handleWhatsappPayMoneyRequestCommand(phone, raw);
    if (payMoneyReq.handled && payMoneyReq.payload) {
      return res.json(payMoneyReq.payload);
    }
    const user = await findWaUserByPhone(phone);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND" });
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    const pending = await handleWalletConversationState(user, raw);
    if (pending.handled) return res.json(pending.payload);

    if (optionLower === "y" || optionLower === "yes" || optionLower === "yes please" || optionLower === "👍") {
      return res.json({
        code: "MORE_HELP",
        message: buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup),
      });
    }
    if (optionLower === "n" || optionLower === "no" || optionLower === "no thanks" || optionLower === "👎") {
      return res.json({
        code: "GOODBYE",
        message: "Thanks for using Qwertymates. See you soon! 👋",
      });
    }

    const option = raw;

    if (option === "0") {
      await clearWalletState((user as any)._id);
      return res.json({
        code: "BACK_TO_MENU",
        message: buildMainMenu((user as any).username || (user as any).name || "user", includeAdjustMarkup),
      });
    }

    if (option === "1") {
      const wallet = await Wallet.findOne({ user: user._id });
      return res.json({
        code: "SUCCESS",
        balance: Number(wallet?.balance || 0),
        message: `Wallet balance: R${Number(wallet?.balance || 0).toFixed(2)}`,
      });
    }

    if (option === "2") {
      await saveWalletState((user as any)._id, "send_money_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return res.json({
        code: "SEND_MONEY_PHONE_PROMPT",
        message: "Enter the cellphone number of the person you want to send money to, in this format: +27123456789",
      });
    }

    if (option === "3") {
      await saveWalletState((user as any)._id, "request_money_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return res.json({
        code: "REQUEST_MONEY_PHONE_PROMPT",
        message: "Enter the cellphone number of the person you want to request money from, in this format: +27123456789",
      });
    }

    if (option === "4") {
      await saveWalletState((user as any)._id, "withdraw_agent_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return res.json({
        code: "WITHDRAW_AGENT_PHONE_PROMPT",
        message: "Enter the merchant agent cellphone number in this format +27123456789",
      });
    }

    if (option === "5") {
      const qrPayload = `ACBPAY:${String((user as any)._id || "").trim()}`;
      const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(qrPayload)}&size=640&format=png&ecLevel=M`;
      setTimeout(() => {
        sendWhatsAppMediaGallery(phone, [
          {
            mediaUrl: qrUrl,
            caption: [
              "My ACBPayWallet QR code",
              "",
              "Show this QR to payer for scan-and-pay.",
              "Reply 0 to go back to main menu.",
            ].join("\n"),
          },
        ]).catch((err) => {
          logger.warn("Failed to send wallet QR image", {
            error: String((err as any)?.message || err),
          });
        });
      }, 350);
      return res.json({
        code: "QR_INFO",
        message: "Generating your QR code image...",
      });
    }

    return res.json({ code: "INVALID_OPTION", message: buildWalletMenu() });
  } catch (err) {
    next(err);
  }
});

export default router;
