# WebRTC call stall — diagnostic guide (v2)

**Applies to:** Morongwa 1:1 voice/video after server signaling fan-out + logging deploy.  
**See also:** [`WEBRTC_CALL_CONNECTING_STALL.md`](./WEBRTC_CALL_CONNECTING_STALL.md), [`WEBRTC_STALL_FIX_INSPECTION.md`](./WEBRTC_STALL_FIX_INSPECTION.md)

---

## What changed (server)

`backend/src/services/webrtcSignaling.ts`:

- **`deliverToPeer`** — fan-out to target socket id, presence room, and call room (ring + media).
- **`deliverToPeer FAILED`** — error log when no channel had subscribers.
- **Forwarding logs** — `call-accept`, `webrtc-offer`, `webrtc-answer`, ICE (debug).

**TURN** — `GET /api/webrtc/turn-credentials` needs `TURN_SHARED_SECRET` (preferred) or `TURN_USERNAME` + `TURN_PASSWORD` on the API host. Sync with:

```bash
cd backend
npm run sync:turn-env-remote
npm run fix:coturn-turn-auth   # align coturn static-auth-secret on VPS
```

---

## Recognize stall type

| UI | Phase | Likely cause |
|----|-------|----------------|
| **Calling…** | Ring | Callee offline, no accept, or `call-accept` not received |
| **Connecting…** | Media | SDP/ICE not exchanged, TURN/NAT failure, or client PC stuck |

---

## Log patterns (production API / docker logs)

Search backend logs for:

| Pattern | Meaning |
|---------|---------|
| `call-request: callee not in presence room` | Callee tab not connected to `/webrtc` |
| `call-accept: received, forwarding to caller` | Ring phase completed on server |
| `webrtc-offer: forwarding` | Caller sent offer; server relaying |
| `webrtc-answer: forwarding` | Callee answered |
| `deliverToPeer FAILED` | **No delivery path** — check socket/room sizes in log payload |
| `WebRTC client connected (presence auto-join)` | User online for presence |

If offer/answer logs appear and **no** `deliverToPeer FAILED`, but UI stays **Connecting…** → suspect **TURN/ICE or client** (`useWebRTC.ts`), not signaling drop.

---

## TURN checklist

**Local `backend/.env` (then sync to server):**

```env
TURN_URLS=turn:165.227.237.142:3478?transport=udp,turn:165.227.237.142:3478?transport=tcp,turns:165.227.237.142:5349?transport=tcp
TURN_SHARED_SECRET=<same as coturn static-auth-secret>
TURN_REALM=qwertymates.com
TURN_TTL_SECONDS=3600
TURN_ENFORCE_EPHEMERAL=1
```

**Verify API (JWT required):**

```bash
curl -s -H "Authorization: Bearer <token>" https://api.qwertymates.com/api/webrtc/turn-credentials
```

Expect HTTP 200 with `data.username`, `data.credential`, `data.urls`.  
503 or missing credential → frontend uses STUN only → cross-network calls likely fail.

**Verify coturn on VPS:**

```bash
systemctl is-active coturn
nc -zu -w3 165.227.237.142 3478
```

---

## Automated smoke tests

From `backend/` (uses `JWT_SECRET` from `.env`):

```bash
# Signaling + TURN HTTP (no real media)
node scripts/smokeWebrtcSignaling.mjs <callerUserId> <calleeUserId> --prod

# Single-socket parity (matches browser CallPresence)
node scripts/smokeWebrtcBrowserParity.mjs <callerUserId> <calleeUserId> --prod
```

Example users (June 2026):

- `@aturetutu` → `69cd1cc2703cf9d7f5bbb58b`
- `@africanhistory` → `69cd1cc2703cf9d7f5bbb466`

**Pass:** callee receives `call-request`, caller receives `call-accept`, caller receives `webrtc-answer` (fake SDP in smoke).

---

## Manual test matrix

| Scenario | Both signed in, tab focused | Expected |
|----------|----------------------------|----------|
| Same Wi‑Fi | Yes | Connected with or without TURN |
| Wi‑Fi ↔ mobile data | Yes | **Requires TURN** |
| Callee background tab | Callee may miss ring | Calling… until timeout |
| Callee offline | — | Caller toast “offline” or Calling… 60s |

---

## Debugging steps

1. Reproduce stall; note **Calling…** vs **Connecting…**.
2. Tail API logs during call; grep patterns above.
3. Browser DevTools → Network → WS `/webrtc` — confirm events client-side.
4. Browser console — `"No TURN servers configured"` → fix server env.
5. If logs clean but stall persists → see [`WEBRTC_CALL_ALTERNATIVES.md`](./WEBRTC_CALL_ALTERNATIVES.md).

---

## Deploy checklist

```bash
cd backend
npm run build
npm run deploy:production
npm run sync:turn-env-remote
npm run fix:coturn-turn-auth
node scripts/smokeWebrtcBrowserParity.mjs <callerId> <calleeId> --prod
```

Verify site: `https://www.qwertymates.com/` and `/wall` return 200 (not 502).
