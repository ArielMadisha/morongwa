/**
 * WhatsApp messaging may live on a Twilio subaccount while SMS/OTP stays on the parent.
 * When set, TWILIO_WA_ACCOUNT_SID / TWILIO_WA_AUTH_TOKEN override TWILIO_ACCOUNT_SID for WA sends only.
 * If only TWILIO_WA_ACCOUNT_SID is set and it equals TWILIO_SUBACCOUNT_SID, TWILIO_SUBACCOUNT_AUTH_TOKEN is used.
 */
export function getTwilioWhatsAppApiCredentials(): { sid: string; token: string } {
  const waSid = String(process.env.TWILIO_WA_ACCOUNT_SID || "").trim();
  const waTok = String(process.env.TWILIO_WA_AUTH_TOKEN || "").trim();
  const sid = String(waSid || process.env.TWILIO_ACCOUNT_SID || "").trim();
  let token = String(waTok || process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (waSid && !waTok) {
    const subSid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
    if (waSid === subSid) {
      token = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || token).trim();
    }
  }
  return { sid, token };
}

/**
 * Outbound sends from the primary WhatsApp sender (TWILIO_WHATSAPP_FROM, usually SA).
 * During migration, set TWILIO_WHATSAPP_RSA_USE_PARENT_CREDENTIALS=1 while the +27 sender still lives on the parent Twilio account.
 */
export function getTwilioCredentialsForPrimaryWhatsappSender(): { sid: string; token: string } {
  const useParent = String(process.env.TWILIO_WHATSAPP_RSA_USE_PARENT_CREDENTIALS || "").trim() === "1";
  if (useParent) {
    return {
      sid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(),
      token: String(process.env.TWILIO_AUTH_TOKEN || "").trim(),
    };
  }
  return getTwilioWhatsAppApiCredentials();
}

export type TwilioWhatsappSendProfile = {
  accountSid: string;
  authToken: string;
  /** E.g. `whatsapp:+2677…` */
  whatsappFrom: string;
};

function tokenForAccountSid(accountSid: string): string {
  const sid = String(accountSid || "").trim();
  if (!sid) return "";
  const parentSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const parentTok = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (sid === parentSid) return parentTok;

  const subSid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
  const subTok = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
  if (sid === subSid) return subTok;

  const waSid = String(process.env.TWILIO_WA_ACCOUNT_SID || "").trim();
  const waTok = String(process.env.TWILIO_WA_AUTH_TOKEN || "").trim();
  if (sid === waSid && waTok) return waTok;

  const bwSid = String(process.env.TWILIO_WA_BW_ACCOUNT_SID || "").trim();
  const bwTok = String(process.env.TWILIO_WA_BW_AUTH_TOKEN || "").trim();
  if (sid === bwSid && bwTok) return bwTok;

  const lsSid = String(process.env.TWILIO_WA_LS_ACCOUNT_SID || "").trim();
  const lsTok = String(process.env.TWILIO_WA_LS_AUTH_TOKEN || "").trim();
  if (sid === lsSid && lsTok) return lsTok;

  const subBSid = String(
    process.env.TWILIO_SUBACCOUNT_B_SID || process.env.TWILIO_MACGYVER_SUBACCOUNT_SID || ""
  ).trim();
  const subBTok = String(
    process.env.TWILIO_SUBACCOUNT_B_AUTH_TOKEN || process.env.TWILIO_MACGYVER_SUBACCOUNT_AUTH_TOKEN || ""
  ).trim();
  if (sid === subBSid && subBTok) return subBTok;

  return "";
}

function hintedProfile(
  businessToHint?: string | null,
  accountSidHint?: string | null
): TwilioWhatsappSendProfile | null {
  const whatsappFrom = normalizeWhatsappFromRaw(String(businessToHint || ""));
  const accountSid = String(accountSidHint || "").trim();
  if (!whatsappFrom || !accountSid) return null;
  const authToken = tokenForAccountSid(accountSid);
  if (!authToken) return null;
  return { accountSid, authToken, whatsappFrom };
}

function normalizeWhatsappFromRaw(raw: string): string {
  const t = String(raw || "").trim().replace(/\s+/g, "");
  if (!t) return "";
  if (/^whatsapp:/i.test(t)) return t;
  const digits = t.replace(/\D/g, "");
  if (!digits) return "";
  return `whatsapp:+${digits}`;
}

/** WhatsApp channel address → E.164 digits only (267… / 27…). */
export function waChannelAddressToDigits(addr: string): string {
  return String(addr || "")
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/\D/g, "");
}

/**
 * Primary/default WhatsApp Business sender (`TWILIO_WHATSAPP_FROM`) — used by Studio REST sends when no BW match.
 */
export function getPrimaryWhatsappSendProfile(): TwilioWhatsappSendProfile | null {
  const { sid, token } = getTwilioCredentialsForPrimaryWhatsappSender();
  const whatsappFrom = normalizeWhatsappFromRaw(process.env.TWILIO_WHATSAPP_FROM || "");
  if (!sid || !token || !whatsappFrom) return null;
  return { accountSid: sid, authToken: token, whatsappFrom };
}

/**
 * Optional Botswana (or second region) WhatsApp sender.
 * If `TWILIO_WA_BW_ACCOUNT_SID` / `TWILIO_WA_BW_AUTH_TOKEN` are unset, reuse the default WhatsApp API credentials.
 */
export function getBotswanaWhatsappSendProfile(): TwilioWhatsappSendProfile | null {
  const whatsappFrom = normalizeWhatsappFromRaw(process.env.TWILIO_WHATSAPP_FROM_BW || "");
  if (!whatsappFrom) return null;

  const bwSid = String(process.env.TWILIO_WA_BW_ACCOUNT_SID || "").trim();
  const bwTok = String(process.env.TWILIO_WA_BW_AUTH_TOKEN || "").trim();
  const base = getTwilioWhatsAppApiCredentials();
  const accountSid = bwSid || base.sid;
  const authToken = bwTok || base.token;
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken, whatsappFrom };
}

/**
 * Optional Lesotho (or third region) WhatsApp sender — symmetric to Botswana.
 */
export function getLesothoWhatsappSendProfile(): TwilioWhatsappSendProfile | null {
  const whatsappFrom = normalizeWhatsappFromRaw(process.env.TWILIO_WHATSAPP_FROM_LS || "");
  if (!whatsappFrom) return null;

  const lsSid = String(process.env.TWILIO_WA_LS_ACCOUNT_SID || "").trim();
  const lsTok = String(process.env.TWILIO_WA_LS_AUTH_TOKEN || "").trim();
  const base = getTwilioWhatsAppApiCredentials();
  const accountSid = lsSid || base.sid;
  const authToken = lsTok || base.token;
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken, whatsappFrom };
}

type RegionalWhatsappRule = {
  profile: TwilioWhatsappSendProfile;
  dialPrefixes: string[];
  /** When true, ambiguous Studio `accountSid` equal to TWILIO_SUBACCOUNT_SID maps here (Botswana migration only). */
  matchAmbiguousSubaccount?: boolean;
};

function normalizeDialPrefix(raw: string): string {
  return String(raw || "")
    .replace(/\D/g, "")
    .trim();
}

/** Optional JSON overrides / extra nations: see TWILIO_WA_REGIONAL_SENDERS_JSON (server env only). */
function regionalRulesFromEnvJson(existingPrefixKeys: Set<string>): RegionalWhatsappRule[] {
  const raw = String(process.env.TWILIO_WA_REGIONAL_SENDERS_JSON || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const out: RegionalWhatsappRule[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const fromRaw = typeof r.whatsappFrom === "string" ? r.whatsappFrom : "";
      const whatsappFrom = normalizeWhatsappFromRaw(fromRaw);
      if (!whatsappFrom) continue;

      const sidRaw =
        typeof r.accountSid === "string"
          ? r.accountSid
          : String(process.env.TWILIO_SUBACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || "").trim();
      const accountSid = String(sidRaw || "").trim();

      const authToken =
        typeof r.authToken === "string" ? String(r.authToken).trim() : tokenForAccountSid(accountSid);

      let prefixesRaw: unknown = r.dialPrefixes;
      if (prefixesRaw === undefined && typeof r.countryCallingCode === "string") prefixesRaw = [r.countryCallingCode];
      const arr = Array.isArray(prefixesRaw) ? prefixesRaw : [];
      const dialPrefixes = arr
        .map((x) => normalizeDialPrefix(String(x)))
        .filter(Boolean);

      if (!accountSid || !authToken || !dialPrefixes.length) continue;

      for (const p of dialPrefixes) existingPrefixKeys.add(p);

      out.push({
        profile: { accountSid, authToken, whatsappFrom },
        dialPrefixes: dialPrefixes.slice().sort((a, b) => b.length - a.length),
      });
    }

    out.sort((a, b) => {
      const al = a.dialPrefixes[0]?.length || 0;
      const bl = b.dialPrefixes[0]?.length || 0;
      return bl - al;
    });
    return out;
  } catch {
    return [];
  }
}

function assembleRegionalRoutingRules(): RegionalWhatsappRule[] {
  const seenPrefixes = new Set<string>();

  /** JSON first so newer countries don't require code changes — explicit dial prefixes replace legacy env duplicates. */
  const jsonRules = regionalRulesFromEnvJson(seenPrefixes);

  const out: RegionalWhatsappRule[] = [...jsonRules];

  const primary = getPrimaryWhatsappSendProfile();
  const primaryDigits = primary ? waChannelAddressToDigits(primary.whatsappFrom) : "";

  const bw = getBotswanaWhatsappSendProfile();
  const bwDigits = bw ? waChannelAddressToDigits(bw.whatsappFrom) : "";
  const bwSameNumberAsPrimary = Boolean(primaryDigits && bwDigits && bwDigits === primaryDigits);

  /** One shared WABA line for BW + SA: do not register a separate +267 route when FROM_BW equals TWILIO_WHATSAPP_FROM. */
  if (bw && !seenPrefixes.has("267") && !bwSameNumberAsPrimary) {
    seenPrefixes.add("267");
    out.push({
      profile: bw,
      dialPrefixes: ["267"],
      /** Only infer BW sender when the customer is actually +267 — avoids SA sessions sharing the same Twilio subaccount picking the wrong `from`. */
      matchAmbiguousSubaccount: true,
    });
  }

  const ls = getLesothoWhatsappSendProfile();
  if (ls && !seenPrefixes.has("266")) {
    seenPrefixes.add("266");
    out.push({
      profile: ls,
      dialPrefixes: ["266"],
    });
  }

  const longestPrefixInRule = (rule: RegionalWhatsappRule): number =>
    rule.dialPrefixes.reduce((m, p) => (p.length > m ? p.length : m), 0);
  out.sort((a, b) => longestPrefixInRule(b) - longestPrefixInRule(a));

  return out;
}

/**
 * Pick Twilio `from` (+ creds) so REST replies stay in the same WhatsApp thread as the inbound bot session.
 *
 * @param businessToHint — inbound `To` (your WhatsApp-enabled Twilio address), often `whatsapp:+267…`.
 * @param userWaPhoneInput — customer `From`; used when Studio omits `To` (+267 mobiles map to BW sender, etc.).
 */
export function resolveWhatsappSendProfile(
  businessToHint?: string | null,
  userWaPhoneInput?: string | null,
  accountSidHint?: string | null
): TwilioWhatsappSendProfile | null {
  const directHint = hintedProfile(businessToHint, accountSidHint);
  if (directHint) return directHint;

  const primary = getPrimaryWhatsappSendProfile();
  if (!primary) return null;

  const hintDigits = waChannelAddressToDigits(String(businessToHint || "").trim());
  const primaryDigits = waChannelAddressToDigits(primary.whatsappFrom);

  const userDigitsRaw = String(userWaPhoneInput || "")
    .trim()
    .replace(/^whatsapp:/i, "");
  const userDigits = userDigitsRaw.replace(/\D/g, "");
  const accountSid = String(accountSidHint || "").trim();

  const subSid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();

  const rules = assembleRegionalRoutingRules();
  for (const rule of rules) {
    const businessDigits = waChannelAddressToDigits(rule.profile.whatsappFrom);
    if (!businessDigits) continue;

    if (hintDigits && hintDigits === businessDigits) return rule.profile;

    if (accountSid && accountSid === rule.profile.accountSid) return rule.profile;

    /** Legacy Botswana-only: shared WhatsApp API subaccount — only when the customer dialled from +267. */
    if (
      rule.matchAmbiguousSubaccount &&
      accountSid &&
      subSid &&
      accountSid === subSid &&
      userDigits.startsWith("267")
    ) {
      return rule.profile;
    }

    if (!hintDigits) {
      for (const pref of rule.dialPrefixes) {
        if (!pref) continue;
        if (userDigits.startsWith(pref)) return rule.profile;
      }
    }
  }

  if (accountSid && accountSid === primary.accountSid) return primary;
  if (hintDigits && hintDigits === primaryDigits) return primary;
  return primary;
}

/** Credential buckets for MacGyver WhatsApp-only sends (Country Ops profile picks per line). */
export type MacGyverWaTwilioPoolKey =
  | "wa_api"
  | "twilio_parent"
  | "twilio_subaccount"
  | "twilio_subaccount_b";

export function normalizeMacGyverWaTwilioPool(raw: unknown): MacGyverWaTwilioPoolKey {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "twilio_parent" || s === "twilio_subaccount" || s === "twilio_subaccount_b" || s === "wa_api") {
    return s;
  }
  return "wa_api";
}

/**
 * Resolve Twilio REST credentials for a MacGyver outbound pool (not the full sender profile).
 * Subaccount B: `TWILIO_SUBACCOUNT_B_SID` + `TWILIO_SUBACCOUNT_B_AUTH_TOKEN` (aliases `TWILIO_MACGYVER_SUBACCOUNT_*`).
 */
export function resolveMacGyverWaCredentialPair(pool: MacGyverWaTwilioPoolKey): { sid: string; token: string } | null {
  if (pool === "twilio_parent") {
    const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    return sid && token ? { sid, token } : null;
  }
  if (pool === "twilio_subaccount") {
    const sid = String(process.env.TWILIO_SUBACCOUNT_SID || "").trim();
    const token = String(process.env.TWILIO_SUBACCOUNT_AUTH_TOKEN || "").trim();
    return sid && token ? { sid, token } : null;
  }
  if (pool === "twilio_subaccount_b") {
    const sid = String(
      process.env.TWILIO_SUBACCOUNT_B_SID || process.env.TWILIO_MACGYVER_SUBACCOUNT_SID || ""
    ).trim();
    const token = String(
      process.env.TWILIO_SUBACCOUNT_B_AUTH_TOKEN || process.env.TWILIO_MACGYVER_SUBACCOUNT_AUTH_TOKEN || ""
    ).trim();
    return sid && token ? { sid, token } : null;
  }
  const base = getTwilioWhatsAppApiCredentials();
  return base.sid && base.token ? { sid: base.sid, token: base.token } : null;
}

/** Build a send profile for an E.164 WhatsApp sender using the chosen credential pool (MacGyver only). */
export function buildMacGyverWhatsappSendProfile(
  e164Raw: string,
  pool: MacGyverWaTwilioPoolKey
): TwilioWhatsappSendProfile | null {
  const whatsappFrom = normalizeWhatsappFromRaw(e164Raw);
  const creds = resolveMacGyverWaCredentialPair(pool);
  if (!whatsappFrom || !creds?.sid || !creds?.token) return null;
  return { accountSid: creds.sid, authToken: creds.token, whatsappFrom };
}
