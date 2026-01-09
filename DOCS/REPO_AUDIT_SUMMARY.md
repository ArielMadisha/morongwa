# Morongwa — Repository Audit & Change Summary

Date: 2026-01-09

This document captures the repository audit, recent hardening work, implemented features, test results, and the current repository state as of the above date. It was created to centralize the findings from an automated audit and iterative fixes performed during a review session.

## 1. Purpose

- Record the high-level audit of the codebase.
- Document changes made during the session (frontend & backend).
- Provide reproducible test outcomes and current limitations.
- Offer clear next steps for maintainers.

## 2. Summary (Top-level)

- Backend: Node.js + TypeScript + Express + Mongoose (MongoDB).
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS.
- Realtime: Socket.IO used for notifications.
- Email: Nodemailer configured via SMTP (dev env required).
- Key issues found: inconsistent `role` typing (string vs array), SMTP credential failures causing 500s, lint/type warnings remaining, remote git divergence.

## 3. Changes Implemented

- Unified `role` semantics across frontend and backend where applicable; frontend `User.role` tightened to `Array<'client'|'runner'|'admin'|'superadmin'>` and UI checks migrated to `role.includes(...)`.
- Added endpoints / fields:
  - Runner vehicle uploads (up to 3 vehicles) and PDP upload endpoints.
  - Runner geolocation update endpoint.
  - Task `closedAtDestination` handling and client confirm-delivery endpoint (`/tasks/:id/confirm-delivery`).
- Hardened notification service to catch and log SMTP errors instead of throwing, preventing email failures from aborting core task flows.
- Added smoke test script (backend/scripts/smoke.mjs) to exercise registration, top-up, task creation, accept/complete flows.
- Added `.gitignore` to ensure `.env` is not tracked and reduce accidental secrets exposure.

## 4. Files Touched (high-level)

- backend/src/data/models/User.ts — added `vehicles`, `pdp`, `location`, `runnerVerified`.
- backend/src/data/models/Task.ts — added `closedAtDestination` flag.
- backend/src/routes/users.ts — added vehicle/PDP upload endpoints and location endpoint.
- backend/src/routes/tasks.ts — added confirm-delivery and acceptance guards for unclosed tasks.
- backend/src/services/notification.ts — made SMTP sends resilient (caught exceptions).
- frontend/lib/types.ts — updated `User.role` type.
- frontend/lib/api.ts, frontend/contexts/AuthContext.tsx, frontend/app/register/page.tsx — adapted register flows to send `role` as an array and use array-safe checks.
- backend/scripts/smoke.mjs — automated smoke tests (register/login/topup/create/accept/complete).

## 5. Smoke Test Results (representative)

- Backend health endpoint: GET `/health` → 200 OK.
- Register client & runner: 201 Created; returned tokens and role arrays.
- Top-up (test): 200 OK; balance updated.
- Create task: 201 Created.
- Accept / Complete task: earlier produced 500 due to SMTP auth failures (invalid dev SMTP credentials). After notification hardening, flows continue but email delivery still requires valid credentials.

## 6. Known Issues & Limitations

- SMTP credentials: current dev `.env` lacks valid SMTP credentials. Nodemailer reports `535 Invalid login` when using invalid or missing credentials. Notification service now logs this error instead of throwing, but real email delivery requires correct credentials.
- Linting/type warnings: ESLint and TypeScript strictness are enabled, but multiple `no-explicit-any` warnings and other type cleanups remain.
- Git: Attempted push to `main` failed due to remote divergence; changes were pushed to branch `update-ignore-env`. Review and PR required for merging.

## 7. Reproduction Steps (local)

1. Copy and configure environment:

   - Backend: `cp backend/.env.example backend/.env` and fill `MONGODB_URI`, `JWT_SECRET`, and SMTP vars if email is required.
   - Frontend: `cp frontend/.env.local.example frontend/.env.local` and set `NEXT_PUBLIC_API_URL`.

2. Start services:

   - Backend:
     ```bash
     cd backend
     npm install
     npm run dev
     ```

   - Frontend:
     ```bash
     cd frontend
     npm install
     npm run dev
     ```

3. Run smoke script (optional):

   ```bash
   node backend/scripts/smoke.mjs
   ```

4. Observe endpoints `/health`, `/api/tasks/available`, and the frontend root.

## 8. Branch & Commit State

- Changes from the audit session were committed locally and pushed to remote branch `update-ignore-env` (do not push `.env`).
- A PR from `update-ignore-env` into `main` is recommended after reviewing and resolving any remote divergences.

## 9. Ownership & Contact

- This audit file was generated from an automated assistant session. For questions or follow-up, contact the repository maintainer listed in the repository metadata or create an issue referencing this file.

---
*End of audit summary.*
