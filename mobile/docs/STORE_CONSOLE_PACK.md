# Store Console Pack (Apple + Google)

Last updated: 2026-04-15

Use this as the copy/paste source while filling App Store Connect and Google Play Console.

## 1) Canonical App Identity

- App name: `Qwertymates`
- Bundle/Application ID: `com.qwertymates`
- EAS project: `Qwertymates-mobile`
- Primary domain: `https://qwertymates.com`
- API domain: `https://api.qwertymates.com`

## 2) Public URLs

- Privacy policy URL: `https://qwertymates.com/policies/privacy-policy`
- Terms URL: `https://qwertymates.com/policies/terms-of-service`
- Support URL (recommended): `https://qwertymates.com/support`

If the support page URL differs in production, replace this value before submission.

## 3) App Description Drafts

### Short Description (Google Play)

`All-in-one social, shopping, errands, wallet, and media app.`

### Promotional Text (Apple, optional)

`Connect, create, buy, sell, run errands, and manage your wallet in one app.`

### Full Description (Apple + Google)

`Qwertymates brings social media, digital content, marketplace shopping, errands, and wallet features into one mobile experience.

With Qwertymates you can:
- Discover and share posts in QwertyTV and world feeds
- Report or block abusive users and manage your account privacy
- Buy and sell products through the marketplace and checkout flow
- Post errands, accept tasks as a runner, and track delivery progress
- Manage wallet activity and transactions in one place

Qwertymates is designed for fast daily use with account controls, safety tools, and policy links available in-app.`

## 4) Keywords (Apple)

Use one comma-separated line, no spaces after commas:

`social,marketplace,shopping,wallet,errands,delivery,video,community,creator`

## 5) Category Suggestions

### Apple
- Primary: `Social Networking`
- Secondary: `Shopping`

### Google Play
- App category: `Social`

## 6) Content Rating Guidance

Select answers based on current app behavior:
- User generated content: **Yes**
- User-to-user interaction: **Yes**
- Commerce/payments: **Yes**
- Location use: **Yes** (errands arrival check)
- Strong violence/sexual content/gambling: **No** (unless later features add these)

## 7) App Privacy / Data Safety Mapping (Working Draft)

Verify with legal/compliance owner before final submission.

### Data Collected

- Personal info: name, email, username, phone (account creation/login/profile)
- User content: posts, comments, media uploads
- Messages: direct/chat messages
- Financial info: wallet/payment transaction references
- Location: foreground location for errands arrival checks
- Identifiers: account ID, device/app session identifiers

### Data Use Purposes

- App functionality (core social, marketplace, errands, wallet features)
- Account management and authentication
- Safety/security and abuse prevention (report/block/moderation)
- Customer support and operations

### Data Sharing

- Payment processors and platform services as required for transactions/submission
- Service providers for infrastructure and messaging where applicable

### Security

- Authenticated API access
- Role-based backend controls
- User report and block mechanisms
- Account deletion flow available in-app

## 8) Reviewer Notes Template (Apple + Google)

`Qwertymates is a combined social + commerce + errands + wallet app.

Core reviewer paths:
1. Login/Register
2. Feed (report/block content)
3. Marketplace cart/checkout
4. Errands create/accept/start/complete
5. Wallet and profile actions (including account deletion)

Policy links are available from auth screens:
- Terms: /policies/terms-of-service
- Privacy: /policies/privacy-policy

If reviewer needs role-specific flows, use the provided demo credentials in App Access notes.`

## 9) App Access / Demo Credentials

Prepare at least:
- Standard client account
- Runner account
- Admin/moderation visibility account (if requested)

Do not store secrets in repo. Keep credentials in console "App Access" fields only.

## 10) Screenshot / Preview Asset Matrix

Capture from release build, not Expo dev client.

### iOS Required Sets
- 6.7" iPhone screenshots (required)
- 6.5" iPhone screenshots (recommended backup)
- iPad screenshots if `supportsTablet=true` (recommended to avoid review friction)

### Android Required Sets
- Phone screenshots (minimum required by Play)
- 7-inch/10-inch tablet screenshots if targeting tablets
- Feature graphic for Play listing

### Suggested Screenshot Sequence
1. Feed / QwertyTV home
2. World/news + report/block safety flow
3. Marketplace product + cart/checkout
4. Errands client + runner actions
5. Wallet overview
6. Profile and account controls

## 11) Known Submission Blockers (Current)

### iOS
- Apple Developer membership expired
- App Store Connect agreements pending
- EU trader status/compliance pending

### Android
- First submit requires interactive setup of Google Play service account key in EAS submit flow

## 12) Immediate Commands

### Android submit (interactive, recommended now)

```bash
cd mobile
npx eas-cli submit --platform android --profile production --id 05d1dfce-2afa-4e3e-8705-5514c581506b
```

### iOS build (after Apple renewal/compliance)

```bash
cd mobile
npx eas-cli build --platform ios --profile production
```

