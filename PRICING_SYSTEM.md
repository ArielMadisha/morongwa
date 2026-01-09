# Morongwa Pricing System Documentation

## Overview

Morongwa uses a transparent, multi-country pricing system with fair fees across 6 African countries. The system is designed to be predictable for clients, fair to runners, and sustainable for the platform.

**Effective Date:** 08 Jan 2026  
**Supported Countries:** Botswana (BWP), Lesotho (LSL), Namibia (NAD), South Africa (ZAR), Zimbabwe (ZWL), Zambia (ZMW)

---

## Core Fees

### 1. **Commission (Success Fee): 15%**
- Deducted from task price at escrow release (after completion & review)
- Applied to gross task price only (not surcharges)
- Industry standard: TaskRabbit (25%), Uber (15-25%), Airbnb (~15%)
- Covers: platform operations, support, fraud prevention, payment processing

**Example:** Task price R250 → Commission = R37.50

### 2. **Booking Fee: R8 ZAR (converted to local currency)**
- Charged at escrow creation (when task posted)
- Covers: payment processing, customer support, platform overhead
- Similar to Uber's booking/service fee model
- Conversion: Booking fee in ZAR × FX rate = local currency amount

**Conversions:**
- South Africa: R8
- Lesotho/Namibia: LSL8 / NAD8
- Botswana: P5.6
- Zimbabwe: ZWL240
- Zambia: ZK10.4

### 3. **Dynamic Surcharges** (optional per task, shown before confirmation)

#### Distance Surcharge
- Charged only for distance **beyond 5 km base radius**
- Rate: R10/km in ZAR, converted to local currency
- Formula: `(actual_distance - 5) × per_km_rate`

**Example:** 12 km distance → (12-5) × R10 = R70

#### Heavy Item Surcharge
- Applies to items **>10 kg**
- Amount: R25 ZAR (converted to local currency)
- Accounts for time, effort, risk of heavy handling

#### Peak Hours Surcharge
- Applies during high-demand windows
- Rate: **+10% of task price**
- Ensures availability during busy periods
- Incentivizes runners to accept time-critical tasks

**Example:** R250 task × 10% = R25 surcharge

#### Urgency Surcharge
- Applies to tasks with deadline **<2 hours**
- Amount: R20 ZAR (converted to local currency)
- Compensates runners for rush availability

---

## Escrow & Payout Flow

### Task Creation (Escrow Hold)
```
Client sends → Task Price + Booking Fee + Surcharges
                    ↓
            Held in escrow until completion
```

### Task Completion & Review
```
Runner completes task → Client reviews → Escrow releases

Runner receives:
    Task Price + Surcharges - 15% Commission
    = Net amount transferred to runner's wallet

Platform receives:
    Booking Fee + Commission
    = Revenue for operations
```

### Withdrawal
Runners withdraw from wallet via:
- **Peach Payments RTC** (South Africa)
- **Stitch Payouts** (All countries)
- **Paystack Transfers** (All countries)
- Bank account, mobile money (where available)

---

## Multi-Country Configuration

All fees are stored in **ZAR base rates** and converted using FX multipliers:

```typescript
// Base fees in ZAR
Booking: R8
Per-KM: R10
Heavy: R25
Urgency: R20

// Applied with FX conversion
Local Amount = Base Amount × FX_per_ZAR
```

**Current FX Rates** (as of 08 Jan 2026):

| Country | Currency | FX_per_ZAR | Booking Fee | Per KM | Heavy | Urgency |
|---------|----------|-----------|-------------|--------|-------|---------|
| Botswana | BWP | 0.70 | P5.6 | P7.0 | P17.5 | P14.0 |
| Lesotho | LSL | 1.00 | LSL8.0 | LSL10.0 | LSL25.0 | LSL20.0 |
| Namibia | NAD | 1.00 | NAD8.0 | NAD10.0 | NAD25.0 | NAD20.0 |
| South Africa | ZAR | 1.00 | R8.0 | R10.0 | R25.0 | R20.0 |
| Zimbabwe | ZWL | 30.00 | ZWL240.0 | ZWL300.0 | ZWL750.0 | ZWL600.0 |
| Zambia | ZMW | 1.30 | ZK10.4 | ZK13.0 | ZK32.5 | ZK26.0 |

---

## Pricing Examples

### South Africa (ZAR)
**Scenario:** Task price R250, 12 km distance, 8 kg, peak hours, urgent

```
Task price:         R250.00
Booking fee:        R8.00
Distance (7 km):    R70.00
Peak surcharge:     R25.00
Urgency surcharge:  R20.00
─────────────────────────
Client Total:       R373.00

Commission (15%):   -R37.50
─────────────────────────
Runner Net:         R327.50

Platform Revenue:   R45.50 (R8 + R37.50)
```

### Zimbabwe (ZWL)
**Same scenario, converted:**

```
Task price:         ZWL 7,500.00
Booking fee:        ZWL 240.00
Distance (7 km):    ZWL 2,100.00
Peak surcharge:     ZWL 750.00
Urgency surcharge:  ZWL 600.00
──────────────────────────────
Client Total:       ZWL 11,190.00

Commission (15%):   -ZWL 1,125.00
──────────────────────────────
Runner Net:         ZWL 9,825.00

Platform Revenue:   ZWL 1,365.00
```

---

## API Endpoints

### 1. Calculate Quote
```
POST /api/pricing/quote

Body:
{
  "currency": "ZAR",              // BWP, LSL, NAD, ZAR, ZWL, ZMW
  "taskPrice": 250,
  "distanceKm": 12,
  "weightKg": 8,
  "isPeak": true,
  "isUrgent": true
}

Response:
{
  "success": true,
  "data": {
    "currency": "ZAR",
    "country": "South Africa",
    "taskPrice": 250,
    "bookingFee": 8,
    "distanceSurcharge": 70,
    "heavySurcharge": 0,
    "peakSurcharge": 25,
    "urgencySurcharge": 20,
    "totalSurcharges": 115,
    "commission": 37.50,
    "clientTotal": 373,
    "runnerNet": 327.50,
    "platformRevenue": 45.50
  }
}
```

### 2. Get All Config
```
GET /api/pricing/config

Returns pricing config for all 6 countries
```

### 3. Get Country Config
```
GET /api/pricing/config/:currency

Example: /api/pricing/config/ZAR

Returns:
{
  "country": "South Africa",
  "currency": "ZAR",
  "fxPerZAR": 1.0,
  "commissionPct": 0.15,
  "peakMultiplier": 0.1,
  "baseRadiusKm": 5,
  "bookingFeeLocal": 8,
  "perKmRateLocal": 10,
  "heavySurchargeLocal": 25,
  "urgencyFeeLocal": 20
}
```

### 4. Update Config (Admin)
```
PUT /api/pricing/config/:currency

Headers:
Authorization: Bearer <admin_token>

Body:
{
  "fxPerZAR": 1.05,
  "bookingFeeLocal": 8.50,
  "peakMultiplier": 0.12
}

Only admins can update pricing
```

### 5. Get Examples
```
POST /api/pricing/examples

Returns sample calculations for all 6 countries
with fixed example (R250 task, 12 km, peak, urgent)
```

---

## Frontend Integration

### Public Pricing Page
**Route:** `/pricing`

Live calculator where users can:
- Select country
- Adjust task price, distance, weight
- Toggle peak hours / urgent
- See real-time breakdown
- Understand fee structure

**Components:**
- `PricingPage` – Full page with hero, calculator, FAQ
- `QuoteCalculator` – Reusable component (full & compact modes)

### Admin Pricing Config
**Route:** `/admin/pricing` (admin only)

Allows admins to:
- View current pricing for all countries
- Edit FX rates, fees, multipliers
- Save changes (updates in-memory + persists in future DB)
- See validation feedback

**Components:**
- `PricingConfigPage` – Full admin dashboard

### Integration in Task Creation
Use the `QuoteCalculator` component with `compact={true}`:

```tsx
import { QuoteCalculator } from '@/components/QuoteCalculator';

// In your task creation form:
<QuoteCalculator 
  currency={userCountry} 
  onQuoteChange={(quote) => setCalculatedPrice(quote.clientTotal)}
  compact={true}
/>
```

---

## Backend Architecture

### Files

1. **`src/config/fees.config.ts`**
   - Pricing constants for all countries
   - FX rates, fee amounts, multipliers
   - Type definitions (Country, CountryConfig)

2. **`src/services/pricing.ts`**
   - Quote calculation logic
   - Validation functions
   - Currency formatting helpers
   - `calculateQuote(params: QuoteParams): QuoteBreakdown`

3. **`src/routes/pricing.ts`**
   - Express API routes
   - `/api/pricing/quote` – calculate
   - `/api/pricing/config` – get config
   - `/api/pricing/config/:currency` – get/update country config
   - `/api/pricing/examples` – example calculations

### Quote Calculation Flow

```
User inputs → Validate → Convert to local currency → 
Apply surcharges → Calculate commission → 
Return breakdown with client total & runner net
```

---

## Future Enhancements

### Database Persistence
Currently pricing config is in-memory. To persist:
1. Create `PricingConfig` MongoDB schema
2. Update `PUT /api/pricing/config/:currency` to save to DB
3. Load config from DB on server startup

### Enterprise Subscription
**Feature:** Monthly subscription for business accounts
- Fee: R750/month per business (converted to local currency)
- Benefits: reduced 12% commission, priority support, API access
- Implementation: add `subscriptionTier` to User model

### Dynamic Peak Windows
Currently "peak" is boolean. Future: schedule-based
- Admin configures peak windows per country/day
- System calculates surge automatically based on current time
- API: `GET /api/pricing/peak-windows`

### Payment Methods
Integrate with local payment providers:
- Peach Payments (ZA)
- Stitch (Multi-country)
- Paystack (Multi-country)
- Local mobile money (M-Pesa, etc.)

### Analytics Dashboard
- Revenue trends by country
- Commission calculations
- Peak hour patterns
- Runner earnings distribution

---

## Compliance & Legal

### POPIA (South Africa)
- Personal & bank details require lawful processing
- Privacy policy covers data handling
- User consent for payment processing documented

### Contractor Classification
- Runners are independent contractors (not employees)
- Keep flag for PAYE withholding if reclassification needed
- Terms of Service clarify contractor status

### Currency & FX
- Rates updated regularly (at least monthly)
- Changes displayed to users before confirmation
- Transparent FX applied at settlement

---

## Testing Checklist

- [ ] Calculate quote with various distances
- [ ] Verify surcharge calculations match examples
- [ ] Test all 6 countries (verify FX conversion)
- [ ] Admin: update FX rate and verify impact
- [ ] Admin: update commission % and verify impact
- [ ] Integration: use calculator in task creation
- [ ] Pricing page: responsive on mobile
- [ ] Error handling: invalid inputs rejected with feedback
- [ ] Escrow: booking fee deducted at creation
- [ ] Payouts: runner net calculated correctly post-commission

---

## Support & Questions

For pricing policy questions, see `/pricing` page.  
For technical integration, check API endpoints above.  
For admin configuration, go to `/admin/pricing`.
