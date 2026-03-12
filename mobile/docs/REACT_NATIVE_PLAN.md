# Morongwa React Native App – Plan

## 1. Current State

### What Exists Today

| Area | Status | Notes |
|------|--------|-------|
| **Auth** | ✅ Done | Login, Register, session persistence |
| **Home / Navigation** | ✅ Done | Tab-based: Hub, TV, Wallet, Cart, Profile |
| **QwertyTV Feed** | ✅ Done | Feed + Saved posts (local AsyncStorage) |
| **Hub (Marketplace)** | ✅ Done | Product list, search, product detail, add to cart |
| **Cart** | ✅ Done | View cart, update qty, remove items |
| **Checkout** | ✅ Done | Quote, pay (wallet/card), order flow |
| **Wallet** | ✅ Done | Balance, transactions, top-up |
| **Profile** | ✅ Done | User info, sign out |

### Tech Stack

- **Expo** ~54, **React Native** 0.81, **React** 19
- **Axios** for API, **AsyncStorage** for tokens + saved posts
- **TypeScript** throughout
- Targets: iOS, Android, Web (Expo web)

---

## 2. Feature Parity with Web

### Web Features Not Yet in Mobile

| Feature | Web Route | Priority | Effort |
|---------|-----------|----------|--------|
| **Client Dashboard** | `/dashboard/client` | High | Medium |
| **Runner Cockpit** | `/dashboard/runner` | High | Medium |
| **MyStore** | `/store` | Medium | Medium |
| **Search (MacGyver)** | `/search` | Medium | Low |
| **QwertyMusic** | `/qwerty-music` | Low | Medium |
| **Messages** | `/messages` | Medium | High |
| **User profiles** | `/user/[id]` | Medium | Low |
| **Reseller flow** | `/marketplace/product/[id]?view=resell` | Medium | Low |
| **Live streams** | `/morongwa-tv/live` | Low | High |
| **Pricing / Support** | `/pricing`, `/support` | Low | Low |

---

## 3. Suggested Roadmap

### Phase 1: Core Parity (4–6 weeks)

1. **Client Dashboard**
   - Create tasks (pickup/delivery, budget)
   - View my tasks
   - Wallet balance + top-up for tasks
   - Suggested fee / quote

2. **Runner Cockpit**
   - Available tasks list
   - Accept task
   - My accepted tasks
   - Basic task status updates

3. **Search**
   - Search bar in header
   - Search users, products, TV posts
   - Reuse `usersAPI.list`, `productsAPI.list`, `tvAPI.getFeed` with `q`

### Phase 2: Social & Commerce (3–4 weeks)

4. **User Profiles**
   - View other users (name, avatar, posts)
   - Follow / unfollow
   - Link to user’s TV posts

5. **MyStore**
   - Show when user has store
   - Store products, orders
   - Add product (camera/upload)

6. **Reseller Flow**
   - Resell option on product detail
   - Reseller checkout path

### Phase 3: Messaging & Media (4–6 weeks)

7. **Messages**
   - Conversation list
   - Chat UI
   - Real-time (Socket.IO or polling)
   - Push notifications (Expo Notifications)

8. **QwertyMusic**
   - Song list, play/pause
   - Albums
   - Purchase with wallet

9. **Live Streams**
   - Live status strip
   - Join live stream
   - WebRTC or HLS player

### Phase 4: Polish & Scale (2–4 weeks)

10. **Offline / Caching**
    - Cache feed, products
    - Queue actions when offline

11. **Push Notifications**
    - Task assigned, message received, order updates

12. **HarmonyOS**
    - React Native OpenHarmony target (per README)

---

## 4. Architecture Decisions

### Navigation

- **Current:** Single `HomeScreen` with tab state
- **Recommendation:** Add `@react-navigation/native` + `@react-navigation/bottom-tabs` for:
  - Deep linking
  - Stack navigation (e.g. Product → Detail → Checkout)
  - Easier back/forward

### State Management

- **Current:** Local `useState` + `useEffect`
- **Recommendation:** Keep simple for now; add Zustand or Context only if shared state grows (e.g. cart count, wallet balance across screens)

### API Layer

- **Current:** `src/lib/api.ts` mirrors web
- **Recommendation:** Keep shared; add retry, 503 handling, and optional request caching

### Media & Assets

- **Images:** Use `getImageUrl()` pattern (base URL + path)
- **Video:** `expo-av` for playback
- **Camera:** `expo-camera` or `expo-image-picker` for store/product uploads

---

## 5. Technical Improvements

| Item | Action |
|------|--------|
| **Config** | Move API URL to env / build config (dev vs prod) |
| **Error handling** | Toast or inline messages for 503, network errors |
| **Loading states** | Skeleton or spinner for lists |
| **Pull-to-refresh** | Already on Hub; add to Feed, Cart, Wallet |
| **Deep links** | `morongwa://product/123`, `morongwa://post/456` |
| **Safe area** | Use `SafeAreaView` / `useSafeAreaInsets` on notched devices |

---

## 6. File Structure (Proposed)

```
mobile/
├── App.tsx
├── app.json
├── src/
│   ├── components/       # Shared UI
│   │   ├── ModalCard.tsx
│   │   ├── ActionChip.tsx
│   │   └── ProductCard.tsx (new)
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── hooks/
│   │   ├── usePendingActionQueue.ts
│   │   └── usePersistentMap.ts
│   ├── lib/
│   │   └── api.ts
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── HubScreen.tsx
│   │   ├── FeedScreen.tsx
│   │   ├── CartScreen.tsx
│   │   ├── CheckoutScreen.tsx
│   │   ├── WalletScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   ├── ClientDashboardScreen.tsx  (new)
│   │   ├── RunnerCockpitScreen.tsx   (new)
│   │   └── SearchScreen.tsx          (new)
│   ├── config.ts
│   └── types.ts
└── docs/
    ├── REACT_NATIVE_PLAN.md
    └── HARMONYOS.md
```

---

## 7. Next Steps

1. **Choose Phase 1 scope** – Client Dashboard + Runner Cockpit + Search
2. **Add React Navigation** – Bottom tabs + stack for detail screens
3. **Implement Client Dashboard** – Reuse `tasksAPI`, `walletAPI` from web
4. **Implement Runner Cockpit** – Reuse `tasksAPI.getAvailable`, `tasksAPI.accept`
5. **Add Search** – New screen or modal, wire to MacGyver search APIs

---

## 8. Dependencies to Add (as needed)

```json
{
  "@react-navigation/native": "^7.x",
  "@react-navigation/bottom-tabs": "^7.x",
  "@react-navigation/native-stack": "^7.x",
  "react-native-screens": "~4.x",
  "expo-linking": "~7.x",
  "expo-av": "~15.x",
  "expo-image-picker": "~16.x",
  "expo-notifications": "~0.29.x"
}
```

---

*Last updated: Feb 2026*
