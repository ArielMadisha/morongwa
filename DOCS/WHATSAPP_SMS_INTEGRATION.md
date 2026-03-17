# WhatsApp & SMS Integration Guide

This document describes how to integrate WhatsApp and SMS for OTP (One-Time Password) delivery in Morongwa. The app currently has a stub implementation that generates OTPs and stores them in memory; production requires connecting to real providers.

## Current Implementation

- **Backend**: `POST /auth/send-otp` accepts `{ phone, channel: "sms" | "whatsapp" }`
- **OTP storage**: In-memory (dev only). Use Redis or a database in production.
- **Frontend**: Users choose "Send via SMS" or "Send via WhatsApp" on the registration phone step.

## SMS Integration (Twilio)

### 1. Prerequisites

- [Twilio account](https://www.twilio.com/try-twilio)
- Twilio Verify Service (recommended) or Programmable SMS

### 2. Twilio Verify (recommended for OTP)

```bash
npm install twilio
```

Create a Verify Service in the [Twilio Console](https://console.twilio.com/) and note the **Service SID**.

### 3. Environment variables

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Backend integration

In `backend/src/routes/auth.ts`, replace the OTP send logic in `POST /send-otp`:

```ts
// For channel === "sms"
import twilio from "twilio";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Send OTP
const verification = await twilioClient.verify.v2
  .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
  .verifications.create({
    to: `+${normalized}`,
    channel: "sms",
  });
```

For **verification**, use Twilio Verify's check endpoint instead of comparing hashes locally:

```ts
const verificationCheck = await twilioClient.verify.v2
  .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
  .verificationChecks.create({
    to: `+${normalized}`,
    code: otp,
  });

if (verificationCheck.status === "approved") {
  // Issue otpToken
}
```

---

## WhatsApp Integration (WhatsApp Cloud API)

### 1. Prerequisites

- [Meta for Developers](https://developers.facebook.com/) account
- WhatsApp Business Account
- Approved authentication template (OTP template)

### 2. Create OTP template

1. Go to [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/)
2. Create an **Authentication** template
3. Use `{{1}}` for the OTP placeholder (or `<<VERIFICATION_CODE>>` depending on Meta's current format)
4. Submit for approval (typically 1–3 days)

### 3. Environment variables

```env
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
META_APP_ID=your_app_id
```

### 4. Backend integration

In `backend/src/routes/auth.ts`, for `channel === "whatsapp"`:

```ts
// Send OTP via WhatsApp Cloud API
const response = await fetch(
  `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalized.replace(/^0/, "27"), // E.164 format
      type: "template",
      template: {
        name: "your_otp_template_name",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: otp }],
          },
        ],
      },
    }),
  }
);
```

### 5. Alternative: Twilio Verify for WhatsApp

Twilio Verify also supports WhatsApp as a channel:

```ts
const verification = await twilioClient.verify.v2
  .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
  .verifications.create({
    to: `+${normalized}`,
    channel: "whatsapp",
  });
```

---

## Abuse Prevention (SMS/OTP Cost Protection)

The backend includes several safeguards to reduce Twilio cost abuse:

| Control | Limit | Purpose |
|--------|-------|---------|
| **IP rate limit** | 3 requests / 15 min per IP | Prevents bulk OTP spam from one IP |
| **Per-phone cooldown** | 2 min between requests | Stops rapid retries to same number |
| **Per-phone daily cap** | 5 OTPs per phone per day | Limits abuse via multiple accounts |
| **Premium number block** | Africa (53 countries): SADC (Botswana, Angola, Lesotho, Namibia, Zimbabwe, Zambia, Mozambique, Malawi, etc.), West Africa/ECOWAS (Ghana, Senegal, Côte d'Ivoire, Benin, Togo, Mali, etc.), East Africa (Kenya, Tanzania, Uganda, Rwanda, Ethiopia, etc.), North Africa (Egypt, Morocco, Algeria, Tunisia, Libya, Sudan). Nigeria 080/081/090/091 = mobile (excluded). Plus Asia, Americas, Europe, Middle East, Oceania. | Avoids sending to expensive premium numbers |

**Custom block list:** Set `OTP_BLOCK_PREFIXES=2787,1900` (comma-separated prefixes) to block additional number ranges.

**Production:** For multi-instance deployments, replace per-phone in-memory maps with Redis (TTL keys for cooldown + daily counters).

## Production Checklist

- [ ] Replace in-memory OTP store with Redis or database
- [ ] Set `OTP_SECRET` to a strong random value
- [ ] Configure Twilio (SMS) and/or WhatsApp Cloud API
- [ ] Add rate limiting per phone number (already in place via `otpSendLimiter` + per-phone limits)
- [ ] Set `NEXT_PUBLIC_WHATSAPP_NUMBER` for the "Register via WhatsApp chat" link

## Username Auto-Generation

Usernames are automatically generated from the user's full name during registration:

- Base: lowercase, alphanumeric + underscore (e.g. `johndoe`)
- If taken: `johndoe1`, `johndoe2`, etc.
- Users can edit their username later in **Profile** → pencil icon next to `@username`
