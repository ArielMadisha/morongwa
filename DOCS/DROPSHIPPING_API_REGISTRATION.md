# Dropshipping API Registration Guide

**CJ Dropshipping • Spocket • EPROLO**

This guide walks you through registering for API access with each dropshipping supplier. Once you have credentials, add them to `.env` and configure the ExternalSupplier model in the admin panel.

---

## 1. CJ Dropshipping

### Registration
1. **Create account:** [Sign up at CJ Dropshipping](https://app.cjdropshipping.com/register.html)
2. **Developer portal:** [CJ API Documentation](https://developers.cjdropshipping.com/)
3. **API version:** Use **API V2.0** (recommended)

### Getting API credentials
- Log in to your CJ account
- Navigate to **Settings** → **API** or **Developer** section
- Generate or copy your **Access Token** (API key)
- Store in `.env`:
  ```
  CJ_API_KEY=your_access_token
  CJ_WEBHOOK_SECRET=your_webhook_secret  # for order status webhooks
  ```

### API capabilities
- Products: list, query details, variants, stock
- Orders: batch create, query, confirm
- Logistics: freight calculation, shipment tracking
- Authentication: access token + refresh

---

## 2. Spocket

### Registration
1. **Create account:** [Spocket registration](https://www.spocket.co/) (merchant/seller account)
2. **API access:** Available through Spocket dashboard after account approval

### Getting API credentials
- Log in to Spocket
- Go to **Settings** → **Integrations** or **API**
- Generate **API Key** and authentication tokens
- Store in `.env`:
  ```
  SPOCKET_API_KEY=your_api_key
  SPOCKET_WEBHOOK_SECRET=your_webhook_secret
  ```

### API capabilities
- Products, variants, inventory
- Orders (create, update)
- REST endpoints with Bearer token auth

### Note
Spocket focuses on curated suppliers; strong for South Africa and EU. Check their [Help Center](https://help.spocket.co/) for API availability.

---

## 3. EPROLO

### Registration
1. **Create account:** [EPROLO](https://www.eprolo.com/)
2. **API access:** Contact EPROLO support or check their dashboard for developer/API options

### Getting API credentials
- EPROLO may offer API access for enterprise or approved partners
- Check **Settings** → **API** or contact support
- Store in `.env`:
  ```
  EPROLO_API_KEY=your_api_key
  EPROLO_WEBHOOK_SECRET=your_webhook_secret
  ```

### Note
EPROLO API documentation may be provided upon request. Strengths: branding, private label, packaging.

---

## USD → ZAR Conversion (Dropship Imports)

CJ prices are in USD. Add to `.env`:

```
USD_ZAR_RATE=18.50
```

Update this regularly (typical range 18–19). Products are converted to ZAR on import. See `docs/TWO_TIER_PRICING_STEP_BY_STEP.md`.

---

## Environment Variables Summary

Add to `backend/.env`:

```env
# CJ Dropshipping
CJ_API_KEY=
CJ_WEBHOOK_SECRET=

# USD→ZAR for dropship imports (update regularly)
USD_ZAR_RATE=18.50

# Spocket
SPOCKET_API_KEY=
SPOCKET_WEBHOOK_SECRET=

# EPROLO
EPROLO_API_KEY=
EPROLO_WEBHOOK_SECRET=
```

---

## Next Steps After Registration

1. **Add ExternalSupplier records** in MongoDB (or via admin UI when built):
   - One record per source (cj, spocket, eprolo)
   - Store API key (encrypt in production)
   - Set `defaultMarkupPct` (e.g. 25)

2. **Run courier rules seed:**
   ```bash
   cd backend
   npx ts-node -r tsconfig-paths/register src/data/seeds/courierRules.ts
   ```

3. **Implement Phase 2** – supplier adapters (CJ first, then Spocket, EPROLO)
