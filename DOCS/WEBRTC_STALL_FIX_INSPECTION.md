# Inspection: proposed WebRTC stall “FIX” (signaling fan-out + logging)

**Date:** June 2026  
**Status:** **Deployed + verified (signaling + TURN)** — June 30, 2026. Real browser media still needs user QA (Wi‑Fi ↔ mobile data).  
**Related:** [`WEBRTC_CALL_CONNECTING_STALL.md`](./WEBRTC_CALL_CONNECTING_STALL.md), [`WEBRTC_CALL_ALTERNATIVES.md`](./WEBRTC_CALL_ALTERNATIVES.md), [`WEBRTC_STALL_FIX_DIAGNOSTIC_v2.md`](./WEBRTC_STALL_FIX_DIAGNOSTIC_v2.md)

---

## What was proposed

A write-up claimed the Morongwa 1:1 call stall was **FIXED** by:

1. **Aggressive fan-out** in `deliverToPeer()` for media events (same as ring)
2. **CRITICAL ERROR logs** when delivery fails
3. **INFO/DEBUG logs** on `call-accept`, `webrtc-offer`, `webrtc-answer`, ICE
4. **TURN env** (`TURN_SHARED_SECRET`, `TURN_URLS`, …)
5. New doc `WEBRTC_STALL_FIX_DIAGNOSTIC_v2.md`

---

## What is actually in the repo (verified)

### ✅ Present in `backend/src/services/webrtcSignaling.ts`

| Claim | Verified |
|-------|----------|
| Unified fan-out (socket id → presence → call room) for media | **Yes** — lines 74–80 emit to all applicable channels |
| `deliverToPeer FAILED` error with diagnostics | **Yes** — lines 82–95 |
| `call-accept: received, forwarding to caller` | **Yes** — lines 217–223 |
| `webrtc-offer: forwarding` / `webrtc-answer: forwarding` | **Yes** — lines 298–305, 327–334 |
| `webrtc-ice-candidate: forwarding` (debug) | **Yes** — lines 357–364 |

`RING_EVENTS` / `MEDIA_EVENTS` sets are still declared (lines 51–52) but **no longer branch differently** inside `deliverToPeer` — dead metadata from the old design.

### ❌ Not found in repo

| Claim | Status |
|-------|--------|
| `DOCS/WEBRTC_STALL_FIX_DIAGNOSTIC_v2.md` | **Present** — deploy + diagnose runbook |
| `.env` updated with `TURN_SHARED_SECRET` in tracked examples | **Not confirmed** — `backend/.env` has no `TURN_*` in visible lines; `deploy-server.secrets.example` uses `TURN_USERNAME` / `TURN_PASSWORD`, not `TURN_SHARED_SECRET` |
| Frontend / mobile changes | **None** in this proposal |
| Production deploy + successful test call after change | **Not documented** |

### TURN reality (`backend/src/routes/webrtc.ts`)

The API supports **two** modes:

1. **Ephemeral (coturn):** `TURN_SHARED_SECRET` → HMAC username/credential  
2. **Fallback:** `TURN_USERNAME` + `TURN_PASSWORD` (marked `fallback: true` in JSON)

If **neither** is set on the server, `GET /api/webrtc/turn-credentials` returns **503** and the frontend uses **STUN only** (`frontend/lib/webrtcIce.ts` warns in console). Cross-network calls remain likely to fail on **Connecting…** even with perfect signaling.

---

## Is this a “FIX”?

### What it **does** improve

| Area | Effect |
|------|--------|
| **Observability** | Real — failed delivery and forwarding steps are now visible in server logs |
| **Media delivery odds** | **Maybe** — if the old code exited after a dead `toSocketId` and never tried presence/call room, fan-out helps |
| **Ring phase** | Already had stronger delivery; logging on `call-accept` helps confirm ring → media transition |

### What it **does not** fix

| Gap | Why stalls can continue |
|-----|-------------------------|
| **Client state machine** | `frontend/hooks/useWebRTC.ts` unchanged — races, shared socket handler detach, `pendingOfferRef`, 45s/60s timeouts |
| **ICE / NAT** | Without working TURN on production, **Connecting…** persists after good signaling |
| **Callee offline** | `call-request` to empty presence → `call-unavailable` (caller should toast); still **Calling…** until timeout if mis-handled |
| **Duplicate events** | Fan-out can deliver the **same** offer/answer/ICE **2–3×** (direct socket + presence room + call room). Clients have some SDP dedup guards; duplicates can still stress signaling state |
| **No user-facing error** | Logs help ops; users still see spinner until timeout unless client maps failures to toasts |
| **Mobile app** | Same custom WebRTC stack; no parallel fix described |

**Verdict:** Labeling this **FIXED** is **overstated**. Accurate label: **server-side signaling hardening + diagnostics**. It addresses **one** failure mode (silent server-side drop) from the stall doc, not the whole system.

---

## Risks introduced by aggressive fan-out

Previous media path tried **one** channel then stopped. New path:

```text
if (targetSocketId valid) → emit to socket
always → emit to presence room (if non-empty)
always → emit to call room (if non-empty)
```

Implications:

1. **Duplicate deliveries** to the same peer when they are in presence + call room (normal during a call).
2. **Call-room broadcast** — `webrtcNs.to(roomId).emit` sends to **every** socket in the room (both peers). Handlers filter by `fromUserId`, but extra traffic and edge-case handler bugs are possible.
3. **`delivered` flag** is true if **any** channel had members — even if the **target peer’s** socket was not connected (e.g. presence room occupied by a stale second tab).

These are acceptable trade-offs **if** duplicates are handled; they are not a substitute for a managed RTC SFU.

---

## How to validate this proposal (before calling it fixed)

Run on **production** after deploy:

1. **TURN check** (signed-in user JWT):
   ```bash
   curl -s -H "Authorization: Bearer <token>" https://api.qwertymates.com/api/webrtc/turn-credentials | jq .
   ```
   Expect `username` + `credential` (not 503, not STUN-only in browser console).

2. **Same-network test** — two browsers, both signed in, accept incoming call → should reach **connected** if signaling was the only issue.

3. **Cross-network test** — e.g. mobile data vs Wi‑Fi — **requires TURN**; if this fails while same-network works, fan-out did not fix ICE.

4. **Log trace** for one failed call:
   - `call-accept: received` on server?
   - `webrtc-offer: forwarding` then **no** `deliverToPeer FAILED`?
   - `webrtc-answer: forwarding`?
   - If all present but UI still **Connecting…** → problem is **ICE/TURN or client PC**, not signaling drop.

5. **Smoke script** (signaling only, no real media):
   ```bash
   cd backend
   node scripts/smokeWebrtcBrowserParity.mjs <callerId> <calleeId> --prod
   ```

**Pass criteria for “fixed”:** real users on production complete 1:1 video **and** voice across **different networks**, repeatedly — not just cleaner logs.

---

## Comparison to alternatives doc

| Approach | Confidence after 10+ failures |
|----------|-------------------------------|
| This proposal (more fan-out + logs + TURN env) | **Low–medium** — worth deploying and monitoring, but history suggests more patches won’t stabilize the full stack |
| Twilio Client-to-Client (voice) / LiveKit or Twilio Video | **High** for connectivity — outsource ICE + media |

Recommendation: **Deploy this if not already live**, use logs to classify failures, but **do not close** the stall issue or cancel the alternatives track until production cross-network calls pass consistently.

---

## Suggested doc / process corrections

If adopting this work officially:

1. Add the missing **`WEBRTC_STALL_FIX_DIAGNOSTIC_v2.md`** (or merge into `WEBRTC_CALL_CONNECTING_STALL.md` § diagnose).
2. Document **actual** TURN vars in `backend/.env.production.example`: `TURN_SHARED_SECRET` *or* `TURN_USERNAME`/`TURN_PASSWORD`, plus `TURN_URLS`.
3. Change status from **FIXED** → **Mitigation deployed — verify on prod**.
4. Add a short “duplicate fan-out” note in code comments for future maintainers.

---

## Production verification (2026-06-30)

| Check | Result |
|-------|--------|
| `npm run deploy:production` | OK |
| `npm run sync:turn-env-remote` | OK — TURN URLs + ephemeral creds on API |
| `npm run fix:coturn-turn-auth` | OK — `coturn` active |
| `GET /api/webrtc/turn-credentials` (--prod) | HTTP 200, `hasCredential: true`, not fallback |
| `smokeWebrtcSignaling.mjs` @aturetutu ↔ @africanhistory | **PASS** |
| `smokeWebrtcBrowserParity.mjs` | **PASS** |
| `www.qwertymates.com` + `/wall` | HTTP 200 |

**Note:** Fan-out delivers duplicate `call-accept` / offer / answer events in smoke logs (3× typical). Clients dedupe some SDP; monitor for signaling-state glitches in real calls.

---

## One-paragraph summary

The proposed solution **is partially implemented** in `webrtcSignaling.ts` and is a **reasonable server-side improvement** (especially logging and trying all delivery channels). It is **not** a complete fix: **no client changes**, **no proof of TURN on production**, **missing diagnostic doc**, and **ICE/NAT + custom `RTCPeerConnection` lifecycle** can still leave users on **Calling…** / **Connecting…**. Treat it as **diagnostics and one signaling-layer patch**; validate with TURN + cross-network calls before declaring victory; keep [**WEBRTC_CALL_ALTERNATIVES.md**](./WEBRTC_CALL_ALTERNATIVES.md) as the fallback if verification fails again.
