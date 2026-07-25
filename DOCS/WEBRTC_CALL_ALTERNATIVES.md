# WebRTC in-app calls — recommended alternatives (replace custom stack)

**Status:** Strategic recommendation — not implemented.  
**Context:** After many fix attempts, Morongwa **1:1 voice/video** still stalls on **Calling…** / **Connecting…**. See diagnosis: [`WEBRTC_CALL_CONNECTING_STALL.md`](./WEBRTC_CALL_CONNECTING_STALL.md).

**Conclusion:** Stop patching roll-your-own WebRTC on Socket.IO. Move in-app calls to a **managed RTC provider** (extend existing Twilio for voice; add Twilio Video or LiveKit for video).

---

## Why the current approach keeps failing

The Morongwa stack combines:

1. A **custom call state machine** (`calling` → `connecting` → `connected`) in `frontend/hooks/useWebRTC.ts`
2. **Custom media transport** — raw `RTCPeerConnection` with home-grown SDP offer/answer and ICE relay via `backend/src/services/webrtcSignaling.ts`

That is two hard problems at once. Signaling delivery, ICE, TURN, reconnects, and browser/mobile differences are what hosted RTC products are built for.

**Proof it can work on this stack:** PSTN Morongwa voice already uses **Twilio Voice SDK** (`@twilio/voice-sdk`, `twilioVoiceService.ts`) — WebRTC is handled inside Twilio; the app only issues tokens and TwiML.

---

## Better directions (ranked for Qwertymates)

### 1. Twilio — extend what already works (best fit)

You already ship Twilio Voice for wallet PSTN calls. Extend the same vendor for **in-app user ↔ user** calls.

| Mode | How | Pros | Cons |
|------|-----|------|------|
| **App ↔ app voice** | TwiML `<Dial><Client>user-{mongoId}</Client></Dial>` + same Voice SDK | Reuses tokens, billing, mobile/web SDK; no custom ICE; ring/accept built into Device | Voice only (no video) |
| **App ↔ app video** | **Twilio Programmable Video** | Same vendor; web + mobile SDKs; SFU handles NAT | Per participant-minute cost; new integration |

**Recommendation:**

- **In-app voice between Qwertymates users** → **Twilio Client → Client** (replace Socket.IO WebRTC for audio).
- **In-app video** → **Twilio Programmable Video** or LiveKit (below) — do not iterate on `useWebRTC.ts` again.

Socket.IO can remain for optional “incoming call” push, or be dropped once Twilio Device handles incoming client calls.

**Existing code to leverage:**

| Piece | Path |
|-------|------|
| Voice SDK (web) | `frontend/lib/twilioVoiceDevice.ts` |
| Access tokens + TwiML | `backend/src/services/twilioVoiceService.ts` |
| Client identity | `user-{24-char mongo id}` via `clientIdentityForUser()` |
| PSTN flow (reference) | `backend/src/routes/voice.ts`, `PstnCallPanel` |

Today PSTN is **Client → phone** only. App-to-app voice adds **Client → Client** in TwiML.

---

### 2. LiveKit (best for video + meetings + optional self-host)

- Managed cloud or self-host on the production VPS
- Strong **web + React Native** SDKs
- Rooms map to existing ids: `direct-{a}-{b}`, `meeting-{…}`
- Backend issues short-lived JWT; **no SDP/ICE in application code**
- Good fit if **Morongwa Meet** and 1:1 video are both priorities

---

### 3. Daily.co (fastest path to reliable video)

- Prebuilt UI or headless SDK
- Minutes-based pricing, minimal backend surface
- Less control than LiveKit; very reliable for “calls must connect”

---

### 4. Jitsi (lowest licence cost, more ops)

- Embed or self-host
- Free, but branding, mobile UX, and operational burden are on the team

---

### 5. What not to do again

| Approach | Verdict |
|----------|---------|
| Another pass fixing `deliverToPeer` / ICE queues in `webrtcSignaling.ts` | High effort, low confidence after 10+ attempts |
| “Just add better TURN on the VPS” | Necessary but **not sufficient** while signaling stays custom |
| Polling-only signaling without a media SFU | May help ring delivery; does not fix NAT/media path |

---

## Recommended product split

| User action | Technology |
|-------------|------------|
| **Voice to phone number** | Keep **Twilio Voice** → PSTN (already works) |
| **Voice user ↔ user in app** | **Twilio Client → Client** (replace custom WebRTC for audio) |
| **Video user ↔ user** | **Twilio Video** or **LiveKit** — one provider; deprecate `useWebRTC.ts` for 1:1 |
| **Morongwa Meet (group)** | Same provider as video (LiveKit and Daily excel here) |
| **Socket.IO `/webrtc`** | Ring notifications only, or remove once provider handles presence/incoming |

Incoming UX can stay similar (modal → Accept), but **Accept should join a provider room / Twilio call**, not `new RTCPeerConnection()`.

---

## Cost and effort (rough)

| Option | Ongoing cost | Engineering (order of magnitude) |
|--------|--------------|----------------------------------|
| Twilio Client voice (1:1) | Per-minute (often lower than PSTN) | ~1–2 weeks |
| Twilio Video (1:1) | Per participant-minute | ~2–3 weeks |
| LiveKit (1:1 + meetings) | Cloud minutes or VPS hosting | ~2–4 weeks |
| Daily (1:1 video) | Per-minute | ~1–2 weeks |

Hosted RTC costs money, but so does repeated engineering on a path that still does not connect in production.

---

## Migration outline (when approved)

### Phase A — In-app voice (Twilio Client → Client)

1. Backend: endpoint to start **app call session** (caller, callee user id); TwiML dials `<Client>user-{calleeId}</Client>`.
2. Backend: reuse `createClientAccessTokenOrThrow` for both parties; optional wallet/billing hook.
3. Frontend/mobile: replace `startCall` / `acceptCall` audio path with `Device.connect()` targeting callee identity (or incoming `device.on('incoming')`).
4. Keep `CallPresenceContext` modal for UX, or use Twilio incoming events.
5. Deprecate audio branches in `useWebRTC.ts` and media events in `webrtcSignaling.ts` for 1:1 voice.

### Phase B — In-app video

1. Choose **Twilio Video** or **LiveKit**.
2. Backend: room create + token mint (short TTL).
3. Frontend/mobile: replace `VideoCallView` media with provider tracks/components.
4. Remove or gate legacy `useWebRTC.ts` 1:1 video path.

### Phase C — Morongwa Meet

1. Align group rooms with provider room API (same as Phase B provider).
2. Retire custom `joinMeetingRoom` WebRTC mesh logic where the SFU replaces P2P.

---

## Code to retire or shrink (after migration)

| Current | After migration |
|---------|-----------------|
| `frontend/hooks/useWebRTC.ts` (1:1 paths) | Provider SDK wrapper only, or delete |
| `webrtc-offer` / `webrtc-answer` / `webrtc-ice-candidate` in `webrtcSignaling.ts` | Remove for 1:1; keep only if needed for legacy |
| `frontend/lib/webrtcIce.ts` | Not needed for hosted RTC |
| TURN on VPS for Morongwa 1:1 | Optional; provider handles ICE |

**Keep:** Twilio PSTN stack, `CallPresenceContext` UX patterns, `directCallRoomId` / room naming (map to provider room names).

---

## Decision record (recommended default)

| Priority | Choice |
|----------|--------|
| **Voice 1:1 in app** | Twilio Client → Client (extend existing Voice integration) |
| **Video 1:1 + Meet** | LiveKit **or** Twilio Video — pick one; prefer LiveKit if self-host/control matters, Twilio if single-vendor billing matters |
| **Custom Socket.IO WebRTC** | **Do not invest further** in 1:1 media |

---

## Related documents

| Doc | Purpose |
|-----|---------|
| [`WEBRTC_CALL_CONNECTING_STALL.md`](./WEBRTC_CALL_CONNECTING_STALL.md) | Symptom, root cause, diagnosis of current failure |
| [`WEBRTC_STALL_FIX_INSPECTION.md`](./WEBRTC_STALL_FIX_INSPECTION.md) | Review of proposed fan-out + logging “fix” (partial mitigation) |
| `backend/scripts/smokeWebrtcSignaling.mjs` | Signaling-only smoke (no real media) |
| `backend/scripts/smokeWebrtcBrowserParity.mjs` | Single-socket parity smoke |

---

## Summary

The current method **can** work in theory, but for Qwertymates (web + mobile + production NAT + many failed iterations) it is the **wrong default**. The pragmatic path is:

1. **Twilio Client-to-Client for in-app voice** — quick win; delete most custom audio WebRTC.
2. **Twilio Video or LiveKit for video** — do not patch `useWebRTC.ts` again.

When ready to implement, confirm: **Twilio-only**, **LiveKit**, or **voice-first then video**.
