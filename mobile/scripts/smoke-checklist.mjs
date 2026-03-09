#!/usr/bin/env node

const lines = [
  "Morongwa Mobile Smoke Test",
  "",
  "1) Start Expo with tunnel:",
  "   npx expo start --tunnel",
  "",
  "2) Open checklist file:",
  "   SMOKE_TEST_CHECKLIST.md",
  "",
  "3) Verify TypeScript before sign-off:",
  "   npm run typecheck"
];

console.log(lines.join("\n"));
