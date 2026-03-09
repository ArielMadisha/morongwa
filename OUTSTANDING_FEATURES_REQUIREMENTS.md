# Morongwa Outstanding Features and Requirements

Status: Draft working list (updated for current sprint)

## A. Priority Features Requested

### 1) Ask McGyver AI
Requirements:
- Contextual assistant available in web and mobile.
- Can answer product, order, profile, and platform questions.
- Supports safe actions only (no privileged admin actions without confirmation).
- Logs prompts/responses for audit and quality tuning.

### 2) Live Stream
Requirements:
- Start/stop live stream from creator profile and TV area.
- Viewer count, live badge, and stream health indicators.
- Moderation controls (report, mute, end stream).
- Realtime delivery and fallback handling for unstable networks.

### 3) Message Calling
Requirements:
- In-chat voice/video call controls in Morongwa messenger.
- Missed/ongoing/ended call states.
- Permission flow (camera/mic), call timeout, reconnect handling.
- Call history and basic quality telemetry.

### 4) Login/Registration Twilio Messaging Integration
Requirements:
- Production Twilio integration for OTP delivery.
- Channel support: SMS and WhatsApp OTP.
- Retry, expiry, resend limits, and abuse protection.
- Verification success/failure audit logs.

### 5) LiveTV Integration
Requirements:
- Unified navigation between Qwertz short-form feed and LiveTV streams.
- Genre and content-type switching without dead links.
- Shared moderation and engagement controls.
- Creator profile continuity across Qwertz and LiveTV.

### 6) Qwertz Dedicated Experience
Requirements:
- Qwertz entries must be clickable and reliably open/filter the dedicated short-form feed.
- Qwertz content definition:
  - Vertical short-form videos (up to 3 minutes)
  - Mobile-first viewing
  - Editing with music, text, and effects
  - Presented in dedicated Qwertz tab/flow

## B. Additional Requirements from Latest Review

### 7) Admin Products Actions
Requirements:
- Add `EDIT` action alongside `VIEW` and `DELETE` in admin products list.
- Edit workflow must persist core product fields (title, description, pricing, stock, status).

### 8) Checkout Layout + Collection Option
Requirements:
- Keep left-side menu/navigation consistent with other pages.
- Add "Collect at store" fulfillment option.
- When collection is selected:
  - shipping = 0
  - order should mark collection mode in backend

### 9) Order Notifications via Morongwa
Requirements:
- Immediately notify sellers in Morongwa messenger when their product is bought.
- Notify all parties through configured channels:
  - Morongwa messenger (realtime)
  - Email
  - WhatsApp
  - SMS
- Channel dispatch should follow per-user notification configuration.

## C. Website Milestones Still Outstanding (from implementation plan)

- Real-time messaging full backend/frontend integration completion.
- File upload system completion (UI + cloud storage + validation).
- Enhanced escrow and dispute workflows.
- Frontend unit test setup and coverage expansion.
- E2E web flow coverage.
- Advanced analytics dashboard.
- Referral system.
- Rating/reviews enhancement.
- Live location tracking.
- i18n rollout.
