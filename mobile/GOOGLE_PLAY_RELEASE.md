# Publish Qwertymates (`com.qwertymates`) to Google Play

## Target API level (Play policy)

Google Play requires **targetSdkVersion ≥ 34** (Android 14). `app.json` sets **`compileSdkVersion` / `targetSdkVersion`: 35** so new EAS production builds comply. If Console still shows API 30, the **old 2021 AAB** is still the active production release — submit a new build (`npm run build:android:production` then `submit:android:production:by-build-id`).

## 0) Fastest way to fix “wrong signing key” (no repo changes required)

Google compares the **SHA1 of the keystore that signed your `.aab`** with **Play Console → App integrity → App signing → Upload key certificate**.

1. **Confirm your `.jks` matches what Play expects** (or matches Expo if you are doing an upload-key reset):

   ```powershell
   cd mobile
   $env:KEYSTORE_PASSWORD = "YOUR_KEYSTORE_PASSWORD"
   node ./scripts/verify-upload-keystore.mjs "C:\path\to\upload.jks" YOUR_ALIAS
   ```

   When the script says it **matches Play’s AC:35…**, continue.

2. **Attach that same file to Expo** (this is what actually changes EAS builds — a file on disk outside Expo does nothing):

   - **Web (often clearest):** [Expo → Credentials](https://expo.dev/accounts/qwertymates/projects/morongwa-mobile/credentials) → **Android** → **production** → manage keystore / upload.
   - **CLI:** `npx eas-cli credentials` → **Android** → **production** → **Keystore** → you will see a short list similar to:
     - **Set up a new keystore** — choose this, then on the **next** questions pick **upload / use existing** (wording varies). **Do not** choose **Generate a new Android Keystore** unless you are doing a Play **upload key reset** and will register the new SHA1 in Play Console.
     - **Change default keystore** — switch which saved credential **configuration** is the default (e.g. revert to an older named set like `Build Credentials B2-5s5kjHE` if you created a bad new one).
     - **Download existing keystore** — backup only.
     - **Delete your keystore** — only if you are sure you want to remove that saved configuration.

     Some CLI versions also offer **credentials.json: Upload/Download…** on an earlier menu — that path can sync a local `credentials.json` up to Expo (see Expo “existing credentials” docs). That option only works if **`credentials.json` exists in the same directory as `eas.json`** (for this repo: `mobile/credentials.json`). Create it first with `npm run prepare:android-play-upload -- "…\file.jks"` (with `KEYSTORE_PASSWORD` / `KEY_ALIAS` set) or by copying `credentials.json.example` → `credentials.json` and editing paths/passwords.

3. **Rebuild and submit** (versionCode bumps on EAS):

   ```powershell
   npm run build:android:production
   npm run submit:android:production
   ```

### Optional: `credentials.json` on disk (advanced)

- Copy `credentials.json.example` → `credentials.json`, put your upload keystore at `credentials/play-upload.jks`, fill passwords/alias.
- **Note:** EAS **cloud** uploads respect `.gitignore` — gitignored keystore files are **not** sent to the server. Prefer **Expo dashboard / `eas credentials`** upload, or a private CI that injects files.
- Profile **`production-local`** sets `credentialsSource: "local"` for builds that read `credentials.json` (see `eas.json`).

### Non-interactive signing (no `eas credentials` menus)

Use this when you have the **correct Play upload `.jks`** on disk (SHA1 must match **Play → App integrity → Upload key** unless you completed an upload-key reset).

1. Install JDK so `keytool` exists (optional but recommended): `winget install Microsoft.OpenJDK.17`
2. From **`mobile/`**:

   Put **`KEYSTORE_PASSWORD`** and **`KEY_ALIAS`** in **`mobile/.env`** (often already used for API URLs) **or** in **`mobile/.env.signing`**. To use the second file only: `copy .env.signing.example .env.signing` then edit `.env.signing`. The prepare script loads **`.env` first**, then **`.env.signing`** (signing file wins on duplicate keys).

   **Do not** put real secrets in **`.env.example`** or **`.env.signing.example`** — those are templates and may be committed to git.

   If EAS reports **“The alias specified for this keystore does not exist”**, **`KEY_ALIAS` must match an entry inside `credentials/play-upload.jks` exactly** (case-sensitive). From `mobile/` run `npm run list:android-upload-keystore-aliases`, copy the **Alias name** from the output into **`KEY_ALIAS`**, then run `npm run prepare:android-play-upload` again. The prepare script also checks the alias locally when `keytool` is available.

   If Gradle logs show `No key with alias 'Qwertymates'`, you used the **app display name** as `KEY_ALIAS`; use the alias from `keytool` instead. Prefer keeping **`KEYSTORE_PASSWORD` / `KEY_ALIAS` in `.env.signing` only** so they are not mixed with `EXPO_PUBLIC_*` in `mobile/.env` (Expo may log `env: export KEYSTORE_PASSWORD KEY_ALIAS` during Android prebuild when those keys exist in a loaded env file).

   ```powershell
   npm run prepare:android-play-upload
   npm run build:android:production:local
   ```

   After the build **finishes**, submit **that** build by ID. **`npm run submit:android:production` uses `--latest`**, which can pick a different profile’s build (EAS default keystore `9D:A8…` instead of your Play upload key `AC:35…`).

   ```powershell
   npm run submit:android:production:by-build-id -- PASTE_BUILD_ID_FROM_EXPO
   ```

   Example: `npm run submit:android:production:by-build-id -- e1ef119b-c8ec-420b-a547-b494e3dc06aa`

   Use **`submit:android:production`** (`--latest`) only when you are sure the latest Android build on the account is the one you want (e.g. you only use remote `production` credentials and never mix in other profiles).

   **Do not** paste two npm commands on one line (e.g. `npm run build … npm run submit …`) — the second command becomes invalid arguments to `eas build`.

3. **`mobile/.easignore`** forces EAS to **include** `credentials.json` and `credentials/play-upload.jks` in the upload (they stay **gitignored**). **`.env.signing` and `.env` are excluded** so passwords are not sent to Expo build servers.

4. **Run every `eas` command from `mobile/`** (same folder as `eas.json`).

5. After a good release, delete `credentials.json`, `credentials/play-upload.jks`, and optionally `.env.signing` from disk if you like.

If you accidentally chose **“Generate a new keystore”** in Expo, that only affects the **remote** default profile. **`production-local`** builds still use your **local** `.jks` from the steps above.

## 1) Unblock signing (required — EAS error you saw)

EAS reported:

- **Found (EAS build):** SHA1 `9D:A8:32:D4:72:78:36:FA:1C:69:B5:CE:FC:BB:F5:64:37:D5:1D:3B`
- **Expected (Play):** SHA1 `AC:35:AC:B7:2E:34:57:56:78:C3:BB:24:39:A7:FC:9C:A2:94:D3:B1`

### Path A — You still have the original upload keystore (best)

1. Find the **`.jks` / `.keystore`** and passwords used for the **first** Play uploads (2021).
2. Confirm SHA1 matches Play’s **upload key** (Play Console → **App integrity** → **App signing** → *Upload key certificate*):

   ```powershell
   keytool -list -v -keystore YOUR.keystore -alias YOUR_ALIAS
   ```

   Look for **SHA1** — it must be `AC:35:...` (same as Play).

3. Install EAS CLI and attach that keystore to **production** Android credentials:

   ```powershell
   cd mobile
   npx eas-cli credentials
   ```

   **Android** → **production** → **Keystore** → **Set up a new keystore** → on the **next** prompts choose **upload / use existing keystore** (not “generate new”).  
   If you already have multiple credential sets, use **Change default keystore** to pick the one whose **SHA1** matches Play.

   If the CLI never offers upload, use the **Expo website Credentials** link above, or the **Non-interactive signing** section below (`prepare:android-play-upload` + `build:android:production:local`).

4. Rebuild (new versionCode auto-increments on EAS):

   ```powershell
   npm run build:android:production
   ```

5. Submit:

   ```powershell
   npm run submit:android:production
   ```

   Or for **Open testing** first (Play “Open testing” = API track **beta**):

   ```powershell
   npm run submit:android:open-testing
   ```

### Path B — No keystore file (upload key reset)

1. Play Console → **App integrity** → follow **Upload key reset** / contact flow (wording varies by account).
2. Export / register the **new upload certificate** from EAS after EAS generates or holds a keystore (`eas credentials`).
3. After Google accepts the new upload key, **rebuild** and **submit** again.

## 2) Service account (for `eas submit`)

- File path (already in `eas.json`): `mobile/credentials/google-play-service-account.json`
- Must **not** be committed (listed in `.gitignore`).
- The JSON user must have **Release to production** (or appropriate) permissions in Play Console → **Users and permissions**.

## 3) Photo & video permissions (Play policy)

If submit fails with:

> All developers requesting access to the photo and video permissions are required to tell Google Play about the core functionality

1. This repo uses **Android Photo Picker** via `expo-image-picker` and **blocks** `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` in `app.json` → `android.blockedPermissions`.
2. Play Console → **Policy** → **App content** → **Photo and video permissions** → declare **No** broad access (or remove declaration if an old track still ships those permissions).
3. Update **all tracks** (internal, closed, open, production) so no older AAB with broad media permissions blocks the release.
4. Rebuild (`npm run build:android:production:local`) and submit the **new** build by ID.

## 4) Play Console — finish a release (no empty “Preview”)

1. **Open testing** or **Production** → **Edit release** (draft).
2. **Step 1 — Create release:** upload **`.aab`**. Confirm **New app bundles** shows **version code > 2** (e.g. 6).
3. **Release notes** → **Save**.
4. **Preview and confirm** only after a bundle appears.
5. Complete **Policy** prompts (e.g. **Advertising ID**, **Government apps**) if the console requires them.
6. **Send for review** / **Roll out**.

## 5) Repo config already aligned with Play (Android 16 note)

- `app.json`: `"orientation": "default"` (no manifest portrait lock for large screens).
- Runtime portrait on phones: `expo-screen-orientation` in `App.tsx`.
- **Tablet / budget device compatibility (e.g. JTY K108):** `plugins/withAndroidDeviceCompatibility.js` marks camera, mic, GPS, and telephony as **not required** in the manifest so Play does not exclude 10″ tablets. `expo-build-properties` keeps **minSdk 24** and builds **armeabi-v7a** (32-bit Spreadtrum/MTK tablets) plus arm64-v8a. Ship a **new AAB** after these changes; then Play Console → **Device catalog** should list JTY K108 as supported.

Ship a **new** AAB so Play stops analyzing the **old** manifest.

## 6) One-shot commands (from `mobile/`)

```powershell
npm run verify:google-play
npm run release:android:play
```

`release:android:play` runs verify → production build → production submit. Fix signing before it can succeed.
