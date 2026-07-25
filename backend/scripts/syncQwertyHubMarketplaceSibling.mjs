#!/usr/bin/env node
/**
 * Reminder / checklist: keep sibling QwertyHub-Marketplace aligned with www QwertyHub behaviour.
 *
 * This does not copy files automatically (sibling is a separate Cursor project).
 * After Hub/Food/guest/cart UX changes on the website, update:
 *   C:\Users\Dell\.cursor\projects\QwertyHub-Marketplace\mobile\
 *
 * Parity checklist:
 *  - Guest browse Hub/Food/Groceries; login required to cart/checkout
 *  - Distinct QwertyHub / Order Food / Groceries buttons
 *  - Caliba maps + street address under shop name
 *  - Menu #1–21 then Extras heading (printed board order)
 *  - Hub catalog excludes Food & Restaurant
 *
 * Usage (from morongwa/backend):
 *   node scripts/syncQwertyHubMarketplaceSibling.mjs
 */
console.log(`
QwertyHub Marketplace sibling (manual parity)

  Path: C:\\Users\\Dell\\.cursor\\projects\\QwertyHub-Marketplace\\mobile

  After changing www QwertyHub food/guest/cart UX, update the Expo app there
  (App.tsx, FoodScreen, HubScreen) and run: npm run typecheck

  Play build blocked until Expo Android quota resets (see sibling DOCS/PLAY_RELEASE.md).
`);
