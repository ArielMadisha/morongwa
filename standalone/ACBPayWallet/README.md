# ACBPayWallet (standalone mirror notes)

The **live** wallet API, PayGate flows, and WhatsApp menus live in the Morongwa monorepo. This folder documents what to keep in sync for a **standalone ACBPayWallet** satellite.

## Consumer surfaces

| Surface | Location |
|---------|----------|
| Full web wallet (Pay at shop, agents, till) | `frontend/app/wallet/page.tsx` on Qwertymates |
| Native ACBPay app | `ACBPayWallet/mobile/` sibling project (Expo) |
| Web wallet sign-in | `ACBPayWallet/src/app/wallet/page.tsx` |
| API gateway + sync | `ACBPayWallet/src/app/api/*` |

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

## Sync scripts

Copies the signed **satellite dispatcher** and wallet reference mirrors into sibling ACBPayWallet:

```bash
cd backend
npm run standalone:sync-acbpaywallet
```

Also refreshes `standalone/ACBPayWallet/src/services/satelliteSync.ts` (minimal git-tracked mirror).

After meaningful sync-protocol changes, re-run sync, then commit.
