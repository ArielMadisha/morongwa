import { FilterQuery } from "mongoose";
import { Policy, PolicyAcceptance, IPolicy, IPolicyVersion, PolicyVisibility } from "../data/models/Policy";
import AuditLog from "../data/models/AuditLog";
import { logger } from "./monitoring";

interface PolicySeed {
  slug: string;
  title: string;
  category: string;
  visibility: PolicyVisibility;
  countryScope: string[];
  tags: string[];
  summary: string;
  content: string;
}

const defaultPolicies: PolicySeed[] = [
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    category: "legal",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["contract", "marketplace", "ecta", "cpa"],
    summary: "Master contract covering roles, task lifecycle, escrow, payouts, Morongwa-TV, marketplace products, product enquiry, and deactivation.",
    content: `# Terms of Service\n\n**Roles:** Clients post tasks; Runners are independent contractors who accept tasks. Resellers, suppliers, and content creators can list products and share content on Morongwa-TV.\n**Task lifecycle:** posting → acceptance → completion → review. Payment is held in escrow until completion or timeout.\n**Escrow & payouts:** Funds are released when the task is marked complete and review window closes, or via timeout rules.\n**Morongwa-TV (Qwerty TV):** Content platform for videos, images, and product promotions. User-generated content is subject to Acceptable Use; automated moderation may flag sensitive material; users may report posts. Content may carry a platform watermark.\n**Marketplace products:** Products can be bought through the marketplace; product enquiry messages route to sellers for notifications.\n**Product enquiry:** Buyers may enquire about products via Messages; enquiries are routed to sellers; see Privacy Policy for message data.\n**Cancellations:** Before acceptance: full refund of fees; after acceptance: see Refunds & Cancellations policy.\n**Disputes:** Evidence-based resolution with escalation path.\n**Ratings:** Anti-fraud; manipulation may lead to removal.\n**Prohibited uses:** Illegal/unsafe tasks, harassment, discrimination, deceptive listings, platform abuse; on Morongwa-TV: sexual, pornographic, or violent content.\n**IP:** You grant Morongwa a license to host/display task and content; ownership remains with you; platform watermark may be applied to Morongwa-TV content.\n**Liability:** Platform provides a marketplace; no warranty on outcomes; capped liability per CPA.\n**Termination:** Accounts may be suspended for violations; appeal path provided.\n**Governing law:** South Africa; electronic contracting per ECTA; consumer protections per CPA.`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy (POPIA)",
    category: "privacy",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["popia", "privacy", "data-subject-rights"],
    summary: "Explains personal data use, lawful basis, rights, security safeguards, Morongwa-TV content data, product enquiry messages, and breach notices.",
    content: `# Privacy Policy\n\nWe process personal information to operate Morongwa.\n- **Lawful basis:** performance of contract, consent (cookies/marketing), legitimate interests (fraud prevention).\n- **Data collected:** identity, contact, payment, device, location (for tasks), ratings, communications; Morongwa-TV content (videos, images, captions, likes, comments); product enquiry messages.\n- **Use:** account, task facilitation, payments, fraud checks, support; Morongwa-TV content hosting and moderation; product enquiry routing to sellers.\n- **Sharing:** payment processors (DPO/PayGate), payout banks, verification/KYC vendors, support tools as operators; product enquiry messages are shared with the relevant seller.\n- **Cross-border transfers:** safeguarded per POPIA Chapter 9; equivalents or contractual safeguards.\n- **Retention:** kept as needed for legal/operational purposes; then deleted or de-identified.\n- **Security:** encryption in transit, access controls, monitoring.\n- **Rights:** access, correction, deletion, objection, restriction; channels via app/email; response per 2025 POPIA regs.\n- **Breach notification:** we will notify the Information Regulator and affected users where required.\n- **Contact:** Information Officer details in app.`,
  },
  {
    slug: "cookies-tracking",
    title: "Cookie & Tracking Policy",
    category: "privacy",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["cookies", "consent"],
    summary: "Discloses cookies/SDKs, purposes, opt-in banner, opt-out controls, and consent withdrawal.",
    content: `# Cookie & Tracking Policy\n\nWe use cookies and SDKs for authentication, security, analytics, and optional marketing.\n- **Consent:** no pre-checked boxes; you can accept or reject non-essential cookies.\n- **Types:** essential (login, security), analytics (performance), functional (preferences), marketing (only if enabled).\n- **Controls:** banner choices, browser settings, and in-app preferences.\n- **Retention:** per category; refreshed periodically.\n- **Third parties:** analytics providers and PSP widgets where applicable.`,
  },
  {
    slug: "pricing-fees",
    title: "Marketplace Pricing & Fees Policy",
    category: "pricing",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["pricing", "fees", "commission"],
    summary: "Commission 15%, booking fee base, surcharges, product pricing (discounts, out of stock), FX disclosure, examples.",
    content: `# Pricing & Fees\n\n- **Commission:** 15% on task price.\n- **Booking fee:** base R8 (converted locally).\n- **Surcharges:** distance beyond base radius, peak, heavy items, urgent (<2h).\n- **Products:** marketplace products may have discount prices; out-of-stock items cannot be purchased.\n- **FX:** quotes shown in local currency; conversions use disclosed FX rates.\n- **Examples:** see pricing page for live calculator.`,
  },
  {
    slug: "escrow-payouts",
    title: "Escrow & Payouts Policy",
    category: "payments",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["escrow", "payouts", "paygate", "fnb"],
    summary: "How funds are held, release conditions, reversals, payout timing, bank/KYC checks.",
    content: `# Escrow & Payouts\n\n- **Funding:** Client funds task via PayGate (DPO) into FNB merchant account.\n- **Hold:** funds held until task completion + review window or timeout.\n- **Release:** on completion confirmation or timeout; disputes pause release.\n- **Reversals:** if cancelled per Refunds policy.\n- **Payouts:** disbursed to Runner bank (FNB/Capitec/others) after clearance; timing T+1 where supported; failed payouts are retried after bank verification.\n- **KYC:** identity/bank verification may be required before payout.`,
  },
  {
    slug: "marketplace",
    title: "Marketplace Policy",
    category: "platform",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["marketplace", "platform", "listing"],
    summary: "How the Morongwa marketplace works: tasks, products, Morongwa-TV, product enquiry, and completion.",
    content: `# Marketplace Policy\n\n- **Overview:** Morongwa is a task and product marketplace connecting clients who need errands done with runners, and buyers with suppliers/resellers. Morongwa-TV (Qwerty TV) allows content creators to share videos and images and promote products.\n- **Tasks:** Clients post tasks with description, location, and budget; tasks must be lawful and clearly described. Runners see available tasks and may accept.\n- **Products:** Suppliers list products; resellers can add products to their wall. Products appear in the marketplace and on Morongwa-TV. Buyers can purchase or enquire via Messages.\n- **Product enquiry:** Buyers may send enquiries about products; messages are routed to the seller for response.\n- **Morongwa-TV:** Content creators can upload videos and images; products may be linked to posts; content is subject to automated moderation and user reporting.\n- **Pricing:** Task price, booking fee, and surcharges are shown before payment; product prices may include discounts; see Pricing & Fees policy.\n- **Completion:** For tasks, runner marks complete; client may review; funds released per Escrow & Payouts policy.\n- **Standards:** All participants must follow Acceptable Use and Community Guidelines.`,
  },
  {
    slug: "morongwa-tv",
    title: "Morongwa-TV (Qwerty TV) Content Policy",
    category: "platform",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["content", "qwerty-tv", "moderation", "watermark"],
    summary: "Content platform for videos and images; watermark; automated moderation; reporting; product promotion.",
    content: `# Morongwa-TV (Qwerty TV) Content Policy\n\nMorongwa-TV (also known as Qwerty TV) is a content platform for resellers, content creators, and manufacturers to share videos and images, including product promotions.\n\n- **Content types:** Videos, images, and carousels. Content may link to marketplace products.\n- **Who can post:** Authenticated users; content creators, resellers, suppliers.\n- **Watermark:** Content may display a platform watermark ("The Digital Home for Doers, Sellers & Creators - Qwertymates.com") at the start and end of videos and on images.\n- **Moderation:** Posts are published automatically. Automated sensitive-content detection may block sexual, pornographic, violent, or sensitive material. Users may report posts; admins review reports.\n- **Prohibited content:** Sexual, pornographic, violent, or sensitive material (e.g. hacked victim imagery). Violations may result in removal and account suspension.\n- **Interactions:** Like, comment, share, repost, report. Product enquiry routes to Messages.\n- **Products:** Featured products may appear on Morongwa-TV; buyers can purchase or enquire.`,
  },
  {
    slug: "suppliers-manufacturers",
    title: "Suppliers & Manufacturers Policy",
    category: "platform",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["suppliers", "manufacturers", "partners"],
    summary: "Terms for suppliers, manufacturers, and other B2B partners who integrate with or supply the Morongwa platform.",
    content: `# Suppliers & Manufacturers Policy\n\n- **Scope:** This policy applies to businesses that supply goods or services to Morongwa, integrate with our platform, or operate as verified partners.\n- **Engagement:** Partnerships are governed by separate agreements; this policy sets baseline expectations for listing, quality, and compliance.\n- **Listing:** Suppliers and manufacturers who are featured or linked on the platform must provide accurate information and comply with applicable law.\n- **Quality & Safety:** Products and services must meet stated specifications and safety standards; non-compliance may result in removal.\n- **Data:** Any data shared with partners is subject to our Privacy Policy and data processing agreements where required.\n- **Contact:** For partnership enquiries, contact partners@morongwa.io.`,
  },
  {
    slug: "refunds-cancellations",
    title: "Refunds, Cancellations & Cooling-off",
    category: "payments",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["refunds", "cancellations", "cpa"],
    summary: "When clients can cancel, what fees are refundable, cooling-off for distance sales, and timelines.",
    content: `# Refunds & Cancellations\n\n- **Before runner acceptance:** full refund of task amount and booking fee.\n- **After acceptance before work starts:** booking fee non-refundable; task amount refundable.\n- **After work started:** pro-rated or case-by-case; see dispute flow.\n- **Cooling-off:** where applicable under CPA/ECTA for distance sales.\n- **Process:** request via app; timelines communicated in dashboard.`,
  },
  {
    slug: "runner-agreement",
    title: "Runner Agreement (Independent Contractor)",
    category: "contracts",
    visibility: "public",
    countryScope: ["ZA"],
    tags: ["contractor", "sars", "independence"],
    summary: "Defines runner independence, taxes, safety, equipment, verification, ratings, and deactivation criteria.",
    content: `# Runner Agreement\n\n- **Status:** Runner is an independent contractor; not an employee.\n- **Taxes:** Runner responsible for tax; deemed employee rules per SARS Interpretation Note 17 may apply.\n- **Conduct:** safety, lawful tasks only, equipment and data costs for Runner.\n- **Verification:** ID, background, KYC may be required.\n- **Ratings:** transparency and appeal; manipulation prohibited.\n- **Deactivation:** for safety, fraud, policy breaches; appeal path provided.`,
  },
  {
    slug: "client-terms",
    title: "Client Terms",
    category: "contracts",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["client", "responsibilities"],
    summary: "Rules for task posting, lawful content, accuracy, chargebacks, and dispute escalation.",
    content: `# Client Terms\n\n- **Accuracy:** tasks must be clear, lawful, and feasible.\n- **Prohibited content:** illegal, unsafe, deceptive, discriminatory, or infringing tasks.\n- **Chargebacks:** treated as disputes; may suspend account.\n- **Escalation:** follow dispute steps before chargebacks where possible.`,
  },
  {
    slug: "acceptable-use",
    title: "Acceptable Use & Community Guidelines",
    category: "conduct",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["safety", "conduct"],
    summary: "Bans illegal/unsafe tasks, harassment, discrimination, deceptive listings, rating abuse, Morongwa-TV prohibited content, and platform misuse.",
    content: `# Acceptable Use\n\n- No illegal, unsafe, or violent tasks.\n- No harassment, hate, or discrimination.\n- No deceptive listings or fraud.\n- No rating manipulation or spam.\n- **Morongwa-TV:** No sexual, pornographic, violent, or sensitive content (e.g. hacked victim imagery). Automated moderation may detect and block such content; users may report posts. Content showing prohibited material will be removed; repeat offenders may be suspended.\n- Comply with local laws and platform safety rules.`,
  },
  {
    slug: "ratings-reviews",
    title: "Ratings & Reviews Policy",
    category: "conduct",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["ratings", "reviews"],
    summary: "How ratings are calculated, anti-fraud checks, right to reply, removal criteria, and appeals.",
    content: `# Ratings & Reviews\n\n- **Calculation:** averages over recent activity with fraud checks.\n- **Right to reply:** parties may respond to reviews.\n- **Removal:** fraud, hate, off-topic, or privacy violations may be removed.\n- **Appeals:** submit evidence; reviewed by support.`,
  },
  {
    slug: "safety-restricted-tasks",
    title: "Safety & Restricted Task Policy",
    category: "safety",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["safety", "restricted"],
    summary: "Lists disallowed categories and required precautions for heavy/long-distance tasks.",
    content: `# Safety & Restricted Tasks\n\n- **Disallowed:** weapons, hazardous goods, illegal substances, regulated medical/legal services, tasks involving minors without guardian consent.\n- **Precautions:** heavy or long-distance tasks require proper equipment and breaks.\n- **Reporting:** unsafe tasks may be cancelled and escalated.`,
  },
  {
    slug: "intellectual-property",
    title: "Intellectual Property & Content Policy",
    category: "legal",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["ip", "content"],
    summary: "Ownership of task and user content, license to host, Morongwa-TV watermark, takedown process, and infringement reporting.",
    content: `# Intellectual Property & Content\n\n- **Ownership:** you retain ownership of your task and user-generated content.\n- **License:** you grant Morongwa a license to host and display content for service delivery.\n- **Morongwa-TV watermark:** Content shared on Morongwa-TV (Qwerty TV) may include a platform watermark ("The Digital Home for Doers, Sellers & Creators - Qwertymates.com") at the start and end of videos and on images.\n- **Takedowns:** report infringement; we may remove or disable access.\n- **Repeat infringers:** may be suspended.`,
  },
  {
    slug: "security-vulnerability",
    title: "Security & Vulnerability Disclosure",
    category: "security",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["security", "vulnerability"],
    summary: "Security measures, responsible disclosure channel, and commitment to POPIA safeguards.",
    content: `# Security & Vulnerability Disclosure\n\n- **Safeguards:** HTTPS, encryption in transit, access controls, monitoring.\n- **Reporting:** email security contact with details; no public disclosure before fix.\n- **Scope:** production apps and APIs; avoid data destruction.\n- **Response:** we will acknowledge and update on remediation.`,
  },
  {
    slug: "accessibility",
    title: "Accessibility Statement",
    category: "accessibility",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["wcag", "accessibility"],
    summary: "Commitment to accessible UX (WCAG), contact for support, and feedback loop.",
    content: `# Accessibility Statement\n\nWe aim to meet WCAG 2.1 AA.\n- **Feedback:** contact support for accessibility issues.\n- **Alternatives:** we will provide reasonable accommodations.\n- **Continuous improvement:** accessibility reviews in releases.`,
  },
  {
    slug: "popia-compliance-framework",
    title: "POPIA Compliance Framework (Summary)",
    category: "compliance",
    visibility: "internal",
    countryScope: ["ZA"],
    tags: ["popia", "governance"],
    summary: "Records of processing, Information Officer, operator agreements, and breach plan per POPIA.",
    content: `# POPIA Compliance Framework (Summary)\n\n- **Records of processing:** maintained per processing activity.\n- **Information Officer:** appointed; contact available in app.\n- **Operator agreements:** in place with processors.\n- **Breach plan:** detection, containment, notification to Regulator/users when required.`,
  },
  {
    slug: "kyc-aml",
    title: "KYC/AML Policy (FIC Act)",
    category: "compliance",
    visibility: "internal",
    countryScope: ["ZA"],
    tags: ["fika", "aml", "kyc"],
    summary: "Risk-based CDD, RMCP per Guidance Note 7A, STR/TPR processes, goAML readiness.",
    content: `# KYC/AML Policy (Summary)\n\n- **RMCP:** aligned to FIC Act and Guidance Note 7A.\n- **CDD:** identity verification; EDD for higher risk.\n- **Reporting:** STR/TPR filed with FIC as required.\n- **Record-keeping:** per statutory periods.`,
  },
  {
    slug: "tax-independent-contractor",
    title: "Tax & Independent Contractor Policy",
    category: "compliance",
    visibility: "internal",
    countryScope: ["ZA"],
    tags: ["tax", "sars", "independence"],
    summary: "Decisioning for deemed employee tests and documentation for contractor status.",
    content: `# Tax & Independent Contractor Policy (Summary)\n\n- **Tests:** premises and control tests per SARS Interpretation Note 17.\n- **3+ employees rule:** tracked for PAYE exposure.\n- **Documentation:** capture independence representations.`,
  },
  {
    slug: "consumer-complaints",
    title: "Consumer Complaints & Dispute Resolution",
    category: "support",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["complaints", "disputes", "cpa"],
    summary: "CPA-aligned process, escalation path, timelines, evidence requirements, and outcomes.",
    content: `# Consumer Complaints & Dispute Resolution\n\n- **Channels:** in-app form and email.\n- **Timelines:** acknowledgment within defined SLA, resolution target communicated.\n- **Escalation:** from support to specialist review; external ombud info provided where applicable.\n- **Evidence:** users may submit photos, chat, receipts.`,
  },
  {
    slug: "electronic-contracting",
    title: "Electronic Contracting SOP (ECTA)",
    category: "compliance",
    visibility: "internal",
    countryScope: ["ZA"],
    tags: ["ecta", "consent"],
    summary: "Consent capture, timestamps, signature equivalence, and acknowledgment of receipt per ECTA.",
    content: `# Electronic Contracting SOP (Summary)\n\n- **Consent capture:** explicit acceptance of ToS/Privacy with timestamps.\n- **Records:** store evidence of acceptance and IP/user-agent.\n- **Acknowledgment:** confirmations for electronic transactions per ECTA.`,
  },
  {
    slug: "incident-response",
    title: "Incident Response & Breach Notification",
    category: "security",
    visibility: "internal",
    countryScope: ["ZA"],
    tags: ["incident", "breach", "popia"],
    summary: "Detection, classification, containment, notification steps, regulator/user notice timelines per POPIA.",
    content: `# Incident Response & Breach Notification (Summary)\n\n- **Phases:** detect, classify, contain, eradicate, recover.\n- **Notification:** Information Regulator and affected users when required.\n- **Integration:** aligned with AML reporting where relevant.`,
  },
  {
    slug: "escrow-and-payout-policy",
    title: "Escrow & Payout Policy (Morongwa)",
    category: "payments",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["escrow", "payouts", "fnb", "funds", "merchant"],
    summary: "Complete escrow flow, fee structure, payout timing, PayGate/FNB integration, failed reversals, and compliance.",
    content: `# Escrow & Payout Policy

## 1. Purpose & Scope

This policy explains how Morongwa holds client funds in escrow, applies platform fees, and pays out to runners after successful task completion. It applies to all tasks booked on Morongwa in Botswana, Lesotho, Namibia, South Africa, Zimbabwe, and Zambia.

## 2. How Escrow Works

- **Collection via PayGate:** When a client confirms a task, the total amount (task price + booking fee + applicable surcharges) is collected via PayGate (DPO) and settles to Morongwa's FNB merchant account.
- **Custodian holding:** Because settlement goes to your FNB account, Morongwa holds client funds directly as custodian until task completion and review approval.
- **Escrow hold ledger:** System maintains an immutable ledger entry (ESCROW_HOLD) recording the hold, surcharges, and commission at the moment of collection.
- **Release trigger:** Escrow is released when (a) the runner completes the task and the client submits a review, or (b) after the review window expires (default 24–48 hours).

## 3. Fees & Pricing Breakdown

### Booking Fee
- **Amount:** R8 (ZAR); converted to local currency at settlement (BWP, LSL, NAD, ZWL, ZMW).
- **Refundability:** Non-refundable (covers platform operations, payment processing, and fraud prevention).
- **Timing:** Deducted at point of collection (ledger: BOOKING_FEE).

### Commission (Success Fee)
- **Rate:** 15% of the task price (VAT-inclusive where applicable).
- **Application:** Charged only if task is approved for payout. If disputed and refunded, commission is reversed.
- **Ledger:** COMMISSION recorded when escrow is released.

### Surcharges (Conditional)
- **Distance:** R10 (ZAR equiv) per km beyond base service radius. *Morongwa does not collect this; it is added to Runner payout bonus.*
- **Peak hours:** +10% of task price if booked during defined peak (08:00–18:00 weekdays, local time).
- **Weight:** R25 (ZAR equiv) for items >10 kg.
- **Urgency:** R20 (ZAR equiv) for urgent tasks (<2 hours to completion deadline).
- **Ledger:** SURCHARGE for each applicable item at collection.

### Transparent Disclosure (CPA & ECTA)
All fees are displayed at checkout with a clear breakdown:
- Task Price: R500.00
- Booking Fee: R8.00
- Distance Surcharge: R50.00
- Peak Hours Surcharge (+10%): R50.00
- TOTAL HELD IN ESCROW: R608.00
- Runner Commission (15%): R75.00
- Runner Receives (if approved): R483.00
- Morongwa Revenue: R83.00

This aligns with CPA "fair, just & reasonable terms" and "full disclosure" principles.

## 4. Payouts to Runners

### Release Calculation
When escrow is approved for release (task completion + review approval or timeout):
- **Runner Net = Task price + Surcharges − 15% Commission**
- **Example:** R500 task + R50 surcharges − R75 commission = R475 to runner.
- **Ledger:** PAYOUT_INITIATED records the amount and runner wallet credit.

### Payment Rails
- **Primary:** FNB Integration Channel EFT Payment API (automated, daily batch or real-time based on volume).
- **Secondary:** Host-to-Host sFTP/EDI for large batches (fallback).
- **Regional:** RTC (Real-Time Clearing) and TCIB (trans-CMA clearing) for near real-time settling where available in Botswana, Lesotho, Namibia, Zimbabwe, Zambia.

### Payout Timing
- **EFT (standard):** T+1 to next business day settlement.
- **RTC/TCIB:** Near real-time (intra-day) where supported by beneficiary bank.
- **Status tracking:** FNB Transaction History API polled daily for reconciliation; runner is notified of payout status in-app.

### KYC & Bank Verification
- Before first payout, runner bank account details are verified against national banking registry (where available).
- Additional documentation may be requested (ID, address, tax registration) per AML/KYC requirements (FIC Act).

## 5. Failed / Reversed Payouts

### Failure Scenarios
- Invalid account number (bank rejects payment).
- Insufficient merchant account balance (retry queued).
- Regulatory block or sanction match (escalated to Compliance).

### Retry Process
- System automatically retries failed payouts (up to 3 attempts) over 5 business days.
- Runner is notified via SMS/email and in-app after each failure; provided with troubleshooting steps.
- After 3 retries, payment is placed on **manual hold** and escalated to Morongwa support.

### Reversal & Clawback
- If a payout reverses post-settlement (rare; e.g., disputed/fraudulent runner account), Morongwa holds the runner wallet and may pursue collection.
- Ledger: PAYOUT_REVERSED records reversal date and reason.

## 6. Security & Privacy

- **Encryption:** Payment collection and payout are performed via secure APIs (HTTPS, TLS 1.2+).
- **Data storage:** Only essential data is stored (bank account number masked; last 4 digits visible to runner only).
- **Access control:** FNB Integration Channel credentials stored in secure environment variables; API calls logged without PII.
- **PII handling:** Aligned to POPIA principles (purpose limitation, storage limitation, security).
- **Audit trail:** All escrow and payout actions immutably logged with timestamps, user IDs, and status codes.

## 7. Governing Law & Dispute Resolution

- **Jurisdiction:** South African law (CPA, ECTA, POPIA, FIC Act).
- **Electronic contracting:** ECTA governs formation of task contracts and electronic payments.
- **Consumer rights:** CPA protects clients; Morongwa offers a complaints pathway (in-app form and email).
- **Dispute resolution:** Evidence-based mediation; escalation to external ombudsman per CPA.
- **Regional compliance:** For Botswana, Lesotho, Namibia, Zimbabwe, Zambia operations, policies adapt per local law (equivalent standards).

## 8. Currency Exchange & Conversions

- Quotes are shown in local currency (based on runner/client location).
- FX rates are updated daily; disclosed in checkout and payout statements.
- Conversion uses mid-market rates + 0.5% margin (to cover hedging).

## 9. Effective Date & Updates

- Effective: January 2026.
- Updates: Material changes to fee structure or payout rails require 30-day notice in-app and via email.

---

**For questions, contact:** support@morongwa.io
`,
  },
  {
    slug: "refunds-and-cancellations-policy",
    title: "Refunds, Cancellations & Cooling-off Policy (Morongwa)",
    category: "payments",
    visibility: "public",
    countryScope: ["ZA", "BW", "LS", "NA", "ZW", "ZM"],
    tags: ["refunds", "cancellations", "cooling-off", "cpa", "ecta"],
    summary: "When clients can cancel, refund calculations, non-refundable fees, cooling-off rights, and process timelines.",
    content: `# Refunds, Cancellations & Cooling-off Policy

## 1. Before Runner Acceptance

**Client Cancellation Window:** From task posting until a runner accepts.

- **Refund:** Full refund of task price and booking fee (100%).
- **Process:** Click "Cancel Task" in app; refund processed immediately to original payment method (PayGate) or wallet (if chosen).
- **Timeline:** Refund initiated within 1 hour; settled to client bank within 24–48 hours depending on payment processor.
- **Ledger:** REFUND_INITIATED and REFUND_SUCCESS recorded with timestamp.

## 2. After Runner Acceptance / Work In Progress

**After-Acceptance Window:** From runner acceptance until task marked "completed" by runner.

- **Booking Fee:** Non-refundable (R8 or local equivalent). Covers platform operations.
- **Task Price:** Eligible for refund, subject to runner costs committed:
  - **0–15 min after acceptance:** Full refund of task price.
  - **15–60 min:** 75% refund of task price; 25% penalty to runner (compensation for time/travel).
  - **>60 min:** 50% refund of task price; 50% to runner.
- **Surcharges:** Refunded pro-rata based on work completed.
- **Process:** Client initiates via "Request Cancellation" in app; platform mediates (both parties must confirm or system auto-resolves after 48 hours).
- **Ledger:** REFUND_INITIATED with reason; REFUND_SUCCESS on confirmation.

**Example:**
- Task: R500; Runner accepted 30 min ago → Client cancels.
- Refund to client: (R500 × 75%) = R375.
- Booking fee (R8): Not refunded.
- To runner: (R500 × 25%) = R125 + any distance surcharge.
- Net client receives: R375 (from escrow); charged R8 + R125 = R133 total fees.

## 3. After Task Completion / During Review Window

**Post-Completion Window:** From runner marking task "completed" until review window closes (default 24–48 hours).

- **Client Dispute:** If client disputes quality/completion, they may request a refund and escalate to mediation.
  - **Platform review:** Morongwa support reviews photographic evidence, chat logs, and runner response.
  - **Mediation:** If both parties agree, a resolution is brokered (partial refund, re-completion offer, etc.).
  - **Decision:** Binding decision issued within 5 business days.
  - **Refund:** If refund is granted, runner receives proportional compensation (e.g., 50% of task price).
- **Ledger:** DISPUTE_HOLD placed on escrow; DISPUTE_RESOLVED when decision is made; REFUND_SUCCESS if refund granted.
- **No dispute:** After review window closes, escrow is automatically released to runner; refunds no longer possible.

## 4. Cooling-off & Distance Sales (CPA)

**Scope:** South Africa and regional equivalents under CPA and distance-sale laws.

- **Right to cancel:** Where the task is a "distance transaction" (client and runner not in same physical location, task not performed in-person), client has a statutory cooling-off period:
  - **CPA (South Africa):** 5 business days from task posting (unless urgent/immediate need is agreed in writing).
  - **Other regions:** Equivalent local law applies (e.g., Botswana Consumer Protection Act).
  
- **Exclusions from cooling-off:**
  - Tasks where performance has begun (with explicit consent).
  - Tasks of a perishable or time-sensitive nature (e.g., same-day delivery).
  - Custom/bespoke tasks not suitable for other clients.

- **Disclosure:** Cooling-off rights are disclosed in the task confirmation email and in-app message at checkout.

- **Exercise cooling-off:** Client clicks "Cancel" in app or emails support@morongwa.io with task ID and reason.

- **Effect:** Client receives full refund (task price + booking fee) within 10 business days of cancellation notice.

## 5. How Refunds Are Paid

### Refund Methods (Client Choice at Cancellation)

1. **Back to original payment method (PayGate):**
   - Refund is initiated via PayGate's reverse transaction.
   - Timeline: Settled to client's card/bank account within 24–48 hours (depends on card issuer/bank processing).
   - Visible in bank statement as a reversal.

2. **Wallet credit (Morongwa account):**
   - Refund is credited to client's Morongwa wallet.
   - Can be used for future tasks immediately.
   - No bank processing delays.
   - Client can withdraw wallet balance at any time (subject to minimum).

### Non-refundable Items
- **Booking fee (R8 or equiv):** Non-refundable under all circumstances (covers platform fraud prevention, payment processing).
- **Runner compensation** (if applicable): Penalty to runner for cancellation after work started.

## 6. Special Cases

### Client Chargebacks / Dispute with Bank
- If a client initiates a chargeback with their card issuer instead of using Morongwa's refund process, Morongwa will:
  - Investigate the chargeback claim.
  - Provide evidence (task completion photo, chat logs, runner response).
  - May suspend client account pending resolution.
- **Morongwa stance:** We prefer in-app dispute resolution (faster, fairer, evidence-based). Chargebacks suggest a process failure and may result in account restrictions.

### Refund Disputes
- If client and runner disagree on refund eligibility, Morongwa support reviews evidence (timestamps, photos, chat).
- Decision is issued within 5 business days.
- Decision is binding; escalation to external ombudsman available per CPA.

## 7. Data & Privacy

- **Refund processing:** Transaction data (amount, method, timestamp) is used for reconciliation and audit.
- **Dispute handling:** Chat logs and photographic evidence are reviewed by Morongwa support and deleted after 90 days (unless needed for legal hold).
- **Regulatory reporting:** Chargebacks and refund disputes are logged per CPA and FIC Act requirements (where applicable).
- **POPIA compliance:** All personal data handled under POPIA safeguards; no sharing with third parties except as necessary for payment processing.

## 8. Refund Timelines

| Scenario | Timeline |
|----------|----------|
| Before acceptance | 1 hour initiation; 24–48h bank settlement |
| After acceptance (cancellation agreed) | 2 hours initiation; 24–48h bank settlement |
| Dispute resolution (refund granted) | 5 business days decision; then 2 hours initiation; 24–48h settlement |
| Cooling-off exercise | 10 business days from notice |
| Wallet credit (alternative) | Immediate (same day) |

## 9. Effective Date & Updates

- Effective: January 2026.
- Updates: Changes to refund policies require 30-day notice in-app and via email.
- **Previous version:** Available upon request from support@morongwa.io.

---

**For questions, contact:** support@morongwa.io | **Escalations:** ombudsman@morongwa.io
`,
  },
];

export const ensureDefaultPolicies = async (userId?: string) => {
  for (const policy of defaultPolicies) {
    const existing = await Policy.findOne({ slug: policy.slug });
    if (!existing) {
      const version: IPolicyVersion = {
        version: 1,
        status: "published",
        title: policy.title,
        summary: policy.summary,
        content: policy.content,
        publishedAt: new Date(),
        createdBy: userId ? (userId as any) : undefined,
        updatedBy: userId ? (userId as any) : undefined,
      };

      await Policy.create({
        slug: policy.slug,
        title: policy.title,
        category: policy.category,
        visibility: policy.visibility,
        countryScope: policy.countryScope,
        tags: policy.tags,
        currentVersion: 1,
        latestPublishedVersion: 1,
        versions: [version],
      });

      logger.info(`Seeded policy ${policy.slug}`);
    } else {
      const latestVer = existing.versions.find(
        (v) => v.version === existing.latestPublishedVersion && v.status === "published"
      );
      if (latestVer && latestVer.content !== policy.content) {
        const nextVersion = (existing.currentVersion || 0) + 1;
        const newVersion: IPolicyVersion = {
          version: nextVersion,
          status: "published",
          title: policy.title,
          summary: policy.summary,
          content: policy.content,
          publishedAt: new Date(),
          createdBy: userId ? (userId as any) : undefined,
          updatedBy: userId ? (userId as any) : undefined,
        };
        existing.versions.push(newVersion);
        existing.currentVersion = nextVersion;
        existing.latestPublishedVersion = nextVersion;
        existing.title = policy.title;
        await existing.save();
        logger.info(`Updated policy ${policy.slug} to version ${nextVersion}`);
      }
    }
  }
};

export const listPublishedPolicies = async () => {
  return Policy.find({ visibility: "public", latestPublishedVersion: { $exists: true } }).select(
    "slug title category tags countryScope latestPublishedVersion currentVersion versions"
  );
};

export const getPublishedPolicy = async (slug: string) => {
  const policy = await Policy.findOne({ slug });
  if (!policy) return null;
  const version = policy.versions.find((v) => v.status === "published" && v.version === policy.latestPublishedVersion);
  if (!version) return null;
  return { policy, version };
};

export const createPolicyVersion = async (
  slug: string,
  data: Partial<IPolicyVersion> & { title?: string; summary?: string; content: string },
  userId?: string,
  publish = false
) => {
  const policy = await Policy.findOne({ slug });
  if (!policy) {
    throw new Error("Policy not found");
  }

  const nextVersion = (policy.currentVersion || 0) + 1;
  const version: IPolicyVersion = {
    version: nextVersion,
    status: publish ? "published" : "draft",
    title: data.title || policy.title,
    summary: data.summary || "",
    content: data.content,
    publishedAt: publish ? new Date() : undefined,
    createdBy: userId ? (userId as any) : undefined,
    updatedBy: userId ? (userId as any) : undefined,
  };

  policy.versions.push(version);
  policy.currentVersion = nextVersion;
  if (publish) {
    policy.latestPublishedVersion = nextVersion;
    policy.title = version.title;
  }

  await policy.save();
  await AuditLog.create({ action: "POLICY_VERSION_CREATED", user: userId || null, meta: { slug, version: nextVersion, publish } });
  return version;
};

export const publishPolicyVersion = async (slug: string, versionNumber: number, userId?: string) => {
  const policy = await Policy.findOne({ slug });
  if (!policy) throw new Error("Policy not found");

  const version = policy.versions.find((v) => v.version === versionNumber);
  if (!version) throw new Error("Version not found");

  version.status = "published";
  version.publishedAt = new Date();
  version.updatedBy = userId ? (userId as any) : undefined;
  policy.latestPublishedVersion = versionNumber;
  policy.currentVersion = Math.max(policy.currentVersion || 0, versionNumber);
  policy.title = version.title;

  await policy.save();
  await AuditLog.create({ action: "POLICY_PUBLISHED", user: userId || null, meta: { slug, version: versionNumber } });
  return version;
};

export const recordPolicyAcceptance = async (
  slug: string,
  userId: string | null,
  ip?: string,
  userAgent?: string,
  meta?: any
) => {
  const policy = await Policy.findOne({ slug });
  if (!policy || !policy.latestPublishedVersion) throw new Error("Policy not found or unpublished");

  const acceptance = await PolicyAcceptance.create({
    policy: policy._id,
    slug,
    version: policy.latestPublishedVersion,
    user: userId,
    ip,
    userAgent,
    meta,
  });

  await AuditLog.create({ action: "POLICY_ACCEPTED", user: userId, meta: { slug, version: policy.latestPublishedVersion } });
  return acceptance;
};

export const listPolicyVersions = async (slug: string, query: FilterQuery<IPolicy> = {}) => {
  const policy = await Policy.findOne({ slug, ...query });
  return policy;
};
