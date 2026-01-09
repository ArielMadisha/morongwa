# Morongwa Escrow & Payout System (Complete Implementation)

## Overview

This document describes the complete escrow flow for Morongwa's marketplace, integrating PayGate (DPO) for collections and FNB Integration Channel for automated payouts. The system maintains an immutable ledger of all financial transactions, enforces compliance with CPA, ECTA, and POPIA, and supports multi-country operations (ZA, BW, LS, NA, ZW, ZM).

## Architecture

### Components

1. **Payment Collection:** PayGate (DPO) hosted checkout or server-to-server API
2. **Merchant Bank:** FNB merchant account (custodian of client funds)
3. **Escrow Ledger:** MongoDB LedgerEntry collection (immutable double-entry accounting)
4. **Escrow Model:** MongoDB Escrow collection (state management)
5. **FNB Integration Service:** OAuth + EFT Payment API + Transaction History API
6. **Fee Engine:** Dynamic calculations (commission, booking fee, surcharges)
7. **Payout Service:** Release logic, retry queues, reconciliation

### System Actors

- **Client:** Posts tasks, funds via PayGate, approves completion
- **Runner:** Accepts tasks, completes work, receives payout
- **Morongwa Platform:** Holds escrow, manages fees, coordinates payouts
- **PayGate (DPO):** Payment collection and settlement to FNB
- **FNB:** Merchant bank, EFT payment rails, transaction history

## Data Models

### Escrow Model

```typescript
interface IEscrow {
  task: ObjectId;
  client: ObjectId;
  runner: ObjectId;
  currency: "ZAR" | "BWP" | "LSL" | "NAD" | "ZWL" | "ZMW";
  
  // Financial state
  taskPrice: number;
  fees: {
    bookingFee: number;        // R8 (non-refundable)
    commission: number;        // 15% of taskPrice
    distanceSurcharge: number; // R10/km
    peakSurcharge: number;     // +10% of taskPrice
    weightSurcharge: number;   // R25 (>10kg)
    urgencySurcharge: number;  // R20 (<2h)
    total: number;             // sum of all surcharges
  };
  totalHeld: number;           // taskPrice + bookingFee (initial escrow)
  runnersNet: number;          // taskPrice + surcharges - commission (payout amount)
  
  // Status tracking
  status: "pending" | "held" | "released" | "refunded" | "disputed";
  paymentStatus: "pending" | "settled" | "failed";
  fnbStatus: "pending" | "submitted" | "processing" | "success" | "failed" | "rejected";
  
  // Payment references
  paymentReference: string;    // from PayGate
  fnbInstructionId: string;    // from FNB EFT API
  fnbRetries: number;          // failed payout retry count
  
  // Timestamps
  releasedAt?: Date;
  payoutCompletedAt?: Date;
  refundedAt?: Date;
}
```

### LedgerEntry Model

```typescript
interface ILedgerEntry {
  escrow: ObjectId;
  type: "DEPOSIT" | "BOOKING_FEE" | "ESCROW_HOLD" | "SURCHARGE" | "COMMISSION" 
       | "PAYOUT_INITIATED" | "PAYOUT_SUCCESS" | "PAYOUT_FAILED" | "PAYOUT_REVERSED"
       | "REFUND_INITIATED" | "REFUND_SUCCESS" | "DISPUTE_HOLD" | "DISPUTE_RESOLVED";
  
  // Double-entry accounting
  amount: number;
  currency: string;
  debitAccount: "morongwa_merchant" | "client_wallet" | "runner_wallet" | "system_fee";
  creditAccount: "morongwa_merchant" | "client_wallet" | "runner_wallet" | "system_fee";
  
  // References for reconciliation
  reference: string;                  // unique ledger entry ID
  relatedPaymentReference?: string;   // PayGate reference
  relatedFNBInstructionId?: string;   // FNB instruction ID
  
  status: "pending" | "confirmed" | "failed";
}
```

## Fee Calculation Engine

### Fee Structure (ZAR; converted to local currency)

| Fee | Amount | When | Refundable |
|-----|--------|------|-----------|
| Booking Fee | R8 | At collection | No |
| Commission | 15% of task price | At payout release | Only if task disputed & refunded |
| Distance Surcharge | R10/km | If distance > base radius | Yes (pro-rata) |
| Peak Hours | +10% of task price | 08:00-18:00 weekdays | Yes (pro-rata) |
| Weight | R25 | If weight >10kg | Yes (pro-rata) |
| Urgency | R20 | If <2 hours to deadline | Yes (pro-rata) |

### Example Breakdown

```
Task booked Friday 3pm, Cape Town to Stellenbosch (~50km), 15kg package, urgent:

Task Price:                    R500.00
Booking Fee (non-refundable):    R8.00
Distance Surcharge (50×R10):   R500.00
Peak Hours (+10% of R500):      R50.00
Weight Surcharge (>10kg):       R25.00
────────────────────────────────────
Total Held in Escrow:         R1,083.00

Commission (15% of R500):       R75.00
────────────────────────────────────
Runner Receives (if approved): R1,008.00
Morongwa Revenue:               R83.00
```

Calculation done by `feeService.calculateFees()` and stored in Escrow.fees.

## State Flow Diagram

```
[Client Posts Task]
         ↓
[Client Confirms → PayGate Payment]
         ↓
[PayGate Webhook: Payment Settled]
         ↓
[Create Escrow → Status: PENDING]
         ↓
[Ledger: DEPOSIT, BOOKING_FEE, ESCROW_HOLD]
         ↓
[Task Accepted by Runner]
         ↓
[Mark Payment Settled → Status: HELD]
         ↓
[Runner Completes Task]
         ↓
[Client Review Window (24-48h)]
         ├─ [Approve] ──→ [Release Escrow → Status: RELEASED]
         ├─ [Dispute] ──→ [DISPUTE_HOLD → Mediation]
         └─ [Timeout] ──→ [Auto-Release → Status: RELEASED]
         ↓
[Ledger: COMMISSION, SURCHARGE, PAYOUT_INITIATED]
         ↓
[Initiate FNB EFT Payment]
         ↓
[Poll FNB Status (daily)]
         ├─ [Success] ──→ [Status: RELEASED → Ledger: PAYOUT_SUCCESS]
         ├─ [Failed] ──→ [Retry Queue → Ledger: PAYOUT_FAILED]
         └─ [Processing] ──→ [Poll again next day]
         ↓
[End: Payout Complete]
```

### Cancel/Refund Flow

```
[Before Runner Accepts]
         ↓
[Client Cancels]
         ↓
[Refund: R500 + R8 booking fee] ✓
         ↓
[Ledger: REFUND_INITIATED → REFUND_SUCCESS]
         ↓
[PayGate Reversal or Wallet Credit]

[After Runner Accepts]
         ↓
[Client Requests Cancellation]
         ↓
[Platform mediates: time-based penalty to runner]
         ↓
[0-15min: 100% refund to client, 0% to runner]
[15-60min: 75% refund to client, 25% to runner]
[>60min: 50% refund to client, 50% to runner]
         ↓
[Ledger: REFUND_INITIATED → REFUND_SUCCESS]
```

## FNB Integration Channel Flow

### Step 1: OAuth Authentication

**Endpoint:** `POST https://api.fnb.co.za/integration-channel/oauth/token`

**Request:**
```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "grant_type": "client_credentials"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Implementation:** `fnbService.getAccessToken()` caches token with 60-second refresh buffer.

### Step 2: Create EFT Payment

**Endpoint:** `POST https://api.fnb.co.za/integration-channel/eft/payments`

**Request:**
```json
{
  "debtorAccount": {
    "bank": "FNB",
    "accountNumber": "MORONGWA_MERCHANT_ACCOUNT"
  },
  "creditorAccount": {
    "bank": "STANDARD",
    "accountNumber": "27123456789",  // Runner's account
    "name": "John Doe"
  },
  "amount": {
    "currency": "ZAR",
    "value": 1008.00
  },
  "reference": "MORO-PAYOUT-63abc123-1704990000000",
  "narrative": "Morongwa task payout for runner",
  "timing": "EFT"  // or "RTC" for real-time clearing
}
```

**Response:**
```json
{
  "instructionId": "FNB-INSTR-123456",
  "state": "SUBMITTED",
  "createdAt": "2026-01-08T14:30:00Z",
  "reference": "MORO-PAYOUT-63abc123-1704990000000"
}
```

**Implementation:** `fnbService.createEFTPayment()` creates payment and stores instructionId in Escrow.

### Step 3: Poll Payment Status

**Endpoint:** `GET https://api.fnb.co.za/integration-channel/eft/payments/{instructionId}/status`

**Response:**
```json
{
  "instructionId": "FNB-INSTR-123456",
  "state": "SUCCESS",
  "statusUpdatedAt": "2026-01-08T15:45:00Z"
}
```

**Possible States:**
- `SUBMITTED` → Queued for processing
- `PROCESSING` → Being processed by FNB
- `SUCCESS` → Settled to runner account
- `FAILED` → Rejected (e.g., invalid account); retry after correction
- `REJECTED` → Permanent rejection (e.g., sanction match)

**Implementation:** `fnbService.getPaymentStatus()` polls daily; `payoutService.pollPayoutStatus()` updates Escrow and Ledger.

### Step 4: Daily Reconciliation

**Endpoint:** `GET https://api.fnb.co.za/integration-channel/accounts/{accountNumber}/transactions?from=2026-01-01&to=2026-01-08`

**Response:**
```json
{
  "accountNumber": "12345678",
  "balance": 25000.00,
  "transactions": [
    {
      "transactionId": "TXN-789",
      "date": "2026-01-08",
      "amount": 1008.00,
      "type": "DEBIT",
      "description": "EFT PAYOUT MORO-PAYOUT-63abc123",
      "reference": "MORO-PAYOUT-63abc123-1704990000000",
      "balanceAfter": 25000.00
    },
    ...
  ]
}
```

**Implementation:** `fnbService.getTransactionHistory()` fetches daily; matched against LedgerEntry.reference for reconciliation.

## API Endpoints

### Collections & Webhooks

#### POST /api/payments/webhook/paygate-escrow
Receive PayGate settlement notification

```bash
curl -X POST http://localhost:5001/api/payments/webhook/paygate-escrow \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "PAY-123456",
    "status": "settled",
    "amount": 1083.00,
    "taskId": "63abc123def456",
    "clientId": "63abc111def111",
    "runnerId": "63abc222def222",
    "paymentMethod": "card"
  }'
```

### Escrow Management (Admin)

#### GET /api/payments/escrow/:escrowId
Get escrow details and ledger

```bash
curl -X GET http://localhost:5001/api/payments/escrow/63abc123def456 \
  -H "Authorization: Bearer TOKEN"
```

#### POST /api/payments/escrow/:escrowId/release
Release escrow after task completion

```bash
curl -X POST http://localhost:5001/api/payments/escrow/63abc123def456/release \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"reason": "task_completed"}'
```

#### POST /api/payments/escrow/:escrowId/refund
Refund escrow

```bash
curl -X POST http://localhost:5001/api/payments/escrow/63abc123def456/refund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"reason": "client_cancellation"}'
```

### Payouts (Admin)

#### POST /api/payments/payout/:escrowId/initiate
Initiate FNB payout

```bash
curl -X POST http://localhost:5001/api/payments/payout/63abc123def456/initiate \
  -H "Authorization: Bearer TOKEN"
```

#### GET /api/payments/payout/:escrowId/status
Poll payout status from FNB

```bash
curl -X GET http://localhost:5001/api/payments/payout/63abc123def456/status \
  -H "Authorization: Bearer TOKEN"
```

### Reconciliation (Admin)

#### GET /api/payments/reconciliation/balance
Get FNB merchant account balance

```bash
curl -X GET http://localhost:5001/api/payments/reconciliation/balance \
  -H "Authorization: Bearer TOKEN"
```

#### GET /api/payments/stats/summary
Get escrow dashboard stats

```bash
curl -X GET http://localhost:5001/api/payments/stats/summary \
  -H "Authorization: Bearer TOKEN"
```

## Environment Variables

```bash
# FNB Integration Channel
FNB_BASE_URL=https://api.fnb.co.za/integration-channel
FNB_CLIENT_ID=your_client_id
FNB_CLIENT_SECRET=your_client_secret
FNB_MERCHANT_ACCOUNT=12345678

# PayGate (DPO)
PAYGATE_MERCHANT_ID=your_merchant_id
PAYGATE_API_KEY=your_api_key

# Frontend
FRONTEND_URL=http://localhost:3001
```

## Compliance Checklist

### CPA (Consumer Protection Act, South Africa)

- [x] **Fair & Reasonable Terms:** All fees disclosed at checkout
- [x] **Full Disclosure:** Fee breakdown shown before payment
- [x] **Complaints Pathway:** In-app form and email support@morongwa.io
- [x] **Dispute Resolution:** Evidence-based mediation, escalation to ombudsman
- [x] **Cooling-off Rights:** Provided for distance sales (5 business days)
- [x] **No Hidden Charges:** Booking fee non-refundable but clearly marked

### ECTA (Electronic Communications & Transactions Act)

- [x] **Consent:** Explicit acceptance of ToS/Privacy at registration
- [x] **Timestamps:** All escrow actions logged with ISO 8601 timestamps
- [x] **Acknowledgment of Receipt:** Confirmation emails for payments/refunds
- [x] **Electronic Signature Equivalence:** Backend stores acceptance proof (IP, user-agent)

### POPIA (Protection of Personal Information Act)

- [x] **Lawful Basis:** Performance of contract (escrow ledger)
- [x] **Storage Limitation:** Transactional data retained per legal hold requirements; PII masked
- [x] **Access Control:** API credentials in environment variables; escrow data encrypted in transit
- [x] **Data Subject Rights:** Access via /api/users/{id}/data; deletion scheduled after retention period
- [x] **Breach Notification:** Incident response plan; notifies Regulator + users if required

### FIC Act (Financial Intelligence Centre Act)

- [x] **AML/KYC:** Runner bank account verification before first payout
- [x] **Risk-Based CDD:** EDD for high-value transactions (>R50k)
- [x] **Reporting:** STR/TPR filed with FIC if suspicious activity detected
- [x] **Record-Keeping:** Escrow and ledger records retained for 5+ years

## Operational Procedures

### Daily Payout Workflow

1. **08:00 AM:** System queries Escrow collection for status="released" & fnbStatus="pending"
2. **08:15 AM:** For each escrow, call `fnbService.createEFTPayment()` to batch-submit to FNB
3. **12:00 PM:** Poll FNB status via `fnbService.getPaymentStatus()` for submitted instructions
4. **4:00 PM:** Fetch FNB transaction history for reconciliation; update Ledger entries
5. **5:00 PM:** Generate daily payout report (success, failed, pending); escalate failures to Ops

### Failed Payout Recovery

1. **Failure detected:** `fnbStatus` = "failed" after FNB response
2. **Retry logic:** Auto-retry up to 3 times over 5 days (backoff: 1 day, 2 days, 5 days)
3. **Runner notification:** SMS/email + in-app alert with troubleshooting steps
4. **Manual escalation:** After 3 retries, escalate to Morongwa support; may require runner to update bank details
5. **Resolution:** Once corrected, payment re-queued and retried

### Dispute Mediation

1. **Dispute raised:** Client marks task as "disputed" during review window
2. **Evidence collection:** Platform gathers chat logs, task photos, timestamps
3. **Initial review:** Support team assesses within 24 hours; may request additional info
4. **Mediation:** Both client and runner offered resolution (partial refund, re-completion, etc.)
5. **Decision:** Binding decision issued within 5 business days; ledger updated with DISPUTE_RESOLVED
6. **Escalation:** If party disagrees, refer to external ombudsman (NCC, OMBUD-ZA, etc.)

### Currency Exchange & Conversion

- **Daily update:** Exchange rates pulled from live source (e.g., OpenExchangeRates API)
- **Rate application:** Used at time of escrow creation; stored for audit trail
- **Mid-market + margin:** 0.5% added to cover hedging costs
- **Transparency:** Conversion shown in checkout and payout statements

## Troubleshooting

### FNB Token Expiry

**Issue:** `getAccessToken()` returns 401 Unauthorized
**Fix:** Token refresh is automatic (60-second buffer); if fails, verify `FNB_CLIENT_ID` and `FNB_CLIENT_SECRET` in `.env`

### Payment Not Settling

**Issue:** PayGate webhook received but payment never marked as "settled"
**Fix:** Check PayGate logs for settlement status; webhook may not have arrived; retry webhook manually or check bank statement

### FNB Payout "Failed"

**Issue:** EFT payment rejected by FNB
**Reasons:** 
- Invalid runner account number → Runner updates bank details
- Insufficient merchant balance → Top up FNB account
- Sanction/AML match → Escalate to Compliance Officer

**Fix:** Check `fnbStatus` and `failureReason` in Escrow; notify runner; retry after issue resolved

### Reconciliation Drift

**Issue:** Ledger total doesn't match FNB balance
**Cause:** 
- Pending payout not yet settled in FNB (T+0 vs T+1)
- Unmatched FNB transaction (e.g., manual transfer)
- Double-entry accounting error

**Fix:** Query `/api/payments/reconciliation/transactions` with date range; manually match references; post reconciliation journal entry if needed

## Performance Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Escrow creation | <100ms | Immediate after payment webhook |
| FNB token fetch | <200ms | Cached; refresh every 60 min |
| EFT payment creation | <500ms | API call to FNB |
| Status poll latency | <1s | Daily batch, no SLA |
| Reconciliation daily | <5s | Pulls 30-90 days of transactions |
| Ledger query | <50ms | Indexed on escrow_id, type, createdAt |
| Fee calculation | <10ms | In-memory, no DB calls |

## Testing Checklist

- [ ] Create escrow with all surcharges; verify fee calculation
- [ ] Simulate PayGate webhook; verify payment settled
- [ ] Release escrow; verify ledger entries correct
- [ ] Initiate FNB payout; verify instruction ID stored
- [ ] Poll FNB status; verify transitions (pending → processing → success)
- [ ] Mock FNB failure; verify retry queue and runner notification
- [ ] Refund escrow before payout; verify refund to PayGate
- [ ] Multi-currency: Test ZAR, BWP, LSL, NAD, ZWL, ZMW conversions
- [ ] Daily reconciliation; verify no discrepancies
- [ ] Admin dashboard stats; verify totals match ledger sums

## Deployment Checklist

- [ ] Set `FNB_*` environment variables
- [ ] Set `PAYGATE_*` environment variables
- [ ] Create superadmin user for manual payout approvals
- [ ] Run `npm run build` in backend
- [ ] Test all FNB endpoints in sandbox before production
- [ ] Seed policies ("Escrow & Payout Policy", "Refunds & Cancellations Policy")
- [ ] Set up daily reconciliation scheduler (cron job)
- [ ] Configure email notifications for failed payouts
- [ ] Test PayGate webhook in production (whitelist IP)
- [ ] Monitor logs for FNB API rate limits (typical: 1000/day per endpoint)

---

**Effective Date:** January 2026  
**Next Review:** July 2026 (6 months)  
**Contact:** engineering@morongwa.io
