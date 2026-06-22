# Admin site coverage matrix

This document maps major **public** Qwertymates surfaces to **admin** tools in the monorepo. It is the written companion to **`/admin/coverage`** on the web app.

For implementation details, search the codebase for the listed paths (e.g. `frontend/app/...`, `backend/src/routes/admin.ts`).

## Core feed & TV

| Public | Admin | Notes |
|--------|--------|--------|
| `/wall` | `/admin/tv` | Posts, comments, reports |
| `/morongwa-tv` | `/admin/tv` | Same moderation backlog |
| `/morongwa-tv/live/watch/[userId]` | `/admin/live` | Users with `isLive` (operational view) |

## Marketplace & commerce

| Public | Admin | Notes |
|--------|--------|--------|
| `/marketplace` | `/admin/products`, `/admin/suppliers`, `/admin/orders` | Catalog, seller verification, checkout orders |
| `/store` | `/admin/stores`, `/admin/reseller` | Store settings, wall stats |
| Product enquiry threads (in-app) | `/admin/product-enquiries` | Buyer–seller enquiries (title search) |

## Wallet, fees, agents

| Public | Admin | Notes |
|--------|--------|--------|
| `/wallet`, merchant flows | `/admin/money-metrics`, `/admin/pricing` | Treasury-style metrics, fees & FX |
| Merchant agents (ACBPay) | `/admin/merchant-agents` | Applications & status |
| Escrow / payouts (ops) | `/admin/escrows`, `/admin/payouts`, `/admin/worldpay-payouts` | As applicable to your deployment |

## Tasks, runners, messaging

| Public | Admin | Notes |
|--------|--------|--------|
| `/tasks` | `/admin/tasks` | Quotes, cancellations |
| Runner onboarding | `/admin/runners` | PDP & vehicle checks |
| `/messages` (DMs) | `/admin/messages` | Recent **DirectMessage** rows (oversight) |
| In-task messenger | *(no separate inbox)* | Context is the task; use `/admin/tasks` + support |

## Music & artists

| Public | Admin | Notes |
|--------|--------|--------|
| `/qwerty-music` | `/admin/music`, `/admin/artists` | Uploads, verifications |

## Support & compliance

| Public | Admin | Notes |
|--------|--------|--------|
| In-app support | `/admin/support` | Tickets |
| Static policy routes (e.g. `/about`, `/account-deletion`, `/child-safety-standards`) | Source in repo | Content changes are code/DOCS, not a single admin form |

## Advertising (see also `ADVERT_GUIDELINES.md`)

| Channel | Admin | Notes |
|---------|--------|--------|
| Sidebar / slot image ads | `/admin/adverts` | `random` and `promo` slots (`Advert` model) |
| Sponsored / placement API ads | `/admin/sponsored-video`, `/admin/advertising` | Web placements & packages |

## Gaps & philosophy

- **Everything** on the site does not need a bespoke admin page: some surfaces are intentionally static, delegated to existing moderation (e.g. TV for feed-like content), or handled via support tickets.
- Where user-generated or transactional data lacked visibility, we add **read-only oversight** endpoints under `/api/admin/...` and matching UI (e.g. recent DMs, live flags, product enquiries).

## Related backend routes (oversight)

- `GET /api/admin/messages/recent` — paginated direct messages, optional `q` (content regex).
- `GET /api/admin/live/broadcasters` — users with `isLive: true`.
- `GET /api/admin/product-enquiries` — paginated enquiries; optional `q` filters by **product title**.

All require **admin** or **superadmin** (see `authenticate` + `authorize` on the admin router).
