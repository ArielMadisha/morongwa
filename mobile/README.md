# Morongwa Mobile

React Native (Expo + TypeScript) mobile app for Morongwa.

## Targets

- iOS
- Android
- HarmonyOS (via React Native OpenHarmony / ArkUI bridge in phase 2)

## Quick Start

1. Install dependencies:

   ```powershell
   cd C:\Users\ArielMadisha\.cursor\morongwa\mobile
   npm install
   ```

2. Start development:

   ```powershell
   npm run start
   ```

3. Run platform builds:

   ```powershell
   npm run android
   npm run ios
   ```

## Backend Connection

`src/config.ts` resolves endpoints in this order:

1. `app.json` -> `expo.extra.apiUrl` / `expo.extra.socketUrl` (preferred for staging/production)
2. Expo LAN host inference (dev convenience)
3. Android emulator fallback `http://10.0.2.2:4000`

Current `app.json` production defaults:

- `https://qwertymates.com/api` for API
- `https://qwertymates.com` for Socket.IO
- TURN for calls:
  - `turn:165.227.237.142:3478?transport=udp`
  - `turns:165.227.237.142:5349?transport=tcp`

For local emulator testing, change `expo.extra` values or temporarily remove them.

## Morongwa Calls (Expo)

Installed:

- `react-native-webrtc`
- `socket.io-client`

Scaffolding added:

- `src/lib/webrtc.ts` (peer connection + local media + TURN config)
- `src/lib/callSignaling.ts` (Socket.IO signaling wrapper)

Notes:

- `react-native-webrtc` requires a development build (not plain Expo Go).
- TURN credentials are fetched at runtime from backend `GET /api/webrtc/turn-credentials` (authenticated).

## Release Builds (EAS)

EAS config is in `eas.json`.

1. Login once on this machine:

   ```powershell
   npm run eas:login
   npm run eas:whoami
   ```

2. Build internal preview artifacts:

   ```powershell
   npm run build:android:preview
   npm run build:ios:preview
   ```

3. Build production artifacts:

   ```powershell
   npm run build:android:production
   npm run build:ios:production
   ```

4. Submit to stores (after credentials are set in Expo account):

   ```powershell
   npm run submit:android:production
   npm run submit:ios:production
   ```

## HarmonyOS Path

Recommended path:

1. Keep shared business layer in TypeScript (`api`, `auth`, `state`) under `src/`.
2. Keep platform-specific wrappers isolated for notifications, media, maps, and storage.
3. Add a Harmony target with React Native OpenHarmony once iOS/Android core flows are stable.
4. Test device APIs (camera, files, push, background tasks) behind capability adapters.

This lets Morongwa ship quickly on iOS/Android while minimizing rework for HarmonyOS.
