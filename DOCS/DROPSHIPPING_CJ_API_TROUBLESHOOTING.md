# CJ Dropshipping API Troubleshooting Flow

**Context:** Qwertymates uses the CJ API directly. No plugins, no store connection in CJ dashboard.

---

## Important: CJ Dashboard vs API

| CJ Dashboard (what you see) | API Integration (what we use) |
|----------------------------|-------------------------------|
| "Products from Authorized Stores" | **Not used** – we don't sync our store to CJ |
| "Add Sourcing Connection" | **Not used** – that's for Shopify/WooCommerce plugins |
| "Unconnected" / "No product in your store" | **Expected** – our store is not connected to CJ |
| Product search, import, orders | **Done via API** – no dashboard connection needed |

**The "store not connected" message on CJ's dashboard is normal for API-only integration.** You do not need to connect your store there.

---

## Troubleshooting Flow (API Integration)

### Step 1: Verify CJ API key

1. Log in to [CJ Dropshipping](https://app.cjdropshipping.com/)
2. Go to **Settings** → **API** or **Developer**
3. Confirm you have an **API key** (not just a store connection)
4. Copy the key and add to `backend/.env`:
   ```
   CJ_API_KEY=your_api_key_here
   ```

### Step 2: Seed ExternalSupplier

The backend reads `CJ_API_KEY` from `.env` and stores it in the `ExternalSupplier` model.

```bash
cd backend
npm run seed:external-suppliers
# or: npx ts-node scripts/seedExternalSuppliers.ts
```

Expected output: `✅ CJ Dropshipping (cj) configured`

If you see `⏭️ Skipping CJ (CJ_API_KEY not set)` → go back to Step 1.

### Step 3: Test CJ auth (optional manual check)

Call CJ directly to verify the key works:

```bash
curl -X POST "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"YOUR_CJ_API_KEY"}'
```

Expected: `{"code":200,"data":{"accessToken":"...","refreshToken":"..."}}`  
If you get an error → API key is invalid or expired.

### Step 4: Test search via Qwertymates admin

1. Log in as superadmin at `/admin`
2. Go to **CJ Dropshipping** → **Search CJ** tab
3. Enter a keyword (e.g. `hoodie`) and click **Search**

**If it works:** Products appear → API is fine.  
**If it fails:** Note the error message (auth, timeout, no results).

### Step 5: Test search via API (curl)

```bash
# 1. Get JWT (login as superadmin)
TOKEN="your_jwt_here"

# 2. Search CJ
curl -X GET "http://localhost:4000/api/admin/dropship/search-cj?q=hoodie&size=5" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `{"products":[...]}`  
If empty array: CJ may have no matching products, or search params differ.  
If 403: Not superadmin.  
If 500: Check backend logs for CJ API error.

### Step 6: Test import

```bash
# Import by search (imports first N results)
curl -X POST "http://localhost:4000/api/admin/dropship/search-import-cj" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"hoodie","limit":3}'
```

Expected: `{"message":"Import complete","imported":N,"data":[...]}`

### Step 7: Check backend logs

If any step fails, check the terminal where `npm run dev` (backend) is running. Look for:

- `CJ auth failed` → API key problem
- `CJ API error` → CJ returned an error (check message)
- Network/timeout → Firewall or CJ API down

---

## Common Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "CJ auth failed" | Invalid/expired API key | Regenerate key in CJ dashboard, update .env, re-run seed |
| Empty search results | CJ has no products for that keyword | Try different keywords (e.g. "shirt", "phone case") |
| 403 on dropship endpoints | Not superadmin | Log in with superadmin account |
| "CJ product not found" on import | Invalid product ID | Use ID from search results, not arbitrary string |
| ExternalSupplier not found | Seed not run or API key missing | Run `npm run seed:external-suppliers` |

---

## Summary

- **CJ dashboard "Unconnected" / "No product in your store"** → Ignore. Not used for API.
- **API flow:** API key → .env → seed ExternalSupplier → search/import via admin or API.
- **If API fails:** Check key, seed, superadmin, and backend logs.
