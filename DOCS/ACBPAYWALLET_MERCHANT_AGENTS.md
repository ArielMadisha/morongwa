# ACBPayWallet — Merchant agents (cash-in / cash-out)

Merchant agents let users **without easy bank access** move between **physical cash** and **ACBPayWallet balance** through **trusted businesses** that hold **wallet float** on the platform.

## Requirements (non-negotiable)

1. **KYC** — The applicant’s Qwertymates account must be **KYC-verified** (`isVerified`) before an application can be submitted or approved. This is the standard identity baseline for cash-adjacent activity.

2. **Admin approval** — Enabling agent operations is **not** self-serve. The user submits an application (business name, description of the **active operating business**, optional public note). **Admins** review and **approve** or **reject**. Only **approved** agents can perform agent transactions or appear in the public agent list (when they choose to be listed).

3. **Active operating business** — Applicants must describe a real, ongoing business (shop, kiosk, service desk, etc.). False statements can lead to rejection or suspension.

4. **Liquidity (float)** — An agent can only **credit a customer’s wallet** after a cash deposit if the agent’s **own ACBPayWallet balance** is sufficient for that amount. There is no platform credit line: the merchant must **top up** (PayGate, card, etc.) or already hold balance. Insufficient balance blocks the transfer.

5. **Phone number** — Customers receive SMS for deposit approvals; agents receive SMS for withdrawal handovers. A verified phone on the profile is required to **apply** as an agent.

## Flows (summary)

| Flow | What happens |
|------|----------------|
| **Apply** | User submits business details + attests KYC/business truth → status `pending`. |
| **Admin approve** | Status `approved`; agent can list in search and run cash deposit / receive withdrawal transfers. |
| **Cash deposit** | Agent initiates; customer approves in app; **agent wallet → customer wallet** (agent must have float). |
| **Cash withdrawal** | Customer sends wallet balance **immediately** to chosen agent; customer collects **physical cash** offline. Only use agents you trust. |
| **Suspend / reinstate** | Admin can suspend an approved agent; reinstate restores `approved`. |

## Admin API (backend)

- `GET /api/admin/merchant-agents?status=pending|approved|rejected|suspended|all`
- `POST /api/admin/merchant-agents/:userId/approve`
- `POST /api/admin/merchant-agents/:userId/reject` — body: `{ reason?: string }`
- `POST /api/admin/merchant-agents/:userId/suspend`
- `POST /api/admin/merchant-agents/:userId/reinstate`

All require **admin** or **superadmin** JWT (same as other `/api/admin/*` routes).

## Wallet API (user)

- `GET /api/wallet/merchant-agent/me` — status, business fields, `canApply`, `isVerified`, etc.
- `POST /api/wallet/merchant-agent/apply` — submit application (KYC + phone + business fields + attestation).
- `PATCH /api/wallet/merchant-agent/me` — **approved agents only**: listing toggle + public note.

## UI

- **Users:** `/wallet` — Merchant agents section (apply, status, listing, deposit/withdraw).
- **Admins:** `/admin/merchant-agents` — queue and actions.

## Compliance note

This feature is **not** a licensed banking service; it is **peer-assisted wallet balance movement** with **admin-gated** agents. Adjust copy and legal review for your jurisdiction.
