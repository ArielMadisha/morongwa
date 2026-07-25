import crypto from "crypto";
import twilio from "twilio";
import mongoose from "mongoose";
import VoiceCall, { VoiceCallStatus } from "../data/models/VoiceCall";
import Wallet from "../data/models/Wallet";
import User from "../data/models/User";
import { AppError } from "../middleware/errorHandler";
import { canonicalPhoneDigits } from "../utils/phoneE164";
import { isValidForOtp } from "../utils/phoneValidation";
import {
  estimateCallCostZar,
  quoteVoiceMinuteRateZar,
  voiceClientConfigured,
  voiceEnabled,
  voiceMinBalanceZar,
} from "../config/voiceRates";
import { debitWalletForVoiceCall } from "./voiceCallBilling";
import { logger } from "./monitoring";

function voiceFromNumber(): string {
  return String(process.env.TWILIO_VOICE_FROM || process.env.TWILIO_SMS_FROM || "").trim();
}

function publicApiBase(): string {
  const base = String(process.env.BACKEND_URL || process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) throw new AppError("Voice API base URL is not configured (BACKEND_URL)", 503);
  return base;
}

export function clientIdentityForUser(userId: string): string {
  return `user-${String(userId || "").trim()}`;
}

export function userIdFromClientIdentity(identity: string): string | null {
  const m = String(identity || "").match(/^user-([a-f0-9]{24})$/i);
  return m ? m[1] : null;
}

function mapTwilioStatus(s: string): VoiceCallStatus {
  const v = String(s || "").toLowerCase();
  if (v === "queued") return "queued";
  if (v === "ringing") return "ringing";
  if (v === "in-progress" || v === "answered") return "in-progress";
  if (v === "completed") return "completed";
  if (v === "busy") return "busy";
  if (v === "no-answer") return "no-answer";
  if (v === "canceled" || v === "cancelled") return "canceled";
  return "failed";
}

async function assertWalletCanPlaceCall(userId: string, estimate1MinZar: number): Promise<void> {
  const wallet = await Wallet.findOne({ user: userId });
  if (!wallet || wallet.balance < voiceMinBalanceZar()) {
    throw new AppError(
      `Insufficient wallet balance. Top up at least R${voiceMinBalanceZar().toFixed(2)} to place calls.`,
      402
    );
  }
  if (wallet.balance < estimate1MinZar) {
    throw new AppError(
      `Insufficient balance for a 1-minute call (need ~R${estimate1MinZar.toFixed(2)}). Top up your wallet.`,
      402
    );
  }
}

export async function getVoiceQuote(destination: string) {
  const digits = canonicalPhoneDigits(destination);
  if (!digits || !isValidForOtp(digits)) {
    throw new AppError("Enter a valid international phone number (e.g. +27821234567)", 400);
  }
  const q = quoteVoiceMinuteRateZar(digits);
  const est1 = estimateCallCostZar(digits, 1);
  const est5 = estimateCallCostZar(digits, 5);
  return {
    destination: `+${digits}`,
    country: q.country,
    lineType: q.lineType,
    perMinuteZar: q.perMinute,
    connectFeeZar: q.connectFee,
    currency: q.currency,
    estimate1MinZar: est1,
    estimate5MinZar: est5,
    minWalletBalanceZar: voiceMinBalanceZar(),
  };
}

/** Reserve a call session + wallet check; client connects via Twilio Voice SDK (WebRTC). */
export async function createClientCallSession(params: {
  userId: string;
  destination: string;
}): Promise<{
  callId: string;
  status: string;
  quote: Awaited<ReturnType<typeof getVoiceQuote>>;
  token: string;
}> {
  if (!voiceEnabled()) {
    throw new AppError("Voice calling is not configured on this server", 503);
  }
  if (!voiceClientConfigured()) {
    throw new AppError(
      "Twilio Voice SDK is not configured (TWILIO_API_KEY_SID, TWILIO_VOICE_APPLICATION_SID, TWILIO_VOICE_FROM)",
      503
    );
  }

  const user = await User.findById(params.userId).select("_id").lean();
  if (!user) throw new AppError("User not found", 404);

  const destDigits = canonicalPhoneDigits(params.destination);
  if (!destDigits || !isValidForOtp(destDigits)) {
    throw new AppError("Invalid destination number", 400);
  }

  const quote = await getVoiceQuote(params.destination);
  await assertWalletCanPlaceCall(params.userId, quote.estimate1MinZar);

  const q = quoteVoiceMinuteRateZar(destDigits);
  const reference = `VOICE-${crypto.randomBytes(8).toString("hex")}`;
  const callDoc = await VoiceCall.create({
    user: new mongoose.Types.ObjectId(params.userId),
    callerPhone: "",
    destinationPhone: destDigits,
    mode: "client",
    status: "queued",
    ratePerMinuteZar: q.perMinute,
    connectFeeZar: q.connectFee,
    currency: q.currency,
    country: q.country,
    lineType: q.lineType,
    reference,
  });

  const token = createClientAccessTokenOrThrow(params.userId);

  return {
    callId: String(callDoc._id),
    status: callDoc.status,
    quote,
    token,
  };
}

/** TwiML when Twilio Voice SDK client connects (outgoingApplicationSid → this URL). */
export async function twimlForClientOutbound(params: Record<string, string>): Promise<string> {
  const callId = String(params.CallId || params.callId || "").trim();
  const toRaw = String(params.To || params.to || "").trim();
  const fromIdentity = String(params.From || "").replace(/^client:/i, "");
  const parentCallSid = String(params.CallSid || "");

  const vr = new twilio.twiml.VoiceResponse();

  if (!mongoose.Types.ObjectId.isValid(callId)) {
    vr.say("Invalid call session.");
    vr.hangup();
    return vr.toString();
  }

  const call = await VoiceCall.findById(callId);
  if (!call || call.mode !== "client") {
    vr.say("Call session not found.");
    vr.hangup();
    return vr.toString();
  }

  const expectedIdentity = clientIdentityForUser(String(call.user));
  const userIdFromIdentity =
    userIdFromClientIdentity(fromIdentity) ||
    userIdFromClientIdentity(fromIdentity.replace(/^client:/i, ""));
  if (userIdFromIdentity !== String(call.user)) {
    logger.warn("Voice TwiML identity mismatch", { callId, fromIdentity, expected: expectedIdentity });
    vr.say("Unauthorized call.");
    vr.hangup();
    return vr.toString();
  }

  const destDigits = call.destinationPhone;
  const toFromClient = canonicalPhoneDigits(toRaw);
  if (toFromClient && toFromClient !== destDigits) {
    logger.warn("Voice TwiML To mismatch — using session destination", {
      callId,
      toRaw,
      session: destDigits,
    });
  }

  if (!destDigits || !isValidForOtp(destDigits)) {
    vr.say("Invalid destination.");
    vr.hangup();
    return vr.toString();
  }

  if (parentCallSid) {
    call.callSid = parentCallSid;
  }
  call.status = "ringing";
  await call.save();

  const apiBase = publicApiBase();
  const statusUrl = `${apiBase}/api/voice/webhook/status?callId=${callId}`;

  const dial = vr.dial({
    callerId: voiceFromNumber(),
    answerOnBridge: true,
    timeout: 60,
  });
  dial.number(
    {
      statusCallback: statusUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    },
    `+${destDigits}`
  );

  return vr.toString();
}

export async function handleStatusWebhook(
  payload: Record<string, string>,
  queryCallId?: string
): Promise<void> {
  const callSid = String(payload.CallSid || "");
  const parentCallSid = String(payload.ParentCallSid || "").trim();
  const isChildLeg = Boolean(parentCallSid);
  const callStatus = mapTwilioStatus(payload.CallStatus || payload.DialCallStatus || "");
  const duration = Number(
    payload.CallDuration || payload.DialCallDuration || payload.Duration || 0
  );

  const callIdQ = String(queryCallId || payload.CallId || payload.callId || "").trim();
  const or: Record<string, unknown>[] = [{ callSid }, { reference: payload.reference || "" }];
  if (mongoose.Types.ObjectId.isValid(callIdQ)) {
    or.push({ _id: new mongoose.Types.ObjectId(callIdQ) });
  }

  const call = await VoiceCall.findOne({ $or: or });
  if (!call) {
    logger.warn("Voice status webhook: unknown call", { callSid, callIdQ });
    return;
  }

  if (!isChildLeg && callSid) {
    call.callSid = callSid;
  }

  if (Number.isFinite(duration) && duration > 0) {
    call.durationSec = Math.max(call.durationSec, duration);
  }

  if (isChildLeg) {
    if (["ringing", "in-progress"].includes(callStatus)) {
      call.status = callStatus;
    } else if (callStatus === "completed") {
      const talkSec = Math.max(duration, call.durationSec, 0);
      if (talkSec > 0) {
        call.durationSec = talkSec;
        call.status = "completed";
        await call.save();
        await debitWalletForVoiceCall(call._id);
      } else {
        call.status = "failed";
        call.errorMessage = String(payload.ErrorMessage || "No answer or immediate hangup");
        await call.save();
      }
      return;
    } else if (["failed", "busy", "no-answer", "canceled"].includes(callStatus)) {
      call.status = callStatus;
      call.errorMessage = String(payload.ErrorMessage || payload.SipResponseCode || callStatus);
    }
    await call.save();
    return;
  }

  if (["ringing", "in-progress"].includes(callStatus)) {
    call.status = callStatus;
    await call.save();
    return;
  }

  if (callStatus === "completed" && !call.walletDebited) {
    call.status = "completed";
    await call.save();
    await debitWalletForVoiceCall(call._id);
    return;
  }

  if (["failed", "busy", "no-answer", "canceled"].includes(callStatus)) {
    call.status = callStatus;
    call.errorMessage = String(payload.ErrorMessage || payload.SipResponseCode || callStatus);
  }

  await call.save();
}

export function createClientAccessTokenOrThrow(userId: string): string {
  const token = createClientAccessToken(userId);
  if (!token) {
    throw new AppError(
      "Twilio Voice SDK is not configured (TWILIO_API_KEY_SID / TWILIO_VOICE_APPLICATION_SID)",
      503
    );
  }
  return token;
}

export function createClientAccessToken(userId: string): string | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const apiKey = process.env.TWILIO_API_KEY_SID || "";
  const apiSecret = process.env.TWILIO_API_KEY_SECRET || "";
  const appSid = process.env.TWILIO_VOICE_APPLICATION_SID || "";
  if (!accountSid || !apiKey || !apiSecret || !appSid) return null;

  const token = new twilio.jwt.AccessToken(accountSid, apiKey, apiSecret, {
    identity: clientIdentityForUser(userId),
    ttl: 3600,
  });
  token.addGrant(
    new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: false,
    })
  );
  return token.toJwt();
}

export function validateTwilioWebhook(
  signature: string | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  const auth = process.env.TWILIO_AUTH_TOKEN || "";
  if (!auth || !signature) return false;
  return twilio.validateRequest(auth, signature, url, params);
}
