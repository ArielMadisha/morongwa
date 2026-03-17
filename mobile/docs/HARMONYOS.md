# HarmonyOS Enablement Plan

This document describes how Morongwa mobile can be extended to HarmonyOS while sharing most of the React Native codebase.

## Strategy

- Keep a single React Native business/UI layer in `src/`.
- Add platform adapters for native capabilities:
  - Push notifications
  - Secure storage
  - File/media access
  - Location/background updates
- Integrate React Native OpenHarmony tooling when iOS/Android flows are stable.

## Phased Rollout

1. Phase 1: Core parity on iOS and Android (auth, wall, messages, wallet, tasks).
2. Phase 2: Add HarmonyOS runtime target and bridge adapters.
3. Phase 3: Device QA and performance tuning on Harmony hardware.

## Notes

- HarmonyOS support quality depends on exact API needs and the RN/OpenHarmony adapter maturity.
- Avoid hard-coding platform APIs in feature screens; use adapter interfaces.
