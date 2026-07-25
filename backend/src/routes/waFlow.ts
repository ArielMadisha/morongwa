import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
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
import Task from "../data/models/Task";
import AuditLog from "../data/models/AuditLog";
import TuckshopCashAgentRegistration from "../data/models/TuckshopCashAgentRegistration";
import { getAgentCommissionSummary, emailAgentEarningsReportForUser } from "../services/agentEarningsService";
import Escrow from "../data/models/Escrow";
import { isValidForOtp, normalizePhone } from "../utils/phoneValidation";
import { assertRegistrationAllowed } from "../utils/registrationSecurity";
import { getFxRates } from "../services/fxService";
import { logger } from "../services/monitoring";
import { slugify } from "../utils/helpers";
import { initiatePayment } from "../services/payment";
import { sendSms } from "../services/otpDelivery";
import { normalizeWaPublicLinkUrl } from "../utils/waSignedLink";
import { generateMoneyRequestActionToken, settleMoneyRequestFromWallet, initiateTopupForMoneyRequest } from "../services/moneyRequestService";
import {
  listOpenPendingStorePaymentsForPayer,
  settlePendingStorePaymentWithWallet,
} from "../services/walletQrPaymentService";
import {
  buildPayAtStoreConfirmCaption,
  buildPayAtStoreQrCaption,
  buildPayAtStoreWaitingActions,
  sendWaPayAtStoreQrMessage,
} from "../services/waPayAtStoreMessaging";
import { AppError } from "../middleware/errorHandler";
import { findMatchingRunners } from "../services/matching";
import { sendNotification, notifyPlatformAdminsRealtime } from "../services/notification";
import {
  selectSponsoredVideoForPlacement,
  isSponsoredVideoUrl,
  waPlacementKeyForSponsoredAction,
  moduleCategoryForWaSponsoredAction,
  recordSponsoredVideoImpression,
  resolveWaFallbackSponsoredVideoPick,
  resolveWaBronzePremenuText,
  isTrackedSponsoredPick,
} from "../services/sponsoredVideoAdService";
import {
  getBotswanaWhatsappSendProfile,
  getTwilioWhatsAppApiCredentials,
  resolveWhatsappSendProfile,
  waChannelAddressToDigits,
} from "../utils/twilioWaCredentials";
import {
  scheduleOnboardingAgentFraudScan,
  scheduleTuckshopFraudScan,
} from "../services/registrationFraudScan";
import { bumpStatusStripCache } from "../services/statusStripPolicy";
import { publishProfileAvatarFeedUpdate } from "../services/profileAvatarFeed";
import {
  buildTshwaneRegionPickerMessage,
  buildTshwaneTownshipPickerMessage,
  getTshwaneTownshipById,
  resolveTshwaneRegionFromMenuDigit,
  resolveTshwaneTownshipFromRegionIndex,
  type TshwaneRegionId,
} from "../data/tshwaneCoverageAreas";
import {
  formatTshwaneQuoteWhatsApp,
  quoteLocalErrandTshwane,
  quoteTransportTshwane,
  transportBandFromKg,
  type LocalServiceKey,
} from "../services/errandPricingTshwane";
import {
  buildTshwanePostedFlowDraft,
  createPostedTshwaneErrandTask,
  estimateTshwanePostedFlowPrice,
  normalizeErrandTaskTypeForDb,
} from "../services/tshwaneErrandTaskService";
import { isSubstantialLocalErrandDeliveryText, isSubstantialLocalErrandPickupText } from "../utils/tshwaneErrandAddressText";
import { effectiveResellerMarkupPctFromWall, resellerMarkupBoundsForProductCategories } from "../config/marketplaceCategoryMarkups";
import { normalizeBulkTierMaxQty } from "../config/bulkTierLimits";
import { getProductPriceForQty } from "../utils/productPricing";
import {
  buildPublicProductMatch,
  DROPSHIP_SOURCES,
  getApprovedSupplierIds,
} from "../services/publicProductListing";
import { enrichProductsWithStoreFields } from "../services/enrichProductStoreFields";
import { resolveWaCatalogPriceDisplay } from "../utils/waCatalogPrice";
import {
  buildErrandsIntroMenuBody,
  ERRANDS_ANDROID_PLAY_URL,
  ERRANDS_DASHBOARD_URL,
} from "../content/errandsMarketing";

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.qwertymates.com";
const API_PUBLIC_URL = process.env.BACKEND_URL || "https://api.qwertymates.com";
const WA_CART_DEFAULT_SHIPPING_PER_SUPPLIER = 100;
/** All WhatsApp sub-menus (wallet, errands, jobs, cash agent, about) auto-exit after this idle period. */
const WA_INTERACTIVE_IDLE_MIN = 3;
const WA_WALLET_INACTIVITY_TIMEOUT_MIN = WA_INTERACTIVE_IDLE_MIN;
const WA_PENDING_CONTINUE_TTL_MS = 60 * 60 * 1000;
const WA_PENDING_CONTINUE_SCOPE = "wa_pending_continue";
const WA_PENDING_CONTINUE_STEP = "resume_command";
const WA_ABOUT_ACTION_SCOPE = "wa_about_actions";
const WA_ABOUT_ACTION_STEP = "about_reply_menu";
const WA_ABOUT_ACTION_TTL_MS = WA_INTERACTIVE_IDLE_MIN * 60 * 1000;
/** WhatsApp wizard: main menu option 9 — tuckshop cash agent (individual / company). */
const CASH_AGENT_REG_SCOPE = "cash_agent_reg";

function waPhoneToDigits(input: string): string {
  const raw = String(input || "").trim().replace(/^whatsapp:/i, "");
  let digits = normalizePhone(raw);
  // Already E.164-style (e.g. Botswana +267…, SA +27…): never prepend 27.
  if (/^(267|27|263|260|264|266|268)/.test(digits)) return digits;
  // Local leading 0 (legacy national format): assume South Africa mobile for backward compatibility.
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  return digits;
}

function waEmailFromPhoneDigits(phoneDigits: string): string {
  return `wa_${phoneDigits}@morongwa.local`;
}

function waPendingContinuePhoneKey(phoneInput: string): mongoose.Types.ObjectId | null {
  const phoneDigits = waPhoneToDigits(phoneInput);
  if (!phoneDigits) return null;
  const hex = crypto.createHash("sha1").update(`wa-pending-v2:${phoneDigits}`).digest("hex").slice(0, 24);
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

async function upsertWaScopedStateForUser(
  userId: any,
  scope: string,
  step: string,
  payload: Record<string, any>,
  expiresAt: Date
): Promise<void> {
  await WaConversationState.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        scope,
        step,
        payload,
        expiresAt,
      },
    },
    { upsert: true, new: true }
  );
}

async function setWaAboutActionState(userId: any): Promise<void> {
  await upsertWaScopedStateForUser(
    userId,
    WA_ABOUT_ACTION_SCOPE,
    WA_ABOUT_ACTION_STEP,
    { active: true },
    new Date(Date.now() + WA_ABOUT_ACTION_TTL_MS)
  );
}

async function getWaAboutActionState(userId: any): Promise<boolean> {
  const st = await WaConversationState.findOne({
    user: userId,
    scope: WA_ABOUT_ACTION_SCOPE,
  }).lean();
  if (!st) return false;
  if (new Date(st.expiresAt).getTime() <= Date.now()) {
    await WaConversationState.deleteOne({ _id: (st as any)._id });
    return false;
  }
  return String((st as any)?.step || "") === WA_ABOUT_ACTION_STEP;
}

async function clearWaAboutActionState(userId: any): Promise<void> {
  await WaConversationState.deleteOne({ user: userId, scope: WA_ABOUT_ACTION_SCOPE });
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

async function clearStaleWaInteractiveStateForMainMenu(userId: any, rawInput: string): Promise<void> {
  const key = normalizeWaMenuDigitInput(rawInput);
  if (!/^[1-9]$/.test(key)) return;
  const st = await WaConversationState.findOne({ user: userId }).select("_id scope step updatedAt").lean();
  if (!st) return;
  // ACBPay Wallet uses 1–5 on its own menu; never purge wallet scope here or "1" is mistaken for main-menu About.
  if (String((st as any).scope || "") === "wallet") return;
  const updatedAtMs = new Date((st as any).updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return;
  // Prevent old submenu/wizard state from hijacking fresh main-menu choices.
  if (Date.now() - updatedAtMs > 2 * 60 * 1000) {
    await WaConversationState.deleteOne({ _id: (st as any)._id });
  }
}

async function findWaUserByPhone(phoneInput: string) {
  const phoneDigits = waPhoneToDigits(phoneInput);
  if (!phoneDigits) return null;
  const waEmail = waEmailFromPhoneDigits(phoneDigits);
  return User.findOne({
    $or: [{ phone: phoneDigits }, { email: waEmail }],
  });
}

function stringifyBodyField(val: any): string {
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  if (typeof val === "string") {
    return val
      .trim()
      .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2060]/g, "")
      .trim();
  }
  return "";
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
    body?.userPhone,
    body?.user_phone,
    body?.contactPhone,
    body?.contact_phone,
    body?.WaId,
    body?.waId,
  ];
  for (const val of candidates) {
    const s = stringifyBodyField(val);
    if (s) return s;
  }
  // Twilio Studio / proxies sometimes nest the WhatsApp address (BW vs SA parity).
  const nestedKeys = new Set([
    "phone",
    "Phone",
    "from",
    "From",
    "waFrom",
    "wa_from",
    "sender",
    "Sender",
    "userPhone",
    "user_phone",
    "contactPhone",
    "contact_phone",
    "WaId",
    "waId",
  ]);
  const queue: Array<{ node: any; depth: number }> = [{ node: body, depth: 0 }];
  const seen = new Set<any>();
  let scanned = 0;
  while (queue.length && scanned < 120) {
    const { node, depth } = queue.shift()!;
    if (!node || typeof node !== "object" || depth > 6) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    scanned++;
    for (const [k, v] of Object.entries(node)) {
      if (nestedKeys.has(k)) {
        const s = stringifyBodyField(v);
        if (s) return s;
      }
      if (v && typeof v === "object") queue.push({ node: v, depth: depth + 1 });
    }
  }
  return "";
}

/** Inbound Twilio `To`: which WhatsApp Business / WABA number received the message (keeps REST sends in the same chat). */
function extractTwilioWaBusinessAddressFromBody(body: unknown): string {
  const candidates = [
    (body as any)?.To,
    (body as any)?.to,
    (body as any)?.twilioTo,
    (body as any)?.TwilioTo,
    (body as any)?.waTo,
    (body as any)?.WaTo,
    (body as any)?.businessTo,
    (body as any)?.business_to,
    (body as any)?.recipient,
    (body as any)?.Recipient,
    (body as any)?.incomingTo,
  ];
  for (const val of candidates) {
    const s = stringifyBodyField(val);
    if (s) return s;
  }
  const nestedKeys = new Set([
    "To",
    "to",
    "twilioTo",
    "TwilioTo",
    "waTo",
    "WaTo",
    "businessTo",
    "business_to",
    "recipient",
    "Recipient",
    "incomingTo",
  ]);
  const queue: Array<{ node: unknown; depth: number }> = [{ node: body, depth: 0 }];
  const seen = new Set<unknown>();
  let scanned = 0;
  while (queue.length && scanned < 120) {
    const { node, depth } = queue.shift()!;
    if (!node || typeof node !== "object" || depth > 6) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    scanned++;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (nestedKeys.has(k)) {
        const s = stringifyBodyField(v);
        if (s) return s;
      }
      if (v && typeof v === "object") queue.push({ node: v, depth: depth + 1 });
    }
  }
  return "";
}

/** Pass through HTTP body so REST sends use the same WhatsApp sender / thread as Studio. */
type WaOutboundSession = { businessTo?: string; accountSid?: string };

const WA_OUTBOUND_SESSION_SCOPE = "wa_outbound_session";
const WA_OUTBOUND_SESSION_STEP = "business_to";
const WA_OUTBOUND_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function waOutboundSessionPhoneKey(phoneInput: string): mongoose.Types.ObjectId | null {
  const phoneDigits = waPhoneToDigits(phoneInput);
  if (!phoneDigits) return null;
  const hex = crypto.createHash("sha1").update(`wa-outbound-session:${phoneDigits}`).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function normalizeBusinessToAddress(input: string): string {
  const digits = waChannelAddressToDigits(input);
  if (!digits) return "";
  return `whatsapp:+${digits}`;
}

function extractTwilioAccountSidFromBody(body: unknown): string {
  const candidates = [
    (body as any)?.AccountSid,
    (body as any)?.accountSid,
    (body as any)?.TwilioAccountSid,
    (body as any)?.twilioAccountSid,
  ];
  for (const val of candidates) {
    const s = stringifyBodyField(val);
    if (/^AC[A-Za-z0-9]{32}$/.test(s)) return s;
  }
  return "";
}

async function resolveWaOutboundSession(phoneInput: string, body: unknown): Promise<WaOutboundSession> {
  const liveBusinessTo = normalizeBusinessToAddress(extractTwilioWaBusinessAddressFromBody(body));
  const accountSid = extractTwilioAccountSidFromBody(body);
  const phoneKey = waOutboundSessionPhoneKey(phoneInput);
  if (liveBusinessTo) {
    if (phoneKey) {
      await WaConversationState.findOneAndUpdate(
        { user: phoneKey, scope: WA_OUTBOUND_SESSION_SCOPE },
        {
          $set: {
            step: WA_OUTBOUND_SESSION_STEP,
            payload: { businessTo: liveBusinessTo, accountSid: accountSid || undefined },
            expiresAt: new Date(Date.now() + WA_OUTBOUND_SESSION_TTL_MS),
          },
        },
        { upsert: true, new: true }
      );
    }
    return accountSid ? { businessTo: liveBusinessTo, accountSid } : { businessTo: liveBusinessTo };
  }
  if (phoneKey && accountSid) {
    await WaConversationState.findOneAndUpdate(
      { user: phoneKey, scope: WA_OUTBOUND_SESSION_SCOPE },
      {
        $set: {
          step: WA_OUTBOUND_SESSION_STEP,
          payload: { accountSid },
          expiresAt: new Date(Date.now() + WA_OUTBOUND_SESSION_TTL_MS),
        },
      },
      { upsert: true, new: true }
    );
  }
  if (!phoneKey) return accountSid ? { accountSid } : {};
  const remembered = await WaConversationState.findOne({
    user: phoneKey,
    scope: WA_OUTBOUND_SESSION_SCOPE,
  }).lean();
  const rememberedBusinessTo = normalizeBusinessToAddress(String((remembered as any)?.payload?.businessTo || ""));
  const rememberedAccountSid = stringifyBodyField((remembered as any)?.payload?.accountSid);
  const effectiveAccountSid = accountSid || rememberedAccountSid;
  if (rememberedBusinessTo || rememberedAccountSid) {
    return {
      businessTo: rememberedBusinessTo || undefined,
      accountSid: effectiveAccountSid || undefined,
    };
  }
  return effectiveAccountSid ? { accountSid: effectiveAccountSid } : {};
}

function getTwilioWaConfig(session?: WaOutboundSession | null, userPhoneInput?: string) {
  const profile = resolveWhatsappSendProfile(session?.businessTo ?? null, userPhoneInput ?? null, session?.accountSid ?? null);
  if (!profile) {
    logger.warn("WhatsApp send profile unresolved", {
      phone: waPhoneToDigits(userPhoneInput || ""),
      businessTo: session?.businessTo || null,
      accountSid: session?.accountSid || null,
    });
    return null;
  }
  return { client: twilio(profile.accountSid, profile.authToken), from: profile.whatsappFrom };
}

/** REST sends real content; Studio must not show a user-visible placeholder. */
const WA_STUDIO_REST_PENDING_MESSAGE = "";

type WaMediaCard = { mediaUrl: string; caption: string };

const QWERTYHUB_SELL_MEDIA_LIMIT = 10;
/** WhatsApp menu 2 — product image cards after premenu clip (agreed: 20). */
const QWERTYHUB_MARKETPLACE_MEDIA_LIMIT = 20;
const QWERTYHUB_MARKETPLACE_MEDIA_GAP_MS = 2000;
const WA_MARKETPLACE_CAPTION_MAX = 1024;
const QWERTYHUB_MEDIA_SEND_GAP_MS = 2200;
const QWERTYHUB_MENU_AFTER_MEDIA_BASE_MS = 90000;
const QWERTYHUB_MENU_AFTER_MEDIA_PER_CARD_MS = 8000;
const QWERTYHUB_FALLBACK_IMAGE_URL = `${FRONTEND_URL.replace(/\/$/, "")}/qwertymates-logo-icon.png`;
/** After sponsored video REST send, wait before menu text so WhatsApp tends to order video above the menu. */
const WA_PREMENU_VIDEO_TO_MENU_GAP_MS = 4200;

async function resolveWaPremenuVideoPick(placementAction: string) {
  const placement = waPlacementKeyForSponsoredAction(placementAction);
  const moduleCategory = moduleCategoryForWaSponsoredAction(placementAction);
  let pick = await selectSponsoredVideoForPlacement(placement, new Date(), { moduleCategory });
  if (!pick?.videoUrl?.trim()) {
    pick = await resolveWaFallbackSponsoredVideoPick(placementAction);
  }
  if (!pick?.videoUrl?.trim()) return null;
  const creativeUrl = String(pick.videoUrl).trim();
  if (!isSponsoredVideoUrl(creativeUrl)) return null;
  return pick;
}

function scheduleWaWelcomeMenuAfterVideoDelay(
  phone: string,
  menuText: string,
  session?: WaOutboundSession,
  delayMs = WA_PREMENU_VIDEO_TO_MENU_GAP_MS
): void {
  const menu = String(menuText || "").trim();
  if (!menu || !waPhoneToDigits(phone)) return;
  setTimeout(() => {
    void sendWhatsAppText(phone, menu, session).catch((err) => {
      logger.warn("WA welcome menu REST send failed", { error: String((err as any)?.message || err) });
    });
  }, Math.max(0, delayMs));
}

function computeQwertyHubMenuDelayMs(cardCount: number): number {
  const safeCount = Number.isFinite(cardCount) ? Math.max(0, Math.floor(cardCount)) : 0;
  if (safeCount <= 0) return 300;
  return QWERTYHUB_MENU_AFTER_MEDIA_BASE_MS + safeCount * QWERTYHUB_MENU_AFTER_MEDIA_PER_CARD_MS;
}

async function sendWhatsAppMediaGallery(
  phoneInput: string,
  mediaCards: WaMediaCard[],
  opts?: { limit?: number; gapMs?: number; session?: WaOutboundSession }
): Promise<void> {
  const cfg = getTwilioWaConfig(opts?.session, phoneInput);
  if (!cfg) return;
  const digits = waPhoneToDigits(phoneInput);
  if (!digits) return;
  const to = `whatsapp:+${digits}`;
  const limit = Number.isFinite(Number(opts?.limit)) ? Math.max(1, Math.floor(Number(opts?.limit))) : QWERTYHUB_SELL_MEDIA_LIMIT;
  const gapMs = Number.isFinite(Number(opts?.gapMs)) ? Math.max(0, Math.floor(Number(opts?.gapMs))) : QWERTYHUB_MEDIA_SEND_GAP_MS;
  const normalized: WaMediaCard[] = mediaCards
    .map((c) => ({
      mediaUrl: resolveImageUrl(String(c?.mediaUrl || "").trim()),
      caption: String(c?.caption || "").trim(),
    }))
    .filter((c) => Boolean(c.mediaUrl))
    .slice(0, limit);
  for (let i = 0; i < normalized.length; i++) {
    const card = normalized[i];
    try {
      await cfg.client.messages.create({
        from: cfg.from,
        to,
        mediaUrl: [card.mediaUrl],
        body: card.caption || "QwertyHub product preview",
      });
    } catch (err) {
      logger.warn("WhatsApp media card send failed", {
        index: i,
        error: String((err as any)?.message || err),
      });
    }
    if (i < normalized.length - 1) {
      await delay(gapMs);
    }
  }
}

/** Send one Twilio media message (image + caption). */
async function sendWhatsAppMediaCard(
  phoneInput: string,
  card: WaMediaCard,
  session?: WaOutboundSession
): Promise<void> {
  const cfg = getTwilioWaConfig(session, phoneInput);
  if (!cfg) throw new Error("WhatsApp send profile not configured");
  const digits = waPhoneToDigits(phoneInput);
  if (!digits) throw new Error("Invalid phone");
  const mediaUrl = resolveImageUrl(String(card?.mediaUrl || "").trim());
  if (!mediaUrl) throw new Error("Missing mediaUrl");
  const to = `whatsapp:+${digits}`;
  await cfg.client.messages.create({
    from: cfg.from,
    to,
    mediaUrl: [mediaUrl],
    body: String(card.caption || "QwertyHub product preview").slice(0, WA_MARKETPLACE_CAPTION_MAX),
  });
}

/** Marketplace menu 2: sequential cards with gap + one retry (Twilio rate limits after premenu video). */
async function sendQwertyHubMarketplaceGallery(
  phoneInput: string,
  mediaCards: WaMediaCard[],
  session?: WaOutboundSession
): Promise<number> {
  const batch = mediaCards
    .map((c) => ({
      mediaUrl: resolveImageUrl(String(c?.mediaUrl || "").trim()),
      caption: String(c?.caption || "").trim().slice(0, WA_MARKETPLACE_CAPTION_MAX),
    }))
    .filter((c) => Boolean(c.mediaUrl))
    .slice(0, QWERTYHUB_MARKETPLACE_MEDIA_LIMIT);

  let sent = 0;
  for (let i = 0; i < batch.length; i++) {
    const card = batch[i]!;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        if (attempt > 0) await delay(3500);
        await sendWhatsAppMediaCard(phoneInput, card, session);
        ok = true;
        sent++;
      } catch (err) {
        logger.warn("QwertyHub marketplace card send failed", {
          index: i,
          attempt,
          error: String((err as any)?.message || err),
        });
      }
    }
    if (i < batch.length - 1) await delay(QWERTYHUB_MARKETPLACE_MEDIA_GAP_MS);
  }
  logger.info("QwertyHub marketplace gallery finished", {
    sent,
    requested: batch.length,
    phone: waPhoneToDigits(phoneInput),
  });
  return sent;
}

/** One outbound video per menu path (WhatsApp shows a single clip; user taps to play). */
async function sendWhatsAppSingleVideo(
  phoneInput: string,
  videoUrl: string,
  caption: string,
  session?: WaOutboundSession
): Promise<void> {
  const u = String(videoUrl || "").trim();
  if (!u) return;
  await sendWhatsAppMediaGallery(phoneInput, [{ mediaUrl: u, caption: String(caption || "").trim() }], {
    limit: 1,
    gapMs: 0,
    session,
  });
}

/**
 * One video (if configured) then async follow-up — no skip/gate/daily caps.
 * WhatsApp does not autoplay; caption nudges tap-to-play only.
 */
function scheduleWaPremenuVideoThenRun(
  phone: string,
  placementAction: string,
  impressionMenuKey: string,
  runAfter: () => Promise<void>,
  logLabel: string,
  session?: WaOutboundSession
): void {
  if (!waPhoneToDigits(phone)) return;
  setTimeout(() => {
    void (async () => {
      try {
        const placement = waPlacementKeyForSponsoredAction(placementAction);
        const moduleCategory = moduleCategoryForWaSponsoredAction(placementAction);
        let pick = await selectSponsoredVideoForPlacement(placement, new Date(), { moduleCategory });
        if (!pick?.videoUrl?.trim()) {
          pick = await resolveWaFallbackSponsoredVideoPick(placementAction);
        }
        if (pick?.videoUrl?.trim()) {
          const creativeUrl = String(pick.videoUrl).trim();
          if (!isSponsoredVideoUrl(creativeUrl)) {
            await runAfter();
            return;
          }
          await sendWhatsAppSingleVideo(phone, creativeUrl, "Tap the video to play.", session);
          if (isTrackedSponsoredPick(pick)) {
            await recordSponsoredVideoImpression({
              adId: pick.adId,
              advertiserId: pick.advertiserId,
              placementKey: pick.placementKey,
              menuKey: impressionMenuKey,
              phoneInput: phone,
              rateZarPerThousandImpressions: pick.rateZarPerThousandImpressions,
            });
          }
          await delay(WA_PREMENU_VIDEO_TO_MENU_GAP_MS);
        } else {
          const bronzeText = await resolveWaBronzePremenuText(placementAction);
          if (bronzeText?.trim()) {
            await sendWhatsAppText(phone, bronzeText, session);
            await delay(WA_PREMENU_VIDEO_TO_MENU_GAP_MS);
          }
        }
        await runAfter();
      } catch (e) {
        logger.warn(logLabel, { error: String((e as any)?.message || e) });
        try {
          await runAfter();
        } catch {
          /* ignore */
        }
      }
    })();
  }, 250);
}

/** Sponsored clip on welcome — video + menu via REST; Studio waits without sending the full menu. */
async function deliverWaWelcomePremenuThenMenu(
  phone: string,
  menuText: string,
  session?: WaOutboundSession
): Promise<boolean> {
  if (!waPhoneToDigits(phone)) return false;
  try {
    const pick = await resolveWaPremenuVideoPick("open_main_menu");
    if (!pick?.videoUrl?.trim()) return false;
    const creativeUrl = String(pick.videoUrl).trim();
    await sendWhatsAppSingleVideo(phone, creativeUrl, "Tap the video to play.", session);
    if (isTrackedSponsoredPick(pick)) {
      await recordSponsoredVideoImpression({
        adId: pick.adId,
        advertiserId: pick.advertiserId,
        placementKey: pick.placementKey,
        menuKey: "welcome",
        phoneInput: phone,
        rateZarPerThousandImpressions: pick.rateZarPerThousandImpressions,
      });
    }
    scheduleWaWelcomeMenuAfterVideoDelay(phone, menuText, session);
    return true;
  } catch (e) {
    logger.warn("WA welcome premenu video sequence failed", { error: String((e as any)?.message || e) });
    scheduleWaWelcomeMenuAfterVideoDelay(phone, menuText, session, 300);
    return true;
  }
}

async function sendWhatsAppText(phoneInput: string, text: string, session?: WaOutboundSession): Promise<void> {
  const cfg = getTwilioWaConfig(session, phoneInput);
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

/** Last non-empty line of a WhatsApp reply (user text under a quote block). */
function waPrimaryReplyLine(raw: string): string {
  const cleaned = stripWaInvisibleChars(raw);
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1]! : cleaned;
}

/** Normalize WhatsApp keycap digits (e.g. 2️⃣) so menu routing matches case "2". */
function normalizeWaMenuDigitInput(raw: string): string {
  let s = String(raw || "").trim().replace(/\uFE0F/g, "");
  s = s.replace(/^[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2060]+/g, "").replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2060]+$/g, "");
  // Fullwidth digits (common on some mobile keyboards / locales)
  s = s.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
  const keycap = s.match(/^([0-9])\u20E3$/);
  if (keycap) return keycap[1];
  if (/^0$/.test(s)) return "0";
  const tryLine = (line: string): string | null => {
    const t = String(line || "").trim();
    if (!t) return null;
    const kcPref = t.match(/^([0-9])\u20E3/);
    if (kcPref) return kcPref[1];
    if (/^0$/.test(t)) return "0";
    const lead = t.match(/^\s*([0-9]|10)\b/);
    if (lead) return lead[1];
    const only = t.match(/^([0-9]|10)$/);
    if (only) return only[1];
    return null;
  };
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const hit = tryLine(lines[i]!);
    if (hit) return hit;
  }
  const firstLine = (s.split(/\r?\n/)[0] || s).trim();
  const leading = tryLine(firstLine);
  if (leading) return leading;
  if (s.length <= 300) {
    const embeddedZero = s.match(/(?:^|\s)0(?:\s|$|[)\].,])/);
    if (embeddedZero) return "0";
    const embedded = s.match(/(?:^|\s)([1-9]|10)(?:\s|$|[)\].,])/);
    if (embedded) return embedded[1]!;
  }
  return s;
}

/** Any submenu: 0 / “Back to main menu” (not pay-at-store “Back to wallet menu”). */
function waIsBackToMainMenuInput(raw: string): boolean {
  const primary = waPrimaryReplyLine(raw);
  if (/^back\s+to\s+(the\s+)?main\s+menu/i.test(primary)) return true;
  if (/wallet\s+menu/i.test(primary)) return false;
  if (["cancel", "menu", "stop", "exit", "quit"].includes(primary.toLowerCase())) return true;
  return normalizeWaMenuDigitInput(primary) === "0";
}

/** @deprecated Use waIsBackToMainMenuInput */
const waIsWalletBackToMainMenuInput = waIsBackToMainMenuInput;

/** Strip ZWSP / bidi / format chars WhatsApp clients sometimes append to replies. */
function stripWaInvisibleChars(input: string): string {
  return String(input || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD\u061C\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\uFE0F/g, "")
    .trim();
}

/** Errand wizard asks "1) Confirm 2) Cancel" — accept plain-language yes (e.g. "confirm") so users are not cancelled by mistake. */
function waErrandConfirmIsYes(raw: string): boolean {
  const cleaned = stripWaInvisibleChars(raw);
  if (!cleaned) return false;

  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  /** User reply under a quote is usually the last line — prefer it over scanning the whole quoted template for stray digits. */
  const primary = lines.length ? lines[lines.length - 1]! : cleaned;
  const primaryNorm = primary.replace(/^[\s✅✔👍]+|[\s✅✔👍]+$/g, "").trim();
  const pl = primaryNorm.toLowerCase();

  if (/^(yes|y|confirm|confirmed|ok|okay|sure|proceed|accept|accepted|correct|yep|yeah|👍)\.?$/i.test(pl)) return true;
  if (/^(go ahead|please confirm|sounds good|that'?s fine)\b/i.test(pl)) return true;
  if (/^(2|no|nope|cancel|abort|stop|decline|negative)\b/.test(pl)) return false;

  const primaryKey = normalizeWaMenuDigitInput(primaryNorm);
  if (primaryKey === "1") return true;
  if (primaryKey === "2") return false;

  if (normalizeWaMenuDigitInput(cleaned) === "1") return true;

  if (/\bconfirm(ed)?\b/i.test(pl) && !/\b(don'?t|do not|not|cancel|no)\b/i.test(pl)) return true;

  return false;
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
  session?: WaOutboundSession;
}): void {
  void (async () => {
    const { phone, cards, introText, menuText, logLabel, session } = params;
    try {
      await delay(500);
      const intro = String(introText || "").trim();
      const menu = String(menuText || "").trim();
      if (!cards.length) {
        if (intro) await sendWhatsAppText(phone, intro, session);
        await delay(300);
        if (menu) await sendWhatsAppText(phone, menu, session);
        return;
      }
      if (intro) await sendWhatsAppText(phone, intro, session);
      await sendWhatsAppMediaGallery(phone, cards, { session });
      await delay(computeQwertyHubMenuDelayMs(cards.length));
      if (menu) await sendWhatsAppText(phone, menu, session);
    } catch (err) {
      logger.warn("QwertyHub follow-up sequence failed", {
        logLabel,
        error: String((err as any)?.message || err),
      });
    }
  })();
}

function getTwilioWhatsAppFromDigits(session?: WaOutboundSession, userPhoneInput?: string): string {
  const profile = resolveWhatsappSendProfile(
    session?.businessTo ?? null,
    userPhoneInput ?? null,
    session?.accountSid ?? null
  );
  if (profile?.whatsappFrom) return waChannelAddressToDigits(profile.whatsappFrom);
  return waChannelAddressToDigits(String(process.env.TWILIO_WHATSAPP_FROM || ""));
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

function buildUnregisteredGuidedMessage(_commandToContinue: string, session?: WaOutboundSession, userPhoneInput?: string): string {
  const waFromDigits = getTwilioWhatsAppFromDigits(session, userPhoneInput);
  const registerLink = ensurePublicWaLink(waMeBotLink(waFromDigits, "REGISTER"));
  return [
    "You are not registered,",
    "Please enter 1 or tap to register",
    registerLink ? `1) Register : ${registerLink}` : "1) Reply in this chat: REGISTER",
  ].join("\n");
}

/** Commerce tap commands that should resume automatically after WhatsApp registration. */
function isWaCommerceResumeCommand(raw: string): boolean {
  const cmd = String(raw || "").replace(/\s+/g, " ").trim();
  if (!cmd) return false;
  return /^(?:resell|ressell|resel)\s+[a-f0-9]{6,24}\s+[0-9]{1,3}\b/i.test(cmd)
    || /^cart\s+add\s+[a-f0-9]{6,24}\s+[0-9]{1,2}\b/i.test(cmd)
    || /^payreq\s+[a-f0-9]{16,64}\s*$/i.test(cmd);
}

function isWaRegisterIntent(rawInput: string): boolean {
  const normalized = String(rawInput || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "register" || normalized === "1") return true;
  return /^register\b|^sign\s*up\b/i.test(normalized);
}

/** Do not overwrite a saved RESELL/CART/PAYREQ pending action with REGISTER/continue keywords. */
function shouldStoreWaPendingContinue(raw: string): boolean {
  const cmd = String(raw || "").replace(/\s+/g, " ").trim();
  if (!cmd) return false;
  if (shouldAttemptPendingContinue(cmd)) return false;
  if (isWaRegisterIntent(cmd)) return false;
  return isWaCommerceResumeCommand(cmd) || cmd.length > 0;
}

/** Studio registration prompt — next inbound message should be the user's full name. */
function buildRegisterFirstMessage(commandToContinue?: string): string {
  const cmd = String(commandToContinue || "").replace(/\s+/g, " ").trim();
  if (/^resell\b/i.test(cmd)) {
    return "To resell this product on Qwertymates, register first.\n\nPlease enter your full name.";
  }
  if (/^cart\s+add\b/i.test(cmd)) {
    return "To add this product to your cart, register first.\n\nPlease enter your full name.";
  }
  if (/^payreq\b/i.test(cmd)) {
    return "To pay this request, register first.\n\nPlease enter your full name.";
  }
  return "Welcome to Qwertymates! Please enter your full name.";
}

function unregisteredWaFlowResponse(commandToContinue: string, session?: WaOutboundSession, userPhoneInput?: string): {
  code: string;
  message: string;
} {
  const cmd = String(commandToContinue || "").replace(/\s+/g, " ").trim();
  if (isWaRegisterIntent(cmd)) {
    return {
      code: "REGISTER_START",
      message: "Enter your date of birth in this format: YYYY-MM-DD",
    };
  }
  return {
    code: "USER_NOT_FOUND",
    message: buildUnregisteredGuidedMessage(cmd, session, userPhoneInput),
  };
}

function shouldAttemptPendingContinue(rawInput: string): boolean {
  const normalized = String(rawInput || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "register" || normalized === "continue" || normalized === "start" || normalized === "skip";
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

/** Encode path segments and prefer www for /uploads so Twilio can fetch media reliably. */
function encodeWhatsAppMediaUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (/^api\.qwertymates\.com$/i.test(u.hostname) && u.pathname.startsWith("/uploads")) {
      u.hostname = "www.qwertymates.com";
    }
    u.pathname = u.pathname
      .split("/")
      .map((seg, i) => (i === 0 || !seg ? seg : encodeURIComponent(decodeURIComponent(seg))))
      .join("/");
    return u.toString();
  } catch {
    return raw.replace(/ /g, "%20");
  }
}

function resolveImageUrl(raw: string): string {
  const val = String(raw || "").trim();
  if (!val) return "";
  const feBase = FRONTEND_URL.replace(/\/$/, "");
  let absolute = val;
  if (!/^https?:\/\//i.test(val)) {
    absolute = val.startsWith("/") ? `${feBase}${val}` : `${feBase}/${val}`;
  }
  return encodeWhatsAppMediaUrl(absolute);
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

function waDefaultResellMarkupForCategories(categories?: string[] | null): number {
  return resellerMarkupBoundsForProductCategories(categories).defaultPct;
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
function buildQwertyHubAutoResellUrl(productUrl: string, categories?: string[] | null): string {
  const sep = productUrl.includes("?") ? "&" : "?";
  const m = waDefaultResellMarkupForCategories(categories);
  return `${productUrl}${sep}view=resell&autoResell=1&markup=${m}`;
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
  const flattened: Array<{ resellerId: string; productId: string; wallPct: number | undefined }> = [];
  for (const w of walls as any[]) {
    const resellerId = String(w?.resellerId || "").trim();
    for (const p of Array.isArray(w?.products) ? w.products : []) {
      const productId = String(p?.productId || "").trim();
      if (!productId) continue;
      const m = Number(p?.resellerCommissionPct);
      const wallPct = Number.isFinite(m) ? Math.round(m) : undefined;
      flattened.push({ resellerId, productId, wallPct });
    }
  }
  if (!flattened.length) return [];
  flattened.sort(() => Math.random() - 0.5);
  const uniqueByProduct = new Map<string, { resellerId: string; wallPct: number | undefined }>();
  for (const row of flattened) {
    if (!uniqueByProduct.has(row.productId)) uniqueByProduct.set(row.productId, { resellerId: row.resellerId, wallPct: row.wallPct });
    if (uniqueByProduct.size >= limit * 3) break;
  }
  const ids = Array.from(uniqueByProduct.keys());
  const products = await Product.find({
    _id: { $in: ids },
    active: true,
    allowResell: true,
    outOfStock: { $ne: true },
  })
    .select("title slug description price currency images supplierSource supplierId categories")
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
    const markupPct = effectiveResellerMarkupPctFromWall(meta.wallPct, (p as any).categories);
    out.push({ product: p, resellerId: meta.resellerId, markupPct });
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
  const match = normalized.match(/(?:resell|ressell|resel)\s+([a-f0-9]{6,24})\s+([0-9]{1,3})\b/i);
  if (!match) {
    if (/^res+e?l+/i.test(lowered)) {
      return {
        handled: true,
        payload: {
          code: "RESELL_FORMAT_INVALID",
          message: "Use this format: RESELL <code> <markup%>. Example: RESELL ab12cd34 25",
        },
      };
    }
    return { handled: false };
  }

  const code = String(match[1] || "").toLowerCase();
  const markup = Math.round(Number(match[2]));
  if (!Number.isFinite(markup) || markup < 0 || markup > 200) {
    return {
      handled: true,
      payload: {
        code: "RESELL_INVALID_MARKUP",
        message: "Enter a markup percentage between 0 and 200. The allowed range for each product depends on its category.",
      },
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
        message: "Product code not found. Reply 1 to refresh products, then use RESELL <code> <markup%>.",
      },
    };
  }

  const bounds = resellerMarkupBoundsForProductCategories((product as any).categories);
  if (markup < bounds.minPct || markup > bounds.maxPct) {
    return {
      handled: true,
      payload: {
        code: "RESELL_INVALID_MARKUP",
        message: `Markup for this product must be between ${bounds.minPct}% and ${bounds.maxPct}%. Example: RESELL ${code} ${bounds.defaultPct}`,
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

  const user = await findWaUserByPhone(phone);
  if (!user) {
    await setWaPendingContinueAction(phone, `RESELL ${code} ${Math.round(markup)}`);
    const flow = unregisteredWaFlowResponse(`RESELL ${code} ${Math.round(markup)}`);
    return {
      handled: true,
      payload: flow,
    };
  }

  const store = await addProductToResellerWall({
    user,
    product,
    resellerCommissionPct: Math.round(markup),
  });
  await clearWaPendingContinueAction(phone);
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
      payload: unregisteredWaFlowResponse(`PAYREQ ${token}`),
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
      payload: unregisteredWaFlowResponse(`CART ADD ${code} ${qty}`),
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
  await clearWaPendingContinueAction(phone);

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
    body?.buttonText,
    body?.ButtonText,
    body?.ButtonPayload,
    body?.buttonPayload,
    body?.ListTitle,
    body?.listTitle,
  ]
    .map((v) => stringifyBodyField(v))
    .find(Boolean);
  if (direct) return direct;
  const nestedKeys = new Set([
    "option",
    "Option",
    "body",
    "Body",
    "message",
    "Message",
    "input",
    "Input",
    "text",
    "Text",
    "Digits",
    "buttonText",
    "ButtonText",
    "ButtonPayload",
    "buttonPayload",
    "ListTitle",
    "listTitle",
  ]);
  const queue: Array<{ node: any; depth: number }> = [{ node: body, depth: 0 }];
  const seen = new Set<any>();
  let scanned = 0;
  while (queue.length && scanned < 160) {
    const { node, depth } = queue.shift()!;
    if (!node || typeof node !== "object" || depth > 8) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    scanned++;
    for (const [k, v] of Object.entries(node)) {
      if (nestedKeys.has(k)) {
        const s = stringifyBodyField(v);
        if (s) return s;
      }
      if (v && typeof v === "object") queue.push({ node: v, depth: depth + 1 });
    }
  }
  const serialized = JSON.stringify(body || {});
  const embedded = serialized.match(/resell\s+[a-f0-9]{6,24}\s+[0-9]{1,2}/i);
  if (embedded) return embedded[0];
  // WhatsApp location shares: Body is empty; coords live in Latitude/Longitude. Do not guess menu digits from JSON.
  if (extractTwilioInboundLocationSummary(body).length >= 3) {
    return "";
  }
  if (
    /"(Latitude|Longitude|latitude|longitude)"\s*:\s*("|-?\d)/.test(serialized) ||
    /"(Latitude|Longitude|latitude|longitude)"\s*:\s*null/.test(serialized)
  ) {
    return "";
  }
  const menuDigit = serialized.match(/(?:^|[^0-9])(10|[1-9])(?:[^0-9]|$)/);
  return menuDigit ? menuDigit[1] : "";
}

/** Twilio WhatsApp inbound attachment URLs (Basic auth required). */
function extractTwilioInboundMedia(body: Record<string, any> | undefined): Array<{ url: string; contentType: string }> {
  const flat = new Map<number, { url: string; contentType: string }>();

  const mergePair = (idx: number, url?: string, contentType?: string) => {
    if (!Number.isFinite(idx) || idx < 0 || idx > 32) return;
    const u = String(url || "").trim();
    const ct = String(contentType || "").trim();
    if (!u && !ct) return;
    const prev = flat.get(idx) || { url: "", contentType: "" };
    if (u) prev.url = u;
    if (ct) prev.contentType = ct;
    flat.set(idx, prev);
  };

  const ingestNode = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 10) return;
    if (Array.isArray(node)) {
      for (const x of node) ingestNode(x, depth + 1);
      return;
    }
    for (const [k, raw] of Object.entries(node)) {
      const key = String(k || "");
      const v = typeof raw === "string" ? raw.trim() : "";
      const mu = key.match(/^MediaUrl(\d+)$/i);
      if (mu && v) mergePair(parseInt(mu[1]!, 10), v, undefined);
      const mc = key.match(/^MediaContentType(\d+)$/i);
      if (mc && v) mergePair(parseInt(mc[1]!, 10), undefined, v);
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") ingestNode(v, depth + 1);
    }
  };

  ingestNode(body || {}, 0);

  const declared = parseInt(String((body || {}).NumMedia ?? (body || {}).numMedia ?? "0"), 10);
  const maxByCount = Number.isFinite(declared) && declared > 0 ? Math.min(declared, 32) : 0;
  const maxIdx = Math.max(maxByCount, 12);
  for (let i = 0; i < maxIdx; i++) {
  const b = body || {};
    const url = String(b[`MediaUrl${i}`] ?? b[`mediaUrl${i}`] ?? "").trim();
    const contentType = String(b[`MediaContentType${i}`] ?? b[`mediaContentType${i}`] ?? "").trim();
    mergePair(i, url, contentType);
  }

  return Array.from(flat.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, pair]) => pair)
    .filter((p) => Boolean(p.url));
}

function parseTwilioGeoCoord(v: unknown): number {
  if (v === undefined || v === null) return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return NaN;
  const n = Number(s.replace(/,/g, "."));
  return Number.isFinite(n) ? n : NaN;
}

function mergeTwilioLocationAliasFields(body: Record<string, any>): Record<string, any> {
  const b = { ...body };
  const firstNonEmpty = (...vals: unknown[]): unknown =>
    vals.find((v) => v !== undefined && v !== null && String(v).trim() !== "");

  if (!firstNonEmpty(b.Latitude, b.latitude)) {
    const lat = firstNonEmpty(
      b.Latitude2,
      b.latitude2,
      b.Lat3,
      b.WaLatitude,
      b.waLatitude,
      b.location?.Latitude,
      b.location?.latitude,
      b.Location?.Latitude,
      b.Location?.latitude
    );
    if (lat !== undefined) b.Latitude = lat;
  }
  if (!firstNonEmpty(b.Longitude, b.longitude)) {
    const lng = firstNonEmpty(
      b.Longitude2,
      b.longitude2,
      b.Lng3,
      b.WaLongitude,
      b.waLongitude,
      b.location?.Longitude,
      b.location?.longitude,
      b.Location?.Longitude,
      b.Location?.longitude
    );
    if (lng !== undefined) b.Longitude = lng;
  }
  if (!firstNonEmpty(b.Address, b.address)) {
    const addr = firstNonEmpty(b.Address2, b.Location?.Address, b.location?.address);
    if (addr !== undefined) b.Address = addr;
  }
  if (!firstNonEmpty(b.Label, b.label)) {
    const lbl = firstNonEmpty(b.Label2, b.Location?.Label, b.location?.label);
    if (lbl !== undefined) b.Label = lbl;
  }
  return b;
}

/**
 * GPS from WhatsApp location share only (Twilio webhook fields).
 * Ignores typed/pasted map links — those are easy to fake; this is what backs verified tuckshop pins.
 */
function extractOfficialWhatsAppPinCoordinates(body: Record<string, any> | undefined): {
  lat: number;
  lng: number;
  label: string;
  address: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const merged = mergeTwilioLocationAliasFields(body as Record<string, any>);
  const loc = merged.Location ?? merged.location;
  const lat = parseTwilioGeoCoord(
    merged.Latitude ??
      merged.latitude ??
      (typeof loc === "object" && loc ? (loc as any).Latitude ?? (loc as any).latitude : undefined)
  );
  const lng = parseTwilioGeoCoord(
    merged.Longitude ??
      merged.longitude ??
      (typeof loc === "object" && loc ? (loc as any).Longitude ?? (loc as any).longitude : undefined)
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const label = stringifyBodyField(
    merged.Label ?? merged.label ?? (typeof loc === "object" && loc ? (loc as any).Label ?? (loc as any).label : "")
  );
  const address = stringifyBodyField(
    merged.Address ?? merged.address ?? (typeof loc === "object" && loc ? (loc as any).Address ?? (loc as any).address : "")
  );
  return { lat, lng, label, address };
}

function buildVerifiedCashAgentLocationLines(
  pin: { lat: number; lng: number; label: string; address: string },
  typedNote: string
): { locationPin: string; locationLatitude: number; locationLongitude: number } {
  const note = typedNote.trim().slice(0, 240);
  const parts = [
    `Verified WhatsApp pin: ${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)}`,
    pin.label,
    pin.address,
    note ? `Shop note: ${note}` : "",
  ].filter(Boolean);
  return {
    locationPin: parts.join(" — ").slice(0, 800),
    locationLatitude: pin.lat,
    locationLongitude: pin.lng,
  };
}

function readLocationSummaryFromObject(node: Record<string, any>): string {
  const loc = node.Location ?? node.location;
  const lat = parseTwilioGeoCoord(
    node.Latitude ??
      node.latitude ??
      (typeof loc === "object" && loc ? (loc as any).Latitude ?? (loc as any).latitude : undefined)
  );
  const lng = parseTwilioGeoCoord(
    node.Longitude ??
      node.longitude ??
      (typeof loc === "object" && loc ? (loc as any).Longitude ?? (loc as any).longitude : undefined)
  );
  const address = stringifyBodyField(
    node.Address ?? node.address ?? (typeof loc === "object" && loc ? (loc as any).Address ?? (loc as any).address : "")
  );
  const label = stringifyBodyField(
    node.Label ?? node.label ?? (typeof loc === "object" && loc ? (loc as any).Label ?? (loc as any).label : "")
  );
  const parts: string[] = [];
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    parts.push(`Maps pin: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  }
  if (label) parts.push(label);
  if (address) parts.push(address);
  return parts.join(" — ").trim();
}

/** WhatsApp location shares: Twilio sends Latitude/Longitude (+ optional Address/Label); Body is often empty. */
function extractTwilioInboundLocationSummary(body: Record<string, any> | undefined): string {
  if (!body || typeof body !== "object") return "";
  const mergedTop = mergeTwilioLocationAliasFields(body as Record<string, any>);
  const top = readLocationSummaryFromObject(mergedTop);
  if (top.length >= 3) return top.slice(0, 800);

  const queue: Array<{ node: unknown; depth: number }> = [{ node: mergedTop, depth: 0 }];
  const seen = new Set<unknown>();
  let scanned = 0;
  while (queue.length && scanned < 160) {
    const { node, depth } = queue.shift()!;
    scanned++;
    if (!node || typeof node !== "object" || depth > 10) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    const hit = readLocationSummaryFromObject(node as Record<string, any>);
    if (hit.length >= 3) return hit.slice(0, 800);
    if (Array.isArray(node)) {
      for (const x of node) queue.push({ node: x, depth: depth + 1 });
    } else {
      for (const v of Object.values(node)) {
        if (v && typeof v === "object") queue.push({ node: v, depth: depth + 1 });
      }
    }
  }

  return "";
}

function guessInvoiceUploadExtension(contentType: string): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("pdf")) return ".pdf";
  if (ct.includes("jpeg")) return ".jpg";
  if (ct.includes("jpg")) return ".jpg";
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  return ".bin";
}

async function downloadTwilioInboundMediaToUploads(
  mediaUrl: string,
  contentType: string
): Promise<{ filename: string; path: string; mimetype: string; size: number } | null> {
  const url = String(mediaUrl || "").trim();
  if (!url) return null;
  const attempts: Array<{ sid: string; token: string }> = [];
  const wa = getTwilioWhatsAppApiCredentials();
  if (wa.sid && wa.token) attempts.push(wa);
  const parentSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const parentTok = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (parentSid && parentTok) attempts.push({ sid: parentSid, token: parentTok });
  const subSid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
  const subTok = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
  if (subSid && subTok) attempts.push({ sid: subSid, token: subTok });

  const uniq = new Set<string>();
  const creds = attempts.filter((c) => {
    const k = `${c.sid}:${c.token}`;
    if (uniq.has(k)) return false;
    uniq.add(k);
    return true;
  });

  if (!creds.length) {
    logger.warn("WA invoice download: no Twilio credentials configured");
    return null;
  }

  let lastErr = "";
  for (const { sid, token } of creds) {
    try {
      const resp = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 90000,
        maxContentLength: 16 * 1024 * 1024,
        auth: { username: sid, password: token },
      });
      const buf = Buffer.from(resp.data);
      if (!buf.length) continue;
      const ext = guessInvoiceUploadExtension(contentType || String(resp.headers?.["content-type"] || ""));
      const filename = `wa-invoice-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const uploadDir = path.join(__dirname, "../../uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const diskPath = path.join(uploadDir, filename);
      fs.writeFileSync(diskPath, buf);
      const mimetype =
        contentType ||
        (typeof resp.headers?.["content-type"] === "string" ? resp.headers["content-type"] : "") ||
        "application/octet-stream";
      return { filename, path: `/uploads/${filename}`, mimetype, size: buf.length };
    } catch (e: any) {
      lastErr = String(e?.message || e);
    }
  }
  logger.warn("WA invoice download failed", { error: lastErr });
  return null;
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

/** WhatsApp registration — TitleCase name + digits, e.g. Ariel -> ariel1234 (@Ariel1234). */
async function generateUniqueWaUsername(displayName: string): Promise<string> {
  const cleaned = String(displayName || "")
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const titleBase =
    parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("") || "User";
  const base = titleBase.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "User";
  let suffix = Math.floor(1000 + Math.random() * 9000);
  let candidate = `${base}${suffix}`.toLowerCase();
  let guard = 0;
  while ((await User.findOne({ username: candidate })) && guard < 200) {
    suffix += 1;
    candidate = `${base}${suffix}`.toLowerCase();
    guard += 1;
  }
  return candidate;
}

function formatWaUsernameForDisplay(username: string): string {
  const u = String(username || "").trim();
  if (!u) return "";
  return u.charAt(0).toUpperCase() + u.slice(1);
}

async function getApprovedSupplierIdsForWa(): Promise<any[]> {
  const rows = await Supplier.find({ status: "approved" }).select("_id").lean();
  return rows.map((r: any) => r?._id).filter(Boolean);
}

/** Approved suppliers whose linked store is in one of the given ISO country codes. */
async function getApprovedSupplierIdsForStoreCountries(
  countryCodes: string[]
): Promise<mongoose.Types.ObjectId[]> {
  const codes = [...new Set(countryCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) return [];
  const stores = await Store.find({
    type: "supplier",
    supplierId: { $exists: true, $ne: null },
    $or: [
      { whatsappMarketCountries: { $in: codes } },
      {
        $and: [
          {
            $or: [
              { whatsappMarketCountries: { $exists: false } },
              { whatsappMarketCountries: null },
              { whatsappMarketCountries: { $size: 0 } },
            ],
          },
          { countryCode: { $in: codes } },
        ],
      },
    ],
  })
    .select("supplierId")
    .lean();
  const supplierIdStrs = [
    ...new Set(stores.map((s) => String(s.supplierId || "")).filter((id) => mongoose.Types.ObjectId.isValid(id))),
  ];
  if (!supplierIdStrs.length) return [];
  const approved = await Supplier.find({
    _id: { $in: supplierIdStrs },
    status: "approved",
  })
    .select("_id")
    .lean();
  return approved.map((d) => d._id);
}

/**
 * Marketplace browse (menu 2) is scoped by WhatsApp business line:
 * - Botswana sender (+267…) → BW + ZM supplier stores
 * - South Africa sender (+27…) → ZA supplier stores only
 */
function resolveWaMarketplaceStoreCountryCodes(
  session?: WaOutboundSession,
  userPhoneInput?: string
): string[] {
  const fromDigits = getTwilioWhatsAppFromDigits(session, userPhoneInput);
  const bwDigits = waChannelAddressToDigits(getBotswanaWhatsappSendProfile()?.whatsappFrom || "");
  const zaDigits = waChannelAddressToDigits(String(process.env.TWILIO_WHATSAPP_FROM || ""));

  if (fromDigits && bwDigits && fromDigits === bwDigits) return ["BW", "ZM"];
  if (fromDigits.startsWith("267")) return ["BW", "ZM"];
  if (fromDigits && zaDigits && fromDigits === zaDigits) return ["ZA"];
  if (fromDigits.startsWith("27")) return ["ZA"];

  return ["ZA"];
}

/** Same catalog as the website marketplace (buy/browse), excluding out-of-stock rows. */
async function buildWaMarketplaceProductMatch(
  extra: Record<string, any> = {},
  opts?: { storeCountryCodes?: string[] }
): Promise<Record<string, any>> {
  const regionalCodes = opts?.storeCountryCodes?.filter(Boolean);
  if (regionalCodes?.length) {
    const regionalSupplierIds = await getApprovedSupplierIdsForStoreCountries(regionalCodes);
    if (!regionalSupplierIds.length) {
      return { _id: { $exists: false }, ...extra };
    }
    return {
      active: true,
      outOfStock: { $ne: true },
      supplierId: { $in: regionalSupplierIds },
      ...extra,
    };
  }

  const approvedSupplierIds = await getApprovedSupplierIds();
  const base = buildPublicProductMatch(approvedSupplierIds);
  if (!base) return { _id: { $exists: false } };
  return {
    ...base,
    outOfStock: { $ne: true },
    ...extra,
  };
}

async function buildWaPublicResellMatch(extra: Record<string, any> = {}): Promise<Record<string, any>> {
  const approvedSupplierIds = await getApprovedSupplierIdsForWa();
  const or: Record<string, unknown>[] = [
    { supplierSource: { $in: [...DROPSHIP_SOURCES] } },
    ...(approvedSupplierIds.length ? [{ supplierId: { $in: approvedSupplierIds } }] : []),
  ];
  return {
    active: true,
    allowResell: true,
    outOfStock: { $ne: true },
    ...(or.length ? { $or: or } : {}),
    ...extra,
  };
}

async function userHasResellerProfile(userId: any): Promise<boolean> {
  const [store, wall] = await Promise.all([
    Store.findOne({ userId, type: "reseller" }).select("_id").lean(),
    ResellerWall.findOne({ resellerId: userId }).select("_id products").lean(),
  ]);
  return Boolean(store || (Array.isArray((wall as any)?.products) && (wall as any).products.length > 0));
}

/** Main WhatsApp menu (order matches Studio / product: video may precede this via REST). */
function buildMainMenu(displayName: string, _includeAdjustMarkup: boolean): string {
  const name = String(displayName || "friend").trim() || "friend";
  return [
    `Welcome to Qwertymates, ${name}!`,
    "",
    "Choose an option (reply with the number):",
    "",
    "1️⃣ 💡 About Qwertymates",
    "2️⃣ 🛒 (Qwertyhub)Marketplace",
    "3️⃣ 🏃 Errands",
    "4️⃣ 🏪 My Store",
    "5️⃣ 💳 Wallet",
    "6️⃣ 💼 Jobs",
    "7️⃣ 🛍️ Cart",
    "8️⃣ 🎮 Yesplay",
    "9️⃣ Register Cash Agent",
  ].join("\n");
}

function buildAboutQwertymatesMessage(): string {
  return [
    "🌍 About Qwertymates",
    "",
    "Qwertymates is your all-in-one digital platform designed to make everyday life easier, faster, and more connected.",
    "",
    "With Qwertymates, you can:",
    "",
    "💳 Send and receive money instantly using ACBPay Wallet",
    "🛒 Shop products from local and online stores via QwertyHub",
    "🏃 Request errands or earn money as a runner",
    "🏪 Start and grow your own store or business",
    "💼 Discover job and earning opportunities",
    "📲 Pay in-store using QR codes or your wallet",
    "",
    "Everything works seamlessly across:",
    "* WhatsApp ✅",
    "* Web ✅",
    "* Mobile apps ✅",
    "",
    "Our mission is simple:",
    "👉 Connect people, businesses, and services in one smart ecosystem.",
    "",
    "🚀 Whether you want to earn, shop, send money, or grow a business — Qwertymates is built for you.",
    "",
    "Reply with:",
    "1️⃣ 💳Open Wallet",
    "2️⃣ 🛒Go to marketplace",
    "3️⃣ 🏃Start Errand",
    "0️⃣ Back to main menu",
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

/** Root step after the wallet summary is shown on WhatsApp (digits 1–5, 0 match submenu, not main menu). */
const WA_WALLET_MENU_STEP = "wallet_menu";
/** Buyer pay-at-store: show QR, poll for merchant charge, confirm (syncs with web /wallet Pay at shop). */
const WA_PAY_AT_STORE_STEP = "pay_at_store";
const WA_PAY_AT_STORE_CONFIRM_STEP = "pay_at_store_confirm";

function buildWalletQrMediaUrl(userId: any): string {
  const qrPayload = `ACBPAY:${String(userId || "").trim()}`;
  return `https://quickchart.io/qr?text=${encodeURIComponent(qrPayload)}&size=640&format=png&ecLevel=M`;
}

/** Wallet menu + balances as image caption so QR always appears above the menu text in one bubble. */
async function sendWaWalletEntryWithMenuState(
  phone: string,
  userId: any,
  waSession?: WaOutboundSession
): Promise<void> {
  const caption = await buildWalletEntryMessage(userId);
  await sendWhatsAppMediaGallery(
    phone,
    [{ mediaUrl: buildWalletQrMediaUrl(userId), caption }],
    { limit: 1, gapMs: 0, session: waSession }
  );
  await saveWalletState(userId, WA_WALLET_MENU_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
}

/** Pay @ store: QR image + caption in one bubble (merchant scans ACBPAY:userId). */
async function sendWaPayAtStoreQrEntry(
  phone: string,
  userId: any,
  waSession?: WaOutboundSession,
  captionOverride?: string
): Promise<void> {
  const caption = String(captionOverride || "").trim()
    ? String(captionOverride).trim()
    : await buildPayAtStoreQrCaption(userId);
  const sent = await sendWaPayAtStoreQrMessage(phone, String(userId), caption);
  if (!sent) {
    await sendWhatsAppText(
      phone,
      `${caption}\n\n(Could not attach QR image — open ${FRONTEND_URL.replace(/\/$/, "")}/wallet and show your QR.)`,
      waSession
    );
  }
}

/** ACBPayWallet actions (balances are shown above in `buildWalletEntryMessage`). */
function buildWalletSubmenu(): string {
  return [
    "What would you like to do?",
    "",
    "1️⃣ Send money",
    "2️⃣ Request money",
    "3️⃣ Withdraw",
    "4️⃣ Pay @ store",
    "5️⃣ Become a merchant",
    "0️⃣ Back to main menu",
  ].join("\n");
}

function buildPayAtStoreWaitingMessage(): string {
  return [
    "🏪 Pay @ store",
    "",
    "Show your QR to the merchant. They scan it and enter your total — then confirm here (same as qwertymates.com/wallet).",
    "",
    buildPayAtStoreWaitingActions(),
  ].join("\n");
}

async function promptPayAtStoreConfirmIfPending(
  userId: any,
  waPhone?: string,
  waSession?: WaOutboundSession
): Promise<{ found: boolean; payload?: { code: string; message: string; quick_replies?: string[] } }> {
  const rows = await listOpenPendingStorePaymentsForPayer(String(userId));
  if (!rows.length) return { found: false };
  const latest = rows[0]!;
  await saveWalletState(
    userId,
    WA_PAY_AT_STORE_CONFIRM_STEP,
    {
      paymentRequestId: latest._id,
      amount: latest.amount,
      merchantName: latest.merchantName,
    },
    WA_WALLET_INACTIVITY_TIMEOUT_MIN
  );
  const msg = buildPayAtStoreConfirmCaption(latest.merchantName, latest.amount);
  if (waPhone) {
    await sendWaPayAtStoreQrEntry(waPhone, userId, waSession, msg);
    return { found: true, payload: { code: "PAY_AT_STORE_CONFIRM", message: WA_STUDIO_REST_PENDING_MESSAGE } };
  }
  return {
    found: true,
    payload: {
      code: "PAY_AT_STORE_CONFIRM",
      message: msg,
      quick_replies: ["1️⃣ Pay with wallet", "2️⃣ Decline", "0️⃣ Back"],
    },
  };
}

async function enterWaPayAtStoreFlow(
  waPhone: string,
  userId: any,
  waSession?: WaOutboundSession
): Promise<{ code: string; message: string }> {
  const pending = await promptPayAtStoreConfirmIfPending(userId, waPhone, waSession);
  if (pending.found && pending.payload) {
    return pending.payload;
  }
  await sendWaPayAtStoreQrEntry(waPhone, userId, waSession);
  await saveWalletState(userId, WA_PAY_AT_STORE_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
  return {
    code: "PAY_AT_STORE",
    message: WA_STUDIO_REST_PENDING_MESSAGE,
  };
}

const WA_MERCHANT_INTRO_MESSAGE = [
  "🏪 Become a Merchant",
  "",
  "Accept payments from customers and grow your business.",
  "",
  "Start application?",
  "",
  "1️⃣ Yes",
  "2️⃣ Cancel",
].join("\n");

type WalletSummary = { availableBalance: number; pendingInJobs: number; earnings: number };

async function getWalletSummary(userId: any): Promise<WalletSummary> {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId });
  const pendingEscrowAgg = await Escrow.aggregate([
    { $match: { client: userId, status: "held" } },
    { $group: { _id: null, total: { $sum: "$totalHeld" } } },
  ]);
  const pendingInJobs = Number(pendingEscrowAgg?.[0]?.total || 0);
  const earnings = (wallet.transactions || []).reduce((sum: number, tx: any) => {
    if (tx.type === "credit") return sum + Number(tx.amount || 0);
    return sum;
  }, 0);
  return {
    availableBalance: Number(wallet.balance || 0),
    pendingInJobs,
    earnings,
  };
}

function walletQuickActions(...actions: string[]): string {
  if (!actions.length) return "";
  return [`Quick actions:`, ...actions].join("\n");
}

async function buildWalletEntryMessage(userId: any): Promise<string> {
  const summary = await getWalletSummary(userId);
  const lockedNote =
    summary.pendingInJobs > 0
      ? [
          "",
          "🔒 Payment secured",
          `R${summary.pendingInJobs.toFixed(2)} is held for your errand.`,
          "Funds will be released once delivery is completed.",
        ].join("\n")
      : "";
  const head = [
    "💳 ACBPay Wallet",
    "",
    `Available Balance: R${summary.availableBalance.toFixed(2)}`,
    `Pending (in jobs): R${summary.pendingInJobs.toFixed(2)}`,
    `Earnings: R${summary.earnings.toFixed(2)}`,
  ].join("\n");
  const tail = buildWalletSubmenu();
  return lockedNote ? `${head}${lockedNote}\n${tail}` : `${head}\n${tail}`;
}

function detectWalletIntent(input: string):
  | "balance"
  | "send"
  | "request"
  | "withdraw"
  | "qr"
  | "merchant"
  | "" {
  const s = String(input || "").toLowerCase();
  if (!s) return "";
  if (/\b(balance|wallet|how much)\b/.test(s)) return "balance";
  if (/\b(send|pay|transfer)\b/.test(s)) return "send";
  if (/\b(request|ask money)\b/.test(s)) return "request";
  if (/\b(withdraw|cash out)\b/.test(s)) return "withdraw";
  if (/\b(qr|scan|pay code|pay @ store|pay at store)\b/.test(s)) return "qr";
  if (/\b(merchant|sell|accept payments?)\b/.test(s)) return "merchant";
  return "";
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
  await upsertWaScopedStateForUser(
    userId,
    "wallet",
    step,
    payload,
    new Date(Date.now() + ttlMinutes * 60 * 1000)
  );
}

async function clearWalletState(userId: any) {
  await WaConversationState.deleteOne({ user: userId, scope: "wallet" });
}

async function waClearAllInteractiveWaStates(userId: any): Promise<void> {
  await Promise.all([
    clearWalletState(userId),
    clearErrandsState(userId),
    clearMochinaState(userId),
    clearCashAgentRegState(userId),
    clearWaAboutActionState(userId),
  ]);
}

async function waGetActiveWalletStep(userId: any): Promise<string> {
  const st = await WaConversationState.findOne({ user: userId, scope: "wallet" }).lean();
  if (!st || new Date(st.expiresAt).getTime() < Date.now()) return "";
  return String(st.step || "");
}

/**
 * Global 0 / “back to main menu” — works from wallet, errands, jobs, cash agent, about, etc.
 * Pay @ store uses 0 to return to the wallet submenu (handled in wallet state).
 */
async function waTryGlobalBackToMainMenu(
  user: any,
  phone: string,
  raw: string,
  waSession?: WaOutboundSession
): Promise<{ handled: boolean; payload?: { code: string; message: string } }> {
  if (!waIsBackToMainMenuInput(raw)) return { handled: false };
  const walletStep = await waGetActiveWalletStep(user._id);
  if (
    (walletStep === WA_PAY_AT_STORE_STEP || walletStep === WA_PAY_AT_STORE_CONFIRM_STEP) &&
    !/^back\s+to\s+(the\s+)?main\s+menu/i.test(waPrimaryReplyLine(raw))
  ) {
    return { handled: false };
  }
  return {
    handled: true,
    payload: await waBuildBackToMainMenuPayload(user, phone, waSession),
  };
}

/** Return user to Qwertymates main menu; prefer REST delivery (Studio rest_wait uses empty body). */
async function waBuildBackToMainMenuPayload(
  user: any,
  phone: string,
  waSession?: WaOutboundSession,
  options?: { prefix?: string }
): Promise<{ code: string; message: string }> {
  await waClearAllInteractiveWaStates(user._id);
  const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
  const menuText = buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup);
  const prefix = String(options?.prefix || "").trim();
  const fullText = prefix ? `${prefix}\n\n${menuText}` : menuText;
  const waPhone = String(phone || "").trim();
  if (waPhone) {
    try {
      await sendWhatsAppText(waPhone, fullText, waSession);
    } catch (err) {
      logger.warn("WA back-to-main menu REST send failed", {
        error: String((err as any)?.message || err),
      });
    }
    return { code: "SELL_INFO_SILENT", message: WA_STUDIO_REST_PENDING_MESSAGE };
  }
  return { code: "BACK_TO_MENU", message: fullText };
}

async function waBuildIdleTimeoutMainMenuPayload(
  user: any,
  phone: string,
  waSession: WaOutboundSession | undefined,
  flowLabel: string
): Promise<{ code: string; message: string }> {
  return waBuildBackToMainMenuPayload(user, phone, waSession, {
    prefix: `${flowLabel} timed out after ${WA_INTERACTIVE_IDLE_MIN} minutes of no reply.`,
  });
}

async function saveMochinaState(
  userId: any,
  step: string,
  payload: Record<string, any> = {},
  ttlMinutes = WA_INTERACTIVE_IDLE_MIN
) {
  await upsertWaScopedStateForUser(
    userId,
    "mochina",
    step,
    payload,
    new Date(Date.now() + ttlMinutes * 60 * 1000)
  );
}

async function clearMochinaState(userId: any) {
  await WaConversationState.deleteOne({ user: userId, scope: "mochina" });
}

async function saveCashAgentRegState(
  userId: any,
  step: string,
  payload: Record<string, any> = {},
  ttlMinutes = WA_INTERACTIVE_IDLE_MIN
) {
  await upsertWaScopedStateForUser(
    userId,
    CASH_AGENT_REG_SCOPE,
    step,
    payload,
    new Date(Date.now() + ttlMinutes * 60 * 1000)
  );
}

async function clearCashAgentRegState(userId: any) {
  await WaConversationState.deleteOne({ user: userId, scope: CASH_AGENT_REG_SCOPE });
}

/** While user is inside Jobs onboarding or Register Cash Agent wizard, don't steal replies with global keywords (earnings/report). */
async function shouldDeferGlobalWaKeywordsForActiveJobsFlow(userId: any): Promise<boolean> {
  const cashSt = await WaConversationState.findOne({ user: userId, scope: CASH_AGENT_REG_SCOPE }).lean();
  if (cashSt && new Date(cashSt.expiresAt).getTime() >= Date.now()) {
    const cashStep = String(cashSt.step || "");
    if (cashStep !== "cash_reg_menu") return true;
  }

  const st = await WaConversationState.findOne({ user: userId, scope: "mochina" }).lean();
  if (!st) return false;
  if (new Date(st.expiresAt).getTime() < Date.now()) return false;
  let step = String(st.step || "");
  const payload = { ...(st.payload || {}) } as Record<string, any>;
  if (step === "main" && !payload.agentFullName && !payload.agentIdPassport) {
    step = "onboarding_menu";
  }
  if (step === "onboarding_menu") return false;
  return true;
}

async function saveErrandsState(
  userId: any,
  step: string,
  payload: Record<string, any> = {},
  ttlMinutes = WA_INTERACTIVE_IDLE_MIN
) {
  await upsertWaScopedStateForUser(
    userId,
    "errands",
    step,
    payload,
    new Date(Date.now() + ttlMinutes * 60 * 1000)
  );
}

async function clearErrandsState(userId: any) {
  await WaConversationState.deleteOne({ user: userId, scope: "errands" });
}

const WA_ERRANDS_WEB_URL = ERRANDS_DASHBOARD_URL;
const WA_QWERTYMATES_ANDROID_URL = ERRANDS_ANDROID_PLAY_URL;

function buildErrandsIntroMenu(): string {
  return buildErrandsIntroMenuBody();
}

/** Dashboard + Play Store links as separate messages (intro body keeps labels only). */
async function sendWhatsAppErrandsLinkFollowups(
  phoneInput: string,
  session?: WaOutboundSession
): Promise<void> {
  await delay(450);
  await sendWhatsAppText(phoneInput, ERRANDS_DASHBOARD_URL, session);
  await delay(350);
  await sendWhatsAppText(phoneInput, ERRANDS_ANDROID_PLAY_URL, session);
}

/** Intro copy (no raw URLs in body) + separate link messages for tappable previews. */
async function sendWhatsAppErrandsIntro(phoneInput: string, session?: WaOutboundSession): Promise<void> {
  await sendWhatsAppText(phoneInput, buildErrandsIntroMenuBody(), session);
  await sendWhatsAppErrandsLinkFollowups(phoneInput, session);
}

function estimateErrandsPrice(flowType: string, meta: Record<string, any>): number {
  if (flowType === "transport" || flowType === "local") {
    return estimateTshwanePostedFlowPrice(flowType as "transport" | "local", meta);
  }

  let amount = 120;
  if (flowType === "collect_send") amount = 240;
  if (flowType === "shop_send") amount = 190;
  const delivery = String(meta.deliveryMethod || "").toLowerCase();
  if (delivery === "taxi") amount += 30;
  if (delivery === "bus") amount += 40;
  if (delivery === "border") amount += 50;
  if (delivery === "courier") amount += 60;
  if (delivery === "other") amount += 50;
  return Math.max(100, Math.round(amount));
}

function buildErrandsTaskDraft(user: any, flowType: string, payload: Record<string, any>) {
  if (flowType === "collect_send") {
    const title = `Collect & Send (${payload.country || "Cross-border"})`;
    const description = `Collect from ${payload.collectFrom || "pickup point"} and send via ${payload.deliveryMethod || "delivery route"} to ${payload.destination || "destination"}.`;
    return {
      taskType: "cross_border_collection",
      title,
      description,
      pickupAddress: payload.collectFrom || "Unknown pickup",
      deliveryAddress: payload.destination || "Unknown destination",
      workflowMeta: {
        originCountry: payload.country,
        deliveryType: payload.deliveryMethod,
        receiptProvided: Boolean(payload.receiptProvided),
        createdVia: "whatsapp",
      },
    };
  }
  if (flowType === "shop_send") {
    const title = `Collect from ${payload.shopName || "shop"} and Send`;
    const description = `Collect from ${payload.shopName || "shop"} in ${payload.city || "city"} and send via ${payload.deliveryMethod || "delivery route"} to ${payload.destination || "destination"}.`;
    return {
      taskType: "shop_and_send",
      title,
      description,
      pickupAddress: payload.shopName || `${payload.city || "SA city"} shop`,
      deliveryAddress: payload.destination || "Unknown destination",
      workflowMeta: {
        collectionCity: payload.city,
        shopName: payload.shopName,
        deliveryType: payload.deliveryMethod,
        receiptProvided: Boolean(payload.receiptProvided),
        createdVia: "whatsapp",
      },
    };
  }
  if (flowType === "transport" || flowType === "local") {
    return buildTshwanePostedFlowDraft(flowType as "transport" | "local", payload, "whatsapp");
  }
  const title = `Errand - ${String((payload as any).description || "Task").slice(0, 60)}`;
  const description = String((payload as any).description || "Errand request");
  return {
    taskType: "general",
    title,
    description,
    pickupAddress: (payload as any).pickup || "Not provided",
    deliveryAddress: (payload as any).delivery || "Not provided",
    workflowMeta: { createdVia: "whatsapp" },
  };
}

async function createCollectSendPendingQuoteTask(user: any, payload: Record<string, any>) {
  const inv = payload.supplierInvoice as
    | { filename: string; path: string; mimetype: string; size: number; uploadedAt?: Date }
    | undefined;
  if (!inv?.path) throw new Error("Collect & Send quote flow missing invoice");
  const country = String(payload.country || "Cross-border").trim();
  const dm = String(payload.deliveryMethod || "other").trim();
  const dest = String(payload.destination || "").trim();
  const title = `Collect & Send (${country}) — awaiting quote`;
  const description = `Cross-border Collect & Send. Destination: ${dest || "TBC"}. Delivery: ${dm}. Supplier / goods details on uploaded invoice — admin will confirm price.`;
  const task = await Task.create({
    taskType: "collect_send",
    title,
    description,
    budget: 0,
    suggestedFee: 0,
    pickupLocation: { type: "Point", coordinates: [0, 0], address: "Supplier — see invoice" },
    deliveryLocation: { type: "Point", coordinates: [0, 0], address: dest || "Destination TBC" },
    status: "pending_quote",
    client: user._id,
    escrowed: false,
    attachments: [],
    supplierInvoice: {
      filename: inv.filename,
      path: inv.path,
      mimetype: inv.mimetype,
      size: inv.size,
      uploadedAt: inv.uploadedAt ? new Date(inv.uploadedAt) : new Date(),
    },
    workflowMeta: {
      originCountry: country,
      deliveryMethod: dm,
      deliveryType: dm,
      destination: dest,
      createdVia: "whatsapp",
      errandHandoverV2: false,
      quoteStatus: "pending_admin",
      invoiceUploadRequired: true,
    },
  });
  logger.info("Collect & Send WhatsApp task queued for admin quote", { taskId: String(task._id) });
  return task;
}

async function createErrandsTaskAndNotify(user: any, flowType: string, payload: Record<string, any>) {
  if (flowType === "transport" || flowType === "local") {
    return createPostedTshwaneErrandTask(user, flowType as "transport" | "local", payload);
  }

  const draft = buildErrandsTaskDraft(user, flowType, payload);
  const estimate = estimateErrandsPrice(flowType, payload);

  const task = await Task.create({
    taskType: normalizeErrandTaskTypeForDb(draft.taskType),
    title: draft.title,
    description: draft.description,
    budget: estimate,
    suggestedFee: estimate,
    pickupLocation: { type: "Point", coordinates: [0, 0], address: draft.pickupAddress },
    deliveryLocation: { type: "Point", coordinates: [0, 0], address: draft.deliveryAddress },
    status: "posted",
    client: user._id,
    escrowed: false,
    attachments: [],
    workflowMeta: { ...draft.workflowMeta, errandHandoverV2: false },
  });

  try {
    const matches = await findMatchingRunners(String(task._id));
    for (const match of (matches || []).slice(0, 5)) {
      await sendNotification({
        userId: match.runnerId,
        type: "NEW_TASK",
        message: `New Errands task: ${task.title} — est. R${estimate}`,
      });
    }
  } catch (err) {
    logger.warn("Errands WhatsApp runner matching failed", { error: String((err as any)?.message || err) });
  }
  return { task, estimate };
}

async function handleErrandsConversationState(
  user: any,
  rawInput: string,
  inboundBody?: Record<string, any>,
  phoneForWa?: string,
  waSession?: WaOutboundSession
): Promise<{ handled: boolean; payload?: any }> {
  const st = await WaConversationState.findOne({ user: user._id, scope: "errands" }).lean();
  if (!st) return { handled: false };
  const waPhone = String(phoneForWa || "").trim() || String((user as any).phone || "").trim();
  if (new Date(st.expiresAt).getTime() < Date.now()) {
    await clearErrandsState(user._id);
    return {
      handled: true,
      payload: await waBuildIdleTimeoutMainMenuPayload(user, waPhone, waSession, "Errands"),
    };
  }

  const input = String(rawInput || "").trim();
  const lower = input.toLowerCase();
  const step = String(st.step || "");
  const payload = { ...(st.payload || {}) } as Record<string, any>;
  const legacyErrandSteps = new Set([
    "transport_item_type",
    "transport_pickup",
    "transport_delivery",
    "transport_vehicle",
    "local_description",
    "local_pickup",
    "local_delivery",
  ]);
  if (legacyErrandSteps.has(step)) {
    await clearErrandsState(user._id);
    if (waPhone) {
      void sendWhatsAppErrandsLinkFollowups(waPhone, waSession).catch((err) => {
        logger.warn("Errands legacy reset link follow-up failed", { error: String((err as any)?.message || err) });
      });
    }
    return {
      handled: true,
      payload: {
        code: "ERRANDS_LEGACY_RESET",
        message:
          `We've updated Errands on WhatsApp.\n\n${buildErrandsIntroMenu()}`,
      },
    };
  }
  const mediaItems = extractTwilioInboundMedia(inboundBody);
  const redirectMsg =
    "For a better experience, continue on Qwertymates Dashboard or the Android App (links sent above).";
  if (step === "collect_invoice") {
    if (!mediaItems.length) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_INVOICE_REQUIRED",
          message:
            "📎 Upload your shop invoice (required).\n\nSend a clear photo or PDF of your invoice here in WhatsApp so we can confirm supplier location, goods, and pricing.",
        },
      };
    }
    const saved = await downloadTwilioInboundMediaToUploads(mediaItems[0]!.url, mediaItems[0]!.contentType);
    if (!saved) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_INVOICE_DOWNLOAD_FAILED",
          message:
            "We could not save your attachment. Please try again with a photo or a smaller PDF.",
        },
      };
    }
    payload.supplierInvoice = { ...saved, uploadedAt: new Date() };
    payload.collectFrom = "Invoice on file";
    await saveErrandsState(user._id, "collect_delivery_method", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_Q3",
        message:
          "How should we deliver?\n1️⃣ Taxi rank\n2️⃣ Bus station\n3️⃣ Border\n4️⃣ Courier\n5️⃣ Other\n\nReply with a number 1–5.",
      },
    };
  }

  const deliveryOfficialPin =
    step === "local_delivery_address"
      ? extractOfficialWhatsAppPinCoordinates(inboundBody as Record<string, any>)
      : null;
  if (!input && !deliveryOfficialPin) {
    return { handled: true, payload: { code: "ERRANDS_EMPTY", message: "Please reply with your answer." } };
  }
  if (waIsBackToMainMenuInput(input) || ["cancel", "menu", "stop"].includes(lower)) {
    return {
      handled: true,
      payload: await waBuildBackToMainMenuPayload(user, waPhone, waSession, {
        prefix: "Errands flow cancelled.",
      }),
    };
  }
  if (/(app|web|edit|struggle|complex|upload fail|can't upload|cant upload)/i.test(lower)) {
    if (waPhone) {
      void sendWhatsAppErrandsLinkFollowups(waPhone, waSession).catch((err) => {
        logger.warn("Errands redirect link follow-up failed", { error: String((err as any)?.message || err) });
      });
    }
    return { handled: true, payload: { code: "ERRANDS_REDIRECT", message: redirectMsg } };
  }

  if (step === "select_option") {
    await clearErrandsState(user._id);
    if (waPhone) {
      void sendWhatsAppErrandsLinkFollowups(waPhone, waSession).catch((err) => {
        logger.warn("Errands web link follow-up failed", { error: String((err as any)?.message || err) });
      });
    }
    return {
      handled: true,
      payload: { code: "ERRANDS_WEB_LINK", message: buildErrandsIntroMenu() },
    };
  }

  // Option 1: Collect & Send (invoice → delivery option → destination → admin quote)
  if (step === "collect_country") {
    payload.country = input;
    await saveErrandsState(user._id, "collect_invoice", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_Q2_INVOICE",
        message:
          "📎 Upload your shop invoice (required).\n\nSend a clear photo or PDF of your invoice here in WhatsApp.\n\nWe use it to confirm supplier location, goods, and your quote.",
      },
    };
  }
  if (step === "collect_delivery_method") {
    const key = normalizeWaMenuDigitInput(input);
    if (!["1", "2", "3", "4", "5"].includes(key)) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_DELIVERY_INVALID",
          message:
            "Please reply with a number 1–5.\n\nHow should we deliver?\n1️⃣ Taxi rank\n2️⃣ Bus station\n3️⃣ Border\n4️⃣ Courier\n5️⃣ Other",
        },
      };
    }
    const dmMap: Record<string, string> = {
      "1": "taxi",
      "2": "bus",
      "3": "border",
      "4": "courier",
      "5": "other",
    };
    payload.deliveryMethod = dmMap[key] || "other";
    await saveErrandsState(user._id, "collect_destination", payload);
    return { handled: true, payload: { code: "ERRANDS_Q4", message: "Where must we send it to? (Type location or name)" } };
  }
  if (step === "collect_destination") {
    payload.destination = input;
    try {
      const task = await createCollectSendPendingQuoteTask(user, payload);
      await clearErrandsState(user._id);
      return {
        handled: true,
        payload: {
          code: "ERRANDS_QUOTE_QUEUED",
          message: `✅ Thanks — we received your details.\n\nYour quote will be sent to you shortly.\n\nRef: #${String(task._id).slice(-6)}`,
        },
      };
    } catch (err) {
      logger.error("Collect & Send pending quote task failed", { error: String((err as any)?.message || err) });
      return {
        handled: true,
        payload: {
          code: "ERRANDS_QUOTE_TASK_FAILED",
          message: "Something went wrong saving your request. Please try again from the Errands menu or open the app.",
        },
      };
    }
  }

  // Option 2: Shop & Send
  if (step === "shop_city") {
    const key = normalizeWaMenuDigitInput(input);
    payload.city = key === "1" ? "Durban" : key === "3" ? "Pretoria" : key === "2" ? "Johannesburg" : input;
    await saveErrandsState(user._id, "shop_name", payload);
    return { handled: true, payload: { code: "ERRANDS_Q2", message: "Enter shop name or address." } };
  }
  if (step === "shop_name") {
    payload.shopName = input;
    await saveErrandsState(user._id, "shop_receipt", payload);
    return { handled: true, payload: { code: "ERRANDS_Q3", message: "Please send your receipt/invoice or order proof.\nReply SKIP to continue without it." } };
  }
  if (step === "shop_receipt") {
    payload.receiptProvided = !["skip", "no", "none"].includes(lower);
    await saveErrandsState(user._id, "shop_method", payload);
    const warn = payload.receiptProvided ? "" : "\n⚠️ For better service, please upload receipt/invoice later.";
    return { handled: true, payload: { code: "ERRANDS_Q4", message: `Where should we send it?\n1️⃣ Taxi\n2️⃣ Courier\n3️⃣ Border\n4️⃣ Other${warn}` } };
  }
  if (step === "shop_method") {
    const key = normalizeWaMenuDigitInput(input);
    payload.deliveryMethod = key === "1" ? "taxi" : key === "2" ? "courier" : key === "3" ? "border" : "other";
    await saveErrandsState(user._id, "shop_destination", payload);
    return { handled: true, payload: { code: "ERRANDS_Q5", message: "Enter destination details." } };
  }
  if (step === "shop_destination") {
    payload.destination = input;
    const estimate = estimateErrandsPrice("shop_send", payload);
    await saveErrandsState(user._id, "shop_confirm", { ...payload, estimate });
    return {
      handled: true,
      payload: {
        code: "ERRANDS_CONFIRM",
        message: `✅ Estimated cost: R${estimate}\n\nConfirm task?\n1️⃣ ✅ Confirm\n2️⃣ ❌ Cancel\n\n(You can also reply CONFIRM or YES.)`,
      },
    };
  }
  if (step === "shop_confirm") {
    if (!waErrandConfirmIsYes(input)) {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Task cancelled." } };
    }
    const { task } = await createErrandsTaskAndNotify(user, "shop_send", payload);
    await clearErrandsState(user._id);
    return { handled: true, payload: { code: "ERRANDS_CREATED", message: `✅ Task created (#${String(task._id).slice(-6)})\n⏳ Finding a runner...` } };
  }

  // Option 2: Transport Items (City of Tshwane tariff — vehicle → kg → areas → surcharges → addresses → photo → confirm)
  if (step === "transport_vehicle_select") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Transport booking cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    if (!["1", "2"].includes(key)) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_TRANSPORT_VEHICLE_INVALID",
          message: "Please reply 1 for Bakkie, 2 for Small truck (or 0 to cancel).",
        },
      };
    }
    payload.vehicleType = key === "2" ? "small_truck" : "bakkie";
    await saveErrandsState(user._id, "transport_load_kg", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_TRANSPORT_KG",
        message:
          "Enter load weight in kg (number only).\n\nExamples: 25, 75, 320\n\nBands (customer price from):\n• 10–50 kg — Light — R200\n• 50–200 kg — Medium — R300\n• 200–500 kg — Heavy — R500\n• 500–1000 kg — Extra heavy — R700\n\nMax 1000 kg for this automated quote.\n(Surcharges: cross-township +R50, peak hours +R30.)",
      },
    };
  }
  if (step === "transport_load_kg") {
    const kgRaw = parsePositiveAmount(input) ?? Number(String(input || "").replace(/[^\d.]/g, ""));
    const kg = Number(kgRaw);
    if (!Number.isFinite(kg) || kg <= 0) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_TRANSPORT_KG_INVALID",
          message: "Please enter load weight as a number in kg (example: 75).",
        },
      };
    }
    if (transportBandFromKg(kg) === null) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_TRANSPORT_KG_RANGE",
          message:
            "That weight is outside our automated band (max 1000 kg).\n\nEnter a weight between 10 and 1000 kg, or open the web app for help.",
        },
      };
    }
    payload.loadKg = Math.round(kg * 10) / 10;
    await saveErrandsState(user._id, "transport_pickup_region", payload);
    return {
      handled: true,
      payload: { code: "ERRANDS_TRANSPORT_PICKUP_REGION", message: buildTshwaneRegionPickerMessage("🚛 Pickup — choose region") },
    };
  }
  if (step === "transport_pickup_region") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Transport booking cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const rid = resolveTshwaneRegionFromMenuDigit(key);
    if (!rid) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_REGION_INVALID",
          message: `Please reply with a number 1–7.\n\n${buildTshwaneRegionPickerMessage("🚛 Pickup — choose region")}`,
        },
      };
    }
    payload.pickupRegionId = rid;
    await saveErrandsState(user._id, "transport_pickup_township", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_TRANSPORT_PICKUP_AREA",
        message: buildTshwaneTownshipPickerMessage(rid as TshwaneRegionId, "🚛 Pickup — choose area"),
      },
    };
  }
  if (step === "transport_pickup_township") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Transport booking cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const idx = Number(key);
    const regionId = String(payload.pickupRegionId || "") as TshwaneRegionId;
    const tw = resolveTshwaneTownshipFromRegionIndex(regionId, idx);
    if (!tw) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_TOWNSHIP_INVALID",
          message: `Please reply with a valid number from the list.\n\n${buildTshwaneTownshipPickerMessage(regionId, "🚛 Pickup — choose area")}`,
        },
      };
    }
    payload.pickupTownshipId = tw.id;
    await saveErrandsState(user._id, "transport_delivery_region", payload);
    return {
      handled: true,
      payload: { code: "ERRANDS_TRANSPORT_DROP_REGION", message: buildTshwaneRegionPickerMessage("🚛 Delivery — choose region") },
    };
  }
  if (step === "transport_delivery_region") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Transport booking cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const rid = resolveTshwaneRegionFromMenuDigit(key);
    if (!rid) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_REGION_INVALID",
          message: `Please reply with a number 1–7.\n\n${buildTshwaneRegionPickerMessage("🚛 Delivery — choose region")}`,
        },
      };
    }
    payload.deliveryRegionId = rid;
    await saveErrandsState(user._id, "transport_delivery_township", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_TRANSPORT_DROP_AREA",
        message: buildTshwaneTownshipPickerMessage(rid as TshwaneRegionId, "🚛 Delivery — choose area"),
      },
    };
  }
  if (step === "transport_delivery_township") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Transport booking cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const idx = Number(key);
    const regionId = String(payload.deliveryRegionId || "") as TshwaneRegionId;
    const tw = resolveTshwaneTownshipFromRegionIndex(regionId, idx);
    if (!tw) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_TOWNSHIP_INVALID",
          message: `Please reply with a valid number from the list.\n\n${buildTshwaneTownshipPickerMessage(regionId, "🚛 Delivery — choose area")}`,
        },
      };
    }
    payload.deliveryTownshipId = tw.id;
    await saveErrandsState(user._id, "transport_peak", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_TRANSPORT_PEAK",
        message: "Peak hours surcharge (+R30 on this tariff)?\n\n1️⃣ Yes\n2️⃣ No\n\n0️⃣ Cancel",
      },
    };
  }
  if (step === "transport_peak") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Transport booking cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    if (!["1", "2"].includes(key)) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_PEAK_INVALID",
          message: "Please reply 1 for Yes or 2 for No (or 0 to cancel).",
        },
      };
    }
    payload.peakHours = key === "1";
    await saveErrandsState(user._id, "transport_pickup_address", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_TRANSPORT_PICKUP_ADDR",
        message: "📍 Pickup street address or landmark (short text).",
      },
    };
  }
  if (step === "transport_pickup_address") {
    payload.pickup = input;
    await saveErrandsState(user._id, "transport_delivery_address", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_TRANSPORT_DROP_ADDR",
        message: "📍 Delivery street address or landmark (short text).",
      },
    };
  }
  if (step === "transport_delivery_address") {
    payload.delivery = input;
    await saveErrandsState(user._id, "transport_photo", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_TRANSPORT_PHOTO",
        message: "📷 Send a photo of the load (optional), or reply SKIP.",
      },
    };
  }
  if (step === "transport_photo") {
    payload.photoProvided = !["skip", "no", "none"].includes(lower);
    const pt = getTshwaneTownshipById(payload.pickupTownshipId);
    const dt = getTshwaneTownshipById(payload.deliveryTownshipId);
    const q = quoteTransportTshwane({
      loadKg: Number(payload.loadKg),
      pickupTownship: pt,
      deliveryTownship: dt,
      peak: Boolean(payload.peakHours),
    });
    if (!q.ok) {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_TRANSPORT_QUOTE_FAIL", message: q.message } };
    }
    const estimate = q.customerTotal;
    await saveErrandsState(user._id, "transport_confirm", { ...payload, estimate });
    return {
      handled: true,
      payload: {
        code: "ERRANDS_CONFIRM",
        message: [
          formatTshwaneQuoteWhatsApp(q),
          "",
          "Confirm task?",
          "1️⃣ ✅ Confirm",
          "2️⃣ ❌ Cancel",
          "",
          "(You can also reply CONFIRM or YES.)",
        ].join("\n"),
      },
    };
  }
  if (step === "transport_confirm") {
    if (!waErrandConfirmIsYes(input)) {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Task cancelled." } };
    }
    const { task } = await createErrandsTaskAndNotify(user, "transport", payload);
    await clearErrandsState(user._id);
    return { handled: true, payload: { code: "ERRANDS_CREATED", message: `✅ Task created (#${String(task._id).slice(-6)})\n⏳ Finding a transport runner...` } };
  }

  // Option 3: Local Errand (City of Tshwane — regions → service → surcharges → addresses → confirm)
  if (step === "local_pickup_region") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Local errand cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const rid = resolveTshwaneRegionFromMenuDigit(key);
    if (!rid) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_REGION_INVALID",
          message: `Please reply with a number 1–7.\n\n${buildTshwaneRegionPickerMessage("📍 Local errand — pickup region")}`,
        },
      };
    }
    payload.pickupRegionId = rid;
    await saveErrandsState(user._id, "local_pickup_township", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_LOCAL_PICKUP_AREA",
        message: buildTshwaneTownshipPickerMessage(rid as TshwaneRegionId, "📍 Pickup — choose area"),
      },
    };
  }
  if (step === "local_pickup_township") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Local errand cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const idx = Number(key);
    const regionId = String(payload.pickupRegionId || "") as TshwaneRegionId;
    const tw = resolveTshwaneTownshipFromRegionIndex(regionId, idx);
    if (!tw) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_TOWNSHIP_INVALID",
          message: `Please reply with a valid number from the list.\n\n${buildTshwaneTownshipPickerMessage(regionId, "📍 Pickup — choose area")}`,
        },
      };
    }
    payload.pickupTownshipId = tw.id;
    await saveErrandsState(user._id, "local_delivery_region", payload);
    return {
      handled: true,
      payload: { code: "ERRANDS_LOCAL_DROP_REGION", message: buildTshwaneRegionPickerMessage("📍 Delivery — choose region") },
    };
  }
  if (step === "local_delivery_region") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Local errand cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const rid = resolveTshwaneRegionFromMenuDigit(key);
    if (!rid) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_REGION_INVALID",
          message: `Please reply with a number 1–7.\n\n${buildTshwaneRegionPickerMessage("📍 Delivery — choose region")}`,
        },
      };
    }
    payload.deliveryRegionId = rid;
    await saveErrandsState(user._id, "local_delivery_township", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_LOCAL_DROP_AREA",
        message: buildTshwaneTownshipPickerMessage(rid as TshwaneRegionId, "📍 Delivery — choose area"),
      },
    };
  }
  if (step === "local_delivery_township") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Local errand cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const idx = Number(key);
    const regionId = String(payload.deliveryRegionId || "") as TshwaneRegionId;
    const tw = resolveTshwaneTownshipFromRegionIndex(regionId, idx);
    if (!tw) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_TOWNSHIP_INVALID",
          message: `Please reply with a valid number from the list.\n\n${buildTshwaneTownshipPickerMessage(regionId, "📍 Delivery — choose area")}`,
        },
      };
    }
    payload.deliveryTownshipId = tw.id;
    await saveErrandsState(user._id, "local_service", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_LOCAL_SERVICE",
        message: [
          "Choose service type:",
          "",
          "1️⃣ Small parcel (<2 kg) — R25",
          "2️⃣ Food delivery — R30",
          "3️⃣ Medium parcel (2–10 kg) — R40",
          "4️⃣ Large parcel (10–20 kg) — R60",
          "",
          "Cross-township (different pickup vs delivery area): +R15",
          "Peak / weekend: +R10",
          "",
          "0️⃣ Cancel",
        ].join("\n"),
      },
    };
  }
  if (step === "local_service") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Local errand cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    const map: Record<string, LocalServiceKey> = {
      "1": "small_parcel",
      "2": "food",
      "3": "medium_parcel",
      "4": "large_parcel",
    };
    const svc = map[key];
    if (!svc) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_LOCAL_SERVICE_INVALID",
          message: "Please reply with 1, 2, 3 or 4 (or 0 to cancel).",
        },
      };
    }
    payload.localServiceKey = svc;
    await saveErrandsState(user._id, "local_peak", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_LOCAL_PEAK",
        message: "Peak / weekend surcharge (+R10 on this tariff)?\n\n1️⃣ Yes\n2️⃣ No\n\n0️⃣ Cancel",
      },
    };
  }
  if (step === "local_peak") {
    const key = normalizeWaMenuDigitInput(input);
    if (key === "0") {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Local errand cancelled.\n\nReply 3 from the main menu (Errands) to start again." } };
    }
    if (!["1", "2"].includes(key)) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_PEAK_INVALID",
          message: "Please reply 1 for Yes or 2 for No (or 0 to cancel).",
        },
      };
    }
    payload.peakHours = key === "1";
    await saveErrandsState(user._id, "local_pickup_address", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_LOCAL_PICKUP_ADDR",
        message: [
          "📍 Add pickup location (required)",
          "",
          "Type the **shop / building name + street or mall** where we must collect.",
          "Example: Nando's, Shop 12, Jubilee Mall, Hammanskraal",
          "",
          "Short replies like one word are not accepted.",
        ].join("\n"),
      },
    };
  }
  if (step === "local_pickup_address") {
    if (!isSubstantialLocalErrandPickupText(input)) {
      return {
        handled: true,
        payload: {
          code: "ERRANDS_LOCAL_PICKUP_REQUIRED",
          message: [
            "Pickup location is required.",
            "",
            "Please type **at least 12 characters** with **2+ words** (shop / mall / street).",
            "",
            "Example: Nando's Jubilee Mall food court entrance",
          ].join("\n"),
        },
      };
    }
    payload.pickup = stripWaInvisibleChars(input);
    await saveErrandsState(user._id, "local_delivery_address", payload);
    return {
      handled: true,
      payload: {
        code: "ERRANDS_LOCAL_DROP_ADDR",
        message: [
          "📍 Add delivery location (required)",
          "",
          "Option A — Send **one WhatsApp location pin** (tap 📎 → Location).",
          "Option B — Type a **full address**: street + area + gate/building notes.",
          "",
          "One-word place names alone are not accepted for text.",
        ].join("\n"),
      },
    };
  }
  if (step === "local_delivery_address") {
    const pin = extractOfficialWhatsAppPinCoordinates(inboundBody as Record<string, any>);
    const typed = stripWaInvisibleChars(input);
    if (pin) {
      const summary =
        extractTwilioInboundLocationSummary(inboundBody as Record<string, any>) ||
        `Maps pin: ${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)}`;
      payload.deliveryVerifiedPin = true;
      payload.deliveryLatitude = pin.lat;
      payload.deliveryLongitude = pin.lng;
      payload.delivery = typed.length >= 3 ? `${summary}\nNotes: ${typed.slice(0, 220)}` : summary;
    } else {
      if (!isSubstantialLocalErrandDeliveryText(input)) {
        return {
          handled: true,
          payload: {
            code: "ERRANDS_LOCAL_DELIVERY_REQUIRED",
            message: [
              "Delivery location is required.",
              "",
              "Send **one WhatsApp location pin**,",
              "or type a **full address** (at least 16 characters, 2+ words) with street / stand / gate info.",
            ].join("\n"),
          },
        };
      }
      payload.deliveryVerifiedPin = false;
      delete payload.deliveryLatitude;
      delete payload.deliveryLongitude;
      payload.delivery = typed;
    }
    const pt = getTshwaneTownshipById(payload.pickupTownshipId);
    const dt = getTshwaneTownshipById(payload.deliveryTownshipId);
    const q = quoteLocalErrandTshwane({
      serviceKey: payload.localServiceKey as LocalServiceKey,
      pickupTownship: pt,
      deliveryTownship: dt,
      peak: Boolean(payload.peakHours),
    });
    if (!q.ok) {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_LOCAL_QUOTE_FAIL", message: q.message } };
    }
    const estimate = q.customerTotal;
    await saveErrandsState(user._id, "local_confirm", { ...payload, estimate });
    return {
      handled: true,
      payload: {
        code: "ERRANDS_CONFIRM",
        message: [
          formatTshwaneQuoteWhatsApp(q),
          "",
          "Confirm task?",
          "1️⃣ ✅ Confirm",
          "2️⃣ ❌ Cancel",
          "",
          "(You can also reply CONFIRM or YES.)",
        ].join("\n"),
      },
    };
  }
  if (step === "local_confirm") {
    if (!waErrandConfirmIsYes(input)) {
      await clearErrandsState(user._id);
      return { handled: true, payload: { code: "ERRANDS_CANCEL", message: "Task cancelled." } };
    }
    const { task } = await createErrandsTaskAndNotify(user, "local", payload);
    await clearErrandsState(user._id);
    return { handled: true, payload: { code: "ERRANDS_CREATED", message: `✅ Task created (#${String(task._id).slice(-6)})\n⏳ Finding a runner...` } };
  }

  return { handled: false };
}

function buildMochinaMenu(): string {
  return [
    "💼 Jobs",
    "",
    "Welcome.",
    "",
    "Reply with:",
    "1️⃣ Register as Onboarding Agent",
    "",
    "That starts one guided flow:",
    "• Step 1 — Your name",
    "• Step 2 — ID / passport number",
    "• Step 3 — Bank account (optional — reply SKIP to skip)",
    "",
    "0️⃣ Back to main menu",
  ].join("\n");
}

function buildCashAgentTypeMenu(): string {
  return [
    "🏪 Register Cash Agent",
    "",
    "Onboarding Agents are paid R30 per successful registration",
    "",
    "Select one option:",
    "",
    "1️⃣ Individual",
    "2️⃣ Company",
    "",
    "0️⃣ Back to main menu",
  ].join("\n");
}

function waCashAgentDigitCount(input: string): number {
  return String(input || "").replace(/\D/g, "").length;
}

async function handleWhatsAppAgentEarningsKeywords(
  user: any,
  phone: string,
  raw: string
): Promise<{ handled: boolean; payload?: any }> {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\s+/g, " ");
  if (!t) return { handled: false };
  const myEarnings =
    /^(my\s*earnings|earnings)$/.test(t) ||
    t === "commission dashboard" ||
    t === "commission" ||
    /^my\s+commission/.test(t);
  const downloadReport =
    /^download\s*report$/.test(t) ||
    t === "report" ||
    /^email\s*report$/.test(t) ||
    t === "csv report";
  if (!myEarnings && !downloadReport) return { handled: false };

  const uid = user._id as mongoose.Types.ObjectId;
  const dash = `${FRONTEND_URL.replace(/\/$/, "")}/wallet/agent-earnings`;

  if (myEarnings) {
    const summary = await getAgentCommissionSummary(uid);
    const msg = [
      "💼 My earnings (tuckshop agent)",
      "",
      `✅ Tuckshops registered: ${summary.tuckshopsRegistered}`,
      `⏳ Pending approvals: ${summary.pendingApprovals}`,
      `💰 Total commissions earned: R ${summary.totalCommissionsEarnedZar.toFixed(2)}`,
      "",
      `Commission dashboard (web): ${dash}`,
      "",
      "Reply DOWNLOAD REPORT to email CSV + PDF.",
    ].join("\n");
    return { handled: true, payload: { code: "AGENT_EARNINGS_SUMMARY", message: msg } };
  }

  const recent = await AuditLog.findOne({
    action: "AGENT_EARNINGS_REPORT_EMAIL",
    user: uid,
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
  })
    .select("_id")
    .lean();
  if (recent) {
    return {
      handled: true,
      payload: {
        code: "AGENT_REPORT_RATE_LIMIT",
        message: "You already requested a report recently. Please wait up to an hour and try again.",
      },
    };
  }

  const result = await emailAgentEarningsReportForUser(uid);
  if (result.ok) {
    await AuditLog.create({
      action: "AGENT_EARNINGS_REPORT_EMAIL",
      user: uid,
      meta: { channel: "whatsapp_keyword", phone: waPhoneToDigits(phone) },
    });
  }

  return {
    handled: true,
    payload: {
      code: result.ok ? "AGENT_REPORT_SENT" : "AGENT_REPORT_FAILED",
      message: result.ok ? `${result.message}\n\nWeb: ${dash}` : result.message,
    },
  };
}

async function handleCashAgentRegistrationConversationState(
  user: any,
  phone: string,
  rawInput: string,
  body?: Record<string, any>
): Promise<{ handled: boolean; payload?: any }> {
  const input = String(rawInput || "").trim();
  const lower = input.toLowerCase();
  const st = await WaConversationState.findOne({ user: user._id, scope: CASH_AGENT_REG_SCOPE }).lean();

  if (!st) return { handled: false };
  const waPhone = String(phone || "").trim() || String((user as any).phone || "").trim();
  if (new Date(st.expiresAt).getTime() < Date.now()) {
    await clearCashAgentRegState(user._id);
    return {
      handled: true,
      payload: await waBuildIdleTimeoutMainMenuPayload(user, waPhone, undefined, "Register Cash Agent"),
    };
  }

  if (waIsBackToMainMenuInput(input)) {
    return {
      handled: true,
      payload: await waBuildBackToMainMenuPayload(user, waPhone),
    };
  }

  let step = String(st.step || "");
  const payload = { ...(st.payload || {}) } as Record<string, any>;

  const saveProofOrSkip = async (): Promise<
    { ok: true; path: string } | { ok: false; payload: { code: string; message: string } }
  > => {
    if (["skip", "none", "no", "n/a", "-"].includes(lower)) {
      return { ok: true, path: "" };
    }
    const mediaList = extractTwilioInboundMedia(body || {});
    const proofPick =
      mediaList.find((m) => /image\/(jpeg|pjpeg|jpg|png|webp)/i.test(String(m.contentType || ""))) ||
      mediaList.find((m) => /application\/pdf/i.test(String(m.contentType || "")));
    if (!proofPick?.url) {
      return {
        ok: false,
        payload: {
          code: "CASH_REG_PROOF_REQUIRED_OR_SKIP",
          message: "Reply SKIP to skip, or send one image/PDF for proof of residence.",
        },
      };
    }
    const saved = await downloadTwilioInboundMediaToUploads(
      proofPick.url,
      proofPick.contentType || "application/octet-stream"
    );
    if (!saved?.path) {
      return {
        ok: false,
        payload: {
          code: "CASH_REG_PROOF_SAVE_FAIL",
          message: "Could not save your file. Please try again or reply SKIP.",
        },
      };
    }
    return { ok: true, path: saved.path };
  };

  const requireImageUpload = async (): Promise<
    { ok: true; path: string } | { ok: false; payload: { code: string; message: string } }
  > => {
    const mediaList = extractTwilioInboundMedia(body || {});
    const imagePick = mediaList.find((m) => /image\/(jpeg|pjpeg|jpg|png|webp)/i.test(String(m.contentType || "")));
    if (!imagePick?.url) {
      return {
        ok: false,
        payload: {
          code: "CASH_REG_PHOTO_REQUIRED",
          message: "Please send one photo (JPG/PNG/WebP) — not text.",
        },
      };
    }
    const savedFile = await downloadTwilioInboundMediaToUploads(imagePick.url, imagePick.contentType || "image/jpeg");
    if (!savedFile?.path) {
      return {
        ok: false,
        payload: {
          code: "CASH_REG_PHOTO_SAVE_FAIL",
          message: "Could not save your photo. Please send the image again.",
        },
      };
    }
    return { ok: true, path: savedFile.path };
  };

  const requireCertUpload = async (): Promise<
    { ok: true; path: string } | { ok: false; payload: { code: string; message: string } }
  > => {
    const mediaList = extractTwilioInboundMedia(body || {});
    const pick =
      mediaList.find((m) => /application\/pdf/i.test(String(m.contentType || ""))) ||
      mediaList.find((m) => /image\/(jpeg|pjpeg|jpg|png|webp)/i.test(String(m.contentType || "")));
    if (!pick?.url) {
      return {
        ok: false,
        payload: {
          code: "CASH_REG_CERT_REQUIRED",
          message: "Please send your company certificate as one PDF or photo (JPG/PNG).",
        },
      };
    }
    const saved = await downloadTwilioInboundMediaToUploads(pick.url, pick.contentType || "application/pdf");
    if (!saved?.path) {
      return {
        ok: false,
        payload: {
          code: "CASH_REG_CERT_SAVE_FAIL",
          message: "Could not save your certificate file. Please try again.",
        },
      };
    }
    return { ok: true, path: saved.path };
  };

  try {
    if (step === "cash_reg_menu") {
      const key = normalizeWaMenuDigitInput(input);
      if (key === "1") {
        await saveCashAgentRegState(user._id, "cash_reg_ind_name", { kind: "individual" });
      return {
        handled: true,
        payload: {
            code: "CASH_REG_IND_NAME",
            message: "Individual — Step 1\n\nEnter your shop name (as customers know it).",
          },
        };
      }
      if (key === "2") {
        await saveCashAgentRegState(user._id, "cash_reg_co_name", { kind: "company" });
        return {
          handled: true,
          payload: {
            code: "CASH_REG_CO_NAME",
            message: "Company — Step 1\n\nEnter your tuckshop / trading name.",
          },
        };
      }
      return {
        handled: true,
        payload: {
          code: "CASH_REG_TYPE_HINT",
          message: ["That wasn't an option — reply 1, 2, or 0.\n\n", buildCashAgentTypeMenu()].join(""),
        },
      };
    }

    if (step === "cash_reg_ind_name") {
      if (input.length < 2) {
        return {
          handled: true,
          payload: { code: "CASH_REG_NAME_SHORT", message: "Enter a shop name (at least 2 characters)." },
        };
      }
      await saveCashAgentRegState(user._id, "cash_reg_ind_id", { ...payload, shopName: input.slice(0, 200) });
      return {
        handled: true,
        payload: {
          code: "CASH_REG_IND_ID",
          message: "Step 2 — Enter your ID or passport number.",
        },
      };
    }

    if (step === "cash_reg_ind_id") {
      if (input.length < 4) {
      return {
        handled: true,
        payload: {
            code: "CASH_REG_ID_INVALID",
            message: "Enter a valid ID or passport number (at least 4 characters).",
          },
        };
      }
      await saveCashAgentRegState(user._id, "cash_reg_ind_location", { ...payload, idPassport: input.slice(0, 80) });
      return {
        handled: true,
        payload: {
          code: "CASH_REG_IND_LOC",
          message:
            "Step 3 — WhatsApp location pin (required)\n\nTap 📎 → Location → drop the pin on your tuckshop.\n\nTyped addresses alone are not accepted — agents need GPS from the pin.\n\nOptional: after the pin, one short text note (e.g. gate colour).",
        },
      };
    }

    if (step === "cash_reg_ind_location") {
      const pin = extractOfficialWhatsAppPinCoordinates(body || {});
      if (!pin) {
        return {
          handled: true,
          payload: {
            code: "CASH_REG_LOC_PIN_REQUIRED",
            message:
              "📍 Send a WhatsApp location pin — tap 📎 → Location → place it on your shop.\n\nDo not type the address only; we need the GPS pin.",
          },
        };
      }
      const { locationPin, locationLatitude, locationLongitude } = buildVerifiedCashAgentLocationLines(pin, input);
      await saveCashAgentRegState(
        user._id,
        "cash_reg_ind_phone",
        { ...payload, locationPin, locationLatitude, locationLongitude },
        30
      );
      return {
        handled: true,
        payload: {
          code: "CASH_REG_IND_PHONE",
          message: "Step 4 — Enter shop owner's cellphone number.",
        },
      };
    }

    if (step === "cash_reg_ind_phone") {
      if (waCashAgentDigitCount(input) < 8) {
        return {
          handled: true,
          payload: {
            code: "CASH_REG_PHONE_INVALID",
            message: "Enter a valid phone number with at least 8 digits.",
          },
        };
      }
      await saveCashAgentRegState(
        user._id,
        "cash_reg_ind_proof",
        { ...payload, contactPhone: input.slice(0, 40) },
        30
      );
      return {
        handled: true,
        payload: {
          code: "CASH_REG_IND_PROOF",
          message:
            "Step 5 (optional) — Proof of residence.\n\nSend one photo or PDF, or reply SKIP to skip.",
        },
      };
    }

    if (step === "cash_reg_ind_proof") {
      const proof = await saveProofOrSkip();
      if (!proof.ok) return { handled: true, payload: proof.payload };
      await saveCashAgentRegState(
        user._id,
        "cash_reg_ind_photo",
        { ...payload, proofPath: proof.path },
        30
      );
      return {
        handled: true,
        payload: {
          code: "CASH_REG_IND_PHOTO",
          message: "Step 6 — Send one clear photo of your tuckshop (shopfront or branding). JPG or PNG.",
        },
      };
    }

    if (step === "cash_reg_ind_photo") {
      const img = await requireImageUpload();
      if (!img.ok) return { handled: true, payload: img.payload };
      const shopName = String(payload.shopName || "").trim();
      const idPassport = String(payload.idPassport || "").trim();
      const address = String(payload.locationPin || "").trim();
      const lat = Number(payload.locationLatitude);
      const lng = Number(payload.locationLongitude);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        await saveCashAgentRegState(user._id, "cash_reg_ind_location", { ...payload });
        return {
          handled: true,
          payload: {
            code: "CASH_REG_LOC_PIN_MISSING",
            message:
              "Your session is missing a verified GPS pin.\n\nStep 3 again: tap 📎 → Location → pin your tuckshop.",
          },
        };
      }
      const tuckshopContactPhone = String(payload.contactPhone || "").trim();
      const proofPath = String(payload.proofPath || "").trim();
      const reg = await TuckshopCashAgentRegistration.create({
        applicantUser: user._id,
        waPhoneDigits: waPhoneToDigits(phone),
        tuckshopName: shopName,
        ownerDetails: `Individual — ID/passport: ${idPassport}`,
        address,
        locationLatitude: lat,
        locationLongitude: lng,
        tuckshopContactPhone,
        preferredPaymentMethod: "Cash agent (WhatsApp)",
        photoPath: img.path,
        status: "pending",
        registrationKind: "individual",
        applicantIdPassport: idPassport,
        ...(proofPath ? { proofOfResidencePath: proofPath } : {}),
      });
      await AuditLog.create({
        action: "WA_TUCKSHOP_CASH_AGENT_SUBMITTED",
        user: user._id,
        meta: {
          registrationId: String(reg._id),
          registrationKind: "individual",
          tuckshopName: reg.tuckshopName,
          waPhone: reg.waPhoneDigits,
          photoPath: reg.photoPath,
          locationLatitude: lat,
          locationLongitude: lng,
        },
      });
      scheduleTuckshopFraudScan(String(reg._id));
      await notifyPlatformAdminsRealtime({
        type: "TUCKSHOP_CASH_AGENT_PENDING",
        message: `New tuckshop cash-agent registration (individual, pending): "${reg.tuckshopName}" — GPS ${lat.toFixed(
          5
        )},${lng.toFixed(5)} — applicant ${reg.waPhoneDigits} — id ${String(reg._id)}.`,
      }).catch(() => {});
      await clearCashAgentRegState(user._id);
      const confirm = [
        "✅ Cash agent registration submitted.",
        "",
        "⏳ Pending approval. You will be notified.",
        "",
        `Reference: …${String(reg._id).slice(-6)}`,
      ].join("\n");
      return { handled: true, payload: { code: "CASH_AGENT_REG_SUBMITTED", message: confirm } };
    }

    if (step === "cash_reg_co_name") {
      if (input.length < 2) {
        return {
          handled: true,
          payload: {
            code: "CASH_REG_NAME_SHORT",
            message: "Enter a tuckshop / trading name (at least 2 characters).",
          },
        };
      }
      await saveCashAgentRegState(user._id, "cash_reg_co_cert", { ...payload, shopName: input.slice(0, 200) });
      return {
        handled: true,
        payload: {
          code: "CASH_REG_CO_CERT",
          message: "Step 2 — Upload your company registration certificate.\n\nSend one PDF or clear photo.",
        },
      };
    }

    if (step === "cash_reg_co_cert") {
      const cert = await requireCertUpload();
      if (!cert.ok) return { handled: true, payload: cert.payload };
      await saveCashAgentRegState(
        user._id,
        "cash_reg_co_location",
        { ...payload, companyCertificatePath: cert.path },
        30
      );
      return {
        handled: true,
        payload: {
          code: "CASH_REG_CO_LOC",
          message:
            "Step 3 — WhatsApp location pin (required)\n\nTap 📎 → Location → drop the pin on your tuckshop.\n\nTyped addresses alone are not accepted — agents need GPS from the pin.\n\nOptional: after the pin, one short text note.",
        },
      };
    }

    if (step === "cash_reg_co_location") {
      const pin = extractOfficialWhatsAppPinCoordinates(body || {});
      if (!pin) {
        return {
          handled: true,
          payload: {
            code: "CASH_REG_LOC_PIN_REQUIRED",
            message:
              "📍 Send a WhatsApp location pin — tap 📎 → Location → place it on your shop.\n\nDo not type the address only; we need the GPS pin.",
          },
        };
      }
      const { locationPin, locationLatitude, locationLongitude } = buildVerifiedCashAgentLocationLines(pin, input);
      await saveCashAgentRegState(
        user._id,
        "cash_reg_co_phone",
        { ...payload, locationPin, locationLatitude, locationLongitude },
        30
      );
      return {
        handled: true,
        payload: {
          code: "CASH_REG_CO_PHONE",
          message: "Step 4 — Enter shop owner's cellphone number.",
        },
      };
    }

    if (step === "cash_reg_co_phone") {
      if (waCashAgentDigitCount(input) < 8) {
        return {
          handled: true,
          payload: {
            code: "CASH_REG_PHONE_INVALID",
            message: "Enter a valid phone number with at least 8 digits.",
          },
        };
      }
      await saveCashAgentRegState(
        user._id,
        "cash_reg_co_photo",
        { ...payload, contactPhone: input.slice(0, 40) },
        30
      );
      return {
        handled: true,
        payload: {
          code: "CASH_REG_CO_PHOTO",
          message: "Step 5 — Send one clear photo of your tuckshop (shopfront or branding).",
        },
      };
    }

    if (step === "cash_reg_co_photo") {
      const img = await requireImageUpload();
      if (!img.ok) return { handled: true, payload: img.payload };
      const shopName = String(payload.shopName || "").trim();
      const address = String(payload.locationPin || "").trim();
      const lat = Number(payload.locationLatitude);
      const lng = Number(payload.locationLongitude);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        await saveCashAgentRegState(user._id, "cash_reg_co_location", { ...payload });
        return {
          handled: true,
          payload: {
            code: "CASH_REG_LOC_PIN_MISSING",
            message:
              "Your session is missing a verified GPS pin.\n\nStep 3 again: tap 📎 → Location → pin your tuckshop.",
          },
        };
      }
      const tuckshopContactPhone = String(payload.contactPhone || "").trim();
      const companyCertificatePath = String(payload.companyCertificatePath || "").trim();
      const reg = await TuckshopCashAgentRegistration.create({
        applicantUser: user._id,
        waPhoneDigits: waPhoneToDigits(phone),
        tuckshopName: shopName,
        ownerDetails: "Company registration",
        address,
        locationLatitude: lat,
        locationLongitude: lng,
        tuckshopContactPhone,
        preferredPaymentMethod: "Cash agent (WhatsApp)",
        photoPath: img.path,
        status: "pending",
        registrationKind: "company",
        ...(companyCertificatePath ? { companyCertificatePath } : {}),
      });
      await AuditLog.create({
        action: "WA_TUCKSHOP_CASH_AGENT_SUBMITTED",
        user: user._id,
        meta: {
          registrationId: String(reg._id),
          registrationKind: "company",
          tuckshopName: reg.tuckshopName,
          waPhone: reg.waPhoneDigits,
          photoPath: reg.photoPath,
          locationLatitude: lat,
          locationLongitude: lng,
        },
      });
      scheduleTuckshopFraudScan(String(reg._id));
      await notifyPlatformAdminsRealtime({
        type: "TUCKSHOP_CASH_AGENT_PENDING",
        message: `New tuckshop cash-agent registration (company, pending): "${reg.tuckshopName}" — GPS ${lat.toFixed(
          5
        )},${lng.toFixed(5)} — applicant ${reg.waPhoneDigits} — id ${String(reg._id)}.`,
      }).catch(() => {});
      await clearCashAgentRegState(user._id);
      const confirm = [
        "✅ Cash agent registration submitted.",
        "",
        "⏳ Pending approval. You will be notified.",
        "",
        `Reference: …${String(reg._id).slice(-6)}`,
      ].join("\n");
      return { handled: true, payload: { code: "CASH_AGENT_REG_SUBMITTED", message: confirm } };
    }

    const knownCashRegSteps = new Set([
      "cash_reg_menu",
      "cash_reg_ind_name",
      "cash_reg_ind_id",
      "cash_reg_ind_location",
      "cash_reg_ind_phone",
      "cash_reg_ind_proof",
      "cash_reg_ind_photo",
      "cash_reg_co_name",
      "cash_reg_co_cert",
      "cash_reg_co_location",
      "cash_reg_co_phone",
      "cash_reg_co_photo",
    ]);
    if (!knownCashRegSteps.has(step)) {
      await clearCashAgentRegState(user._id);
      return {
        handled: true,
        payload: {
          code: "CASH_AGENT_REG_RESET",
          message: "That session was out of date. Reply 9 on the main menu to start Register Cash Agent again.",
        },
      };
    }

    logger.warn("Register Cash Agent: unhandled step while state exists", { step });
    return { handled: false };
  } catch (e: any) {
    logger.warn("Register Cash Agent WA flow failed", { error: String(e?.message || e) });
    return {
      handled: true,
      payload: {
        code: "CASH_AGENT_REG_ERROR",
        message: "Something went wrong. Please try again from the main menu (reply 9).",
      },
    };
  }
}

async function handleMochinaConversationState(
  user: any,
  phone: string,
  rawInput: string,
  body?: Record<string, any>
): Promise<{ handled: boolean; payload?: any }> {
  const input = String(rawInput || "").trim();
  const lower = input.toLowerCase();
  const st = await WaConversationState.findOne({ user: user._id, scope: "mochina" }).lean();

  if (!st) return { handled: false };
  const waPhone = String(phone || "").trim() || String((user as any).phone || "").trim();
  if (new Date(st.expiresAt).getTime() < Date.now()) {
    await clearMochinaState(user._id);
    return {
      handled: true,
      payload: await waBuildIdleTimeoutMainMenuPayload(user, waPhone, undefined, "Jobs"),
    };
  }

  if (waIsBackToMainMenuInput(input)) {
    return {
      handled: true,
      payload: await waBuildBackToMainMenuPayload(user, waPhone),
    };
  }

  let step = String(st.step || "");
  const payload = { ...(st.payload || {}) } as Record<string, any>;

  if (/^cash_/.test(step)) {
    await clearMochinaState(user._id);
    return {
      handled: true,
      payload: {
        code: "JOBS_LEGACY_FLOW_RESET",
        message:
          "That tuckshop registration path was updated.\n\nReply 9 on the main menu for Register Cash Agent, or 6 for Jobs.",
      },
    };
  }

  // Legacy betting flow used step "main"; treat fresh payload as onboarding menu.
  if (step === "main" && !payload.agentFullName && !payload.agentIdPassport) {
    step = "onboarding_menu";
  }

  try {
    if (step === "onboarding_menu") {
      const key = normalizeWaMenuDigitInput(input);
      if (key === "1" || /^register|^sign\s*up\b/i.test(lower)) {
        await saveMochinaState(user._id, "onboarding_name", {});
        return {
          handled: true,
          payload: {
            code: "ONBOARDING_AGENT_NAME",
            message: [
              "📝 Onboarding Agent — you're in the flow now.",
              "",
              "Step 1 of 3 — Enter your full name (as it appears on your ID).",
              "",
              "Next we'll ask for ID/passport, then bank details (optional).",
              "Reply 0️⃣ anytime to leave this flow.",
            ].join("\n"),
          },
        };
      }
      return {
        handled: true,
        payload: {
          code: "JOBS_MENU_HINT",
          message: ["Reply 1️⃣ to start the onboarding flow, or 0️⃣ to go back.\n\n", buildMochinaMenu()].join(""),
        },
      };
    }

    if (step === "onboarding_name") {
      if (input.length < 2) {
        return {
          handled: true,
          payload: {
            code: "ONBOARDING_NAME_INVALID",
            message: "Stay in the flow — Step 1 of 3.\n\nEnter your full name (at least 2 characters).",
          },
        };
      }
      await saveMochinaState(user._id, "onboarding_id", { agentFullName: input.slice(0, 120) });
      return {
        handled: true,
        payload: {
          code: "ONBOARDING_AGENT_ID",
          message: [
            "Step 2 of 3 — Enter your ID or passport number.",
            "",
            "Reply 0️⃣ to leave this flow.",
          ].join("\n"),
        },
      };
    }

    if (step === "onboarding_id") {
      if (input.length < 4) {
        return {
          handled: true,
          payload: {
            code: "ONBOARDING_ID_INVALID",
            message: "Stay in the flow — Step 2 of 3.\n\nEnter a valid ID or passport number.",
          },
        };
      }
      await saveMochinaState(
        user._id,
        "onboarding_bank",
        { ...payload, agentIdPassport: input.slice(0, 80) },
        30
      );
      return {
        handled: true,
        payload: {
          code: "ONBOARDING_AGENT_BANK",
          message: [
            "Step 3 of 3 — Bank account (optional)",
            "",
            "Enter bank name, account number, branch if needed — or reply SKIP to skip.",
            "",
            "Reply 0️⃣ to leave this flow.",
          ].join("\n"),
        },
      };
    }

    if (step === "onboarding_bank") {
      const skipped = ["skip", "none", "no", "n/a", "-"].includes(lower);
      const bankDetail = skipped ? "" : input.slice(0, 500);
      const meta = {
        channel: "whatsapp",
        phone: waPhoneToDigits(phone),
        agentFullName: String(payload.agentFullName || ""),
        agentIdPassport: String(payload.agentIdPassport || ""),
        bankAccount: bankDetail || undefined,
        submittedAt: new Date().toISOString(),
      };
      const onboardLog = await AuditLog.create({
        action: "WA_ONBOARDING_AGENT_APPLICATION",
        user: user._id,
        meta,
      });
      scheduleOnboardingAgentFraudScan(String(onboardLog._id));
      await notifyPlatformAdminsRealtime({
        type: "ONBOARDING_AGENT_APPLICATION",
        message: `New WhatsApp Onboarding Agent application: ${meta.agentFullName} (${meta.phone}). ID/passport on file — user ${String(user._id)}.`,
      }).catch(() => {});
      await clearMochinaState(user._id);
      const bankLine = bankDetail
        ? `Bank: ${bankDetail.length > 220 ? `${bankDetail.slice(0, 220)}…` : bankDetail}`
        : "Bank: (not provided)";
      const summary = [
        "✅ Flow complete — registration received",
        "",
        `Name: ${meta.agentFullName}`,
        `ID / Passport: ${meta.agentIdPassport}`,
        bankLine,
        "",
        "Our team will review your application and contact you on this number if needed.",
        "",
        "Your main menu options are below.",
      ].join("\n");
      return { handled: true, payload: { code: "ONBOARDING_AGENT_SUBMITTED", message: summary } };
    }

    await saveMochinaState(user._id, "onboarding_menu", {});
    return { handled: true, payload: { code: "JOBS_MENU_RESET", message: buildMochinaMenu() } };
  } catch (e: any) {
    logger.warn("Jobs WA submenu failed", { error: String(e?.message || e) });
    return {
      handled: true,
      payload: {
        code: "JOBS_TEMP_ERROR",
        message: "Something went wrong. Please try again from the main menu (6 — Jobs).",
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
    .select("title slug description price discountPrice currency images supplierSource supplierId categories")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  let picksPool = sample.slice(0, QWERTYHUB_SELL_MEDIA_LIMIT);
  if (picksPool.length < QWERTYHUB_SELL_MEDIA_LIMIT) {
    const existing = new Set(picksPool.map((p: any) => String(p?._id || "")));
    const need = QWERTYHUB_SELL_MEDIA_LIMIT - picksPool.length;
    const backup = await Product.find({
      active: true,
      outOfStock: { $ne: true },
      _id: { $nin: Array.from(existing).filter(Boolean) },
    })
      .select("title slug description price discountPrice currency images supplierSource supplierId categories")
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
  const enrichedPicksPool = await enrichProductsWithStoreFields(picksPool as Record<string, unknown>[]);

  const mediaCards: WaMediaCard[] = [];
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const waFromDigits = getTwilioWhatsAppFromDigits(undefined, phoneInputForGeo);
  const picks = enrichedPicksPool.map((p: any, i: number) => {
    const title = compactText(String(p?.title || "Product"), 42);
    const slug = String(p?.slug || "").trim();
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const descriptionRaw = stripHtml(String(p?.description || "No description available."));
    const basePrice = getEffectiveProductPrice(p as any);
    const display = resolveWaCatalogPriceDisplay(p, rates, basePrice);
    const targetCurrency = display.currency;
    const price = display.amount.toFixed(2);
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "") || QWERTYHUB_FALLBACK_IMAGE_URL;
    const productSlugOrId = String(p?._id || "").trim() || slug;
    const productUrl = `${baseUrl}/marketplace/product/${encodeURIComponent(productSlugOrId)}`;
    const defMk = waDefaultResellMarkupForCategories(p?.categories);
    const autoResellUrl = buildQwertyHubAutoResellUrl(productUrl, p?.categories);
    const resellTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${defMk}`) || waChatCommandFallback("resell", shortCode, defMk)
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
  const enrichedResellerProducts = await enrichProductsWithStoreFields(
    resellerPicks.map((row) => row.product as Record<string, unknown>)
  );
  resellerPicks.forEach((row, idx) => {
    const p = enrichedResellerProducts[idx] || row.product;
    const title = compactText(String(p?.title || "Product"), 42);
    const base = getEffectiveProductPrice(p as any);
    const resellerPrice = Math.round(base * (1 + row.markupPct / 100) * 100) / 100;
    const display = resolveWaCatalogPriceDisplay(p as any, rates, resellerPrice);
    const targetCurrency = display.currency;
    const price = display.amount.toFixed(2);
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const addToCartTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) || waChatCommandFallback("cart", shortCode, 1)
    );
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "");
    if (image) {
      mediaCards.push({
        mediaUrl: image,
        caption: buildQwertyHubProductCardCaption({
          index: enrichedPicksPool.length + idx,
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

function formatWaBulkTierRange(minQty: number, maxQty: number): string {
  const max = normalizeBulkTierMaxQty(Number(maxQty), Number(minQty));
  const min = Number(minQty);
  if (min >= max) return `${min}+`;
  return `${min}-${max}`;
}

function buildWaMarketplaceBulkLine(
  p: {
    price: number;
    discountPrice?: number | null;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }> | null;
    currency?: string;
    supplierSource?: string;
  },
  rates: Record<string, number>
): string | undefined {
  const tiers = p.bulkTiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return undefined;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const parts = sorted.map((t) => {
    const display = resolveWaCatalogPriceDisplay(p, rates, Number(t.price));
    return `${formatWaBulkTierRange(t.minQty, t.maxQty)}: ${display.label}`;
  });
  return `📦 Bulk: ${parts.join(" · ")}`;
}

function buildQwertyHubMarketplaceCardCaption(opts: {
  title: string;
  targetCurrency: string;
  price: string;
  bulkLine?: string;
  shortCode: string;
  addToCartLink: string;
  resellTapLink: string;
}): string {
  const lines = [
    `📦 ${opts.title}`,
    `💰 ${opts.targetCurrency} ${opts.price}`,
    ...(opts.bulkLine ? [opts.bulkLine] : []),
    `🔖 code: ${opts.shortCode}`,
    "",
    "Buy / Add to cart:",
    opts.addToCartLink,
    "",
    "Resell this Product:",
    opts.resellTapLink,
  ];
  let body = lines.join("\n");
  if (body.length > WA_MARKETPLACE_CAPTION_MAX) {
    body = `${body.slice(0, WA_MARKETPLACE_CAPTION_MAX - 1)}…`;
  }
  return body;
}

async function fillMarketplacePicksPool(
  picksPool: any[],
  need: number,
  storeCountryCodes?: string[]
): Promise<void> {
  if (need <= 0 || picksPool.length >= need) return;
  const existing = new Set(picksPool.map((p: any) => String(p?._id || "")).filter(Boolean));
  const backupMatch = await buildWaMarketplaceProductMatch(
    {
      _id: { $nin: Array.from(existing) },
    },
    { storeCountryCodes }
  );
  const backup = await Product.find(backupMatch)
    .select("title slug description price discountPrice bulkTiers currency images categories supplierSource supplierId")
    .sort({ createdAt: -1 })
    .limit(Math.max(need * 4, 40))
    .lean();
  for (const p of backup) {
    picksPool.push(p);
    existing.add(String((p as any)?._id || ""));
    if (picksPool.length >= need) break;
  }
}

async function buildQwertyHubMarketplaceMessage(
  phoneInputForGeo: string,
  waSession?: WaOutboundSession
): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const need = QWERTYHUB_MARKETPLACE_MEDIA_LIMIT;
  const storeCountryCodes = resolveWaMarketplaceStoreCountryCodes(waSession, phoneInputForGeo);
  const match = await buildWaMarketplaceProductMatch({}, { storeCountryCodes });
  const sampleSize = Math.min(Math.max(need * 4, 40), 120);
  let picksPool: any[] = await Product.aggregate([
    { $match: match },
    { $sample: { size: sampleSize } },
    {
      $project: {
        title: 1,
        slug: 1,
        description: 1,
        price: 1,
        discountPrice: 1,
        bulkTiers: 1,
        currency: 1,
        images: 1,
        supplierSource: 1,
        supplierId: 1,
        categories: 1,
      },
    },
  ]);
  if (picksPool.length < need) {
    await fillMarketplacePicksPool(picksPool, need, storeCountryCodes);
  }
  picksPool = picksPool.slice(0, need);

  if (!picksPool.length) {
    return {
      message: "",
      mediaCards: [],
    };
  }

  const rates = (await getFxRates()).rates;
  const enrichedMarketplacePicks = await enrichProductsWithStoreFields(picksPool as Record<string, unknown>[]);
  const waFromDigits = getTwilioWhatsAppFromDigits(undefined, phoneInputForGeo);
  const mediaCards: WaMediaCard[] = [];

  enrichedMarketplacePicks.forEach((p: any) => {
    const title = compactText(String(p?.title || "Product"), 36);
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const unitBase = getProductPriceForQty(p as any, 1);
    const display = resolveWaCatalogPriceDisplay(p, rates, unitBase);
    const targetCurrency = display.currency;
    const price = display.amount.toFixed(2);
    const bulkLine = buildWaMarketplaceBulkLine(p as any, rates);
    const image = resolveImageUrl(Array.isArray(p?.images) ? String(p.images[0] || "") : "") || QWERTYHUB_FALLBACK_IMAGE_URL;
    const addToCartLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `CART ADD ${shortCode} 1`) || waChatCommandFallback("cart", shortCode, 1)
    );
    const defMk = waDefaultResellMarkupForCategories(p?.categories);
    const resellTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${defMk}`) || waChatCommandFallback("resell", shortCode, defMk)
    );

    mediaCards.push({
      mediaUrl: image,
      caption: buildQwertyHubMarketplaceCardCaption({
        title,
        targetCurrency,
        price,
        bulkLine,
        shortCode,
        addToCartLink,
        resellTapLink,
      }),
    });
  });

  return {
    message: "",
    mediaCards: mediaCards.slice(0, QWERTYHUB_MARKETPLACE_MEDIA_LIMIT),
  };
}

async function deliverQwertyHubMarketplaceBrowse(
  phone: string,
  user: any,
  includeAdjustMarkup: boolean,
  waSession?: WaOutboundSession
): Promise<void> {
  const menuText = buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup);
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  try {
    const storeCountryCodes = resolveWaMarketplaceStoreCountryCodes(waSession, phone);
    const marketplacePayload = await buildQwertyHubMarketplaceMessage(phone, waSession);
    const cards = Array.isArray(marketplacePayload.mediaCards) ? marketplacePayload.mediaCards : [];
    if (cards.length) {
      const sent = await sendQwertyHubMarketplaceGallery(phone, cards, waSession);
      if (sent === 0) {
        throw new Error("No marketplace product cards could be delivered");
      }
    } else {
      const regionLabel =
        storeCountryCodes.includes("BW") || storeCountryCodes.includes("ZM")
          ? "Botswana and Zambia"
          : storeCountryCodes.includes("ZA")
            ? "South Africa"
            : "your region";
      await sendWhatsAppText(
        phone,
        `No marketplace products from ${regionLabel} stores right now. Browse: ${baseUrl}/marketplace`,
        waSession
      );
    }
    await delay(900);
    await sendWhatsAppText(phone, menuText, waSession);
  } catch (err) {
    logger.warn("QwertyHub marketplace browse delivery failed", {
      error: String((err as any)?.message || err),
    });
    try {
      await sendWhatsAppText(
        phone,
        [
          "🛒 QwertyHub Marketplace",
          "",
          `We could not load product cards. Browse: ${baseUrl}/marketplace`,
          "Or try again: reply 2",
        ].join("\n"),
        waSession
      );
      await sendWhatsAppText(phone, menuText, waSession);
    } catch {
      /* ignore */
    }
  }
}

function scheduleQwertyHubMarketplaceBrowse(
  phone: string,
  user: any,
  includeAdjustMarkup: boolean,
  impressionMenuKey: string,
  waSession?: WaOutboundSession
): void {
  scheduleWaPremenuVideoThenRun(
    phone,
    "open_marketplace",
    impressionMenuKey,
    async () => deliverQwertyHubMarketplaceBrowse(phone, user, includeAdjustMarkup, waSession),
    "QwertyHub marketplace premenu video sequence failed",
    waSession
  );
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
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const waFromDigits = getTwilioWhatsAppFromDigits(undefined, params.phoneInputForGeo);
  const match = await buildWaPublicResellMatch({
    categories: { $in: [new RegExp(`^${category}$`, "i")] },
  });
  const sampleRaw = await Product.find(match)
    .select("title slug description price discountPrice currency images supplierSource supplierId categories")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const sample = await enrichProductsWithStoreFields(sampleRaw as Record<string, unknown>[]);

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
    const basePrice = getEffectiveProductPrice(p as any);
    const display = resolveWaCatalogPriceDisplay(p, rates, basePrice);
    const targetCurrency = display.currency;
    const price = display.amount.toFixed(2);
    const slug = String(p?.slug || "").trim();
    const productSlugOrId = String(p?._id || "").trim() || slug;
    const productUrl = `${baseUrl}/marketplace/product/${encodeURIComponent(productSlugOrId)}`;
    const defMk = waDefaultResellMarkupForCategories(p?.categories);
    const autoResellUrl = buildQwertyHubAutoResellUrl(productUrl, p?.categories);
    const resellTapLink = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${defMk}`) || waChatCommandFallback("resell", shortCode, defMk)
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
  const productsRaw = await Product.find({ _id: { $in: productIds } })
    .select("title price discountPrice currency supplierSource supplierId externalSupplierId externalData")
    .lean();
  const products = await enrichProductsWithStoreFields(productsRaw as Record<string, unknown>[]);
  const productMap = new Map(products.map((p: any) => [String(p?._id || ""), p]));

  const lines: string[] = ["Cart products:"];
  let subtotal = 0;
  let subtotalCurrency: string | null = null;
  const uniqueSupplierIds = new Set<string>();
  const uniqueExternalSupplierIds = new Set<string>();
  let cjGroupCount = 0;
  items.slice(0, 20).forEach((row: any, idx: number) => {
    const pid = String(row?.productId || "");
    const p = productMap.get(pid);
    if (!p) return;
    const qty = Math.max(1, Number(row?.qty || 1));
    const base = getEffectiveProductPrice(p as any);
    const display = resolveWaCatalogPriceDisplay(p, rates, base);
    const lineTotal = display.amount * qty;
    if (subtotalCurrency == null) subtotalCurrency = display.currency;
    if (subtotalCurrency === display.currency) subtotal += lineTotal;
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
    lines.push(
      `${idx + 1}. ${compactText(String((p as any)?.title || "Product"), 42)} x${qty} — ${display.currency} ${lineTotal.toFixed(2)}`
    );
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

  const cartSummaryCurrency = subtotalCurrency || targetCurrency;
  const grandTotal = subtotal + shipping;
  lines.push(
    "",
    "Shipping costs:",
    ...(shippingLines.length ? shippingLines : [`- Standard shipping: ${targetCurrency} ${shipping.toFixed(2)}`]),
    shippingIsEstimated
      ? "Shipping is estimated right now and may change after live courier confirmation at checkout."
      : "Shipping is fully calculated from current supplier tariffs and live courier quotes.",
    "",
    ...(subtotalCurrency
      ? [`Subtotal: ${cartSummaryCurrency} ${subtotal.toFixed(2)}`]
      : ["Subtotal: see line items (mixed currencies)"]),
    `Shipping: ${targetCurrency} ${shipping.toFixed(2)}`,
    ...(subtotalCurrency
      ? [`Total to pay: ${cartSummaryCurrency} ${grandTotal.toFixed(2)}`]
      : ["Total to pay: open checkout on the website for the final amount"]),
    `Checkout: ${baseUrl}/cart`
  );
  return lines.join("\n");
}

async function buildMyResellChannelMessage(params: { user: any; phoneInputForGeo: string }): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const { user, phoneInputForGeo } = params;
  const resellerId = String((user as any)?._id || "").trim();
  const rates = (await getFxRates()).rates;

  const resellerStore = await Store.findOne({ userId: user._id, type: "reseller" }).select("name").lean();
  const storeName = String((resellerStore as any)?.name || "My Store").trim() || "My Store";

  const wall = await ResellerWall.findOne({ resellerId: user._id })
    .populate({
      path: "products.productId",
      select: "title slug description price discountPrice currency images active allowResell outOfStock categories supplierId supplierSource",
    })
    .lean();

  const productsRaw = Array.isArray((wall as any)?.products) ? (wall as any).products : [];
  const activeEntries = productsRaw.filter((entry: any) => {
    const p = entry?.productId;
    return p && p.active !== false && p.allowResell !== false && p.outOfStock !== true;
  });

  /** Keep MyStore on WhatsApp-only cues — no unsolicited storefront / website URLs (buyer tap links stay on each product card). */
  const headerLines = ["🌐 MyStore", `Store: ${storeName}`, ""];

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

  const enrichedMyStoreProducts = await enrichProductsWithStoreFields(
    activeEntries.map((entry: any) => (entry?.productId || {}) as Record<string, unknown>)
  );
  activeEntries.forEach((entry: any, idx: number) => {
    const p = enrichedMyStoreProducts[idx] || entry.productId || {};
    const title = compactText(String(p?.title || "Product"), 48);
    const basePrice = getEffectiveProductPrice(p as { price?: number; discountPrice?: number });
    const markupPct = effectiveResellerMarkupPctFromWall(entry?.resellerCommissionPct, (p as any)?.categories);
    const resellerPrice = Math.round(basePrice * (1 + markupPct / 100) * 100) / 100;
    const display = resolveWaCatalogPriceDisplay(p as any, rates, resellerPrice);
    const showPrice = display.label;
    const productId = String(p?._id || "").trim();
    const slugOrId = productId || String((p as any)?.slug || "").trim();
    const buyerPageUrl = buildQwertyHubSharePreviewUrl({
      productSlugOrId: slugOrId,
      resellerId,
      resellerCommissionPct: markupPct,
    });

    const image = resolveImageUrl(Array.isArray((p as any)?.images) ? String((p as any).images[0] || "") : "");
    if (image) {
      const description = compactText(stripHtml(String(p?.description || "")), 72);
      mediaCards.push({
        mediaUrl: image,
        caption: [
          `🌐 MyStore · ${storeName}`,
          `📦 ${title}`,
          `💰 ${showPrice}`,
          ...(description ? [`📝 ${description}`] : []),
          "",
          "Buyer link (opens in browser):",
          buyerPageUrl,
        ].join("\n"),
      });
    }
  });

  /**
   * WhatsApp UX: do not send a wall of text before the image gallery — previews + captions already carry buyer/share links.
   * Only send a compact text fallback when every listing lacks a usable image (no media cards).
   */
  let summaryMessage = "";
  if (mediaCards.length === 0) {
    const lines: string[] = [
      ...headerLines,
      "Products (no preview images yet — add photos to your listings to show cards here):",
    ];
    activeEntries.forEach((entry: any, idx: number) => {
      const p = enrichedMyStoreProducts[idx] || entry.productId || {};
      const title = compactText(String(p?.title || "Product"), 48);
      const basePrice = getEffectiveProductPrice(p as { price?: number; discountPrice?: number });
      const markupPct = effectiveResellerMarkupPctFromWall(entry?.resellerCommissionPct, (p as any)?.categories);
      const resellerPrice = Math.round(basePrice * (1 + markupPct / 100) * 100) / 100;
      const display = resolveWaCatalogPriceDisplay(p as any, rates, resellerPrice);
      const showPrice = display.label;
      const productId = String((p as any)?._id || "").trim();
      const slugOrId = productId || String((p as any)?.slug || "").trim();
      const buyerPageUrl = buildQwertyHubSharePreviewUrl({
        productSlugOrId: slugOrId,
        resellerId,
        resellerCommissionPct: markupPct,
      });
      lines.push(`${idx + 1}. ${title} — ${showPrice}`);
      lines.push(`   ${buyerPageUrl}`);
    });
  lines.push("", "Reply 1 for new product picks.");
    summaryMessage = lines.join("\n");
  }

  return {
    message: summaryMessage,
    mediaCards: mediaCards.slice(0, 10),
  };
}

async function _buildAdjustMarkupMessage(user: any): Promise<string> {
  const wall = await ResellerWall.findOne({ resellerId: user._id })
    .populate({ path: "products.productId", select: "title active allowResell outOfStock categories" })
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
      "Reply 1 to get products, then use: RESELL <code> <markup%> (range depends on category).",
    ].join("\n");
  }

  const lines = [
    "Adjust the Markup",
    "Use: RESELL <code> <markup%> (allowed min–max depends on the product category).",
    "",
    "Your product codes:",
  ];

  valid.forEach((entry: any, idx: number) => {
    const p = entry?.productId || {};
    const title = compactText(String(p?.title || "Product"), 42);
    const code = String(p?._id || "").slice(0, 8).toLowerCase();
    const b = resellerMarkupBoundsForProductCategories((p as any)?.categories);
    const current = effectiveResellerMarkupPctFromWall(entry?.resellerCommissionPct, (p as any)?.categories);
    lines.push(`${idx + 1}. ${title}`);
    lines.push(`   Code: ${code} | Current: ${Math.round(current)}% | Allowed: ${b.minPct}-${b.maxPct}%`);
    lines.push(`   Example: RESELL ${code} ${b.defaultPct}`);
  });

  return lines.join("\n");
}

async function buildAboutQwertyHubPayload(user: any, phoneInputForGeo: string): Promise<{ message: string; mediaCards?: WaMediaCard[] }> {
  const baseUrl = FRONTEND_URL.replace(/\/$/, "");
  const resellerStore = await Store.findOne({ userId: user._id, type: "reseller" }).select("slug name").lean();
  const storeSlug = String((resellerStore as any)?.slug || "").trim();
  const storeName = String((resellerStore as any)?.name || "My Store").trim() || "My Store";
  const storeLink = storeSlug ? `${baseUrl}/store/${encodeURIComponent(storeSlug)}` : `${baseUrl}/store`;
  const waFromDigits = getTwilioWhatsAppFromDigits(undefined, phoneInputForGeo);
  const topCategories = await listQwertyHubTopCategories();
  const rates = (await getFxRates()).rates;

  const match = await buildWaPublicResellMatch({});
  const sampleRaw = await Product.aggregate([
    { $match: match },
    { $sample: { size: 20 } },
    {
      $project: {
        title: 1,
        slug: 1,
        description: 1,
        price: 1,
        discountPrice: 1,
        currency: 1,
        images: 1,
        supplierSource: 1,
        supplierId: 1,
        categories: 1,
      },
    },
  ]);
  const sample = await enrichProductsWithStoreFields(sampleRaw as Record<string, unknown>[]);

  const mediaCards: WaMediaCard[] = [];
  sample.forEach((p: any, idx: number) => {
    const title = compactText(String(p?.title || "Product"), 42);
    const shortCode = String(p?._id || "").slice(0, 8).toLowerCase();
    const slug = String(p?.slug || "").trim();
    const descriptionRaw = stripHtml(String(p?.description || ""));
    const basePrice = getEffectiveProductPrice(p as any);
    const display = resolveWaCatalogPriceDisplay(p, rates, basePrice);
    const targetCurrency = display.currency;
    const price = display.amount.toFixed(2);
    const productSlugOrId = String(p?._id || "").trim() || slug;
    const productUrl = `${baseUrl}/marketplace/product/${encodeURIComponent(productSlugOrId)}`;
    const defMk = waDefaultResellMarkupForCategories(p?.categories);
    const tapToResell = ensurePublicWaLink(
      waMeBotLink(waFromDigits, `RESELL ${shortCode} ${defMk}`) || waChatCommandFallback("resell", shortCode, defMk)
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
          autoResellUrl: buildQwertyHubAutoResellUrl(productUrl, p?.categories),
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
    "Tap 'Tap to resell'. It sends RESELL <code> <markup%> to the bot (markup is prefilled for that product category).",
    "The product is added to your reseller wall/store automatically.",
    "If you do not have a reseller store, one is created automatically.",
    "Adjust markup anytime from menu: 8",
    "Tip: Go to MYSTORE to see all your products on sale",
    "",
    "3) Default markup and markup adjustment",
    "Default markup is the midpoint of the allowed range for that product's category.",
    "To change markup, use menu 8 product codes with RESELL <code> <markup%> (min–max shown per product).",
    `You can also adjust on web via your store page (${storeName}): ${storeLink}`,
    "",
    "4) See your products on sale",
    "Reply 7 (MyStore).",
    "MyStore lists what you have on sale here in WhatsApp.",
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
    const waSession = await resolveWaOutboundSession(phone, req.body);
    const optionRaw = extractUserInputFromBody(req.body);
    const user = await findWaUserByPhone(phone);
    if (!user) {
      const continueCmd = String(optionRaw || "").replace(/\s+/g, " ").trim();
      if (shouldStoreWaPendingContinue(continueCmd)) {
        await setWaPendingContinueAction(phone, continueCmd);
      }
      const flow = unregisteredWaFlowResponse(continueCmd, waSession, phone);
      return res.json(flow);
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

    const pendingCommerce = await getWaPendingContinueAction(phone);
    if (pendingCommerce && isWaCommerceResumeCommand(pendingCommerce)) {
      const cartAddPending = await handleWhatsappCartAddCommand(phone, pendingCommerce);
      if (cartAddPending.handled && cartAddPending.payload?.code === "CART_ADDED") {
        await clearWaPendingContinueAction(phone);
        return res.json({
          code: "USER_READY_18_PLUS",
          is18Plus: age !== null ? age >= 18 : false,
          menu: cartAddPending.payload.message,
        });
      }
      const resellPending = await handleWhatsappResellCommand(phone, pendingCommerce);
      if (resellPending.handled && resellPending.payload?.code === "RESELL_ADDED") {
        await clearWaPendingContinueAction(phone);
        return res.json({
          code: "USER_READY_18_PLUS",
          is18Plus: age !== null ? age >= 18 : false,
          menu: resellPending.payload.message,
        });
      }
      const payReqPending = await handleWhatsappPayMoneyRequestCommand(phone, pendingCommerce);
      if (payReqPending.handled && payReqPending.payload && payReqPending.payload.code !== "USER_NOT_FOUND") {
        await clearWaPendingContinueAction(phone);
        return res.json({
          code: "USER_READY_18_PLUS",
          is18Plus: age !== null ? age >= 18 : false,
          menu: payReqPending.payload.message,
        });
      }
    }

    const username = String((user as any).username || "").trim();
    const name = (user as any).name || "user";
    const displayForWelcome = username || name;
    const is18Plus = age !== null ? age >= 18 : false;
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    const menuText = buildMainMenu(displayForWelcome, includeAdjustMarkup);
    const welcomeUsesRestPremenu = await deliverWaWelcomePremenuThenMenu(phone, menuText, waSession);
    if (welcomeUsesRestPremenu) {
      return res.json({
        code: "WELCOME_PREMENU_REST",
        is18Plus,
        menu: WA_STUDIO_REST_PENDING_MESSAGE,
      });
    }
    return res.json({
      code: is18Plus ? "USER_READY_18_PLUS" : "USER_READY_UNDER_18",
      is18Plus,
      menu: menuText,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/register", async (req: Request, res: Response, next) => {
  try {
    const phoneInput = String(extractPhoneFromBody(req.body) || req.body?.phone || "").trim();
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    const dateOfBirthRaw = String(req.body?.dateOfBirth || "").trim();
    const avatarUrl = String(req.body?.avatarUrl || req.body?.avatarMediaUrl || "").trim();
    const townArea = String(req.body?.townArea || req.body?.town || req.body?.area || "").trim();
    const usernameInput = String(req.body?.username || "").trim().toLowerCase();

    if (!phoneInput || !name || !password || !dateOfBirthRaw) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "phone, name, password and dateOfBirth are required." });
    }
    if (!avatarUrl) {
      return res.status(400).json({ code: "PROFILE_PICTURE_REQUIRED", message: "Profile picture is required for WhatsApp registration." });
    }
    if (name.length < 2 || isWaRegisterIntent(name)) {
      return res.status(400).json({ code: "INVALID_NAME", message: "Please enter your name." });
    }
    if (password.length < 6) {
      return res.status(400).json({ code: "INVALID_PASSWORD", message: "Please enter your password (at least 6 characters)." });
    }
    if (!townArea || townArea.length < 2) {
      return res.status(400).json({ code: "INVALID_TOWN", message: "Please enter town/area where you stay." });
    }

    const phoneDigits = waPhoneToDigits(phoneInput);
    if (phoneDigits.length < 10) {
      return res.status(400).json({ code: "INVALID_PHONE", message: "Invalid phone number." });
    }
    const phoneCheck = isValidForOtp(phoneDigits);
    if (!phoneCheck.valid) {
      return res.status(400).json({
        code: "UNSUPPORTED_PHONE",
        message: phoneCheck.reason || "Premium and shortcode numbers are not supported.",
      });
    }

    try {
      await assertRegistrationAllowed({ name, phone: phoneDigits });
    } catch (e: any) {
      return res.status(400).json({
        code: "REGISTRATION_BLOCKED",
        message: e?.message || "Registration not allowed for this phone or name.",
      });
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
      username = await generateUniqueWaUsername(name);
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
      publicProfileLocation: { enabled: false, label: townArea.slice(0, 120) },
    });
    bumpStatusStripCache();
    await Wallet.create({ user: user._id });
    if (avatarUrl) {
      await publishProfileAvatarFeedUpdate({
        userId: user._id,
        avatarPath: avatarUrl,
        previousAvatar: null,
      });
    }

    const is18Plus = (age ?? 0) >= 18;
    const usernameDisplay = formatWaUsernameForDisplay(username);
    // 200 (not 201): Twilio Studio HTTP Request treats non-2xx as failure; some configs only accept 200.
    res.status(200).json({
      code: "REGISTER_SUCCESS",
      is18Plus,
      message: `You are successfully registered, your username is @${usernameDisplay}`,
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
    const phone = String(extractPhoneFromBody(req.body) || req.body?.phone || "").trim();
    const avatarUrl = String(req.body?.avatarUrl || req.body?.avatarMediaUrl || "").trim();
    if (!phone || !avatarUrl) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "phone and avatar media URL are required." });
    }
    const user = await findWaUserByPhone(phone);
    if (!user) return res.status(404).json({ code: "USER_NOT_FOUND" });
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    const previousAvatar = String((user as any).avatar || "").trim() || null;
    (user as any).avatar = avatarUrl;
    await user.save();
    await publishProfileAvatarFeedUpdate({
      userId: (user as any)._id,
      avatarPath: avatarUrl,
      previousAvatar,
    });
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
    const waSession = await resolveWaOutboundSession(phone, req.body);
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
    if (!user) {
      if (shouldStoreWaPendingContinue(raw)) {
        await setWaPendingContinueAction(phone, raw);
      }
      return res.status(200).json(unregisteredWaFlowResponse(raw, waSession, phone));
    }
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    await clearStaleWaInteractiveStateForMainMenu((user as any)._id, raw);

    const globalBack = await waTryGlobalBackToMainMenu(user, phone, raw, waSession);
    if (globalBack.handled && globalBack.payload) {
      return res.json(globalBack.payload);
    }

    const age = calculateAge((user as any).dateOfBirth);
    const is18Plus = age !== null && age >= 18;
    const deferGlobalKw = await shouldDeferGlobalWaKeywordsForActiveJobsFlow((user as any)._id);
    if (!deferGlobalKw) {
      const earningsKw = await handleWhatsAppAgentEarningsKeywords(user, phone, raw);
      if (earningsKw.handled && earningsKw.payload) {
        return res.json(earningsKw.payload);
      }
    }
    const menuFull = buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup);

    const cashAgentState = await handleCashAgentRegistrationConversationState(
      user,
      phone,
      raw,
      req.body as Record<string, any>
    );
    if (cashAgentState.handled) {
      const cp = cashAgentState.payload;
      if (cp?.code === "CASH_AGENT_REG_SUBMITTED" && typeof cp.message === "string") {
        return res.json({
          ...cp,
          message: `${cp.message}\n\n${menuFull}`,
        });
      }
      return res.json(cashAgentState.payload);
    }

    const mochinaState = await handleMochinaConversationState(user, phone, raw, req.body as Record<string, any>);
    if (mochinaState.handled) {
      const mp = mochinaState.payload;
      if (mp?.code === "ONBOARDING_AGENT_SUBMITTED" && typeof mp.message === "string") {
        return res.json({
          ...mp,
          message: `${mp.message}\n\n${menuFull}`,
        });
      }
      return res.json(mochinaState.payload);
    }
    const walletState = await handleWalletConversationState(user, raw, phone, waSession);
    if (walletState.handled) {
      return res.json(walletState.payload);
    }
    const errandsState = await handleErrandsConversationState(
      user,
      raw,
      req.body as Record<string, any>,
      phone,
      waSession
    );
    if (errandsState.handled) {
      return res.json(errandsState.payload);
    }

    const aboutActionsActive = await getWaAboutActionState((user as any)._id);
    if (aboutActionsActive) {
      const aboutChoice = normalizeWaMenuDigitInput(waPrimaryReplyLine(raw));
      if (aboutChoice === "0" || waIsBackToMainMenuInput(raw)) {
        return res.json(await waBuildBackToMainMenuPayload(user, phone, waSession));
      }
      if (aboutChoice === "1") {
        await clearWaAboutActionState((user as any)._id);
        const uid = (user as any)._id;
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_wallet",
          "about_1",
          async () => {
            await sendWaWalletEntryWithMenuState(phone, uid, waSession);
          },
          "About->Wallet premenu video sequence failed",
          waSession
        );
        return res.json({ code: "SELL_INFO_SILENT", message: WA_STUDIO_REST_PENDING_MESSAGE });
      }
      if (aboutChoice === "2") {
        await clearWaAboutActionState((user as any)._id);
        scheduleQwertyHubMarketplaceBrowse(phone, user, includeAdjustMarkup, "about_2", waSession);
        return res.json({ code: "SELL_INFO_SILENT", message: WA_STUDIO_REST_PENDING_MESSAGE });
      }
      if (aboutChoice === "3") {
        await clearWaAboutActionState((user as any)._id);
        await clearErrandsState((user as any)._id);
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_errands",
          "about_3",
          async () => {
            await sendWhatsAppErrandsIntro(phone, waSession);
          },
          "About->Errands premenu video sequence failed",
          waSession
        );
        return res.json({ code: "SELL_INFO_SILENT", message: WA_STUDIO_REST_PENDING_MESSAGE });
      }
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
          sendWhatsAppMediaGallery(phone, cards, { session: waSession }).catch((err) => {
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
        const uid = (user as any)._id;
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_about",
          "1",
          async () => {
            await setWaAboutActionState(uid);
            const chunks = chunkLongMessageByLines(aboutText, 1200);
            for (const chunk of chunks) {
              try {
                await sendWhatsAppText(phone, chunk, waSession);
                await delay(350);
              } catch (err) {
                logger.warn("Failed to send About Qwertymates chunk", {
                  error: String((err as any)?.message || err),
                });
                break;
              }
            }
          },
          "About Qwertymates premenu video sequence failed",
          waSession
        );
        return res.json({
          code: "SELL_INFO_SILENT",
          message: WA_STUDIO_REST_PENDING_MESSAGE,
        });
      }
      case "2": {
        scheduleQwertyHubMarketplaceBrowse(phone, user, includeAdjustMarkup, "2", waSession);
        return res.json({ code: "SELL_INFO_SILENT", message: WA_STUDIO_REST_PENDING_MESSAGE });
      }
      case "3": {
        await clearErrandsState((user as any)._id);
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_errands",
          "3",
          async () => {
            await sendWhatsAppErrandsIntro(phone, waSession);
          },
          "Errands premenu video sequence failed",
          waSession
        );
        return res.json({
          code: "SELL_INFO_SILENT",
          message: WA_STUDIO_REST_PENDING_MESSAGE,
        });
      }
      case "4": {
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_mystore",
          "4",
          async () => {
            const menuText = buildMainMenu(menuDisplayName(user as any), includeAdjustMarkup);
            try {
              const channelPayload = await buildMyResellChannelMessage({ user, phoneInputForGeo: phone });
              const cards = Array.isArray(channelPayload.mediaCards) ? channelPayload.mediaCards : [];
              const body = String(channelPayload.message || "").trim();
              if (body) {
                const chunks = chunkLongMessageByLines(body, 1000);
                for (const chunk of chunks) {
                  await sendWhatsAppText(phone, chunk, waSession);
                  await delay(350);
                }
              } else if (!cards.length) {
                await sendWhatsAppText(
                  phone,
                  ["🌐 MyStore", "", "No products to show here yet.", "", "Reply 1 to browse products and add items to your store."].join(
                    "\n"
                  ),
                  waSession
                );
              }
              if (cards.length) {
                await delay(500);
                try {
                  await sendWhatsAppMediaGallery(phone, cards, { limit: 10, gapMs: 700, session: waSession });
                } catch (err) {
                  logger.warn("MyStore WhatsApp media gallery failed", {
                    error: String((err as any)?.message || err),
                  });
                }
              }
              await delay(400);
              await sendWhatsAppText(phone, menuText, waSession);
            } catch (err) {
              logger.warn("MyStore premenu follow-up failed", { error: String((err as any)?.message || err) });
              try {
                await sendWhatsAppText(phone, menuText, waSession);
              } catch {
                /* ignore */
              }
            }
          },
          "MyStore premenu video sequence failed",
          waSession
        );
        return res.json({
          code: "SELL_INFO_SILENT",
          message: WA_STUDIO_REST_PENDING_MESSAGE,
        });
      }
      case "5": {
        const uid = (user as any)._id;
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_wallet",
          "5",
          async () => {
            await sendWaWalletEntryWithMenuState(phone, uid, waSession);
          },
          "ACBPayWallet premenu video sequence failed",
          waSession
        );
        return res.json({
          code: "SELL_INFO_SILENT",
          message: WA_STUDIO_REST_PENDING_MESSAGE,
        });
      }
      case "6": {
        if (!is18Plus) {
          return res.json({
            code: "AGE_RESTRICTED_JOBS",
            message: "Jobs / Onboarding Agent registration is for users aged 18+ only.",
          });
        }
        const uidJobs = (user as any)._id;
        await clearCashAgentRegState(uidJobs);
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_jobs",
          "6",
          async () => {
            await saveMochinaState(uidJobs, "onboarding_menu", {});
            await sendWhatsAppText(phone, buildMochinaMenu(), waSession);
          },
          "Jobs onboarding premenu video sequence failed",
          waSession
        );
        return res.json({
          code: "SELL_INFO_SILENT",
          message: WA_STUDIO_REST_PENDING_MESSAGE,
        });
      }
      case "9": {
        if (!is18Plus) {
          return res.json({
            code: "AGE_RESTRICTED_CASH_AGENT",
            message: "Register Cash Agent is for users aged 18+ only.",
          });
        }
        const uidCash = (user as any)._id;
        await clearMochinaState(uidCash);
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_jobs",
          "9",
          async () => {
            await saveCashAgentRegState(uidCash, "cash_reg_menu", {});
            await sendWhatsAppText(phone, buildCashAgentTypeMenu(), waSession);
          },
          "Register Cash Agent premenu video sequence failed",
          waSession
        );
        return res.json({
          code: "SELL_INFO_SILENT",
          message: WA_STUDIO_REST_PENDING_MESSAGE,
        });
      }
      case "7": {
        scheduleWaPremenuVideoThenRun(
          phone,
          "open_cart",
          "7",
          async () => {
            await sendWhatsAppText(phone, await buildWaCartMessage(user, phone), waSession);
          },
          "Cart premenu video sequence failed",
          waSession
        );
        return res.json({
          code: "SELL_INFO_SILENT",
          message: WA_STUDIO_REST_PENDING_MESSAGE,
        });
      }
      case "8":
        return res.json({
          code: "YESPLAY_LINK",
          message: "https://goyesplay.com/y076dc110",
        });
      case "0": {
        return res.json(await waBuildBackToMainMenuPayload(user, phone, waSession));
      }
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
                await sendWhatsAppMediaGallery(phone, cards, { session: waSession });
              } catch (err) {
                logger.warn("Failed to send About QwertyHub media cards", { error: String((err as any)?.message || err) });
              }
            }
            for (const chunk of rest) {
              try {
                await sendWhatsAppText(phone, chunk, waSession);
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
              sendWhatsAppMediaGallery(phone, cards, { session: waSession }).catch((err) => {
                logger.warn("Failed to send WhatsApp MyStore shortcut media gallery", { error: String((err as any)?.message || err) });
              });
            }, 900);
          }
          const summary = String(channelPayload.message || "").trim();
          return res.json({
            code: "MYSTORE_CHANNEL",
            message: summary || (cards.length ? WA_STUDIO_REST_PENDING_MESSAGE : ""),
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

async function handleWalletConversationState(
  user: any,
  rawInput: string,
  phoneForWa?: string,
  waSession?: WaOutboundSession
): Promise<{ handled: boolean; payload?: any }> {
  const st = await WaConversationState.findOne({ user: user._id, scope: "wallet" }).lean();
  if (!st) return { handled: false };
  const waPhoneEarly = String(phoneForWa || "").trim() || String((user as any).phone || "").trim();
  if (new Date(st.expiresAt).getTime() < Date.now()) {
    await clearWalletState(user._id);
    return {
      handled: true,
      payload: await waBuildIdleTimeoutMainMenuPayload(user, waPhoneEarly, waSession, "ACBPay Wallet"),
    };
  }

  const input = String(rawInput || "").trim();
  const step = String(st.step || "");
  const payload = (st.payload || {}) as Record<string, any>;
  const waPhone = String(phoneForWa || "").trim() || String((user as any).phone || "").trim();

  // "0" / "0️⃣" = back navigation. Must run before phone/amount validation in sub-steps.
  if (waIsWalletBackToMainMenuInput(input)) {
    if (step === WA_PAY_AT_STORE_STEP || step === WA_PAY_AT_STORE_CONFIRM_STEP) {
      await saveWalletState(user._id, WA_WALLET_MENU_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      if (waPhone) {
        await sendWaWalletEntryWithMenuState(waPhone, user._id, waSession);
        return { handled: true, payload: { code: "WALLET_MENU", message: WA_STUDIO_REST_PENDING_MESSAGE } };
      }
      return {
        handled: true,
        payload: {
          code: "WALLET_MENU",
          message: await buildWalletEntryMessage(user._id),
        },
      };
    }
    return {
      handled: true,
      payload: await waBuildBackToMainMenuPayload(user, waPhone, waSession),
    };
  }
  const payAtStoreBackDigit = normalizeWaMenuDigitInput(waPrimaryReplyLine(input));
  if (
    payAtStoreBackDigit === "0" &&
    (step === WA_PAY_AT_STORE_STEP || step === WA_PAY_AT_STORE_CONFIRM_STEP)
  ) {
    await saveWalletState(user._id, WA_WALLET_MENU_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
    if (waPhone) {
      await sendWaWalletEntryWithMenuState(waPhone, user._id, waSession);
      return { handled: true, payload: { code: "WALLET_MENU", message: WA_STUDIO_REST_PENDING_MESSAGE } };
    }
    return {
      handled: true,
      payload: {
        code: "WALLET_MENU",
        message: await buildWalletEntryMessage(user._id),
      },
    };
  }

  if (step === WA_PAY_AT_STORE_CONFIRM_STEP) {
    const confirmKey = normalizeWaMenuDigitInput(input);
    if (confirmKey === "2" || input.toLowerCase() === "decline" || input.toLowerCase() === "cancel") {
      await saveWalletState(user._id, WA_PAY_AT_STORE_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      if (waPhone) {
        await sendWaPayAtStoreQrEntry(waPhone, user._id, waSession);
        return {
          handled: true,
          payload: { code: "PAY_AT_STORE_DECLINED", message: WA_STUDIO_REST_PENDING_MESSAGE },
        };
      }
      return {
        handled: true,
        payload: {
          code: "PAY_AT_STORE_DECLINED",
          message: ["Payment declined.", "", buildPayAtStoreWaitingMessage()].join("\n"),
          quick_replies: ["1️⃣ Check for payment request", "2️⃣ Show my QR again", "0️⃣ Back to wallet menu"],
        },
      };
    }
    if (!(confirmKey === "1" || input.toLowerCase() === "confirm" || input.toLowerCase() === "pay")) {
      return {
        handled: true,
        payload: {
          code: "PAY_AT_STORE_CONFIRM_RETRY",
          message: buildPayAtStoreConfirmCaption(
            String(payload.merchantName || "Store"),
            Number(payload.amount || 0)
          ),
          quick_replies: ["1️⃣ Pay with wallet", "2️⃣ Decline", "0️⃣ Back"],
        },
      };
    }
    const paymentRequestId = String(payload.paymentRequestId || "").trim();
    if (!paymentRequestId) {
      await saveWalletState(user._id, WA_PAY_AT_STORE_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return {
        handled: true,
        payload: { code: "PAY_AT_STORE_EXPIRED", message: "That payment request expired. Show your QR again.\n\n" + buildPayAtStoreWaitingMessage() },
      };
    }
    try {
      const result = await settlePendingStorePaymentWithWallet(String(user._id), paymentRequestId);
      await saveWalletState(user._id, WA_WALLET_MENU_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return {
        handled: true,
        payload: {
          code: "PAY_AT_STORE_PAID",
          message: [
            "✅ Payment successful",
            "",
            `Paid R${result.amount.toFixed(2)} at ${result.merchantName}.`,
            `New balance: R${result.balance.toFixed(2)}`,
            "",
            walletQuickActions("1️⃣ Send money", "4️⃣ Pay @ store"),
          ].join("\n"),
          quick_replies: ["1️⃣ Send money", "4️⃣ Pay @ store", "0️⃣ Back to main menu"],
        },
      };
    } catch (err: any) {
      const msg =
        err instanceof AppError
          ? err.message
          : String(err?.message || "Payment could not be completed");
      const insufficient = /insufficient/i.test(msg);
      return {
        handled: true,
        payload: {
          code: insufficient ? "PAY_AT_STORE_LOW_BALANCE" : "PAY_AT_STORE_PAY_FAILED",
          message: insufficient
            ? [
                msg,
                "",
                `Top up on the web: ${FRONTEND_URL.replace(/\/$/, "")}/wallet`,
                "",
                buildPayAtStoreConfirmCaption(String(payload.merchantName || "Store"), Number(payload.amount || 0)),
              ].join("\n")
            : [msg, "", buildPayAtStoreConfirmCaption(String(payload.merchantName || "Store"), Number(payload.amount || 0))].join("\n"),
          quick_replies: ["1️⃣ Pay with wallet", "2️⃣ Decline", "0️⃣ Back"],
        },
      };
    }
  }

  if (step === WA_PAY_AT_STORE_STEP) {
    const storeKey = normalizeWaMenuDigitInput(input);
    if (storeKey === "1" || /\b(check|refresh|request)\b/i.test(input)) {
      const hit = await promptPayAtStoreConfirmIfPending(user._id, waPhone, waSession);
      if (hit.found && hit.payload) {
        return { handled: true, payload: hit.payload };
      }
      return {
        handled: true,
        payload: {
          code: "PAY_AT_STORE_NONE_PENDING",
          message: [
            "No payment request yet.",
            "",
            "Ask the merchant to scan your QR and enter the total — then reply 1 again.",
            "",
            buildPayAtStoreWaitingMessage(),
          ].join("\n"),
        },
      };
    }
    if (storeKey === "2" || /\b(qr|code|show)\b/i.test(input)) {
      if (!waPhone) {
        return {
          handled: true,
          payload: {
            code: "PAY_AT_STORE_QR_RETRY",
            message: `Open your wallet QR on the web: ${FRONTEND_URL.replace(/\/$/, "")}/wallet`,
          },
        };
      }
      await sendWaPayAtStoreQrEntry(waPhone, user._id, waSession);
      return {
        handled: true,
        payload: { code: "PAY_AT_STORE_QR", message: WA_STUDIO_REST_PENDING_MESSAGE },
      };
    }
    const autoPending = await promptPayAtStoreConfirmIfPending(user._id, waPhone, waSession);
    if (autoPending.found && autoPending.payload) {
      return { handled: true, payload: autoPending.payload };
    }
    return {
      handled: true,
      payload: {
        code: "PAY_AT_STORE_WAIT",
        message: buildPayAtStoreWaitingMessage(),
        quick_replies: ["1️⃣ Check for payment request", "2️⃣ Show my QR again", "0️⃣ Back to wallet menu"],
      },
    };
  }

  /** Submenu shown under the balance block (same actions as `/wallet/menu-action` root). */
  if (step === WA_WALLET_MENU_STEP) {
    const key = normalizeWaMenuDigitInput(waPrimaryReplyLine(input));
    if (key === "0" || waIsWalletBackToMainMenuInput(input)) {
      return {
        handled: true,
        payload: await waBuildBackToMainMenuPayload(user, waPhone, waSession),
      };
    }
    if (!key || !/^[1-5]$/.test(key)) {
      if (waPhone) {
        await sendWaWalletEntryWithMenuState(waPhone, user._id, waSession);
        return {
          handled: true,
          payload: {
            code: "WALLET_MENU_RETRY",
            message: "Reply with 1–5 or 0 to go back.",
          },
        };
      }
      return {
        handled: true,
        payload: {
          code: "WALLET_MENU_RETRY",
          message: [`Reply with 1–5 or 0 to go back.\n\n`, await buildWalletEntryMessage(user._id)].join(""),
        },
      };
    }
    if (key === "1") {
      await saveWalletState(user._id, "send_money_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return {
        handled: true,
        payload: {
          code: "SEND_MONEY_PHONE_PROMPT",
          message: [
            "💸 Send Money",
            "",
            "Who would you like to send money to?",
            "Enter recipient phone number in this format: +27123456789",
          ].join("\n"),
          quick_replies: ["2️⃣ Request money", "3️⃣ Withdraw", "0️⃣ Back to main menu"],
        },
      };
    }
    if (key === "2") {
      await saveWalletState(user._id, "request_money_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return {
        handled: true,
        payload: {
          code: "REQUEST_MONEY_PHONE_PROMPT",
          message: "Request money from who?\n\nEnter recipient phone number in this format: +27123456789",
          quick_replies: ["1️⃣ Send money", "3️⃣ Withdraw", "0️⃣ Back to main menu"],
        },
      };
    }
    if (key === "3") {
      await saveWalletState(user._id, "withdraw_agent_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return {
        handled: true,
        payload: {
          code: "WITHDRAW_AGENT_PHONE_PROMPT",
          message:
            "💵 Withdraw Money\n\nSelect agent:\nEnter the merchant agent cellphone number in this format +27123456789",
          quick_replies: ["1️⃣ Send money", "2️⃣ Request money", "0️⃣ Back to main menu"],
        },
      };
    }
    if (key === "4") {
      if (!waPhone) {
        return {
          handled: true,
          payload: {
            code: "WALLET_QR_RETRY",
            message: "Could not resolve your chat to send the QR image. Open your wallet on the web: " + `${FRONTEND_URL.replace(/\/$/, "")}/wallet`,
          },
        };
      }
      const payAtStore = await enterWaPayAtStoreFlow(waPhone, user._id, waSession);
      return {
        handled: true,
        payload: {
          ...payAtStore,
          quick_replies: ["1️⃣ Check for payment request", "2️⃣ Show my QR again", "0️⃣ Back to wallet menu"],
        },
      };
    }
    if (key === "5") {
      const uidM = (user as any)._id;
      if (!waPhone) {
        await saveWalletState(uidM, "merchant_intro", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
        return { handled: true, payload: { code: "MERCHANT_INTRO", message: WA_MERCHANT_INTRO_MESSAGE } };
      }
      scheduleWaPremenuVideoThenRun(
        waPhone,
        "open_merchant_apply",
        "wallet_merchant",
        async () => {
          await saveWalletState(uidM, "merchant_intro", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
          await sendWhatsAppText(waPhone, WA_MERCHANT_INTRO_MESSAGE, waSession);
        },
        "WA merchant apply premenu video sequence failed",
        waSession
      );
      return { handled: true, payload: { code: "SELL_INFO_SILENT", message: WA_STUDIO_REST_PENDING_MESSAGE } };
    }
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
    await saveWalletState(user._id, "send_money_confirm", { ...payload, amount });
    return {
      handled: true,
      payload: {
        code: "SEND_MONEY_CONFIRM",
        message: [
          "Confirm transaction:",
          "",
          `Send R${amount.toFixed(2)} to ${String(payload.recipientPhone || "recipient")}?`,
          "",
          "1️⃣ Confirm",
          "2️⃣ Cancel",
        ].join("\n"),
        quick_replies: ["1️⃣ Confirm", "2️⃣ Cancel"],
      },
    };
  }

  if (step === "send_money_confirm") {
    const sendMoneyConfirmKey = normalizeWaMenuDigitInput(input);
    if (sendMoneyConfirmKey === "2" || input.toLowerCase() === "cancel") {
      await saveWalletState(user._id, WA_WALLET_MENU_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      const summary = await getWalletSummary(user._id);
      return {
        handled: true,
        payload: {
          code: "SEND_MONEY_CANCELLED",
          message: [
            "❌ Transaction cancelled",
            "",
            `New Balance: R${summary.availableBalance.toFixed(2)}`,
            "",
            walletQuickActions("1️⃣ Send money", "2️⃣ Request money", "4️⃣ Pay @ store"),
          ].join("\n"),
          quick_replies: ["1️⃣ Send money", "2️⃣ Request money", "4️⃣ Pay @ store"],
        },
      };
    }
    if (!(sendMoneyConfirmKey === "1" || input.toLowerCase() === "confirm")) {
      return {
        handled: true,
        payload: {
          code: "SEND_MONEY_CONFIRM_RETRY",
          message: "Reply 1 to confirm or 2 to cancel.",
          quick_replies: ["1️⃣ Confirm", "2️⃣ Cancel"],
        },
      };
    }

    const sendAmt = Number(payload.amount || 0);
    if (!Number.isFinite(sendAmt) || sendAmt <= 0) {
      await clearWalletState(user._id);
      return { handled: true, payload: { code: "INVALID_AMOUNT", message: "Invalid amount. Start again." } };
    }
    let senderWallet = await Wallet.findOne({ user: user._id });
    if (!senderWallet) senderWallet = await Wallet.create({ user: user._id });
    let recipientWallet = await Wallet.findOne({ user: payload.recipientId });
    if (!recipientWallet) recipientWallet = await Wallet.create({ user: payload.recipientId });

    const senderBal = Math.round(Number(senderWallet.balance || 0) * 100) / 100;
    const normalizedSendAmt = Math.round(sendAmt * 100) / 100;
    const fromWallet = Math.min(Math.max(senderBal, 0), normalizedSendAmt);
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
          message: [
            "❌ Transaction failed",
            "",
            "Reason: Insufficient balance",
            `Available: R${senderBal.toFixed(2)}`,
            `Required: R${normalizedSendAmt.toFixed(2)}`,
            "",
            `Use PayGate here:\n${paymentResult.paymentUrl || ""}`,
          ].join("\n"),
        },
      };
    }

    await saveWalletState(user._id, WA_WALLET_MENU_STEP, {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
    const summary = await getWalletSummary(user._id);

    return {
      handled: true,
      payload: {
        code: "SEND_MONEY_SUCCESS",
        message: [
          "✅ Payment successful",
          "",
          `R${normalizedSendAmt.toFixed(2)} sent to ${String(payload.recipientPhone || "recipient")}`,
          "",
          `Reference: WA-SEND-${Date.now()}`,
          `New Balance: R${summary.availableBalance.toFixed(2)}`,
          "",
          walletQuickActions("1️⃣ Send again", "0️⃣ Back to main menu"),
        ].join("\n"),
        quick_replies: ["1️⃣ Send again", "0️⃣ Back to main menu"],
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
    const summary = await getWalletSummary(user._id);
    return {
      handled: true,
      payload: {
        code: "REQUEST_MONEY_SENT",
        message: [
          "✅ Request sent",
          "",
          "The recipient will receive a WhatsApp payment link.",
          "",
          `New Balance: R${summary.availableBalance.toFixed(2)}`,
          "",
          walletQuickActions("1️⃣ Send money", "2️⃣ Request money"),
        ].join("\n"),
        quick_replies: ["1️⃣ Send money", "2️⃣ Request money"],
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
    await saveWalletState(user._id, "withdraw_agent_confirm", { ...payload, amount });
    return {
      handled: true,
      payload: {
        code: "WITHDRAW_CONFIRM",
        message: [
          "Confirm withdrawal:",
          "",
          `Withdraw R${amount.toFixed(2)} with ${String(payload.agentName || "selected agent")}?`,
          "",
          "1️⃣ Confirm",
          "2️⃣ Cancel",
        ].join("\n"),
        quick_replies: ["1️⃣ Confirm", "2️⃣ Cancel"],
      },
    };
  }

  if (step === "withdraw_agent_confirm") {
    const withdrawConfirmKey = normalizeWaMenuDigitInput(input);
    if (withdrawConfirmKey === "2" || input.toLowerCase() === "cancel") {
      await clearWalletState(user._id);
      return { handled: true, payload: { code: "WITHDRAW_CANCELLED", message: "Withdrawal cancelled." } };
    }
    if (!(withdrawConfirmKey === "1" || input.toLowerCase() === "confirm")) {
      return { handled: true, payload: { code: "WITHDRAW_CONFIRM_RETRY", message: "Reply 1 to confirm or 2 to cancel." } };
    }
    const amount = Number(payload.amount || 0);
    const wallet = await Wallet.findOne({ user: user._id });
    if (!wallet || wallet.balance < amount) {
      await clearWalletState(user._id);
      return {
        handled: true,
        payload: {
          code: "INSUFFICIENT_BALANCE",
          message: [
            "❌ Transaction failed",
            "",
            "Reason: Insufficient balance",
            `Available: R${Number(wallet?.balance || 0).toFixed(2)}`,
            `Required: R${amount.toFixed(2)}`,
            "",
            "Try again or top up your wallet.",
          ].join("\n"),
        },
      };
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
    return { handled: true, payload: { code: "WITHDRAW_OTP_SENT", message: "✅ Withdrawal request sent\n\nOTP sent to agent. Enter the OTP to complete withdrawal." } };
  }

  if (step === "withdraw_agent_otp") {
    const otp = input.replace(/\D/g, "");
    const expected = String(payload.otp || "");
    const expiryMs = new Date(String(payload.otpExpiresAt || "")).getTime();
    if (!expected || Number.isNaN(expiryMs) || Date.now() > expiryMs) {
      await clearWalletState(user._id);
      return { handled: true, payload: { code: "OTP_EXPIRED", message: "OTP expired. Choose 3 (Withdraw) again." } };
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
    const summary = await getWalletSummary(user._id);
    return {
      handled: true,
      payload: {
        code: "WITHDRAW_SUCCESS",
        message: [
          "✅ Withdrawal request sent",
          "",
          "Meet the agent to collect cash.",
          "",
          `Amount: R${amount.toFixed(2)}`,
          `Reference: ${reference}`,
          `New Balance: R${summary.availableBalance.toFixed(2)}`,
          "",
          walletQuickActions("1️⃣ Send money", "2️⃣ Request money", "4️⃣ Pay @ store"),
        ].join("\n"),
        quick_replies: ["1️⃣ Send money", "2️⃣ Request money", "4️⃣ Pay @ store"],
      },
    };
  }

  if (step === "merchant_intro") {
    const merchantIntroKey = normalizeWaMenuDigitInput(input);
    if (merchantIntroKey === "2" || input.toLowerCase() === "cancel") {
      await clearWalletState(user._id);
      return { handled: true, payload: { code: "MERCHANT_CANCELLED", message: "Merchant application cancelled." } };
    }
    if (!(merchantIntroKey === "1" || input.toLowerCase() === "yes")) {
      return { handled: true, payload: { code: "MERCHANT_INTRO_RETRY", message: "Reply 1 to start application or 2 to cancel." } };
    }
    await saveWalletState(user._id, "merchant_business_name", {});
    return { handled: true, payload: { code: "MERCHANT_BUSINESS_NAME", message: "Business name\nEnter your business name:" } };
  }

  if (step === "merchant_business_name") {
    if (input.length < 2) return { handled: true, payload: { code: "MERCHANT_BUSINESS_NAME_INVALID", message: "Please enter a valid business name." } };
    await saveWalletState(user._id, "merchant_business_desc", { businessName: input.slice(0, 120) });
    return { handled: true, payload: { code: "MERCHANT_BUSINESS_DESC", message: "Business description\nDescribe your business:" } };
  }

  if (step === "merchant_business_desc") {
    if (input.length < 10) return { handled: true, payload: { code: "MERCHANT_BUSINESS_DESC_INVALID", message: "Please provide a longer business description." } };
    await saveWalletState(user._id, "merchant_location", { ...payload, businessDescription: input.slice(0, 2000) });
    return { handled: true, payload: { code: "MERCHANT_LOCATION", message: "Location\nEnter your business location (area/suburb):" } };
  }

  if (step === "merchant_location") {
    if (input.length < 2) return { handled: true, payload: { code: "MERCHANT_LOCATION_INVALID", message: "Please provide your business location." } };
    const mergedDescription = `${String(payload.businessDescription || "")}\nLocation: ${input}`.slice(0, 2000);
    const me = await User.findById(user._id);
    if (!me) return { handled: true, payload: { code: "USER_NOT_FOUND", message: "User not found." } };
    if (!(me as any).isVerified || !(me as any).phone?.trim()) {
      await clearWalletState(user._id);
      return {
        handled: true,
        payload: {
          code: "MERCHANT_KYC_REQUIRED",
          message: "Complete KYC verification and add a phone number in your profile before merchant application.",
        },
      };
    }
    (me as any).merchantAgent = {
      ...((me as any).merchantAgent || {}),
      applicationStatus: "pending",
      businessName: String(payload.businessName || "").slice(0, 120),
      businessDescription: mergedDescription,
      publicNote: `Location: ${input}`.slice(0, 200),
      kycAttestedAt: new Date(),
      appliedAt: new Date(),
      enabled: false,
      rejectionReason: undefined,
    };
    await me.save();
    await clearWalletState(user._id);
    return {
      handled: true,
      payload: {
        code: "MERCHANT_APPLICATION_RECEIVED",
        message: [
          "📎 Please send:",
          "• ID copy",
          "• Business registration (if available)",
          "• Proof of address",
          "",
          "Send them here as images or PDFs.",
          "",
          "✅ Application received",
          "We are reviewing your application.",
          "You will receive an update shortly.",
        ].join("\n"),
      },
    };
  }

  return { handled: false };
}

router.post("/wallet/menu-action", async (req: Request, res: Response, next) => {
  try {
    const phone = extractPhoneFromBody(req.body);
    const waSession = await resolveWaOutboundSession(phone, req.body);
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
    const globalBack = await waTryGlobalBackToMainMenu(user, phone, raw, waSession);
    if (globalBack.handled && globalBack.payload) {
      return res.json(globalBack.payload);
    }
    const includeAdjustMarkup = await userHasResellerProfile((user as any)._id);
    const pending = await handleWalletConversationState(user, raw, phone, waSession);
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

    const rawTrim = String(raw || "").trim();
    const menuDigit = normalizeWaMenuDigitInput(rawTrim);
    const looksLikeMenuDigit = /^[0-9]{1,2}$/.test(menuDigit) && rawTrim.replace(/\D/g, "").length < 10;
    const option = looksLikeMenuDigit ? menuDigit : rawTrim;
    const isNumericOption = /^\d+$/.test(option);
    const intent = isNumericOption ? "" : detectWalletIntent(optionLower);

    if (option === "0" || waIsWalletBackToMainMenuInput(raw)) {
      return res.json(await waBuildBackToMainMenuPayload(user, phone, waSession));
    }

    if (intent === "balance") {
      await sendWaWalletEntryWithMenuState(phone, (user as any)._id, waSession);
      return res.json({
        code: "BALANCE_INFO",
        message: WA_STUDIO_REST_PENDING_MESSAGE,
      });
    }

    if (option === "1" || intent === "send") {
      await saveWalletState((user as any)._id, "send_money_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return res.json({
        code: "SEND_MONEY_PHONE_PROMPT",
        message: [
          "💸 Send Money",
          "",
          "Who would you like to send money to?",
          "Enter recipient phone number in this format: +27123456789",
        ].join("\n"),
        quick_replies: ["2️⃣ Request money", "3️⃣ Withdraw", "0️⃣ Back to main menu"],
      });
    }

    if (option === "2" || intent === "request") {
      await saveWalletState((user as any)._id, "request_money_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return res.json({
        code: "REQUEST_MONEY_PHONE_PROMPT",
        message: "Request money from who?\n\nEnter recipient phone number in this format: +27123456789",
        quick_replies: ["1️⃣ Send money", "3️⃣ Withdraw", "0️⃣ Back to main menu"],
      });
    }

    if (option === "3" || intent === "withdraw") {
      await saveWalletState((user as any)._id, "withdraw_agent_phone", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
      return res.json({
        code: "WITHDRAW_AGENT_PHONE_PROMPT",
        message: "💵 Withdraw Money\n\nSelect agent:\nEnter the merchant agent cellphone number in this format +27123456789",
        quick_replies: ["1️⃣ Send money", "2️⃣ Request money", "0️⃣ Back to main menu"],
      });
    }

    if (option === "4" || intent === "qr") {
      const payAtStore = await enterWaPayAtStoreFlow(phone, (user as any)._id, waSession);
      return res.json({
        ...payAtStore,
        quick_replies: ["1️⃣ Check for payment request", "2️⃣ Show my QR again", "0️⃣ Back to wallet menu"],
      });
    }

    if (option === "5" || intent === "merchant") {
      const uidM = (user as any)._id;
      scheduleWaPremenuVideoThenRun(
        phone,
        "open_merchant_apply",
        "wallet_merchant",
        async () => {
          await saveWalletState(uidM, "merchant_intro", {}, WA_WALLET_INACTIVITY_TIMEOUT_MIN);
          await sendWhatsAppText(phone, WA_MERCHANT_INTRO_MESSAGE, waSession);
        },
        "WA merchant apply premenu video sequence failed",
        waSession
      );
      return res.json({
        code: "SELL_INFO_SILENT",
        message: WA_STUDIO_REST_PENDING_MESSAGE,
      });
    }

    await sendWaWalletEntryWithMenuState(phone, (user as any)._id, waSession);
    return res.json({
      code: "INVALID_OPTION",
      message: "Reply with 1–5 or 0 to go back.",
      quick_replies: ["1️⃣ Send money", "2️⃣ Request money", "0️⃣ Back to main menu"],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
