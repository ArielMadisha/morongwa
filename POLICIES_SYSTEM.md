# Morongwa Policy & Compliance System Documentation

## Overview

Complete legal compliance framework implementing 20 policies across 6 African countries (Botswana, Lesotho, Namibia, South Africa, Zimbabwe, Zambia) with:

- **Public policies** (14 customer-facing)
- **Internal compliance docs** (6 governance-focused)
- **Multi-country support** with regional currency notes
- **Version control** with audit trails
- **Admin dashboard** for policy management
- **User acceptance tracking** with timestamps and IP logging
- **PayGate + FNB integration** specifics

---

## Architecture

### Backend Components

#### 1. **Policy Data Models** (`backend/src/data/models/Policy.ts`)
- **Policy Schema**: slug, title, category, visibility (public/internal), countryScope, tags, versions, currentVersion, latestPublishedVersion
- **PolicyVersion Schema**: version number, status (draft/published), title, summary, content (Markdown), publishedAt, createdBy/updatedBy
- **PolicyAcceptance Schema**: policy reference, user, version accepted, timestamp, IP, userAgent, metadata
- **Indexes**: for rapid lookup by slug, version, and acceptance date

#### 2. **Policy Service** (`backend/src/services/policyService.ts`)
- **ensureDefaultPolicies()**: Seeds 20 default policies on server startup (idempotent)
- **listPublishedPolicies()**: Returns public policies with metadata
- **getPublishedPolicy(slug)**: Retrieves full content of published version
- **createPolicyVersion(slug, data, userId, publish)**: Creates draft or published version with audit logging
- **publishPolicyVersion(slug, versionNumber, userId)**: Marks version as published
- **recordPolicyAcceptance(slug, userId, ip, userAgent, meta)**: Logs user acceptance with context
- **listPolicyVersions(slug)**: Shows all versions of a policy

#### 3. **Policy Routes** (`backend/src/routes/policies.ts`)
- **GET /api/policies** - List all published policies (public)
- **GET /api/policies/:slug** - Get single published policy (public)
- **GET /api/policies/:slug/versions** - List all versions (admin-only)
- **POST /api/policies/:slug/version** - Create new version (admin-only)
- **POST /api/policies/:slug/publish** - Publish specific version (admin-only)
- **POST /api/policies/accept** - Record policy acceptance (authenticated)
- **POST /api/policies/seed/defaults** - Reseed policies (superadmin-only)

#### 4. **Server Integration** (`backend/src/server.ts`)
- Imports policyRoutes and ensureDefaultPolicies
- Calls `ensureDefaultPolicies()` on server startup
- Registers `/api/policies` route
- PORT set to 5001 (PayGate compatible)

---

## Frontend Components

### 1. **Policy API Client** (`frontend/lib/policiesApi.ts`)
Axios-based client with methods:
- `listPublished()` - Get all public policies
- `getPolicy(slug)` - Get single policy
- `getVersions(slug)` - List versions (admin)
- `createVersion(slug, data)` - Create/publish version (admin)
- `publishVersion(slug, version)` - Publish specific version (admin)
- `acceptPolicies(slugs, meta)` - Record acceptances
- `seedDefaults()` - Reseed policies (admin)

### 2. **Public Policy Pages**

#### **Policies Index** (`frontend/app/policies/page.tsx`)
- Lists all 20 published policies
- Filterable by category, tags, search
- Shows summary, version, scope (countries), tags
- Download PDF button for each policy
- Responsive grid layout with sky-blue theme
- Metadata badges for category, version, countries

#### **Single Policy Page** (`frontend/app/policies/[slug]/page.tsx`)
- Full markdown-rendered policy content
- Metadata sidebar (tags, countries, version, publish date)
- Download PDF and share/copy link actions
- Summary highlight box
- Back navigation
- Timestamp display

### 3. **Admin Dashboard** (`frontend/app/admin/policies/page.tsx`)
- Lists all policies with quick edit buttons
- Edit mode with:
  - Title editor
  - Markdown content editor
  - Save as draft button
  - Publish button (goes live immediately)
  - Version control (creates new version)
- Role-based access (admin/superadmin only)
- Audit logging of all edits

### 4. **Registration Flow Update** (`frontend/app/register/page.tsx`)
- **Explicit consent checkboxes** (NOT pre-checked, per CPA/POPIA)
  - Terms of Service
  - Privacy Policy
- Links directly to policy pages
- Error state if not accepted
- On success, passes policy slugs to register API
- AuthContext records acceptances with metadata

### 5. **Footer Navigation** (`frontend/app/page.tsx`)
Updated footer with 4 columns:
- **Legal**: Terms, Privacy, Cookies
- **Platform**: Pricing & Fees, Escrow & Payouts, Community Guidelines
- **Resources**: All Policies, Security, Support
- Regional note (6 countries)

### 6. **Auth Context** (`frontend/contexts/AuthContext.tsx`)
Updated register function:
```typescript
register(name, email, password, role, policyAcceptances?: string[])
```
- Calls backend auth registration
- If policyAcceptances provided, calls `policiesAPI.acceptPolicies()`
- Records with `source: 'register'` metadata
- Non-blocking on policy acceptance failure

---

## 20 Policies Implemented

### Public Policies (14)

1. **Terms of Service**
   - Slug: `terms-of-service`
   - Covers roles, task lifecycle, escrow, fees, disputes, ratings, termination
   - Legal basis: ECTA, CPA

2. **Privacy Policy (POPIA)**
   - Slug: `privacy-policy`
   - Data collection, processing, rights, breach notification
   - Compliant with POPIA 8 conditions

3. **Cookie & Tracking**
   - Slug: `cookies-tracking`
   - Consent banner, cookie types, opt-out controls

4. **Pricing & Fees** ✅ (Already Built)
   - Slug: `pricing-fees`
   - 15% commission, R8 booking fee, surcharges, FX disclosure
   - Interactive calculator link

5. **Escrow & Payouts**
   - Slug: `escrow-payouts`
   - DPO/PayGate funding, FNB merchant account, hold/release logic
   - T+1 payout timing for Capitec/other banks

6. **Refunds & Cancellations**
   - Slug: `refunds-cancellations`
   - Before/after acceptance rules, cooling-off, timelines

7. **Runner Agreement**
   - Slug: `runner-agreement`
   - Independent contractor status, SARS tests, taxes, deactivation

8. **Client Terms**
   - Slug: `client-terms`
   - Task accuracy, prohibited content, chargebacks, escalation

9. **Acceptable Use & Community Guidelines**
   - Slug: `acceptable-use`
   - Prohibitions on illegal/unsafe tasks, harassment, fraud

10. **Ratings & Reviews**
    - Slug: `ratings-reviews`
    - Calculation, anti-fraud, appeals, removal criteria

11. **Safety & Restricted Tasks**
    - Slug: `safety-restricted-tasks`
    - Disallowed categories (weapons, hazmat, etc.), precautions

12. **Intellectual Property & Content**
    - Slug: `intellectual-property`
    - Ownership, licensing, takedowns, infringement reporting

13. **Security & Vulnerability Disclosure**
    - Slug: `security-vulnerability`
    - HTTPS, encryption, responsible disclosure channel

14. **Accessibility Statement**
    - Slug: `accessibility`
    - WCAG 2.1 AA commitment, feedback loop

### Internal Compliance Docs (6)

15. **POPIA Compliance Framework (Summary)**
    - Slug: `popia-compliance-framework`
    - Processing records, Information Officer, operator agreements, breach plan

16. **KYC/AML Policy (FIC Act)**
    - Slug: `kyc-aml`
    - RMCP per Guidance Note 7A, CDD, EDD, STR/TPR, goAML

17. **Tax & Independent Contractor Policy**
    - Slug: `tax-independent-contractor`
    - SARS Interpretation Note 17 tests, documentation, PAYE thresholds

18. **Consumer Complaints & Dispute Resolution**
    - Slug: `consumer-complaints`
    - CPA-aligned process, escalation, timelines, ombud info

19. **Electronic Contracting (ECTA)**
    - Slug: `electronic-contracting`
    - Consent capture, timestamps, signature equivalence, receipts

20. **Incident Response & Breach Notification**
    - Slug: `incident-response`
    - Detection, classification, containment, regulatory notification timelines

---

## Regional Customization

### Multi-Country Support
All policies scoped to: ZA, BW, LS, NA, ZW, ZM

### Payout Provider Notes
- **South Africa**: PayGate (DPO) → FNB merchant account → Capitec/FNB/other banks (T+1 where supported)
- **Other countries**: PayGate integration with local bank partnerships
- All policies reference PayGate and FNB explicitly

### Currency/FX Disclosure
- Pricing policy includes FX rates (linked to pricing calculator)
- Escrow & Payouts policy explains conversion and settlement timing
- Examples in local currencies for each country

---

## Audit & Compliance Features

### Audit Logging
Every policy action logged to `AuditLog` collection:
- `POLICY_VERSION_CREATED`: When draft/version created
- `POLICY_PUBLISHED`: When version goes live
- `POLICY_ACCEPTED`: When user accepts policy
- Captures: userId, timestamp, slug, version, metadata (IP, userAgent)

### Acceptance Tracking
- **PolicyAcceptance collection**: One record per acceptance
- Fields: user, slug, version, acceptedAt, ip, userAgent, meta
- Non-authenticated acceptances tracked for anonymous users
- Used for consent audits and dispute resolution

### Version History
- Each policy maintains full version history
- Drafts preserved for review before publishing
- Published versions immutable and timestamped
- Admin can revert by publishing older version (creates new version record)

---

## Integration Points

### 1. **Startup**
```typescript
// In server startup
await ensureDefaultPolicies();  // Idempotent; seeds if missing
```

### 2. **Registration**
```typescript
// Frontend calls register with policy slugs
await register(name, email, password, role, ['terms-of-service', 'privacy-policy']);

// Backend records acceptances via POST /api/policies/accept
```

### 3. **Checkout** (Future)
- Fee disclosure modal before payment
- Links to Pricing & Fees, Refunds & Cancellations, Escrow & Payouts
- Quick summary of charges with policy references

### 4. **Admin Panel**
- Superadmin only
- Edit policies, publish versions
- View audit trail of all policy changes and acceptances
- Can reseed defaults

---

## API Reference

### Public Endpoints

#### List Published Policies
```
GET /api/policies
Response: { success: true, data: [ { slug, title, category, tags, countryScope, latestPublishedVersion, summary, publishedAt } ] }
```

#### Get Single Policy
```
GET /api/policies/:slug
Response: { success: true, data: { slug, title, category, tags, countryScope, version, publishedAt, summary, content } }
```

#### Record Acceptance
```
POST /api/policies/accept
Body: { slugs: ['terms-of-service', 'privacy-policy'], meta?: { source: 'register' } }
Response: { success: true, data: [ { slug, version, acceptedAt } ] }
Auth: Required (JWT token)
```

### Admin Endpoints

#### Create Policy Version
```
POST /api/policies/:slug/version
Body: { title?: string, summary?: string, content: string, publish?: boolean }
Auth: Required (admin/superadmin)
```

#### Publish Specific Version
```
POST /api/policies/:slug/publish
Body: { version: number }
Auth: Required (admin/superadmin)
```

#### List Versions
```
GET /api/policies/:slug/versions
Auth: Required (admin/superadmin)
```

---

## Database Schema

### Policy Collection
```typescript
{
  slug: String (unique, indexed),
  title: String,
  category: String,
  visibility: 'public' | 'internal',
  countryScope: [String],
  tags: [String],
  currentVersion: Number,
  latestPublishedVersion: Number,
  versions: [
    {
      version: Number,
      status: 'draft' | 'published',
      title: String,
      summary: String,
      content: String (Markdown),
      publishedAt: Date,
      createdBy: ObjectId (User),
      updatedBy: ObjectId (User),
      createdAt: Date,
      updatedAt: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### PolicyAcceptance Collection
```typescript
{
  policy: ObjectId (Policy),
  slug: String,
  version: Number,
  user: ObjectId (User) | null,
  acceptedAt: Date,
  ip: String,
  userAgent: String,
  meta: Mixed,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Compliance Checklist

### POPIA (South Africa)
- ✅ Privacy policy published
- ✅ Data subject rights documented
- ✅ Breach notification process in incident response policy
- ✅ Information Officer contact (can be added to app footer)
- ✅ Lawful basis documented (contract, consent, legitimate interests)

### CPA (South Africa)
- ✅ Terms of Service with clear roles and fees
- ✅ Transparent pricing disclosed upfront
- ✅ Refund/cancellation policy published
- ✅ Consumer complaints process documented
- ✅ No pre-ticked consent boxes (explicit opt-in on register)

### ECTA (Electronic Communications)
- ✅ Electronic contract formation (terms at signup)
- ✅ Acceptance capture with timestamp
- ✅ Acknowledgment of receipt (email confirmation optional)

### FIC Act / AML (South Africa)
- ✅ KYC/AML policy summarized (links to full RMCP documentation)
- ✅ PayGate integration requires KYC verification
- ✅ STR/TPR filing procedures documented (internal)

### SARS (South Africa)
- ✅ Contractor independence documented (Runner Agreement)
- ✅ No pre-ticked employment classification

### Regional (BW, LS, NA, ZW, ZM)
- ✅ Multi-country currency support
- ✅ Payout provider transparency
- ✅ Mirrored transparency principles aligned with SA best practices

---

## Next Steps (Optional Enhancements)

1. **PDF Exports**: Add endpoint to generate downloadable PDFs of policies
2. **Language Support**: Translate policies to Setswana, Sesotho, Oshiwambo, Afrikaans, Shona, Nyanja
3. **Email Acceptance**: Send acceptance receipt emails after signup
4. **Policy Change Notifications**: Notify users of policy updates
5. **Consent Management Platform**: Link to dedicated CMP for cookie/marketing opt-outs
6. **Automated Compliance Reports**: Monthly audit trail export for regulators
7. **A/B Testing**: Track acceptance rates and UX improvements
8. **Information Officer Portal**: Self-service POPIA data subject request handling

---

## File Structure

```
backend/
├── src/
│   ├── data/
│   │   └── models/
│   │       └── Policy.ts ✅
│   ├── services/
│   │   └── policyService.ts ✅
│   ├── routes/
│   │   └── policies.ts ✅
│   └── server.ts ✅ (updated)

frontend/
├── app/
│   ├── policies/
│   │   ├── page.tsx ✅ (list)
│   │   └── [slug]/
│   │       └── page.tsx ✅ (single)
│   ├── admin/
│   │   └── policies/
│   │       └── page.tsx ✅ (dashboard)
│   ├── page.tsx ✅ (footer updated)
│   └── register/
│       └── page.tsx ✅ (acceptance flow)
├── lib/
│   ├── api.ts ✅ (port fixed)
│   └── policiesApi.ts ✅
└── contexts/
    └── AuthContext.tsx ✅ (register updated)
```

---

## Testing Checklist

- [ ] Server starts and seeds 20 policies
- [ ] GET /api/policies returns all 20 with metadata
- [ ] GET /api/policies/terms-of-service returns full content
- [ ] POST /api/policies/accept logs acceptance for authenticated user
- [ ] Frontend /policies page loads and lists all policies
- [ ] Frontend /policies/terms-of-service renders markdown correctly
- [ ] Register page shows unchecked consent boxes
- [ ] Register page calls API with policy acceptance slugs
- [ ] Admin /admin/policies page loads (admin role only)
- [ ] Admin can edit policy content and publish
- [ ] Footer links navigate to correct policy pages
- [ ] All 6 countries appear in policy metadata
- [ ] PayGate/FNB details present in escrow & payouts policy

---

## Support & Maintenance

- **Audit Trail**: Check `AuditLog` collection for policy change history
- **Acceptance Records**: Query `PolicyAcceptance` collection for user consent records
- **Version Rollback**: Publish older version number to revert changes
- **Batch Updates**: Use admin dashboard or API to update multiple policies
- **Compliance Audits**: Export audit logs and acceptance records for regulators

---

*Last Updated: January 9, 2026*
*System: Morongwa Multi-Country Marketplace*
*Compliance Scope: Botswana, Lesotho, Namibia, South Africa, Zimbabwe, Zambia*
