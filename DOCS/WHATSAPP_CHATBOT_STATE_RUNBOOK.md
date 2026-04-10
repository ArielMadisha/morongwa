# WhatsApp Chatbot State Runbook

This document is the operational reference for the Qwertymates WhatsApp chatbot.
Use it during debugging, incident response, and future feature changes.

## Scope

- Bot runtime route: `backend/src/routes/waFlow.ts`
- Money-request logic: `backend/src/services/moneyRequestService.ts`
- Payment webhook effects: `backend/src/routes/payments.ts`
- Twilio Studio template: `backend/src/integrations/zweppe-mochina-flow/twilio-flow-v2.template.json`
- Studio deploy script: `backend/scripts/pushTwilioFlowV2.mjs`

---

## 1) High-Level Architecture

- Twilio Studio receives incoming WhatsApp messages.
- Studio calls backend HTTP webhook endpoint(s) under `/api/wa/flow/*`.
- Backend returns `code` + `message/menu` payloads used by Studio transitions.
- For media-heavy responses (QwertyHub/MyStore cards), backend also sends direct WhatsApp messages via Twilio REST API (`sendWhatsAppText`, `sendWhatsAppMediaGallery`) to control ordering.

### Important behavior

- Studio + backend are coupled by response `code` values.
- If you change a `code` in backend, verify Studio split/transition conditions still match.

---

## 2) Main Runtime States (Backend)

The backend maintains short conversational states in `WaConversationState` for wallet flows.

- Scope: `"wallet"`
- Inactivity timeout: `WA_WALLET_INACTIVITY_TIMEOUT_MIN` (currently 3 minutes in code)
- State examples:
  - `send_money_phone`
  - `send_money_amount`
  - `request_money_phone`
  - `request_money_amount`
  - `withdraw_agent_phone`
  - `withdraw_agent_amount`
  - `withdraw_agent_otp`

If state expires, user is returned to main menu.

---

## 3) Key Commands / Intents

### Product and reseller

- `CART ADD <code> <qty>`: add product to cart
- `RESELL <code> <3-7>`: add product to reseller wall/store and set markup
- `MYSTORE` shortcut: sends current reseller products with buyer links and WhatsApp share links

### Wallet and payments

- Wallet menu supports:
  - balance
  - send money
  - request money
  - withdraw from agent
  - QR code
- Money request tap-to-pay command:
  - `PAYREQ <actionToken>`
- Legacy top-up command support exists in menu/help text:
  - `TOPUP <amount>`

### Reliability shortcut

- CART/RESELL command handling is intentionally evaluated early so Studio restarts from trigger/check-user do not lose action commands.

---

## 4) Shipping Calculation State (Website + WhatsApp)

### Website (`/checkout`)

Source: `backend/src/routes/checkout.ts`

- Internal suppliers: uses configured supplier `shippingCost`.
- External suppliers: uses external supplier `shippingCost`.
- CJ products: fetches live freight quote by destination country.
- Quote response now includes:
  - `shipping`
  - `shippingBreakdown`
  - `shippingQuoteType` (`live_quote` | `configured_tariff`)
  - `shippingNote`

Frontend (`frontend/app/checkout/page.tsx`) shows shipping line items + `shippingNote` so users see if shipping is live-calculated or tariff-based.

### WhatsApp cart summary

Source: `buildWaCartMessage` in `waFlow.ts`

- Uses same structure as web:
  - supplier tariffs for internal/external
  - live CJ quote when available
- Correctly converts shipping values to target phone currency.
- If live quote unavailable, marks CJ shipping as estimated and includes explicit note:
  - estimated now
  - may change after courier confirmation at checkout

---

## 5) Payment State (PayGate)

### Shared initiation service

Source: `backend/src/services/payment.ts`

- Entry point: `initiatePayment()`
- Requires production-safe config:
  - `PAYGATE_ID`
  - `PAYGATE_SECRET`
  - `PAYGATE_URL` (live host expected: `secure.paygate.co.za`)
  - non-localhost `FRONTEND_URL` and `BACKEND_URL`
- Flat card fee support:
  - `PAYGATE_FLAT_FEE_ZAR` (default `5`)
  - Added to every PayGate card initiation unless explicitly skipped.

### Webhook settlement

Source: `backend/src/routes/payments.ts` (`/api/payments/webhook`)

Handles references:

- `ADDCARD-*`
- `CHECKOUT-*`
- `CARDPMT-*`
- `ORDER-*`
- `MUSIC-*`
- `TOPUP-*` / `PAY-*`

Money-request direct-card finalization path:

- `moneyRequestService.finalizeMoneyRequestAfterDirectCard()` is used so request status is completed without accidental double-debit behavior.

---

## 6) "Send Money" and "Request Money" Current Rules

### Send money (wallet chat flow)

When sender balance is insufficient:

- Sends wallet partial amount first (if any) directly to recipient wallet.
- Creates PayGate payment for shortfall.
- Shortfall payment is configured to credit recipient-side target as implemented in current wallet/money-request logic.

### Money request (`PAYREQ`)

When payer balance is insufficient:

- Attempts wallet partial settlement first (if available).
- Generates PayGate link for shortfall.
- Finalizes pending money request after successful webhook settlement path.

---

## 7) Twilio Studio Operational State

Template file:

- `backend/src/integrations/zweppe-mochina-flow/twilio-flow-v2.template.json`

Deploy command:

- `cd backend && npm run deploy:twilio-flow`

Script behavior:

- If `TWILIO_STUDIO_FLOW_SID` is set, updates that exact flow in-place and publishes.
- If not set, creates a new flow (risk of orphan flow if sender still points to old one).

### Required env for stable Twilio behavior

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_STUDIO_FLOW_SID` (strongly recommended)

---

## 8) Operational Debug Checklist

When bot misbehaves, check in this order:

1. Twilio sender and Studio flow
   - Confirm sender is attached to expected `TWILIO_STUDIO_FLOW_SID`.
   - Confirm latest flow is published.
2. Backend runtime env in API container
   - `FRONTEND_URL`, `BACKEND_URL`, `PAYGATE_*`, Twilio vars.
   - Ensure values are production URLs (not localhost).
3. Payment path
   - Check backend logs around `initiatePayment` and webhook.
   - Verify reference prefixes match expected handling branch.
4. WA conversation state
   - Check `WaConversationState` for stuck/expired wallet step.
5. Shipping path
   - For CJ shipping issues, check live freight quote availability and product variant `vid`.
6. Response code mismatches
   - Compare backend response `code` with Studio split conditions.

---

## 9) Known Fragility Points

- Studio and backend `code` mismatch can silently route to wrong menu/error branch.
- Missing CJ variant ID blocks live shipping quote for that product.
- Missing/invalid PayGate or localhost URL config blocks card initiation.
- Twilio media ordering depends on delayed follow-up send scheduling; very long queues can reorder user-visible messages.

---

## 10) Safe Change Procedure (Future)

1. Edit backend (`waFlow.ts` / services) with backward-compatible `code` values.
2. If Studio conditions must change, update flow template JSON.
3. Build backend locally (`npm run build`).
4. Deploy backend.
5. Deploy Twilio flow (`npm run deploy:twilio-flow`).
6. Run end-to-end manual checks:
   - `CART ADD`, `MYSTORE`, `RESELL`
   - wallet send/request/payreq
   - cart shipping summary
   - checkout handoff link behavior

---

## 11) Recommended Incident Logging Format

For each WhatsApp issue, capture:

- phone (masked)
- incoming text
- backend response `code`
- state before/after (`WaConversationState.step`)
- payment reference (if any)
- Twilio flow SID + revision timestamp
- whether issue is reproducible

This makes regressions traceable and speeds future fixes.

