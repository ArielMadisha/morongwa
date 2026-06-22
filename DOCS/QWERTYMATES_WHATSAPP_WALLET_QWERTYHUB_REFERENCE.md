# Qwertymates: WhatsApp, ACBPay Wallet & QwertyHub — Engineering Reference

This document is the **product-facing technical reference** for how Qwertymates behaves on **WhatsApp** (Twilio Studio + backend), **ACBPay Wallet**, and **QwertyHub / reseller (My Store)** flows. Use it for onboarding, feature work, and debugging.

**Companion (operations / incidents):** [`WHATSAPP_CHATBOT_STATE_RUNBOOK.md`](./WHATSAPP_CHATBOT_STATE_RUNBOOK.md) — state TTL, shipping notes, deploy hooks.

**Canonical code:** `backend/src/routes/waFlow.ts`  
**Twilio Studio template:** `backend/src/integrations/zweppe-mochina-flow/twilio-flow-v2.template.json`  
**Publish Studio flows:** `backend/scripts/pushTwilioFlowV2.mjs` (from `backend/`, with `.env` Twilio vars)

---

## 1. Architecture at a glance

| Layer | Role |
|--------|------|
| **Twilio Studio** | Inbound WhatsApp → HTTP to API → branch on JSON `code` → `send-and-wait-for-reply` for the next user message. |
| **Backend `waFlow`** | Business logic, menus, `WaConversationState`, wallet/errands/about/mochina wizards. |
| **Twilio REST (from backend)** | Sponsored **video**, long text **chunked** for limits, **image/product galleries**, wallet QR images — so order and content are controlled outside Studio’s single-message limits. |

**Branding:** Shipped product is **Qwertymates** (see repo rules / `mobile` config). WhatsApp copy and menus say Qwertymates / QwertyHub / ACBPay Wallet as appropriate.

---

## 2. Twilio Studio ↔ API contract

Studio calls these endpoints (production base: `https://api.qwertymates.com/api/wa/flow/`):

| Widget / step | Method | Path | Purpose |
|---------------|--------|------|---------|
| `check_user` | POST | `check-user` | Registration gate, pending CART/RESELL, schedules welcome video + silent menu response for ready users. |
| `main_menu_api` | POST | `menu` | Main menu digits **1–8**, cart/resell/payreq, about submenu, wallet/errands/mochina state machines. |
| `wallet_menu_api` | POST | `wallet/menu-action` | Legacy/alternate path; wallet root still handled on **`menu`** when `scope: wallet` is active. |

**Critical form fields** (forward on every Studio HTTP request that drives outbound REST):

- `phone` / `From` — customer WhatsApp id  
- `to` / `To` — **business** WhatsApp number that received the message (keeps thread on SA vs Botswana)  
- `accountSid` / `AccountSid` — Twilio account that received the webhook (locks credentials for REST sends)

If `To` or `AccountSid` is missing, regional replies can mix senders; the backend stores **`WaOutboundSession`** (`businessTo`, `accountSid`) keyed off the user to recover context.

**Studio response `code` values** must match `split-based-on` widgets in the JSON template. Changing a `code` in `waFlow.ts` without updating the flow JSON breaks routing.

---

## 3. Regional WhatsApp (South Africa vs Botswana)

**Goal:** Messages initiated on **+267…** (or the Botswana WABA) must be answered **from the same sender and Twilio account**, not from the South Africa line.

**Implementation:**

- `backend/src/utils/twilioWaCredentials.ts` — `resolveWhatsappSendProfile(businessToHint, userWaPhoneInput, accountSidHint)`  
- Env (typical): `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_FROM_BW`, optional `TWILIO_WA_BW_ACCOUNT_SID` / `TWILIO_WA_BW_AUTH_TOKEN`, parent/subaccount SIDs/tokens as documented in that file.

**Inbound hints:** Studio passes `trigger.message.To` and `trigger.message.AccountSid` into the flow HTTP widgets.

---

## 4. Sponsored video adverts (premenu)

**Rules:**

- Creatives are **video only**: public **HTTPS** URLs ending in **`.mp4` / `.mov` / `.m4v`** (see `sponsoredVideoAdService.ts`).
- WhatsApp does **not** autoplay; users tap the card to play.
- Sequence: **`scheduleWaPremenuVideoThenRun`** → optional **video** (delay) → **`runAfter()`** (menu text, galleries, wallet screen, etc.).

**Actions → placement keys** (admin + DB `SponsoredVideoAd.placements`):

| Action (`open_*`) | Placement key | Typical use |
|------------------|---------------|-------------|
| `open_main_menu` | `wa_premenu_main` | After check-user welcome |
| `open_about` | `wa_menu_about` | Main menu **1** → About text |
| `open_marketplace` | `wa_menu_marketplace` | Main **2** |
| `open_errands` | `wa_menu_errands` | Main **3** |
| `open_mystore` | `wa_menu_mystore` | Main **4** My Store |
| `open_wallet` | `wa_menu_wallet` | Main **5** |
| `open_jobs` | `wa_menu_jobs` | Main **6** / Mochina |
| `open_cart` | `wa_menu_cart` | Main **7** |
| `open_merchant_apply` | `wa_wallet_merchant` | Wallet → Become a merchant |

**Fallback:** Placement aliases allow **`wa_premenu_main`** (and related legacy keys) to satisfy a placement if no ad is tagged specifically.

**Admin UI:** `frontend/app/admin/sponsored-video/page.tsx` — placement labels aligned with main menu numbers.

---

## 5. Main menu (WhatsApp)

Text built in `buildMainMenu()`:

1. About Qwertymates  
2. (Qwertyhub) Marketplace  
3. Errands  
4. My Store  
5. Wallet  
6. Jobs (Mochina)  
7. Cart  
8. Yesplay  

**Behaviour summary:**

| Key | Premenu action | Follow-up (REST / state) |
|-----|----------------|---------------------------|
| 1 | `open_about` | Chunked About copy + about submenu state (`wa_about_actions`); sub-choices 1–3,0 → wallet / marketplace / errands with their own premenu |
| 2 | `open_marketplace` | Product gallery + main menu |
| 3 | `open_errands` | `errands` scope, intro wizard |
| 4 | `open_mystore` | `buildMyResellChannelMessage` — **chunked** text, optional media cards, **main menu** again |
| 5 | `open_wallet` | `sendWaWalletEntryWithMenuState` — balance + submenu + **`wallet_menu`** step |
| 6/9 | `open_jobs` | Mochina menu + `mochina` scope |
| 7 | `open_cart` | Cart summary |
| 8 | — | Yesplay link |

**Silent Studio paths:** Many branches return `SELL_INFO_SILENT` so Studio does not duplicate long text; the user sees content from **REST** only.

---

## 6. ACBPay Wallet (WhatsApp)

### 6.1 Entry

- Main **5** or About **1** (Open Wallet) after premenu video.  
- Message from `buildWalletEntryMessage`: balances (available, pending in jobs, earnings) + `buildWalletSubmenu()`.

### 6.2 `wallet_menu` (root submenu)

After the wallet screen is shown, the backend saves **`WaConversationState`** with `scope: "wallet"`, **`step: "wallet_menu"`** (`WA_WALLET_MENU_STEP`).  

Digits **1–5** are **wallet** actions, **not** main-menu About/Marketplace:

| Digit | Step / behaviour |
|-------|-------------------|
| 1 | `send_money_phone` → amount → confirm → wallet debit / PayGate shortfall |
| 2 | `request_money_phone` → amount → `MoneyRequest` + payer link |
| 3 | `withdraw_agent_phone` → agent OTP flow (`MerchantAgentCashTx`) |
| 4 | QR image (QuickChart) via REST |
| 5 | Merchant apply (`merchant_intro` wizard) + optional premenu video |
| 0 | Clear wallet state → main menu |

**Important:** `clearStaleWaInteractiveStateForMainMenu` **does not** delete documents when `scope === "wallet"`, so digit **1** on the wallet screen is never mistaken for main-menu **1** (About).

### 6.3 Timeouts

- Wallet inactivity: `WA_WALLET_INACTIVITY_TIMEOUT_MIN` (e.g. 3 minutes) in code.  
- Sub-steps use `saveWalletState` / `clearWalletState`.

### 6.4 Website parity (high level)

Wallet web lives under **`/wallet`**, **`/pay/*`**, money requests, PayGate webhooks. WhatsApp send/request flows generate links into those surfaces where applicable (`FRONTEND_URL`).

**Web wallet tabs (aligned with WhatsApp):**

| Tab | WhatsApp analogue | Behaviour |
|-----|-------------------|-----------|
| **Pay at shop** | Wallet **4** (show QR) + pay incoming merchant requests | Buyer shows `ACBPAY:{userId}` QR; merchant scans on **Sell (till)** tab. |
| **Cash & agents** | Wallet **3** (withdraw via agent) + agent cash deposit | **Get cash:** pick agent, amount debits wallet immediately; collect physical cash. **Cash in:** approved agent scans customer QR or username; customer approves deposit in app/SMS. |
| **Sell (till)** | Supplier / store owner (web; apply via supplier flow) | Scan buyer QR → enter basket total → optional store name (e.g. tuckshop) → buyer confirms once. Phase 1: amount only, no line items. |

Direct link: `/wallet?accept=1` opens **Sell (till)** when the user is an approved merchant.

---

## 7. QwertyHub & reseller (My Store)

### 7.1 Concepts

- **QwertyHub:** Marketplace discovery; WhatsApp sends product **image cards** with captions (add to cart / resell links).  
- **Reseller wall:** `ResellerWall` + optional `Store` type `reseller`.  
- **My Store:** Main menu **4** — same product list as web store; **long text is chunked** to avoid WhatsApp body limits; then optional gallery; then main menu.

### 7.2 Commands (parsed early on `/menu`)

| Command | Purpose |
|---------|---------|
| `CART ADD <shortId> <qty>` | Add to `Cart` |
| `RESELL <shortId> <3-7>` | Add to wall + markup (within allowed band) |
| `MYSTORE` / shortcuts | My Store–style payload |
| `CATEGORY <name>` | Filtered product set |
| `PAYREQ <token>` | Money-request deep link |

These are evaluated **before** main-menu digit routing so Studio restarts do not drop commands.

### 7.3 Data sources

- Products: `Product` with `allowResell`, supplier rules, dropship vs internal.  
- Images: `resolveImageUrl` / API public URLs for Twilio media.

---

## 8. Conversation state model (`WaConversationState`)

- **Unique index on `user` only** (one document per user).  
- **`scope`** discriminates: `wallet`, `errands`, `mochina`, `wa_about_actions`, `wa_pending_continue`, etc.  
- Updates must use **user-keyed upserts** that **set `scope`** (see `upsertWaScopedStateForUser`) to avoid duplicate-key errors when switching flows.

---

## 9. Admin & configuration

| Area | Location |
|------|----------|
| Sponsored video ads & placements | Admin **Sponsored video**; model `SponsoredVideoAd` |
| Merchant agents / withdrawals | Merchant agent approval paths; `MerchantAgentCashTx` |
| Twilio env | `backend/.env` (never commit secrets) — see `twilioWaCredentials.ts` |

---

## 10. Deploy & Studio publish

From **`backend/`**:

```bash
npm run build
npm run deploy:production
```

This normally: ships backend, runs **`pushTwilioFlowV2.mjs`** (parent + subaccount flows discovered from sender webhooks), refreshes frontend, NPM edge hardening.

**Guardrail:** After deploy, verify `https://www.qwertymates.com/` and `/wall` (non-502).

---

## 11. Troubleshooting quick list

| Symptom | Check |
|---------|--------|
| Botswana chat answers from SA number | `To` / `AccountSid` on Studio HTTP widgets; `resolveWhatsappSendProfile`; env BW sender + tokens |
| Menu digit does wrong thing | `WaConversationState` scope/step; wallet **must** be `wallet_menu` after wallet entry |
| Only video, no text | Message length — use **chunking**; Twilio errors in logs; `runAfter` thrown |
| Duplicate key Mongo `WaConversationState` | Upsert by `user`, set `scope` in `$set` |
| Studio orphan flow created | `pushTwilioFlowV2.mjs` logs; set `TWILIO_STUDIO_FLOW_SID` if discovery fails |

---

## 12. File index

| Topic | File(s) |
|-------|---------|
| All WhatsApp HTTP routes & menus | `backend/src/routes/waFlow.ts` |
| Ad selection & placements | `backend/src/services/sponsoredVideoAdService.ts`, `waPreMenuAdvertConfig.ts` |
| Twilio credentials / regional senders | `backend/src/utils/twilioWaCredentials.ts` |
| Studio JSON | `backend/src/integrations/zweppe-mochina-flow/twilio-flow-v2.template.json` |
| State schema | `backend/src/data/models/WaConversationState.ts` |
| Admin ads UI | `frontend/app/admin/sponsored-video/page.tsx` |

---

*Last aligned with monorepo behaviour as of the date of the commit that adds this document; verify critical `code` strings against `waFlow.ts` and the Studio template before large releases.*
