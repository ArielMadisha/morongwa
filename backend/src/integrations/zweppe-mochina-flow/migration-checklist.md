# Migration Checklist: Legacy Zweppe Flow -> Morongwa

## Goal

Support WhatsApp users with the old Zweppe/Mochina conversation logic while keeping Morongwa auth and wallet architecture.

## Phase 1: Compatibility layer (no Twilio Flow redesign yet)

1. Create routes returning legacy `MSGCODE` payloads:
   - `POST /api/wa/zweppe/game/checkUser`
   - `POST /api/wa/zweppe/game/checkUsername`
   - `POST /api/wa/zweppe/game/registerUser`
   - `POST /api/wa/zweppe/game/listBetValues`
   - `POST /api/wa/zweppe/game/loadWallet`
   - `POST /api/wa/zweppe/runner/convertToRunner`
   - `POST /api/wa/zweppe/funds/generatePaymentLink`
   - `POST /api/wa/zweppe/funds/walletToWalletTransfer`

2. Keep Twilio Studio widgets mostly unchanged by updating only:
   - `function_1` endpoint resolver output (`apiUrl`)
   - HTTP widget URLs to new `/api/wa/zweppe/*` paths

3. Add body/phone normalization helpers:
   - Accept both `whatsapp:+27...` and `+27...`
   - Keep `join-*` parsing semantics (`join-GM`, `join-REF`)

## Phase 2: Map old behavior to current models

- `DotUser` -> `User`
- `game_user` wallet fields -> `Wallet` + `WalletTransaction`
- old runner type -> current `role` includes `"runner"`
- legacy refer bonus -> new referral transaction in wallet service

## Phase 3: Optional modernization

- Replace Twilio Studio menu tree with webhook + state machine in backend
- Move OTP to existing `/auth/send-otp` and `/auth/verify-otp`
- Remove legacy MD5/SHA1 password assumptions from old flow payloads

## Critical compatibility notes

- Legacy flow depends on exact misspelled codes like `INSUFFICIANT_BALANCE` and `INAVLID_OTP`.
- Preserve these exact strings in compatibility responses or Studio `split-based-on` will break.
- Flow expects many requests as `application/x-www-form-urlencoded`.

## Security upgrades to keep

- Never return raw OTP in API responses (legacy did in `/generateOtp`).
- Use existing rate limits in `backend/src/middleware/rateLimit.ts`.
- Keep Twilio secrets only in `.env`, never in flow JSON.
