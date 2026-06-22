# Huawei AppGallery (Qwertymates Android)

Huawei does not use `eas submit` like Google Play. You produce a release **AAB** (preferred) or **APK**, then upload it in **AppGallery Connect**.

## 1. Huawei developer account

1. Register at [Huawei Developers](https://developer.huawei.com/).
2. Complete identity verification (individual or company) as required by Huawei.
3. Open [AppGallery Connect](https://developer.huawei.com/consumer/en/service/josp/agc/index.html) → **My apps** → **Add app**.

## 2. Local build (EAS)

From the `mobile/` directory:

```bash
npm run verify:huawei
npm run build:android:huawei
# or same signing as local Play keystore:
npm run build:android:huawei:local
```

- Downloads an **`.aab`** from the EAS build page when finished.
- For quick device testing outside AppGallery, you can use **`npm run build:android:huawei:apk`** (APK profile `huawei-apk`).

Signing: use the **same Android upload keystore** as Google Play if the application id is the same (`com.qwertymates`). Configure in EAS credentials (`eas credentials`) or `production-local` with local keystore.

## 3. AppGallery Connect checklist

- **Package name** must match `app.json` → `expo.android.package` (`com.qwertymates`).
- **Version**: align `expo.version` (and store version codes with your release process / EAS `appVersionSource`).
- **Privacy policy URL** (required): e.g. your live site policy page.
- **Screenshots**, **short/full description**, **content rating** questionnaire.
- **AAB upload**: Distribution → **Upload** package (Huawei supports Android App Bundle for distribution).

## 4. Google Mobile Services (GMS) note

This app is mostly **REST + WebSocket + WebRTC**; there is **no** `expo-notifications` / Firebase dependency in `package.json`. Many Huawei devices still run your build fine.

If you later add **FCM push** or **Google Maps**, plan optional **HMS Push Kit** / **Huawei Map Kit** for users without GMS — not required for the initial AppGallery listing if you do not depend on those APIs.

## 5. After upload

Use Huawei’s review flow (similar to other stores). For updates, bump `expo.version` / version code and run `build:android:huawei` again, then upload the new artifact.
