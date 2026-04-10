# QwertyHub WhatsApp links (product cards)

## Product rule

Many users **cannot use the website**. Product cards must work **entirely in WhatsApp**: tap → open chat with the bot → prefilled command is sent (or ready to send).

## Add to cart

- **Link format:** `https://wa.me/<TWILIO_WHATSAPP_FROM digits>?text=<encoded>`
- **Prefilled text:** `CART ADD <8-char product code> <qty>` (example: `CART ADD 69cbd9cb 1`) — matches tap links like `https://wa.me/<digits>?text=CART%20ADD%20...`
- **Behaviour:** User taps the link → WhatsApp opens to the business number with that text. Sending the message runs the same handler as typing the command manually.

## Resell (add to MyStore)

- **Link format:** same `wa.me` pattern as above.
- **Prefilled text:** `RESELL <code> <markup 3–7>` (default markup from env-driven constants in code).
- **Behaviour:** Same as manual `RESELL` command.

## What we do *not* put in cards for these actions

- **No** `https://api.../api/wa/g/...` redirect links in captions for “Buy / Add to cart” or “Add to MyStore (resell)”.
- **No** `https://www.../wa/g/...` redirect links for those actions.

Those HTTPS redirect endpoints were used for signed, tamper-resistant links; they are **optional** for older messages and remain on the server (`GET /api/wa/g/:token` → 302 to `wa.me`). **New** bot messages should use **direct `wa.me`** only for cart and resell taps.

## Configuration

- **`TWILIO_WHATSAPP_FROM`** must include the business WhatsApp number (e.g. `whatsapp:+27123456789`) so `wa.me/<digits>` targets the correct bot.

## Fallback when the bot number is missing

- Cards must **not** fall back to `https://www.../marketplace/product/...` for “Add to cart” or resell.
- If `TWILIO_WHATSAPP_FROM` is empty, captions use plain text: `Reply in this chat: CART ADD <code> <qty>` or `Reply in this chat: RESELL <code> <markup>` so the user stays in WhatsApp.

## Share / preview lines (reseller → buyers)

- After a successful **RESELL**, the bot sends a **buyer link** (`/share/product/...`). The “share this with buyers” line must be a **direct `wa.me` link** with that URL prefilled, e.g. `https://wa.me/<business digits>?text=<encoded share URL>`.
- **Do not** use signed redirects like `https://www.../wa/g/<token>` for this — the buyer-facing URL is already embedded in the `text=` parameter.

## MyStore (menu / WhatsApp list)

- **Buyer link** must be the same **share page** as everywhere else: `https://www.../share/product/<slugOrId>?resellerId=...&resellerCommissionPct=...` — not `/marketplace/product/...`.
- **Share on WhatsApp** is `buildWaMeShareFromText(buyerPageUrl)` so resellers get one browser link and one `wa.me` tap-to-forward link, with no mixed marketplace URLs.
