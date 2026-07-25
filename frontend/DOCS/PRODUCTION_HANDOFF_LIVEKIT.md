# Production Handoff — LiveKit Real-Time Media Layer

**Status:** Implemented on `main` working tree (not yet deployed).
**Scope:** Introduce LiveKit as Morongwa's single real-time media layer and rebuild/build on top of it:

1. **1:1 voice/video calls** — rebuilt off the old Socket.IO WebRTC relay.
2. **Live Rooms** — 1 host → many viewers broadcast.
3. **Audio Rooms** — Clubhouse-style speakers/listeners.
4. **Qwertz Live** — TikTok-style vertical live broadcast (separate namespace).

This replaces the roll-your-own `RTCPeerConnection` + Socket.IO SDP/ICE relay that
never connected reliably across NATs (STUN-only, no TURN). LiveKit Cloud owns
ICE/TURN/SFU; the API only mints short-lived JWTs and never proxies media.

> **Background docs:** `WEBRTC_CALL_CONNECTING_STALL.md`, `WEBRTC_CALL_ALTERNATIVES.md`
> (this is the recommended "LiveKit" path from the alternatives doc, now implemented).

---

## 1. What shipped

### Backend (`backend/`)

| File | Change |
|------|--------|
| `src/services/livekitService.ts` | **New.** Token minting (`mintAccessToken`), role→grant mapping, deterministic room-name helpers (`callRoomName`, `liveRoomName`, `audioRoomName`, `qwertzRoomName`), config readers (`isLiveKitConfigured`, `getLiveKitUrl`), webhook receiver, `RoomServiceClient` accessor. |
| `src/routes/livekit.ts` | **New.** `GET /config`, `POST /call-token`, `POST /live/token`, `POST /audio/token`, `POST /qwertz/token`, `POST /webhook`. All token routes require auth. |
| `server.ts` | Registered `["/api/livekit", livekitRoutes]`; calls `logLiveKitStartup()` in `initializeServices()`. |
| `.env.production.example` | Added LiveKit env section (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, optional TTL). |
| `package.json` | Added dependency **`livekit-server-sdk`** (`^2`). |

The legacy `src/services/webrtcSignaling.ts` (`/webrtc` Socket.IO namespace) is
**kept** — but only for lightweight **ringing** (call-request/accept/reject/cancel).
The SDP/ICE media events it exposes are no longer used by the new call client and
can be removed later once mobile is migrated.

### Frontend (`frontend/`)

| File | Change |
|------|--------|
| `lib/api.ts` | Added `livekitAPI` (config / call / live / audio / qwertz token calls) + `LiveKitTokenResponse` type. |
| `lib/livekit.ts` | **New.** Shared room options (call/broadcast/audio), connect defaults, participant-metadata parser. |
| `hooks/useLiveKitCall.ts` | **New.** 1:1 call state machine: ringing over `/webrtc` Socket.IO, media over LiveKit. Replaces `useWebRTC`. |
| `components/LiveKitCallView.tsx` | **New.** Incoming/calling/connecting/rejected overlays + `LiveKitRoom` + `VideoConference` when connected. Replaces `VideoCallView` in messages. |
| `app/messages/page.tsx` | Swapped `useWebRTC`/`VideoCallView` → `useLiveKitCall`/`LiveKitCallView`. |
| `components/livekit/LiveStage.tsx` | **New.** Reusable broadcast stage (host publishes + control bar; viewers subscribe-only). Landscape or portrait. |
| `components/livekit/AudioStage.tsx` | **New.** Audio room stage: speaker/listener avatars with speaking rings + mic control. |
| `app/live/page.tsx`, `app/live/[hostId]/page.tsx` | **New.** Live Rooms directory + room (host/viewer). |
| `app/audio-rooms/page.tsx`, `app/audio-rooms/[roomId]/page.tsx` | **New.** Audio Rooms directory + room. |
| `app/qwertz/live/page.tsx`, `app/qwertz/live/[hostId]/page.tsx` | **New.** Qwertz Live (vertical) landing + room. |
| `package.json` | Added **`livekit-client`**, **`@livekit/components-react`**, **`@livekit/components-styles`**. |

The old `hooks/useWebRTC.ts` and `components/VideoCallView.tsx` are **left in place**
(no longer imported by the web app) so nothing else that might reference them breaks;
delete them once you confirm no other importers.

---

## 2. Architecture

```
Client (web / mobile)                 Morongwa API                 LiveKit Cloud
──────────────────────                ─────────────                ──────────────
1. POST /api/livekit/*-token   ─────▶ authenticate (JWT)
                                       mint AccessToken(apiKey,
                                       apiSecret, grants)
                               ◀─────  { token, url, room, role }
2. connect(url, token)  ───────────────────────────────────────▶  join room (SFU)
3.  media (ICE/TURN/SFU handled entirely by LiveKit)  ◀────────▶  publish/subscribe
```

**Key rules**

- `LIVEKIT_API_SECRET` lives **only** on the backend. The browser gets a signed token + the wss URL from the token response — never the secret.
- Rooms are **deterministic** so both parties compute the same name:
  - Call: `call-<sortedUserIdA>-<sortedUserIdB>`
  - Live: `live-<hostUserId>`
  - Audio: `audio-<roomId>`
  - Qwertz: `qwertz-<hostUserId>`
- **Grants by role:** `call`/`speaker` publish+subscribe; `host` publish+subscribe+`roomAdmin` (moderation); `viewer`/`listener` subscribe-only (still `canPublishData` for chat/reactions).

---

## 3. Environment variables (server)

Set on the API host, then **restart the API**:

```env
LIVEKIT_URL=wss://qwertymates-vtjkcprt.livekit.cloud
LIVEKIT_API_KEY=APId22drkxTX9KS
LIVEKIT_API_SECRET=<secret>
# optional
LIVEKIT_TOKEN_TTL_SECONDS=3600
```

> ⚠️ **Rotate the secret before production.** The current key/secret was committed
> to `frontend/.env.local` (a client env file, which exposes it to the browser).
> Generate a fresh API key/secret in the LiveKit Cloud dashboard, put it **only** in
> the backend `.env` / secrets manager, and remove the credentials from any frontend
> env file. The frontend does **not** need any `LIVEKIT_*` var — the token endpoint
> returns the URL.

No `NEXT_PUBLIC_LIVEKIT_*` is required on the frontend.

---

## 4. Deploy steps

**Backend**

```bash
cd backend
npm install                 # picks up livekit-server-sdk
# set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in the host env
npm run build
# restart the API process/container (pm2 restart / docker compose up -d --build)
```

**Frontend**

```bash
cd frontend
npm install                 # picks up livekit-client + @livekit/components-*
npm run build
# restart / redeploy the Next.js app
```

**LiveKit dashboard (optional but recommended)**

- Register a webhook pointing to `https://api.<domain>/api/livekit/webhook` to receive room/participant lifecycle events (used for future analytics / live-flag reconciliation).

---

## 5. Routes / features to verify after deploy

| Feature | URL / entry | Expected |
|---------|-------------|----------|
| Config | `GET /api/livekit/config` | `{ data: { configured: true, url: "wss://…" } }` |
| 1:1 call | Messages → open a chat → call button | Callee sees incoming modal → Accept → both see live video via LiveKit |
| Live Rooms | `/live` → **Go Live**; another account opens `/live/<hostId>` | Host publishes; viewer watches; viewer count updates |
| Audio Rooms | `/audio-rooms` → **Start**; share code; others **Listen**/**Speak** | Speakers show mic + speaking ring; listeners subscribe-only |
| Qwertz Live | `/qwertz/live` → **Go Qwertz Live**; viewer opens `/qwertz/live/<hostId>` | Vertical (portrait) broadcast |

**Token smoke (with a valid user JWT):**

```bash
curl -s -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"peerUserId":"<otherUserId>"}' \
  https://api.<domain>/api/livekit/call-token | jq .
# expect data.token (JWT), data.url (wss://), data.room=call-<a>-<b>
```

---

## 6. API additions (reference)

All token endpoints require `Authorization: Bearer <jwt>` and return
`{ data: { token, url, room, role, ... } }`.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/livekit/config` | — | Public-ish; `{ configured, url }` |
| POST | `/api/livekit/call-token` | `{ peerUserId }` | Role `call`; deterministic room |
| POST | `/api/livekit/live/token` | `{ asHost?, hostUserId? }` | `host` when `asHost`, else `viewer` |
| POST | `/api/livekit/audio/token` | `{ roomId, role? }` | role: `host`\|`speaker`\|`listener` |
| POST | `/api/livekit/qwertz/token` | `{ asHost?, hostUserId? }` | Separate `qwertz-` namespace |
| POST | `/api/livekit/webhook` | raw (LiveKit-signed) | Verified via `WebhookReceiver` |

---

## 7. Not in this release / follow-ups

- **Mobile (`mobile/`)** — greenfield for real-time; add `@livekit/react-native` + `@livekit/react-native-webrtc` and reuse the same token endpoints. Not implemented here.
- **Persistent directories** — Live Rooms discovery reuses the existing `User.isLive` flag via `GET /api/tv/statuses`. Audio Rooms and Qwertz Live are **ephemeral** (shareable code / host-id link) with no backend registry. For a browsable directory, add a `LiveSession` / `AudioRoom` model (roomType, hostId, title, startedAt, viewerCount) written from the `/webhook` handler.
- **Speaker promotion in Audio Rooms** — currently a joiner picks Listen or Speak up front. Host-driven "invite to stage" requires `RoomServiceClient.updateParticipant` permissions (server hook point already available via `getRoomServiceClient()`).
- **Live chat/reactions overlay** — `canPublishData` is granted to everyone; wire a data-channel UI on `LiveStage`/`AudioStage` when desired.
- **Retire legacy WebRTC** — after mobile migrates, delete `frontend/hooks/useWebRTC.ts`, `frontend/components/VideoCallView.tsx`, and the SDP/ICE media events in `backend/src/services/webrtcSignaling.ts` (keep the ring events).
- **`User.isLive` reconciliation** — host go-live/end toggles `PATCH /api/users/:id/live`. If a host crashes without ending, the flag can stick; reconcile via the LiveKit webhook (`participant_left` / `room_finished`).

---

## 8. Git

New files:

```
backend/src/services/livekitService.ts
backend/src/routes/livekit.ts
frontend/lib/livekit.ts
frontend/hooks/useLiveKitCall.ts
frontend/components/LiveKitCallView.tsx
frontend/components/livekit/LiveStage.tsx
frontend/components/livekit/AudioStage.tsx
frontend/app/live/page.tsx
frontend/app/live/[hostId]/page.tsx
frontend/app/audio-rooms/page.tsx
frontend/app/audio-rooms/[roomId]/page.tsx
frontend/app/qwertz/live/page.tsx
frontend/app/qwertz/live/[hostId]/page.tsx
DOCS/PRODUCTION_HANDOFF_LIVEKIT.md
```

Modified:

```
backend/server.ts
backend/.env.production.example
backend/package.json  (+ package-lock.json)
frontend/lib/api.ts
frontend/app/messages/page.tsx
frontend/package.json  (+ package-lock.json)
```

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `GET /api/livekit/config` → `configured:false` | `LIVEKIT_API_KEY`/`SECRET` not set on API host; set + restart. |
| Token endpoint → 503 "Live media is not configured" | Same as above. |
| Client connects then immediately disconnects | `LIVEKIT_URL` wrong or mismatched key/secret vs project; verify against LiveKit dashboard. |
| Call: incoming modal never appears | Ringing runs on `/webrtc` Socket.IO — confirm the socket connects and both users share the `roomId`. Media is separate (LiveKit). |
| No camera/mic in room | Browser permissions; must be HTTPS in production (LiveKit requires secure context). |
| Webhook 401 | Signature check failed — the webhook secret is the same LiveKit API key/secret; ensure they match the dashboard. |
```
