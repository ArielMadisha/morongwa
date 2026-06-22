# Advertising guidelines (Qwertymates)

Operational reference for **what** we run on the platform, **where** it appears, and **what** we accept from advertisers. For admin URLs, use `/admin/adverts`, `/admin/sponsored-video`, and `/admin/advertising`.

## 1. Inventory (channels)

### A. Slot adverts (`Advert` model)

- **Admin:** `/admin/adverts`
- **Slots:**
  - **`random`** — top square-style rotation in the web sidebar (`AdvertSlot` / related layout).
  - **`promo`** — secondary / promotional placement (see model: “bottom remainder”).
- **Creative:** image URL + optional external `linkUrl` and optional tied `productId` for marketplace deep links.
- **Scheduling:** `active`, optional `startDate` / `endDate`, `order` for priority.

### B. Sponsored / performance ads (web API)

- **Components:** e.g. `WebAdPlacement` requests creatives by **placement key** and **audience** (`generic`, `wallet`, `runner`, `merchant`, `shopper`).
- **Admin:** `/admin/sponsored-video` (creatives, advertisers, revenue views) and `/admin/advertising` (rate card / web packages copy).
- **Tracking:** impressions and clicks are recorded server-side (`advertsAPI.trackImpression` / `trackClick` on the frontend).

### C. WhatsApp & other surfaces

- Video or static assets deployed for WhatsApp flows may live under `frontend/public/wa-adverts/` (or are configured via backend/WhatsApp tooling).
- Treat these like any other production asset: **no misleading claims**, readable text at handset resolution, and **don’t promise financial returns**.

## 2. Creative standards

### Image slot adverts (`/admin/adverts`)

- **Format:** clear, readable at small sizes; prefer **square** or layout-safe crops that match the sidebar tile.
- **File hosting:** stable HTTPS URLs (`imageUrl`). Prefer same-origin uploads under `/uploads/...` when possible so TLS and caching stay consistent.
- **Copy on image:** minimal text; if text is heavy, supply a **`linkUrl`** to a compliant landing page.
- **Product promos:** when `productId` is set, ensure price and availability on the product page match the creative.

### Video (sponsored placements / WA)

- **Length:** short hooks (few seconds to ~30s) unless a placement explicitly supports longer reads.
- **Safe area:** keep logos and legal within the centre; many players crop on mobile.
- **Sound:** assume **sound off**; subtitles or on-screen keywords help.
- **File size:** compress for mobile; failures here translate to skipped impressions.

### Landing pages (`linkUrl` / `ctaUrl`)

- Must match the product or service in the ad.
- **HTTPS** required for production.
- No interstitial that blocks the claimed offer (e.g. unrelated surveys or downloads).
- Privacy: if you collect data, link to the site privacy policy and obtain consent where required.

## 3. Prohibited & restricted content

Reject or pause creatives that:

- Violate law in target markets (fraud, illegal goods, deceptive financial schemes).
- Discriminate or attack protected classes; incite violence; glorify harm.
- Contain malware, phishing, cloaking, or **misleading impersonation** of Qwertymates / banks / wallets.
- Show **unchecked health claims**, “guaranteed” investment returns, or payday lending without proper licensing disclosures.
- Use **non-consented** likenesses or copyrighted media without clearance.

Restricted (require extra scrutiny and sometimes legal sign-off):

- Alcohol, vaping, gambling, political advocacy, cryptocurrencies, herbal supplements.

## 4. Operational checklist (before activating)

1. **Truth:** headline, visuals, pricing, and CTA aligned.
2. **Destination:** landing URL loads, mobile-friendly, not on a malware list.
3. **Brand:** advertiser has rights to logos and trademarks shown.
4. **Dates:** `startDate` / `endDate` and `active` reflect the paying flight.
5. **Measurement:** placement key / slot documented so support can trace reports.

## 5. Roles & escalation

- **Moderation disputes:** escalate to operations + legal depending on geography and category.
- **Platform take-down:** if a creative is flagged by users or partners, **deactivate** the advert in admin and capture screenshots + URLs in the support ticket trail.

## 6. References in code

| Area | Typical files |
|------|----------------|
| Slot adverts model | `backend/src/data/models/Advert.ts`, `frontend/components/AdvertSlot.tsx` |
| Sponsored placements | `frontend/components/WebAdPlacement.tsx`, `frontend/lib/api.ts` (`advertsAPI`) |
| Admin API client | `frontend/lib/api.ts` (`adminAPI.getAdverts`, sponsored video methods) |

Update this document when you add new **placement keys**, **slots**, or **policies** so support and admins stay aligned.
