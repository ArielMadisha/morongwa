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

`src/config.ts` currently defaults to:

- `http://10.0.2.2:5001/api` for API
- `http://10.0.2.2:5001` for Socket.IO

`10.0.2.2` is Android emulator loopback for host machine localhost.

## HarmonyOS Path

Recommended path:

1. Keep shared business layer in TypeScript (`api`, `auth`, `state`) under `src/`.
2. Keep platform-specific wrappers isolated for notifications, media, maps, and storage.
3. Add a Harmony target with React Native OpenHarmony once iOS/Android core flows are stable.
4. Test device APIs (camera, files, push, background tasks) behind capability adapters.

This lets Morongwa ship quickly on iOS/Android while minimizing rework for HarmonyOS.
