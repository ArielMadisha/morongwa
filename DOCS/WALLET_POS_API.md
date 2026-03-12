# ACBPayWallet POS API (Future)

This document describes the planned API for POS (Point of Sale) systems to accept ACBPayWallet QR payments.

## QR Code Format

User QR codes encode: `ACBPAY:{userId}`

Example: `ACBPAY:64abc123def456789`

## Flow (Store / POS)

1. **Customer presents QR** at checkout
2. **POS scans QR** → extracts `userId`
3. **POS calls API** to create payment (sends SMS OTP to customer)
4. **Customer receives SMS** with 6-digit code
5. **Customer tells code** to teller
6. **POS submits code** → payment completes

## API Endpoints (Planned)

### 1. Create payment from scan

```
POST /api/wallet/payment-from-scan
Authorization: Bearer {merchant_api_key}
Content-Type: application/json

{
  "fromUserId": "64abc123...",   // from scanned QR
  "amount": 150.00,
  "merchantName": "Store Name"
}

Response:
{
  "paymentRequestId": "...",
  "amount": 150,
  "expiresIn": 300,
  "message": "Verification code sent to payer"
}
```

### 2. Confirm payment with OTP

```
POST /api/wallet/confirm-payment
Authorization: Bearer {merchant_api_key}
Content-Type: application/json

{
  "paymentRequestId": "...",
  "otp": "123456"
}

Response:
{
  "message": "Payment successful",
  "amount": 150,
  "reference": "QR-..."
}
```

## Current Implementation

The above endpoints exist for **authenticated users** (merchant must be logged in). For POS integration:

- **Option A**: Create merchant accounts; store staff log in to accept payments
- **Option B**: Add API key auth for POS devices; each merchant gets an API key
- **Option C**: Webhook/callback flow for integrated POS software

## Cards (Visa/Mastercard) – PayGate PayVault

As a PayGate merchant, you can use **PayVault** for card tokenization:

- Enable PayVault in your [PayGate Merchant Portal](https://www.paygate.co.za/)
- PayVault stores card details in PayGate’s PCI DSS Level 1 environment
- You receive a token (GUID) for future transactions
- No need to handle raw card numbers

**Implemented**: ACBPayWallet now supports stored cards. Add card (R1 tokenization), pay at store with card or wallet. Enable PayVault in PayGate Merchant Portal.
