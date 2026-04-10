# Mobile Livestream + Video Call Setup (DigitalOcean)

This is the server setup plan for Expo mobile app support using the same Linux DigitalOcean server.

## 1) Recommended Architecture

- **API/App**: existing `qwertymates.com` backend (already running)
- **TURN/STUN (required for mobile calls)**: `coturn` on same droplet
- **WebRTC signaling**: existing Socket.IO server (or separate namespace)
- **Livestream ingest**: RTMP server (`nginx-rtmp`) or SRS
- **Playback delivery**: HLS via HTTPS (`https://qwertymates.com/hls/...`)

## 2) What I Need From You

Please provide these values so I can wire the mobile app and backend end-to-end:

- `DROPLET_IP_OR_HOST` (public IP / DNS used by mobile devices) -> **Provided: `165.227.237.142`**
- `TURN_REALM` (e.g. `qwertymates.com`)
- `TURN_USERNAME` / `TURN_PASSWORD` (long random secrets)
- `RTMP_INGEST_URL` (e.g. `rtmp://qwertymates.com/live`)
- `HLS_PLAYBACK_BASE_URL` (e.g. `https://qwertymates.com/hls`)
- `TLS_CERT_MODE` (`letsencrypt` or existing cert paths)
- Preferred SFU for group calls/lives: `mediasoup` or `livekit` (recommended: LiveKit for speed)

## 3) Ports To Open On UFW / Firewall

- `80/tcp`, `443/tcp` (web + TLS)
- `3478/udp` and `3478/tcp` (TURN)
- `5349/tcp` (TURN over TLS)
- `10000-20000/udp` (WebRTC relay media range)
- `1935/tcp` (RTMP ingest, if using nginx-rtmp)

## 4) DNS Records

- `qwertymates.com` -> droplet IP
- optional `turn.qwertymates.com` -> droplet IP
- optional `live.qwertymates.com` -> droplet IP

## 5) Mobile App Env (Expo)

Use in `mobile/app.json` or EAS secrets:

- `apiUrl`: `https://qwertymates.com/api`
- `socketUrl`: `https://qwertymates.com`
- `turnUrls`: `turn:turn.qwertymates.com:3478?transport=udp,turns:turn.qwertymates.com:5349?transport=tcp`
- `turnUsername`: `<TURN_USERNAME>`
- `turnCredential`: `<TURN_PASSWORD>`

If DNS is not ready yet, temporary values can use your IP:

- `turn:165.227.237.142:3478?transport=udp`
- `turns:165.227.237.142:5349?transport=tcp`

## 6) Minimal Verification Checklist

- Login/register works on real Android device over mobile data
- 1-to-1 Morongwa call succeeds on different networks (WiFi <-> LTE)
- Live stream publish from mobile to RTMP succeeds
- HLS playback starts within 4-8 seconds on mobile
- Server CPU/RAM stable during 10+ concurrent viewers

## 7) Next Implementation Steps (I can do next)

1. Add mobile call client (`react-native-webrtc`) + TURN config.
2. Add backend signaling events (`offer`, `answer`, `ice-candidate`, `hangup`).
3. Add mobile live publish flow + stream key issuance endpoint.
4. Add live viewer screen consuming HLS.
5. Add moderation controls (end stream / mute / block).

## 8) Automated Provision Script

From `backend/`:

- Dry run: `npm run setup:realtime-remote:dry`
- Apply on server: `npm run setup:realtime-remote`

Script file: `backend/scripts/setupRealtimeInfraRemote.mjs`

