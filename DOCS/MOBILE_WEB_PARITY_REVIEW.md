# Qwertymates mobile ↔ web parity review

**Purpose:** Single checklist so mobile matches web behaviour before any Play upload.  
**Updated:** 2 Aug 2026 · **Ship only when every P0 row is Done.**

---

## Bug-fix pack (screenshots 2 Aug) — **Done in 1.3.18+; hardened in 1.3.19**

| Issue | Status |
|---|---|
| Registration cellphone (SMS/WhatsApp OTP) | Done |
| Video call Hang up sticky / always tappable | Done (1.3.19 sticky bar) |
| Sponsored horizontal swipe + warehouse stock | Done (Hammanskraal parity) |
| Create post: upload then wait for Post | Done |
| Wall images show full photo (`contain`) | Done (1.3.19 default) |
| Food/Groceries store list → menu + address | Done |
| QwertyTV actions bottom (not under FABs) | Done |
| ACBPay Receive hub, detailed tx, centered modals, Quick Info/Security | Done |

**Verify on device:** Profile must show **App 1.3.19** (or higher). If Profile shows ≤1.3.17, Play has not delivered the build yet — update from Play or sideload the production APK.

---

## Earlier P0 pack — **Done**

1. Create post heading optional  
2. ACBPay in-app verify / Scan QR donate / PayGate WebBrowser  
3. Hub cart stepper + Food/Groceries sections  
4. FAB icons-only + trending swipe  
5. Ask MacGyver multi-source search  

---

## Ship gate
- [x] P0 rows Done  
- [x] `npm run typecheck`  
- [x] Smoke script  
- [x] EAS production **1.3.19** / versionCode **66** + Play submit  
- [x] Ops email  

Build: https://expo.dev/accounts/qwertymates/projects/morongwa-mobile/builds/ef69774b-3651-4f2c-b027-d91e220a73b9  

**Do not** upload while P0 incomplete.
