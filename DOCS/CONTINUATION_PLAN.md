# Morongwa — Continuation Plan & Prioritized Next Steps

Date: 2026-01-09

This document lists prioritized follow-up actions, owners (TBD), and concise commands or checks to continue the work from the audit session.

## Priority 1 — Restore Email Delivery or Provide Mocking

- Problem: SMTP credentials are invalid/missing in dev env; Nodemailer returns `535` which previously caused task flows to fail.
- Action:
  1. Add valid SMTP credentials to `backend/.env` (do not commit `.env`) or configure a dev/mock transport.
  2. Recommended quick test: set `MAILER_TRANSPORT=ethereal` or use nodemailer's test account during dev.
  3. Re-run smoke script: `node backend/scripts/smoke.mjs` and confirm accept/complete flows do not return 500s.

## Priority 2 — Lint & Type Cleanup

- Problem: Multiple `no-explicit-any` warnings and other TypeScript loosenings used as temporary fixes.
- Action:
  1. Run `npm run lint` and `npm run build` in both `backend` and `frontend` and fix type errors iteratively.
  2. Introduce small helpers for role checks (e.g., `isClient(user)`, `isRunner(user)`) and type them.

## Priority 3 — Tests & CI

- Action:
  1. Add unit tests for notification service (mock SMTP), user role helpers, and task lifecycle flows.
  2. Add CI workflow to run `npm test`, `npm run build`, and a short smoke test on PRs.

## Priority 4 — Git & Release

- Action:
  1. Inspect remote `main` to resolve the push rejection: fetch + rebase or fix any malformed files on remote.
  2. Open PR from `update-ignore-env` into `main`; request review.

## Priority 5 — Additional Hardening

- Action:
  1. Add secrets-checker to prevent `.env` from being committed.
  2. Add structured logging for notification failures and retry logic for transient SMTP failures.

## Quick Commands

Backend dev:
```bash
cd backend
npm install
npm run dev
```

Frontend dev:
```bash
cd frontend
npm install
npm run dev
```

Run smoke tests:
```bash
node backend/scripts/smoke.mjs
```

## Notes

- All sensitive changes (SMTP creds, API keys) must live in local `.env` and never be committed.
