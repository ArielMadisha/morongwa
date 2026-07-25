# WebRTC voice/video calls — “Calling…” / “Connecting…” stall

**Status:** Known issue — documented only (no fix in this note).  
**Observed:** June 2026 on production web (`www.qwertymates.com`) between real accounts (e.g. `@aturetutu` ↔ `@africanhistory`).  
**UI:** `VideoCallView` spinner modal — never reaches live audio/video (`connected`).

---

## Symptom (what users see)

Both sides can remain on a loading modal indefinitely (or until manual Cancel / long timeout):

| UI label | Who typically sees it | Meaning in code |
|----------|----------------------|-----------------|
| **Calling…** | Outgoing caller | `callStatus === 'calling'` — ring phase; waiting for callee to accept |
| **Connecting…** | Caller (after accept) and/or callee (after Accept) | `callStatus === 'connecting'` — SDP offer/answer + ICE; waiting for media path |

Screenshots show:

1. **Calls page** — caller stuck on **Calling…** (peer e.g. “African History”).
2. **Profile / elsewhere** — party stuck on **Connecting…** (peer name shown, spinner, Cancel only).

Neither side shows the in-call UI (local/remote video, mute, hang up on active call). Audio and video never start.

---

## Expected end-to-end flow (1:1 direct call)

Room id: `direct-{sortedUserIdA}-{sortedUserIdB}` (`frontend/lib/callRoom.ts`).

```
Caller                          Server (/webrtc)                    Callee
  |                                   |                              |
  |-- join-user-presence ------------>|                              |
  |-- join-call-room ---------------->|                              |
  |-- call-request ------------------>|-- call-request ------------->|  (presence room)
  |   [UI: Calling…]                  |                              |  [incoming modal]
  |                                   |<-- call-accept --------------|
  |<-- call-accept -------------------|                              |
  |   [UI: Connecting…]               |                              |  [UI: Connecting…]
  |-- webrtc-offer ------------------>|-- webrtc-offer ------------->|
  |                                   |<-- webrtc-answer -------------|
  |<-- webrtc-answer ------------------|                              |
  |<=========== ICE + media (needs TURN across NAT) ============>    |
  |   [UI: connected]                 |                              |  [UI: connected]
```

**Code paths:** `frontend/hooks/useWebRTC.ts`, `frontend/contexts/CallPresenceContext.tsx`, `frontend/contexts/WebRTCCallContext.tsx`, `backend/src/services/webrtcSignaling.ts`.

---

## Where it actually stops (the real problem)

This is **not** a single bug in the modal UI. The modal correctly reflects two different **stuck phases** in the Morongwa WebRTC pipeline:

### Phase A — Stuck on **Calling…** (ring never completes)

**Actual problem:** The caller never receives a `call-accept` (or the callee never successfully sends one).

Common causes in this codebase:

1. **Callee not present on the signaling channel**  
   Incoming ring is delivered only to the callee’s Socket.IO **presence room** (`join-user-presence`). The callee must be signed in with `CallPresenceProvider` active (Qwertymates tab open, `/webrtc` socket connected). If not, the server logs `call-request: callee not in presence room` and emits `call-unavailable` to the caller — but if presence is flaky (reconnect, background tab, ad blocker), the caller may sit on **Calling…** until the **60s ring timeout** instead of a clear offline state.

2. **Callee never accepts**  
   `call-request` arrived but user did not tap Accept on the global incoming modal (`CallPresenceContext`).

3. **`call-accept` delivery failure**  
   Ring events use aggressive fan-out (target socket id + presence + call room). Media events do **not** (see Phase B). If accept is lost due to socket id mismatch or reconnect mid-call, caller stays on **Calling…**.

4. **Crossed / duplicate call attempts**  
   If both users call each other at once, each side can be in `calling`/`connecting` with conflicting handler state on the **shared per-tab** `/webrtc` socket.

### Phase B — Stuck on **Connecting…** (signaling accepted, media never starts)

**Actual problem:** Ring succeeded (`call-accept` exchanged), but the WebRTC peer connection **never reaches a state where `markConnected()` runs**, so UI never leaves **Connecting…** (until **45s connect timeout** → toast → `endCall()`).

`connected` is set only when (`useWebRTC.ts`):

- `RTCPeerConnection.ontrack` receives a remote `MediaStream`, **or**
- `connectionState === 'connected'`, **or**
- `iceConnectionState` is `connected` / `completed`.

If SDP or ICE never completes, none of these fire.

**Primary technical gap — silent loss of media signaling:**

In `backend/src/services/webrtcSignaling.ts`, `deliverToPeer` treats **ring** and **media** differently:

- **Ring** (`call-accept`, `call-reject`, …): try socket id → presence → call room; warn if unreachable.
- **Media** (`webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`): try socket id → call room → presence; **if all miss, the event is dropped with no error to either client**.

So both sides can show **Connecting…** while offer, answer, or ICE candidates never reach the peer. The UI has no intermediate feedback for “negotiation failed” — only a delayed timeout.

Contributing factors:

1. **TURN / NAT** — ICE servers from `GET /api/webrtc/turn-credentials` (`frontend/lib/webrtcIce.ts`). If TURN is missing or wrong, peers on different networks often never complete ICE (STUN-only warning in console). Symptom: indefinite **Connecting…** then timeout.

2. **Timing / ordering** — Caller sends `webrtc-offer` only after `call-accept` and local `getUserMedia` + `RTCPeerConnection` setup. Callee emits `call-accept` before `getUserMedia` finishes; offers are queued in `pendingOfferRef` when PC is not ready. This usually works but is sensitive to slow permissions or handler detach on reconnect.

3. **Single shared socket per tab** — Caller and callee both reuse the presence socket (`getCallPresenceSocket()`). Handlers are attached/detached per call (`attachCallSocketHandlers`). A reconnect or second call attempt can detach handlers while the UI still shows **Connecting…**.

4. **`peerSocketIdRef` staleness** — Media delivery prefers `toSocketId` from the last ring event. After reconnect, that id may be invalid; fallback depends on both peers being in the same `join-call-room` room at the exact moment media is sent.

---

## What this is NOT

- **Not** the PSTN / Twilio voice path (`voice.ts`, `PstnCallPanel`) — that is a separate stack.
- **Not** Morongwa Meet lobby mode (`joinMeetingRoom`) — different code path (can show **connected** in lobby without a peer).
- **Not** camera permission alone — denied permissions show a toast and reset to `idle`, not an endless spinner (unless an error path is missed).

---

## Timeouts (current behaviour)

| Timer | Duration | When armed | On fire |
|-------|----------|------------|---------|
| Ring | 60s | Outgoing `startCall` | “No answer — try again later”, `idle` |
| Connect | 45s | After `call-accept` / `sendOffer` | “Video connection timed out…”, `endCall()` |

Users may wait up to **45–60 seconds** before any automatic recovery.

---

## Relevant files (for a future fix)

| Area | Path |
|------|------|
| Client call state machine | `frontend/hooks/useWebRTC.ts` |
| Incoming ring UI | `frontend/contexts/CallPresenceContext.tsx` |
| Call session wiring | `frontend/contexts/WebRTCCallContext.tsx` |
| Modal copy (“Calling…” / “Connecting…”) | `frontend/components/VideoCallView.tsx` |
| Outgoing from Calls page | `frontend/app/calls/page.tsx` |
| Signaling + delivery | `backend/src/services/webrtcSignaling.ts` |
| Room ACL | `backend/src/utils/socketAuth.ts` (`assertWebrtcRoomAccess`) |
| ICE / TURN | `frontend/lib/webrtcIce.ts`, backend TURN credentials route |
| Smoke scripts | `backend/scripts/smokeWebrtcSignaling.mjs`, `smokeWebrtcBrowserParity.mjs` |

---

## How to reproduce / diagnose (later)

1. Two browsers, two Qwertymates accounts, both tabs open and signed in.
2. **Calls** → search peer → Video or Voice.
3. Callee must see **incoming** modal and tap **Accept**.
4. Watch browser console + Network → WebSocket `/webrtc` for: `call-request`, `call-accept`, `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`.
5. Server logs: `call-request: callee not in presence room`, `deliverToPeer: target unreachable`, `deliverToPeer: ring target unreachable`.
6. Run: `node scripts/smokeWebrtcBrowserParity.mjs <callerId> <calleeId> --prod` from `backend/` (signaling only, no real media).

**Interpretation:**

- Stuck **Calling…** → missing `call-accept` on caller socket.
- Stuck **Connecting…** with `call-accept` present → missing or one-sided `webrtc-offer` / `webrtc-answer` / ICE, or ICE failure (often TURN).

---

## Summary (one paragraph)

Qwertymates Morongwa **1:1 WebRTC calls** use a two-step protocol: **ring** over Socket.IO presence, then **WebRTC negotiation** (SDP + ICE). The reported issue is that calls **never leave the pre-media UI**: callers hang on **Calling…** when the callee does not accept or `call-accept` never arrives; both sides hang on **Connecting…** when accept succeeded but **media signaling or ICE never completes**. The most likely systemic defect is **silent dropping of `webrtc-offer`, `webrtc-answer`, and ICE events** when peers are not reachable via the narrow media delivery path, combined with **TURN/NAT failure** and **shared-socket handler lifecycle** issues — not a failure of the loading modal itself.

---

## Recommended path forward

After many fix attempts, further patches to this stack are low confidence. See **[`WEBRTC_CALL_ALTERNATIVES.md`](./WEBRTC_CALL_ALTERNATIVES.md)** for managed RTC options (Twilio Client-to-Client voice, Twilio Video / LiveKit for video) and a migration outline.

For a review of the latest server-side fan-out + logging proposal, see **[`WEBRTC_STALL_FIX_INSPECTION.md`](./WEBRTC_STALL_FIX_INSPECTION.md)** (deployed 2026-06-30). Operational runbook: **[`WEBRTC_STALL_FIX_DIAGNOSTIC_v2.md`](./WEBRTC_STALL_FIX_DIAGNOSTIC_v2.md)**.
