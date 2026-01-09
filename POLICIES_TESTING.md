# Morongwa Policy System - Quick Testing Guide

## ✅ System Status
- **Backend**: Running on `http://localhost:5001` ✓
- **Frontend**: Running on `http://localhost:3001` ✓
- **Database**: MongoDB Atlas connected ✓

---

## 🧪 Quick Test Scenarios

### 1. View Policies Page
**URL**: http://localhost:3001/policies

**Expected Results:**
- ✅ Lists all 20 policies
- ✅ Filterable by category (legal, privacy, pricing, compliance, etc.)
- ✅ Search bar finds policies by title/tags
- ✅ Each policy card shows:
  - Title
  - Summary snippet
  - Category badge
  - Tags
  - Country scope
  - Version number
  - Download PDF button

---

### 2. View Single Policy
**URL**: http://localhost:3001/policies/terms-of-service

**Expected Results:**
- ✅ Full policy content rendered as Markdown
- ✅ Metadata sidebar shows:
  - Category
  - Tags list
  - Country scope
  - Version number
  - Published date
- ✅ Share/Copy link button
- ✅ Download PDF button
- ✅ Back navigation

**Test All Slugs:**
- terms-of-service
- privacy-policy
- cookies-tracking
- pricing-fees
- escrow-payouts
- refunds-cancellations
- runner-agreement
- client-terms
- acceptable-use
- ratings-reviews
- safety-restricted-tasks
- intellectual-property
- security-vulnerability
- accessibility
- popia-compliance-framework
- kyc-aml
- tax-independent-contractor
- consumer-complaints
- electronic-contracting
- incident-response

---

### 3. Test Registration with Policy Acceptance
**URL**: http://localhost:3001/register

**Steps:**
1. ✅ Checkboxes are **NOT pre-checked** (explicit consent required)
   - Terms of Service checkbox (unchecked)
   - Privacy Policy checkbox (unchecked)
2. ✅ Clicking checkbox links navigate to policy pages
3. ✅ Fill form:
   - Name: "Test User"
   - Email: "test@morongwa.co.za"
   - Password: "Secure123Pass"
   - Role: Client or Runner
4. ✅ Try submitting WITHOUT checking boxes → Error: "Please accept the Terms and Privacy Policy"
5. ✅ Check both boxes and submit
   - Should redirect to `/dashboard`
   - Backend should log policy acceptances in AuditLog
   - PolicyAcceptance records created

---

### 4. Test API Endpoints

#### List Published Policies
```bash
curl http://localhost:5001/api/policies
```

**Expected**: Array of 20 policies with metadata

#### Get Single Policy
```bash
curl http://localhost:5001/api/policies/terms-of-service
```

**Expected**: Full policy content object

#### Test Unauthenticated Access
```bash
curl http://localhost:5001/api/policies/accept \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"slugs": ["terms-of-service"]}'
```

**Expected**: 401 Unauthorized (requires auth token)

---

### 5. Test Admin Dashboard (Future)
**URL**: http://localhost:3001/admin/policies

**Requirements:**
- Must be logged in as admin/superadmin
- (Currently requires manual user role update in DB)

**Expected Features (when role is set):**
- ✅ List of all policies
- ✅ Edit button for each policy
- ✅ Editor with Markdown content
- ✅ Save Draft button
- ✅ Publish button
- ✅ Version history

---

### 6. Test Footer Links
**URL**: http://localhost:3001 (home page)

**Expected:**
- ✅ Footer has 4 columns:
  - **Legal**: Terms, Privacy, Cookies
  - **Platform**: Pricing & Fees, Escrow & Payouts, Community Guidelines
  - **Resources**: All Policies, Security, Support
- ✅ All links navigate to correct policy pages
- ✅ "Serving Botswana · Lesotho · Namibia · South Africa · Zimbabwe · Zambia"

---

## 🔍 Database Verification

### Check Seeded Policies
```javascript
// In MongoDB Atlas
db.policies.find().count()  // Should be 20
db.policies.find({}, { slug: 1, title: 1 }).limit(5)
```

### Check Policy Acceptances
```javascript
db.policyacceptances.find()  // Should have records after registration
// Fields to verify: user, slug, version, acceptedAt, ip, userAgent
```

### Check Audit Log
```javascript
db.auditlogs.find({ action: "POLICY_ACCEPTED" })
db.auditlogs.find({ action: "POLICY_PUBLISHED" })
```

---

## 🐛 Troubleshooting

### Issue: Policies not loading
**Solution**: 
```bash
# Check backend logs - should see policy seeding
# If missing, call POST /api/policies/seed/defaults (superadmin only)
```

### Issue: Policy acceptance not recorded
**Solution**:
```bash
# Ensure user is authenticated with valid JWT token
# Check backend logs for POST /api/policies/accept calls
```

### Issue: Admin dashboard not accessible
**Solution**:
```bash
# User must have role: 'admin' or 'superadmin'
# Update user role in MongoDB:
db.users.updateOne({ email: "user@example.com" }, { $set: { role: "admin" } })
```

### Issue: Markdown not rendering
**Solution**:
```bash
# Verify react-markdown is installed
cd frontend && npm list react-markdown
# If missing: npm install react-markdown
```

---

## 📊 Key Metrics to Test

### Performance
- ✅ Policies page loads in <2 seconds
- ✅ Single policy page loads in <1 second
- ✅ Admin dashboard editable
- ✅ API response time <500ms

### Compliance
- ✅ All 20 policies seeded
- ✅ All 6 countries in scope
- ✅ Acceptance tracked with IP/userAgent
- ✅ Audit trail complete

### UX
- ✅ Explicit consent (no pre-checked boxes)
- ✅ Clear policy links from footer
- ✅ Mobile responsive
- ✅ Markdown renders correctly

---

## 🚀 What's Next

1. **Create test admin user**:
   ```bash
   # Run backend script
   npm run scripts/createAdmin.ts
   ```

2. **Test policy editing** as admin

3. **Generate PDF exports** (endpoint TBD)

4. **Monitor audit logs** for compliance

5. **Set up automated tests** for policy endpoints

---

## 📝 Notes

- All policies are **Markdown-formatted** for easy editing
- Policies are **versioned** - old versions never deleted
- **Acceptance tracking** includes IP and user-agent for dispute resolution
- **Audit trail** captures all changes for regulatory compliance
- **Multi-country scope** reduces need for duplicate policies

---

## 💡 Sample API Responses

### GET /api/policies
```json
{
  "success": true,
  "data": [
    {
      "slug": "terms-of-service",
      "title": "Terms of Service",
      "category": "legal",
      "tags": ["contract", "marketplace", "ecta", "cpa"],
      "countryScope": ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
      "latestPublishedVersion": 1,
      "summary": "Master contract covering roles, task lifecycle, escrow...",
      "publishedAt": "2026-01-09T11:55:00Z"
    }
    // ... 19 more policies
  ]
}
```

### POST /api/policies/accept
```json
Request:
{
  "slugs": ["terms-of-service", "privacy-policy"],
  "meta": { "source": "register" }
}

Response:
{
  "success": true,
  "data": [
    {
      "slug": "terms-of-service",
      "version": 1,
      "acceptedAt": "2026-01-09T11:56:00Z"
    },
    {
      "slug": "privacy-policy",
      "version": 1,
      "acceptedAt": "2026-01-09T11:56:00Z"
    }
  ]
}
```

---

**Ready to test!** 🚀 Navigate to http://localhost:3001/policies to begin.
