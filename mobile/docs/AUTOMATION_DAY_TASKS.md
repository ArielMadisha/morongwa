# React Native – Full-Day Automation Task List

Tasks that can run autonomously on iOS/Android without user interference, based on [REACT_NATIVE_PLAN.md](./REACT_NATIVE_PLAN.md).

---

## Block 1: Foundation (≈2–3 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 1 | Install React Navigation | Add `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`, `react-native-screens` | `package.json` updated |
| 2 | Add tasksAPI to mobile | Add `tasksAPI` (getMyTasks, getAvailable, getMyAcceptedTasks, create, accept, start, complete, cancel, getById) to `mobile/src/lib/api.ts` | API layer ready for dashboards |
| 3 | Add storesAPI to mobile | Add `storesAPI.getMyStore`, `storesAPI.getBySlug` if missing | API for MyStore |
| 4 | Add followsAPI.getSuggested | Add `getSuggested({ limit?, q? })` to mobile api.ts | API for Search |
| 5 | Add Task type to mobile types | Add `Task` interface matching backend (title, description, category, budget, status, pickupLocation, deliveryLocation, etc.) | `mobile/src/types.ts` |
| 6 | Add retry + 503 handling to api | Add axios interceptor for 503 with toast/fallback, optional retry | `mobile/src/lib/api.ts` |
| 7 | Config: env-based API URL | Add `MOBILE_API_URL` from env or app.json extra, support dev/prod | `mobile/src/config.ts`, `app.json` |

---

## Block 2: Navigation Refactor (≈1–2 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 8 | Create NavigationContainer + tabs | Wrap app in `NavigationContainer`, create bottom tab navigator (Hub, TV, Wallet, Cart, Profile) | `App.tsx` or `src/navigation/` |
| 9 | Add Errands tab with stack | Add "Errands" tab; stack: Clients, Runners (or single screen with sub-tabs) | Tab + stack |
| 10 | Add Search tab or modal | Add Search as tab or header button opening modal | Search entry point |
| 11 | Deep link config | Add `expo-linking` + `linking` config for `morongwa://product/:id`, `morongwa://post/:id` | `app.json` + navigation config |

---

## Block 3: Client Dashboard Screen (≈2–3 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 12 | Create ClientDashboardScreen | New screen: wallet balance, "Create task" button, my tasks list | `ClientDashboardScreen.tsx` |
| 13 | Create task form | Form: title, description, category, pickup/delivery addresses, budget | Modal or inline form |
| 14 | My tasks list | FlatList of tasks with status (pending, accepted, in_progress, completed) | List UI |
| 15 | Wallet top-up for tasks | Reuse walletAPI.topUp when balance < task cost; redirect back to dashboard | Flow wired |
| 16 | Suggested fee / quote | Call tasks quote API if exists, or compute suggested fee; show in form | Fee display |
| 17 | Pull-to-refresh | Add RefreshControl to tasks list | RefreshControl |

---

## Block 4: Runner Cockpit Screen (≈2–3 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 18 | Create RunnerCockpitScreen | New screen: available tasks, my accepted tasks | `RunnerCockpitScreen.tsx` |
| 19 | Available tasks list | FlatList from `tasksAPI.getAvailable()` | List UI |
| 20 | Accept task | Button to accept; call `tasksAPI.accept(id)` | Accept flow |
| 21 | My accepted tasks | FlatList from `tasksAPI.getMyAcceptedTasks()` | List UI |
| 22 | Task status actions | Buttons: Start, Check arrival, Complete, Cancel | Action handlers |
| 23 | Pull-to-refresh | Add RefreshControl to both lists | RefreshControl |

---

## Block 5: Search Screen (≈1–2 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 24 | Create SearchScreen | New screen: search input, results sections (Users, Products, TV) | `SearchScreen.tsx` |
| 25 | Search API calls | Call `usersAPI.list({ q })`, `productsAPI.list({ q })`, `tvAPI.getFeed({ q })`; merge results | Search logic |
| 26 | Results UI | Sections for Users, Products, TV posts; tap to navigate | List/grid UI |
| 27 | Debounce search | 300ms debounce on input | useDebouncedCallback or similar |

---

## Block 6: User Profiles & Follow (≈1–2 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 28 | Create UserProfileScreen | Screen: avatar, name, username, follower count, Follow button | `UserProfileScreen.tsx` |
| 29 | Follow / unfollow | Use followsAPI.follow, unfollow, getStatus | FollowButton component |
| 30 | Link from TV post | Tap creator on FeedScreen → UserProfileScreen | Navigation |
| 31 | User's TV posts | Fetch TV feed filtered by creatorId; display grid | Posts section |

---

## Block 7: MyStore (≈2 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 32 | Create MyStoreScreen | Screen: store products, orders (if API exists) | `MyStoreScreen.tsx` |
| 33 | Add product (camera) | Use `expo-image-picker`; upload images; call products API create | Add product flow |
| 34 | Store products list | List products for current user's store | List UI |
| 35 | Show MyStore in nav when hasStore | Fetch `storesAPI.getMyStore` or similar; conditionally show tab | Nav logic |

---

## Block 8: Reseller Flow (≈1 hour)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 36 | Resell option on product detail | Add "Resell" button in HubScreen product modal | Button + navigation |
| 37 | Reseller checkout path | Navigate to checkout with resellerId; handle in CheckoutScreen | Checkout flow |

---

## Block 9: Technical Improvements (≈1–2 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 38 | Pull-to-refresh on Feed | Add RefreshControl to FeedScreen | FeedScreen.tsx |
| 39 | Pull-to-refresh on Cart | Add RefreshControl to CartScreen | CartScreen.tsx |
| 40 | Pull-to-refresh on Wallet | Add RefreshControl to WalletScreen | WalletScreen.tsx |
| 41 | Loading skeletons | Add simple ActivityIndicator or skeleton for lists | Reusable component |
| 42 | Safe area | Ensure SafeAreaView / useSafeAreaInsets on all screens | Global or per-screen |
| 43 | Error toasts | Use Alert or a toast lib for API errors | Error handling |

---

## Block 10: QwertyMusic (≈2 hours)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 44 | Add musicAPI to mobile | Add `musicAPI.getSongs`, `musicAPI.getAlbums`, purchase if exists | `api.ts` |
| 45 | Create QwertyMusicScreen | Screen: song list, play/pause with expo-av | `QwertyMusicScreen.tsx` |
| 46 | Audio playback | Use `expo-av` Audio.Sound for play/pause | Playback logic |
| 47 | Purchase with wallet | If song requires purchase, call wallet/donate API | Purchase flow |

---

## Block 11: Pricing & Support (≈30 min)

| # | Task | Description | Output |
|---|------|--------------|--------|
| 48 | Create PricingScreen | Simple screen with pricing info (from policies or static) | `PricingScreen.tsx` |
| 49 | Create SupportScreen | Simple screen with support link / contact | `SupportScreen.tsx` |
| 50 | Add to footer nav | Link Pricing and Support in Profile or nav | Nav |

---

## Execution Order (Recommended)

```
Block 1 (Foundation)     → Block 2 (Navigation) → Block 3 (Clients)
                                                      ↓
Block 4 (Runners)        ←──────────────────────────────┘
     ↓
Block 5 (Search)         → Block 6 (Profiles) → Block 7 (MyStore)
     ↓
Block 8 (Reseller)       → Block 9 (Improvements) → Block 10 (Music)
     ↓
Block 11 (Pricing/Support)
```

---

## What Requires User Input (Excluded)

- **Messages** – Chat UI and real-time logic need product decisions
- **Live streams** – WebRTC/HLS setup and streaming config
- **Push notifications** – Expo project ID, FCM/APNs config
- **HarmonyOS** – Platform-specific setup
- **Design choices** – Colors, fonts, exact layouts (use existing patterns)
- **API keys / env** – User must set `MOBILE_API_URL` for their backend

---

## Estimated Total

| Block | Tasks | Est. Time |
|-------|-------|-----------|
| 1. Foundation | 7 | 2–3 h |
| 2. Navigation | 4 | 1–2 h |
| 3. Client Dashboard | 6 | 2–3 h |
| 4. Runner Cockpit | 6 | 2–3 h |
| 5. Search | 4 | 1–2 h |
| 6. User Profiles | 4 | 1–2 h |
| 7. MyStore | 4 | 2 h |
| 8. Reseller | 2 | 1 h |
| 9. Improvements | 6 | 1–2 h |
| 10. QwertyMusic | 4 | 2 h |
| 11. Pricing/Support | 3 | 30 min |
| **Total** | **50** | **~16–22 h** |

A full day (8–10 hours) can cover Blocks 1–5 plus parts of 6–9. Run Blocks 1–4 first for Phase 1 parity.

---

*Last updated: Feb 2026*
