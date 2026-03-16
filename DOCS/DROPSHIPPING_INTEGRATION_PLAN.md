# Qwertymates Dropshipping Integration Plan

**CJ Dropshipping • Spocket • EPROLO**

**Date:** February 2026  
**Status:** Plan of Action

---

## Context: What Qwertymates Is

Qwertymates is a powerful all-in-one digital ecosystem combining commerce, services, payments, media, communication, and AI. **QwertyHub** is the marketplace and reselling engine: suppliers upload products; users browse and resell instantly with **zero inventory risk**. When a user starts reselling, **MyStore** is created automatically. Products are fulfilled directly by suppliers. This plan extends that model by integrating external dropshipping suppliers (CJ, Spocket, EPROLO) so Qwertymates can offer a broader catalog while keeping the same inventory-free, reseller-first experience.

---

## Executive Summary

Qwertymates is an inventory-free dropshipping platform: users resell products from **QwertyHub** (click Resale → **MyStore** created automatically). This plan integrates **CJ Dropshipping**, **Spocket**, and **EPROLO** as external suppliers so that:

1. **Qwertymates** dropships from CJ/Spocket/EPROLO (no stock, no logistics)
2. **Users** dropship from Qwertymates (add products to MyStore, set their own prices)
3. **Buyer** places order → Qwertymates forwards to supplier API → supplier fulfills
4. **Coverage:** All countries supplied by CJ, Spocket, EPROLO (Southern Africa, EU, US, etc.)

### ⚠️ Mandatory: Qwertymates Markup on Every Product

**Every product that users dropship must already have a Qwertymates markup applied.** No product appears in QwertyHub without the platform markup. The flow is:

- **Supplier cost** (CJ/Spocket/EPROLO) + **Qwertymates markup** = **Base price** (what resellers see in QwertyHub)
- **Base price** + **Reseller markup** = **Selling price** (what buyers pay)

Qwertymates earns its margin on every sale before the reseller adds theirs.

---

## Current Qwertymates Flow (Baseline)

| Component | Current State |
|-----------|---------------|
| **Supplier** | Verified users (company/individual) add products manually |
| **Product** | `supplierId` → Supplier, `stock`, `allowResell` |
| **Reseller** | Adds `allowResell` products to ResellerWall, sets 3–7% commission |
| **Order** | Buyer → Cart → Checkout → Order → Supplier fulfills (pickup/ship) |
| **Stock** | Tracked per product; out-of-stock blocks purchase |

---

## Target Architecture

```
[ Buyer ] → [ Qwertymates Checkout ] → [ Order Service ]
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
            [ CJ Adapter ]            [ Spocket Adapter ]        [ EPROLO Adapter ]
                    │                         │                         │
                    └─────────────────────────┼─────────────────────────┘
                                              ▼
                                    [ CJ / Spocket / EPROLO APIs ]
                                              │
                                              ▼
                                    [ Supplier Fulfills → Courier ]
```

---

## Phase 1: Data Models & Supplier Abstraction

### 1.1 External Supplier Model

```typescript
// ExternalSupplier
{
  source: "cj" | "spocket" | "eprolo";
  name: string;
  apiKey: string;        // encrypted
  apiSecret?: string;    // optional
  webhookSecret?: string;
  status: "active" | "paused" | "disabled";
  defaultMarkupPct?: number;  // platform markup
  createdAt, updatedAt
}
```

### 1.2 Product Model Extensions

```typescript
// Add to Product (for external/dropshipped products)
{
  supplierSource: "internal" | "cj" | "spocket" | "eprolo";  // default: "internal"
  externalSupplierId?: ObjectId;   // ref ExternalSupplier
  externalProductId?: string;      // supplier's product ID
  externalData?: object;          // raw variant/shipping info from supplier
  supplierCost?: number;           // raw cost from CJ/Spocket/EPROLO (for external only)
  qwertymatesMarkupPct?: number;   // platform markup applied (e.g. 25)
  // price = supplierCost * (1 + qwertymatesMarkupPct/100) — Qwertymates markup applied before listing
  // When supplierSource !== "internal": stock ignored, outOfStock from supplier API
}
```

### 1.3 Courier Rules Model

```typescript
// CourierRule
{
  country: string;           // ISO 3166-1 alpha-2 (e.g. "ZA", "EU")
  region?: string;          // "Southern Africa", "EU"
  preferredSupplier: "cj" | "spocket" | "eprolo";
  courier: string;          // "DHL", "Aramex", "CJPacket", etc.
  shippingMethod: string;   // "Standard", "Express"
  deliveryDays: number;
  active: boolean;
}
```

### 1.4 Order Model Extensions

```typescript
// Add to Order
{
  externalOrderId?: string;     // supplier's order ID
  externalSupplierId?: ObjectId;
  delivery: {
    ...existing,
    trackingUrl?: string;
    carrier?: string;
  }
}
```

### 1.5 Markup Config (Qwertymates Markup – Mandatory)

**Rule:** Every dropshipped product must have a Qwertymates markup. Applied at import; stored on product.

```typescript
// MarkupConfig (platform-level, per supplier or per category)
{
  type: "percentage" | "fixed" | "tiered";
  value?: number;           // e.g. 25 for 25%
  tiers?: [{ minPrice, maxPrice, markupPct }];
  supplierSource?: "cj" | "spocket" | "eprolo";
}

// Product stores (for external products):
{
  supplierCost: number;      // raw cost from CJ/Spocket/EPROLO
  qwertymatesMarkupPct: number;  // e.g. 25
  price: number;            // supplierCost * (1 + markup/100) = base price for resellers
}
```

---

## Phase 2: Supplier API Adapters

### 2.1 Unified Supplier Interface

```typescript
interface SupplierAdapter {
  getProduct(id: string): Promise<SupplierProduct>;
  searchProducts(query: string, filters?: object): Promise<SupplierProduct[]>;
  createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResponse>;
  getTracking(orderId: string): Promise<TrackingInfo>;
}
```

### 2.2 Product Import Service

- **CJ API:** Fetch catalog, map to Qwertymates Product schema
- **Spocket API:** Fetch products, map to schema
- **EPROLO API:** Fetch products, map to schema
- **Sync:** Cron job or manual import; cache in MongoDB
- **Apply Qwertymates markup (mandatory):** Before saving, compute `price = supplierCost × (1 + markupPct/100)`. Store both `supplierCost` and `qwertymatesMarkupPct`. No product is listed without this markup.

### 2.3 Order Forwarding

When order is paid:
1. Resolve each product's `supplierSource` and `externalSupplierId`
2. Group items by external supplier
3. For each supplier: call `createOrder` with buyer address, items, courier
4. Store `externalOrderId` on Order
5. Webhook updates status/tracking

---

## Phase 3: Country & Courier Routing

### 3.1 Courier Rules Table (Seed Data)

| Region | Country | Supplier | Courier | Delivery Days |
|--------|---------|----------|---------|---------------|
| Southern Africa | South Africa | Spocket | Aramex | 2–7 |
| Southern Africa | Zambia | CJ | DHL | 10 |
| Southern Africa | Botswana | CJ | DHL | 9 |
| Southern Africa | Namibia | CJ | Yanwen | 8 |
| Southern Africa | Lesotho | Spocket | The Courier Guy | 3 |
| Southern Africa | Zimbabwe | CJ | DHL | 12 |
| Southern Africa | Mozambique | CJ | DHL | 11 |
| EU | Germany | Spocket | DHL Express | 3 |
| EU | France | Spocket | La Poste | 3 |
| EU | Italy | EPROLO | DHL Express | 4 |
| EU | Spain | Spocket | Correos | 3 |
| ... | (all 27 EU) | ... | ... | ... |

### 3.2 Order Flow with Country

1. Frontend sends `deliveryCountry` (ISO code) with checkout
2. Backend looks up `CourierRule` for that country
3. When calling supplier API, pass preferred courier/shipping method

---

## Phase 4: Reseller & Pricing

### 4.1 Mandatory Qwertymates Markup (Applied First)

**Every product in QwertyHub from CJ/Spocket/EPROLO already has a Qwertymates markup.**

| Step | Who | Action |
|------|-----|--------|
| 1 | Supplier | Product cost = $10 |
| 2 | **Qwertymates** | Apply markup (e.g. 25%) → Base price = $12.50 |
| 3 | Reseller | Sees base price $12.50, adds their markup → Selling price = $15 |
| 4 | Buyer | Pays $15 |

Qwertymates earns $2.50; reseller earns $2.50. No product is listed without step 2.

### 4.2 Reseller Flow

- User browses QwertyHub (all products already have Qwertymates markup in the price)
- Clicks "Resale" → product added to ResellerWall
- Reseller sets **their price** (must be ≥ base price; base price = supplier cost + Qwertymates markup)
- Store created automatically when first product added

### 4.3 Pricing Validation

- **Base price** = supplier cost × (1 + Qwertymates markup %). Stored on Product.
- **Reseller price** must be ≥ base price.
- **At checkout:** Platform markup already in base; reseller commission calculated on (reseller price − base price) or their %.

### 4.4 No Stock Handling

- `supplierSource !== "internal"` → no stock check
- Order goes to supplier API; supplier confirms availability
- If supplier rejects: refund, notify buyer

---

## Phase 5: Webhooks & Tracking

### 5.1 Webhook Endpoints

- `POST /api/webhooks/cj` – order status, tracking
- `POST /api/webhooks/spocket` – order updates
- `POST /api/webhooks/eprolo` – order updates

### 5.2 Order Status Sync

- Map supplier statuses → Qwertymates: `processing`, `shipped`, `delivered`
- Update `Order.delivery.trackingNo`, `trackingUrl`, `carrier`
- Notify buyer via email/in-app

---

## Phase 6: Country Coverage

### 6.1 Target Countries (from CJ, Spocket, EPROLO)

| Region | Countries |
|--------|-----------|
| **Southern Africa** | South Africa, Zambia, Botswana, Namibia, Lesotho, Zimbabwe, Mozambique |
| **EU (27)** | Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden |
| **Other** | US, UK, Canada, Australia, etc. (as per supplier coverage) |

### 6.2 Implementation

- Seed `CourierRule` for all supported countries
- Add `availableCountries` to Product (from supplier API)
- Filter products by buyer country in QwertyHub

---

## Implementation Order

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **1. Data Models** | 1–2 days | ExternalSupplier, CourierRule, Product/Order extensions, MarkupConfig |
| **2. CJ Adapter** | 3–5 days | Product import, order placement, webhook handler |
| **3. Spocket Adapter** | 2–3 days | Same as CJ |
| **4. EPROLO Adapter** | 2–3 days | Same as CJ |
| **5. Courier Rules** | 1 day | Seed + lookup logic |
| **6. Checkout Integration** | 2–3 days | Route external orders to supplier APIs |
| **7. Reseller UI** | 1–2 days | Allow resellers to add external products, set prices |
| **8. Admin UI** | 2–3 days | Import products, manage suppliers, view orders |

**Total estimate:** 4–6 weeks

---

## Environment Variables

```env
# CJ Dropshipping
CJ_API_KEY=...
CJ_WEBHOOK_SECRET=...

# Spocket
SPOCKET_API_KEY=...
SPOCKET_WEBHOOK_SECRET=...

# EPROLO
EPROLO_API_KEY=...
EPROLO_WEBHOOK_SECRET=...
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/data/models/ExternalSupplier.ts` | CJ/Spocket/EPROLO config |
| `backend/src/data/models/CourierRule.ts` | Country-based routing |
| `backend/src/data/models/MarkupConfig.ts` | Markup rules |
| `backend/src/services/suppliers/cjAdapter.ts` | CJ API client |
| `backend/src/services/suppliers/spocketAdapter.ts` | Spocket API client |
| `backend/src/services/suppliers/eproloAdapter.ts` | EPROLO API client |
| `backend/src/services/suppliers/supplierService.ts` | Unified interface |
| `backend/src/services/productImportService.ts` | Import from supplier APIs |
| `backend/src/services/orderForwardingService.ts` | Forward orders to suppliers |
| `backend/src/routes/webhooks.ts` | CJ/Spocket/EPROLO webhooks |
| `backend/src/data/seeds/courierRules.ts` | Full country + EU seed |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| API rate limits | Rate limiting, caching, batch imports |
| Supplier API changes | Adapter pattern, versioned endpoints |
| Currency (ZAR vs USD) | Store both; convert at checkout |
| Customs/duties | Add to markup or shipping; display to buyer |
| Order rejection | Retry logic; notify buyer; refund |

---

## Next Steps

1. ~~**Register** for CJ, Spocket, EPROLO API access~~ → See [DROPSHIPPING_API_REGISTRATION.md](./DROPSHIPPING_API_REGISTRATION.md)
2. ~~**Implement Phase 1** – data models and migrations~~ ✅ Done
3. **Run migration** for existing products: `npx ts-node scripts/migrateProductSupplierSource.ts`
4. **Seed courier rules:** `npx ts-node scripts/seedCourierRules.ts`
5. **Implement CJ adapter first** – full flow (import → order → webhook)
6. **Extend** to Spocket and EPROLO
7. **Test** end-to-end with sandbox/test accounts

---

## Appendix A: Supplier Comparison

| Supplier | Catalog | Strengths | Best For |
|----------|---------|-----------|----------|
| **CJ** | Very broad | API, global shipping, warehouses (CN/US/EU) | Scalability, variety |
| **Spocket** | Curated | Local SA suppliers, US/EU, faster delivery | South Africa, quality |
| **EPROLO** | Broad | Branding, private label, packaging | Brand building |

---

## Appendix B: Full Courier Rules Seed (Southern Africa + EU)

```json
[
  {"country": "ZA", "region": "Southern Africa", "preferredSupplier": "spocket", "courier": "Aramex", "shippingMethod": "Local Express", "deliveryDays": 5},
  {"country": "ZM", "region": "Southern Africa", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "CJPacket", "deliveryDays": 10},
  {"country": "BW", "region": "Southern Africa", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "CJPacket", "deliveryDays": 9},
  {"country": "NA", "region": "Southern Africa", "preferredSupplier": "cj", "courier": "Yanwen", "shippingMethod": "Standard", "deliveryDays": 8},
  {"country": "LS", "region": "Southern Africa", "preferredSupplier": "spocket", "courier": "The Courier Guy", "shippingMethod": "Local Express", "deliveryDays": 3},
  {"country": "ZW", "region": "Southern Africa", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "CJPacket", "deliveryDays": 12},
  {"country": "MZ", "region": "Southern Africa", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "CJPacket", "deliveryDays": 11},
  {"country": "DE", "region": "EU", "preferredSupplier": "spocket", "courier": "DHL Express", "shippingMethod": "EU Warehouse", "deliveryDays": 3},
  {"country": "FR", "region": "EU", "preferredSupplier": "spocket", "courier": "La Poste", "shippingMethod": "EU Warehouse", "deliveryDays": 3},
  {"country": "IT", "region": "EU", "preferredSupplier": "eprolo", "courier": "DHL Express", "shippingMethod": "EU Warehouse", "deliveryDays": 4},
  {"country": "ES", "region": "EU", "preferredSupplier": "spocket", "courier": "Correos", "shippingMethod": "EU Warehouse", "deliveryDays": 3},
  {"country": "NL", "region": "EU", "preferredSupplier": "spocket", "courier": "PostNL", "shippingMethod": "EU Warehouse", "deliveryDays": 3},
  {"country": "BE", "region": "EU", "preferredSupplier": "spocket", "courier": "bpost", "shippingMethod": "EU Warehouse", "deliveryDays": 3},
  {"country": "AT", "region": "EU", "preferredSupplier": "spocket", "courier": "Austrian Post", "shippingMethod": "EU Warehouse", "deliveryDays": 4},
  {"country": "PL", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "EU Warehouse", "deliveryDays": 5},
  {"country": "PT", "region": "EU", "preferredSupplier": "spocket", "courier": "CTT", "shippingMethod": "EU Warehouse", "deliveryDays": 4},
  {"country": "SE", "region": "EU", "preferredSupplier": "spocket", "courier": "PostNord", "shippingMethod": "EU Warehouse", "deliveryDays": 4},
  {"country": "IE", "region": "EU", "preferredSupplier": "spocket", "courier": "An Post", "shippingMethod": "EU Warehouse", "deliveryDays": 4},
  {"country": "GR", "region": "EU", "preferredSupplier": "cj", "courier": "ACS", "shippingMethod": "Standard", "deliveryDays": 6},
  {"country": "RO", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 7},
  {"country": "CZ", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "EU Warehouse", "deliveryDays": 5},
  {"country": "HU", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 6},
  {"country": "BG", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 7},
  {"country": "HR", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 6},
  {"country": "SK", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "EU Warehouse", "deliveryDays": 5},
  {"country": "SI", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "EU Warehouse", "deliveryDays": 5},
  {"country": "DK", "region": "EU", "preferredSupplier": "spocket", "courier": "PostNord", "shippingMethod": "EU Warehouse", "deliveryDays": 4},
  {"country": "FI", "region": "EU", "preferredSupplier": "spocket", "courier": "Posti", "shippingMethod": "EU Warehouse", "deliveryDays": 5},
  {"country": "EE", "region": "EU", "preferredSupplier": "cj", "courier": "Omniva", "shippingMethod": "Standard", "deliveryDays": 6},
  {"country": "LV", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 6},
  {"country": "LT", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 6},
  {"country": "CY", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 7},
  {"country": "MT", "region": "EU", "preferredSupplier": "cj", "courier": "DHL", "shippingMethod": "Standard", "deliveryDays": 7},
  {"country": "LU", "region": "EU", "preferredSupplier": "spocket", "courier": "La Poste", "shippingMethod": "EU Warehouse", "deliveryDays": 3}
]
```

---

## Appendix C: Order Flow (Detailed)

```
1. Buyer adds product to cart (from reseller store or QwertyHub)
2. Checkout: buyer enters delivery address + country
3. Backend: get quote (product price + reseller markup + shipping from CourierRule)
4. Buyer pays (wallet/card)
5. Order created (status: paid)
6. OrderForwardingService:
   a. For each product: if supplierSource in [cj,spocket,eprolo]
   b. Group items by external supplier
   c. Look up CourierRule for deliveryCountry
   d. Call supplier API: createOrder(items, address, courier)
   e. Store externalOrderId on Order
7. Order status → processing
8. Webhook from supplier: shipped (tracking) → Order.delivery updated
9. Webhook: delivered → Order status → delivered
10. Payout (every sale):
    - **Qwertymates:** base price − supplier cost = platform markup (e.g. $12.50 − $10 = $2.50)
    - **Reseller:** selling price − base price = their margin (e.g. $15 − $12.50 = $2.50)
    - Qwertymates markup is built into base price; reseller margin is on top
```
