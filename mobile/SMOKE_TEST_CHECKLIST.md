# Morongwa Mobile Smoke Test (iPhone + Expo Go)

Use this checklist before merging large feed/profile changes.

## 1) Environment

- [ ] iPhone and dev machine are on the same Wi-Fi network.
- [ ] `npx expo start --tunnel` works and QR opens the app in Expo Go.
- [ ] Backend API is reachable from iPhone (`/api/health` or known endpoint).
- [ ] No red screen or fatal startup error appears.

## 2) Authentication

- [ ] Login succeeds with an existing account.
- [ ] Register flow succeeds (if test account creation is enabled).
- [ ] Logout returns to auth screen cleanly.

## 3) Feed Basics

- [ ] Feed loads posts and adverts.
- [ ] Pull-to-refresh updates list.
- [ ] Infinite scroll loads more items without duplicate bursts.
- [ ] Search filters posts and clearing search restores results.
- [ ] Sort chips (Newest/Trending/Random) update feed.

## 4) Post Interactions

- [ ] Like/unlike works and count updates.
- [ ] Double-tap media likes post and heart burst appears.
- [ ] Comments modal opens, list loads, and send comment works.
- [ ] More actions modal opens and supports Save/Share/Copy/Report.
- [ ] Save/unsave persists after app restart.

## 5) Moderation and Local Controls

- [ ] Mute/unmute creator hides/shows creator posts.
- [ ] Block 24h hides creator posts and persists locally.
- [ ] Muted creators modal can search and unmute single/all.
- [ ] Report submit succeeds; failed report queues for retry.

## 6) Profile + Social

- [ ] Tapping creator opens profile modal.
- [ ] Follow/unfollow updates state and follower count.
- [ ] Followers/Following lists open and can drill into nested profiles.
- [ ] Breadcrumb navigation allows jumping back correctly.

## 7) Queue + Reliability

- [ ] Queue badge reflects pending actions.
- [ ] Queue inspector loads items and Retry now works.
- [ ] Retry success clears queue and shows success feedback.

## 8) Accessibility + UX

- [ ] VoiceOver can identify primary controls (Like, Comment, More, Follow, Close).
- [ ] Modal close/back actions are reachable and correctly labeled.
- [ ] Press-scale/animations feel responsive on small iPhone screens.

## 9) Final Gate

- [ ] `npm run typecheck` passes.
- [ ] Manual smoke pass completed with no blocker or P1 regression.
