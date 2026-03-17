# Dropshipping Testing Guide

## Where to Test

| Test Type | Where | How |
|-----------|-------|-----|
| **API import** | Backend | Use Postman, curl, or frontend admin panel |
| **Product import** | Backend API | `POST /api/admin/dropship/import-cj/:id` or `POST /api/admin/dropship/search-import-cj` |
| **Checkout flow** | Frontend | Add product to cart → checkout → pay |
| **Webhooks** | Backend | `POST /api/webhooks/cj` (simulate CJ order updates) |

## Superadmin Credentials

Create a superadmin first:

```bash
cd backend
npm run seed-superadmin
```

**Default credentials:**

| Field | Value |
|-------|-------|
| Email | `superadmin@qwertymates.com` |
| Username | `superadmin` |
| Password | `gtSFKT2F6ndYy9Gpers_yo1wKDk` |

**Login:** Use the frontend login page with email or username + password.

## Testing Import (Admin API)

1. **Authenticate** – Login with superadmin, get JWT from `/api/auth/login`
2. **Import by CJ product ID:**
   ```bash
   curl -X POST "http://localhost:4000/api/admin/dropship/import-cj/04A22450-67F0-4617-A132-E7AE7F8963B0" \
     -H "Authorization: Bearer YOUR_JWT"
   ```
3. **Search and import:**
   ```bash
   curl -X POST "http://localhost:4000/api/admin/dropship/search-import-cj" \
     -H "Authorization: Bearer YOUR_JWT" \
     -H "Content-Type: application/json" \
     -d '{"query":"hoodie","limit":5}'
   ```

## Testing Checkout

1. Add imported product to cart (frontend)
2. Add delivery address and `deliveryCountry` (e.g. `"ZA"`)
3. Pay with wallet or card
4. Order forwarding runs automatically when payment succeeds

## Webhook

CJ can send order updates to `POST /api/webhooks/cj` – body example:

```json
{
  "orderNumber": "QM-<orderId>",
  "orderId": "123434",
  "trackingNumber": "CJPKL7160102171YQ",
  "trackingStatus": "In transit",
  "logisticName": "DHL"
}
```
