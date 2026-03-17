# 2-Tier Pricing – Step-by-Step (CJ Import)

## Overview

When you import a product from CJ Dropshipping, the system applies **2-tier pricing** in **USD**. All admin prices stay in USD. The frontend converts to the user's local currency (ZAR, EUR, etc.) based on their country.

---

## Step 1: Supplier Cost (C) – from CJ in USD

CJ returns product cost in **US Dollars** (e.g. $4.36).

- **Source:** CJ API `nowPrice` / `discountPrice` / `sellPrice`
- **Stored as:** `supplierCost` (in USD)

---

## Step 2: Platform Price (P) – what resellers pay (USD)

```
P = supplierCostUSD × platformMultiplier
```

- **platformMultiplier** depends on category (e.g. Fashion = 1.45, Beauty = 1.55)
- **Stored as:** `price` (in USD)
- **Currency:** `USD`

---

## Step 3: Reseller Pricing – what end customers pay (USD)

- **Recommended reseller price:** `R = P ÷ (1 − resellerMargin)`
- **Min resale price (MAP):** `R_min = P ÷ (1 − resellerMinMargin)`
- **Stored as:** `recommendedResellerPrice`, `minResalePrice`, `resellerMarginPct` (all USD)

---

## Step 4: Frontend – convert to user's currency

- User selects country (footer: ZAR, EUR, USD, etc.)
- FX rates fetched from ExchangeRate-API (automated, no key)
- Prices displayed in local currency (e.g. ZAR for South Africa, EUR for EU)

---

## Example (Hoodie @ $4.36)

| Step | Value | Notes |
|------|-------|-------|
| 1. Supplier cost (USD) | $4.36 | From CJ |
| 2. Platform price (Fashion 1.45×) | $6.32 | Resellers pay this (USD) |
| 3. Recommended reseller price (45% margin) | $11.49 | $6.32 ÷ (1 − 0.45) |
| 4. Display in ZAR (rate ~18.5) | R116.92 | Frontend converts |

---

## Configuration

### Admin

All admin prices (supplier cost, platform price, margins) are in **USD**.

### Frontend FX

- **Automated:** `GET /api/fx/rates` fetches from [ExchangeRate-API](https://www.exchangerate-api.com) (open access, no key)
- **Country selector:** Footer – user picks country; prices convert to that currency
- **EU countries:** Use EUR

### Category multipliers

See `backend/src/config/twoTierPricing.ts` – Fashion, Beauty, Home, Electronics, etc.
