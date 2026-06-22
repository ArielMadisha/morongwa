# Mobile Release Readiness (iOS + Android)

Last updated: 2026-04-15

## 1) Product/Policy Readiness

- [x] In-app account deletion flow available from profile.
- [x] Account closure now removes profile/contact PII and deactivates access.
- [x] User-generated content reporting available from feed/world surfaces.
- [x] User block capability implemented (persistent account block, cross-device via API).
- [ ] Public-facing moderation policy page reviewed and aligned with in-app behavior.
- [ ] Moderation SLA and escalation process documented for reviewer questions.
- [ ] iOS digital goods/payment policy final decision documented (especially music/download features).

## 2) Mobile Technical Readiness

- [x] TypeScript checks passing (`mobile` typecheck).
- [x] Expo doctor/dependency issues resolved for current SDK.
- [x] Location permissions included for errands arrival checks.
- [x] Root `.easignore` configured for monorepo (small upload archive).
- [ ] Real-time errands updates beyond polling (push/socket) still pending.
- [ ] Errands map picker/address UX polish still pending.

## 3) Build/Release Pipeline Readiness

- [x] Android production EAS build can run in non-interactive mode.
- [ ] iOS production credentials must be finalized interactively in EAS (certificate/provisioning).
- [ ] Final iOS production build + App Store submission runbook verification.
- [ ] Final Android production build + Play submission runbook verification.

## 4) Store Console Metadata Readiness

### Apple App Store Connect
- [ ] App Privacy "nutrition labels" completed accurately.
- [ ] Privacy Policy URL and Support URL set.
- [ ] Content rights declarations and age rating completed.
- [ ] Required screenshots uploaded for all target devices.
- [ ] Demo/test account notes prepared for review team.

### Google Play Console
- [ ] Data Safety form completed (wallet/payments/messages/media/location).
- [ ] Content rating questionnaire completed.
- [ ] Target audience + families declarations completed.
- [ ] App access instructions (test credentials) prepared for review.
- [ ] UGC moderation evidence/process notes ready if requested.

## 5) Go/No-Go Checklist

Before pressing submit for both stores:

1. Run `mobile` typecheck and confirm clean.
2. Run production EAS builds for Android + iOS.
3. Smoke test login, feed, report/block, errands, checkout, wallet, and account deletion on release builds.
4. Verify Privacy Policy and Terms links resolve correctly from the app.
5. Confirm store metadata/forms are complete and consistent with real app behavior.

## 6) Next Phase (Execution Order)

### Step A — iOS credential unblock (interactive, one-time)

Run in `mobile/` locally (interactive terminal):

```bash
npx eas-cli build --platform ios --profile production
```

Expected outcome:
- Distribution certificate validated
- Provisioning profile created/attached
- Build starts successfully in EAS cloud

If prompted:
- Reuse existing bundle identifier `com.qwertymates`
- Let EAS manage credentials automatically unless you have a specific manual cert policy

### Step B — Final production builds

```bash
# Android
npx eas-cli build --platform android --profile production --non-interactive

# iOS (can use non-interactive after Step A succeeds)
npx eas-cli build --platform ios --profile production --non-interactive
```

Capture build URLs and artifact links in release notes.

### Step C — Release-candidate smoke test

Test on both platforms using production builds:
- Auth: login/register/password change/sign-out
- Feed safety: report content + block creator account
- Errands: create/accept/start/complete/arrival check
- Wallet + checkout: wallet path and card redirect path
- Profile: edit profile + account deletion flow

### Step D — Store console completion

Apple:
- App Privacy labels
- age/content declarations
- screenshots
- support/privacy URLs
- reviewer test notes

Google Play:
- Data Safety
- content rating
- app access instructions
- target audience declarations

### Step E — Submission

After Steps A-D are complete:

```bash
# Android submit (interactive first-time setup for Google service account key)
npx eas-cli submit --platform android --profile production --id 05d1dfce-2afa-4e3e-8705-5514c581506b

# iOS submit (ensure App Store Connect app metadata is complete first)
npx eas-cli submit --platform ios --profile production --non-interactive
```

## 7) Reference Docs

- Store metadata and console field pack: `mobile/docs/STORE_CONSOLE_PACK.md`
- End-to-end release smoke runbook: `mobile/docs/SMOKE_RUNBOOK_PRODUCTION.md`
- Store text copy bundle: `mobile/docs/STORE_TEXT_BUNDLE.md`
- App Privacy/Data Safety worksheet: `mobile/docs/APP_PRIVACY_DATA_SAFETY_MAPPING.md`
- Reviewer app-access template: `mobile/docs/REVIEWER_ACCESS_PACKET.md`

## 8) Current Live Blockers (as of 2026-04-15)

- iOS:
  - Apple Developer membership expired
  - App Store Connect agreement updates pending
  - EU trader status/compliance details pending
- Android:
  - Google Play service account key setup requires interactive `eas submit` once

