#!/usr/bin/env node

const lines = [
  "Qwertymates Mobile Smoke Test",
  "",
  "1) Start Expo with tunnel:",
  "   npx expo start --tunnel",
  "",
  "2) Open checklist file:",
  "   SMOKE_TEST_CHECKLIST.md",
  "",
  "3) Verify TypeScript before sign-off:",
  "   npm run typecheck",
  "",
  "4) Android Play / large screens (after a native build):",
  "   - Phone AVD: rotate device; confirm no crash (portrait lock may apply).",
  "   - Tablet or resizable AVD (smallest width >= 600dp): portrait + landscape.",
  "   See SMOKE_TEST_CHECKLIST.md section 10.",
  "",
  "5) EAS Android production build + submit (from mobile/):",
  "   npm run build:android:production",
  "   npm run submit:android:production",
  "   Requires: eas login or EXPO_TOKEN, and credentials/google-play-service-account.json for submit.",
];

console.log(lines.join("\n"));
