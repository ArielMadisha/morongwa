# Qwertymates — iOS App Store checklist

**Bundle ID:** `com.qwertymates.app`  
**Display name:** Qwertymates  
**SKU:** `qwertymates-ios`  
**ASC Apple ID (`ascAppId`):** `6798004708` (wired in `mobile/eas.json` → `submit.production.ios`)  
**Expo project:** `qwertymates` / `morongwa-mobile`  
**Privacy policy:** https://www.qwertymates.com/policies/privacy-policy  
**Account deletion help:** https://www.qwertymates.com/account-deletion  
**Support:** support@qwertymates.com · https://www.qwertymates.com

> **Team ID:** not yet in `eas.json` — paste 10-char Apple Team ID from [developer.apple.com/account](https://developer.apple.com/account) → Membership details into `submit.production.ios.appleTeamId` when known.

Paste-ready listing copy and screenshots live outside the monorepo:

`C:\Users\Dell\.cursor\projects\App Stores Graphics\IOS\Qwertymates\`

| Asset | Path |
|---|---|
| Listing copy | `docs/03-APP-STORE-LISTING.md` |
| Icon 1024 full-bleed | `logos/qwertymates-ios-icon-1024-fullbleed.png` (also `mobile/assets/ios-icon.png`) |
| iPhone 6.7" | `screenshots/iphone-6-7/` |
| iPhone 6.5" | `screenshots/iphone-6-5/` |
| iPhone 5.5" | `screenshots/iphone-5-5/` |
| iPad 12.9" | `screenshots/ipad-12-9/` (+ landscape) |

---

## Code / build readiness (this repo)

From `mobile/`:

```bash
npm run verify:ios:release-readiness
npm run build:ios:production
# after ASC app + credentials:
npm run submit:ios:production
```

### Already in `mobile/app.json`

- Bundle `com.qwertymates.app`, tablet support, `buildNumber`
- `ITSAppUsesNonExemptEncryption: false`
- Camera / mic / photo library / location usage strings
- `ios.privacyManifests` (UserDefaults, file timestamp, disk space, boot time)
- Official App Store icon via `ios.icon` → `assets/ios-icon.png`

### Account deletion (Guideline 5.1.1(v))

In-app: **Profile → Delete my account** (password + type `DELETE`). API: `DELETE /api/users/:id` with `{ password }`.

### Sign in with Apple

Auth is email / phone OTP — no Google/Apple OAuth in the mobile app. Sign in with Apple is **not required** unless a third-party login is added later.

### Background modes / VoIP

Calls use in-app WebRTC (`react-native-webrtc`). No PushKit / CallKit background VoIP mode is declared. Do **not** add `voip` UIBackgroundModes unless CallKit + push is implemented.

### Force update

- Android: `GET /api/mobile/android-update-policy` (force on)
- iOS: `GET /api/mobile/ios-update-policy` — **force off by default** until the first App Store listing is live; set `MOBILE_IOS_FORCE_UPDATE=true` and `MOBILE_IOS_STORE_URL=https://apps.apple.com/app/idXXXXXXXX` after launch

---

## App Store Connect — manual steps

1. **Apple Developer Team** membership active; create App ID `com.qwertymates.app` if missing.
2. **App Store Connect** → New App → bundle `com.qwertymates.app`.
3. Paste listing from `03-APP-STORE-LISTING.md` (name, subtitle, description, keywords, support URL).
4. Upload screenshots from App Stores Graphics folders (6.7" required for modern iPhone).
5. Upload 1024×1024 icon if ASC does not take it from the binary.
6. **App Privacy** (nutrition labels) — declare data linked to user as applicable: contact info, user content, payment/wallet info, location (errands / nearby stores), identifiers. Tracking: typically **No** unless ads SDKs are added.
7. **Age rating** questionnaire — social networking + user-generated content; unrestricted web not primary.
8. **Encryption** — uses standard HTTPS only; matches `ITSAppUsesNonExemptEncryption: false`.
9. Create **App Store Connect API key** (Issuer ID + Key ID + `.p8`) for EAS submit; store via `eas credentials -p ios` (do not commit `.p8`).
10. Fill `eas.json` → `submit.production.ios`:

```json
"ios": {
  "ascAppId": "<numeric App Store Connect app id>",
  "appleTeamId": "<10-char Team ID>",
  "appleId": "<apple-id email used for ASC>"
}
```

Or rely on EAS interactive submit / ASC API key env once credentials are on the Expo account.

11. After first approved build: set production `MOBILE_IOS_STORE_URL` and optionally `MOBILE_IOS_FORCE_UPDATE=true`.

---

## Known blockers (credentials)

| Blocker | Minimum unblock |
|---|---|
| **EAS iOS distribution credentials not set up** | On owner PC (interactive TTY): `cd mobile` then `npx eas-cli credentials -p ios` → log in to Apple Developer account → let EAS create Distribution Certificate + App Store provisioning profile for `com.qwertymates.app`. Then `npm run build:ios:production`. |
| Non-interactive build fails | Error: `Credentials are not set up. Run this command again in interactive mode.` Agent CI cannot complete Apple login (stdin not readable). |
| No ASC app record | **Done** — ASC app exists; Apple ID / `ascAppId` = `6798004708` (SKU `qwertymates-ios`) |
| No ASC API key for non-interactive submit | Users and Access → Integrations → App Store Connect API → create key; set via `eas credentials` → App Store Connect API Key (or `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID`) |
| `appleTeamId` unknown | Membership → Team ID (10 chars); optional for submit if ASC API key is on EAS account |

Do **not** claim the app is shipped to the App Store until EAS build **and** submit succeed.
