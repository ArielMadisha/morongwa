# EAS Android Play release — July 2026 quota resume

## Background

Expo **free-tier Android builds** for account `qwertymates` were exhausted in **June 2026**. Upload reached EAS (`versionCode` would have been **38**) but the build was rejected with:

> This account has used its Android builds from the Free plan this month, which will reset … on Wed Jul 01 2026.

## Scheduled automation (owner PC)

Register once:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/windows/Register-EasAndroidJulyBuildTask.ps1
```

| Setting | Value |
|---------|--------|
| Task | `Qwertymates-EAS-Android-July-Release` |
| Start | **2026-07-01 08:00** local, then daily through **2026-07-07** |
| Action | `Run-EasAndroidPlayRelease.ps1` → `runEasAndroidPlayReleaseWhenQuotaOpen.mjs` |

Verify:

```powershell
Get-ScheduledTask -TaskName "Qwertymates-EAS-Android-July-Release"
Get-ScheduledTaskInfo -TaskName "Qwertymates-EAS-Android-July-Release"
```

Log: `mobile/exports/eas-android-release-task.log`  
State: `mobile/exports/eas-android-release-state.json`

## Manual release (from `mobile/`)

```bash
npm run verify:android-release-readiness
npm run release:android:play
```

Or step by step:

```bash
npm run verify:google-play
npm run build:android:production
npm run submit:android:production:by-build-id -- <BUILD_ID>
```

## Included in this release (June 2026 backlog)

- **v1.3.1** — `mobile/app.json`
- Tablet / JTY K108 Play compatibility — `withAndroidDeviceCompatibility.js`
- WebRTC **polling-first** signaling — `callSignaling.ts`
- Status strip **multi-segment** viewer (swipe through school gallery statuses)
- Qwertymates branding / Q logo in shell

## Cursor rule

`.cursor/rules/eas-android-july-build.mdc` (`alwaysApply: true`) — agents must resume the Play release after quota resets.
