# Food/grocery merchant SMS — South Africa sender

## Why this exists

When WhatsApp order alerts fail (Meta utility template pending, or outside the 24h session / Twilio **63016**), settlement falls back to **SMS** (`foodOrderSettlement.ts` → `sendSms`).

Production currently sends SMS from **`TWILIO_SMS_FROM`** (US long code `+1…`). Delivering that to a **ZA (+27)** handset often fails with Twilio **30003** (undelivered).

**Findings (Twilio API inventory, parent account):**

| Resource | Status |
|---|---|
| Incoming SMS numbers | Only **`+19798594873`** (US, SMS-capable) |
| Messaging Service `WA Zweppe` | Contains the same US number only |
| `TWILIO_WHATSAPP_FROM` (`+27815826899`) | WhatsApp Business sender — **not** in Incoming Phone Numbers; **cannot** be used as SMS From |
| `TWILIO_SMS_FROM_ZA` | **Unset** — no ZA SMS path yet |
| Subaccount | No incoming numbers / messaging services |

Do **not** invent a From number. Buy/configure one in Twilio, then set env.

## Code behaviour (after this change)

`otpDelivery.resolveSmsSendParams`:

1. Destination **+27…** → use **`TWILIO_SMS_FROM_ZA`** if set (wins over Messaging Service).
2. Else Messaging Service SID (if set).
3. Else global **`TWILIO_SMS_FROM`**.

OTP and other SMS keep using the same resolver; only ZA destinations prefer the ZA From when present. US/BW/LS behaviour is unchanged when those regional vars are unset.

## Owner action — buy a ZA SMS sender

1. Open [Twilio Console → Phone Numbers → Buy a number](https://console.twilio.com/us1/develop/phone-numbers/manage/search).
2. Country: **South Africa**. Type: **Mobile** (SMS-enabled). Local inventory may be empty; mobile (+2760…) is what Twilio lists as available.
3. Complete **regulatory** requirements for ZA mobile numbers (identity + **South African address** docs). See [Twilio ZA regulatory guidelines](https://www.twilio.com/en-us/guidelines/za/regulatory) and [ZA SMS guidelines](https://www.twilio.com/en-us/guidelines/za/sms).
4. After purchase, note the E.164 (e.g. `+2760…`). Confirm **SMS** capability on the number.
5. Set locally in `backend/.env` (do not commit):
   ```env
   TWILIO_SMS_FROM_ZA=+2760XXXXXXXX
   ```
   Leave `TWILIO_SMS_FROM=+19798594873` for non-ZA / existing OTP paths unless you intentionally change it.
6. Sync to production and restart API:
   ```bash
   cd backend
   npm run sync:wa-twilio-env-remote
   ```
   (script merges `TWILIO_SMS_FROM_ZA` into live `.env` and restarts `morongwa-api-test`.)
7. Retest merchant SMS only after the ZA From is live, e.g. resend alert for a known order:
   ```bash
   node scripts/resendFoodMerchantAlert.mjs <orderId>
   ```

### Optional: Messaging Service

You may add the new ZA number to a Messaging Service and set `TWILIO_SMS_MESSAGING_SERVICE_SID`. For ZA destinations, **`TWILIO_SMS_FROM_ZA` still takes priority** so a US-only Messaging Service cannot override it.

### Not supported as a shortcut

- Reusing **`TWILIO_WHATSAPP_FROM`** as SMS From.
- Alphanumeric Sender ID for ZA (Twilio: **not supported** for South Africa).
- Relying on US long code → ZA for merchant last-resort.

## Primary channel reminder

WhatsApp remains primary (`TWILIO_WA_ORDER_ALERT_CONTENT_SID` Meta approval). SMS is last resort only. In-app shop-owner notifications are a separate track — do not duplicate that here.
