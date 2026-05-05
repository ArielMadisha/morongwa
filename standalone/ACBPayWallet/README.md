# ACBPayWallet (standalone mirror notes)

The **live** wallet API, PayGate flows, and WhatsApp menus live in the Morongwa monorepo. This folder documents what to keep in sync for a **standalone ACBPayWallet** satellite.

## Morongwa → satellite sync

Morongwa pushes signed events when `SATELLITE_SYNC_SECRET` and `ACBPAYWALLET_SYNC_URL` are set (`backend/src/services/satelliteSync.ts`).

Event families routed to ACBPayWallet:

- `payment.*`
- `wallet.*`
- `merchant_agent.*`

## Source files to review when changing wallet behaviour

| Area | Path |
|------|------|
| Wallet balance + WhatsApp push side effects | `backend/src/services/walletBalanceSideEffects.ts` |
| Wallet routes | `backend/src/routes/wallet.ts` |
| WhatsApp wallet UX | `backend/src/routes/waFlow.ts` (ACBPayWallet menu blocks) |
| Satellite dispatcher | `backend/src/services/satelliteSync.ts` |

## Sync script

Copies the signed **satellite dispatcher** (`satelliteSync.ts`) next to Ask MacGyver mirrors:

```bash
cd backend
npm run standalone:sync-ask-macgyver
```

Wallet domain logic stays in the monorepo (`wallet.ts`, `walletBalanceSideEffects.ts`, `waFlow.ts`); mirror those in your standalone wallet repo when behaviour changes.

After meaningful sync-protocol changes, re-run sync, then commit.
