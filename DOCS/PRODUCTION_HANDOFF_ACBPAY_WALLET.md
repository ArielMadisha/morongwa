# Production handoff — ACBPay Wallet (web)

See `backend/exports/agent-instruction-attachments/PRODUCTION_HANDOFF_ACBPAY_WALLET.md` for the full agent runbook.

**Deployed:** July 2026 — fintech dashboard, Pay at Shop, Scan/Show QR, Cash & Agents (mock), in-wallet phone verify.

**Components:** `frontend/components/wallet/` (`PayAtShopFlow`, `WalletQrCard`, `QrScannerModal`, `PhoneVerifyModal`, `CashAgentsFlow`, `FlowModal`, `walletAgents.ts`).

**API:** `GET /wallet/my-pending-payments`, `POST /wallet/confirm-my-payment` (+ existing `/wallet/pending-payments`, `/wallet/pay-pending-with-wallet`).
