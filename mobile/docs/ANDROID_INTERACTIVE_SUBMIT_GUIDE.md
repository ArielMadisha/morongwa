# Android Interactive Submit Guide (EAS + Google Play)

Last updated: 2026-04-15

Use this guide to complete first-time Android submission setup interactively.

## 1) Command to Run

From the `mobile/` folder:

```bash
npx eas-cli submit --platform android --profile production --id 05d1dfce-2afa-4e3e-8705-5514c581506b
```

## 2) What This Submission Uses

- Platform: Android
- Build ID: `05d1dfce-2afa-4e3e-8705-5514c581506b`
- Artifact: signed `.aab` from latest production build

## 3) Expected Prompts and Recommended Choices

### Prompt: Google Play service account key not configured

Choose to set up credentials.

Recommended:
- Select option to **provide/connect service account JSON key**
- Use a Play Console service account with at least:
  - Release to production track
  - View app information
  - Manage releases (as needed by your workflow)

### Prompt: Upload/Select service account key

- If asked to upload file path, provide your service account JSON path.
- If asked to create/store key for future submits, choose **Yes**.

### Prompt: Track selection

Recommended for first public rollout:
- `internal` or `closed` (safe validation), then promote to `production`

If you are ready for live release directly:
- `production`

### Prompt: Release status

Recommended:
- Start with `draft` or `completed` depending on your rollout plan.
- If uncertain, choose `draft` and finalize in Play Console manually.

## 4) After Successful Submit

1. Open Play Console release page.
2. Verify:
   - artifact version code
   - release notes
   - country/rollout settings
3. Complete policy sections (if not already complete):
   - Data Safety
   - Content Rating
   - App Access
4. Start rollout.

## 5) Common Issues and Fixes

### "Service Account key invalid" / permission errors

- Ensure service account is linked in Play Console:
  - Setup -> API access
- Ensure the service account has app-level permissions.

### "Package name mismatch"

- Confirm package in app config is `com.qwertymates`.
- Confirm same package exists in Play Console app listing.

### "Version code already used"

- Run a fresh Android production build to auto-increment version code, then submit the new build ID.

## 6) Quick Retry Commands

### Build new Android artifact

```bash
npx eas-cli build --platform android --profile production --non-interactive
```

### Submit latest build interactively

```bash
npx eas-cli submit --platform android --profile production --latest
```

