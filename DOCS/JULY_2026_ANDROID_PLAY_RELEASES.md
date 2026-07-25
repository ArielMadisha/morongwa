# Android Play releases — 1 July 2026 (owner schedule)

**Owner decision (June 2026):** Ship **Qwertymates** and **ACBPay** to Google Play on **1 July 2026** when Expo EAS free-tier quota resets. **Defer Morongwa Messenger** until hub/call fixes are complete.

---

## Ship on 1 July 2026

| App | Package | Project path | Windows task | Time (local) |
|-----|---------|--------------|--------------|--------------|
| **Qwertymates** | `com.qwertymates` | `morongwa/mobile/` | `Qwertymates-EAS-Android-July-Release` | **08:00** |
| **ACBPay** | `com.acbpay.wallet` | `ACBPayWallet/mobile/` (sibling) | `ACBPay-EAS-Android-July-Release` | **09:30** |

Retries: daily **1–7 July** if quota still blocked. Stops after first successful Play submit (state file `completedAt`).

### Register tasks (owner PC)

```powershell
# Qwertymates (monorepo)
powershell -NoProfile -ExecutionPolicy Bypass -File "c:\Users\Dell\.cursor\projects\morongwa\mobile\scripts\windows\Register-EasAndroidJulyBuildTask.ps1"

# ACBPay (sibling)
powershell -NoProfile -ExecutionPolicy Bypass -File "c:\Users\Dell\.cursor\projects\ACBPayWallet\mobile\scripts\windows\Register-EasAndroidJulyBuildTask.ps1"
```

### Verify

```powershell
Get-ScheduledTask -TaskName "Qwertymates-EAS-Android-July-Release"
Get-ScheduledTask -TaskName "ACBPay-EAS-Android-July-Release"
Get-ScheduledTaskInfo -TaskName "Qwertymates-EAS-Android-July-Release"
Get-ScheduledTaskInfo -TaskName "ACBPay-EAS-Android-July-Release"
```

### Manual (if PC asleep at 08:00)

```bash
# Qwertymates — from morongwa/mobile/
npm run verify:android-release-readiness
npm run release:android:play:quota-resume

# ACBPay — from ACBPayWallet/mobile/
npm run typecheck
npm run release:android:play:quota-resume
```

### What Qwertymates July build includes

- **v1.3.1** — June 2026 backlog (tablet compat, status viewer, Q logo, call signaling updates)
- See `DOCS/EAS_ANDROID_JULY_BUILD.md`

### What ACBPay July build includes

- First Play listing **`com.acbpay.wallet`** — Qwertymates auth + wallet API
- **v1.0.0** — `ACBPayWallet/mobile/app.json`

---

## Deferred (not 1 July)

| App | Reason | Re-enable when |
|-----|--------|----------------|
| **Morongwa Messenger** | Fix Morongwa hub / WebRTC / related changes first | Owner approves new ship date |

Task **disabled** (not deleted): `Morongwa-Messenger-EAS-Android-July-Release`

```powershell
# Re-enable later:
powershell -File "c:\Users\Dell\.cursor\projects\morongwa-messenger\mobile\scripts\windows\Register-EasAndroidJulyBuildTask.ps1"
```

---

## Logs and state

| App | Log | State |
|-----|-----|-------|
| Qwertymates | `morongwa/mobile/exports/eas-android-release-task.log` | `eas-android-release-state.json` |
| ACBPay | `ACBPayWallet/mobile/exports/eas-android-release-task.log` | `eas-android-release-state.json` |
| Morongwa Messenger | `morongwa-messenger/mobile/exports/...` | (deferred) |

---

## Agent duty on 1 July 2026

1. Confirm both scheduled tasks exist and Morongwa Messenger task is **Disabled**.
2. If quota open: run releases for **Qwertymates** then **ACBPay** (or confirm task logs show success).
3. Report version, versionCode, EAS build URL, Play submission URL for each app.
4. Do **not** ship Morongwa Messenger unless owner explicitly re-prioritizes.
