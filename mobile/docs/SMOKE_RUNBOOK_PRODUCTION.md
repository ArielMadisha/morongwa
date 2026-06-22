# Production Smoke Runbook (Release Candidate)

Last updated: 2026-04-15

Use this runbook on Android/iOS production artifacts before store submission.

## 1) Test Environment Prep

- Install latest release artifacts (AAB/APK/TestFlight build).
- Verify backend points to production API.
- Use stable network (Wi-Fi + mobile data spot checks).
- Prepare test accounts:
  - client account
  - runner account
  - optional admin reviewer account

## 2) Auth + Entry Flows

1. Login with username/email/phone.
2. Register a new user (if registration open).
3. Verify Terms + Privacy links open correctly.
4. Logout and login again (session persistence check).
5. Change password from profile and re-login.

Pass criteria:
- No crashes
- No dead-end navigation
- Error messages are user-readable

## 3) Feed Safety Flows (Critical)

1. Open feed and world surfaces.
2. Open post options and submit report with reason.
3. Use "block creator account" option while reporting.
4. Confirm blocked creator content no longer appears.
5. Confirm account deletion option is visible in profile.

Pass criteria:
- Report succeeds (or queues with clear retry message)
- Block action persists and removes blocked content
- Account controls are accessible and understandable

## 4) Marketplace + Checkout

1. Browse products.
2. Add item to cart.
3. Open checkout and load quote.
4. Test wallet payment path.
5. Test card payment redirect path.

Pass criteria:
- Totals render correctly
- Checkout does not freeze
- Redirect opens externally when needed

## 5) Errands Flow (Client + Runner)

### Client
1. Create task with title/description/budget.
2. View task in "my tasks".
3. Confirm delivery when eligible.

### Runner
1. View available tasks.
2. Accept task.
3. Start task.
4. Use "Use current location" for arrival check.
5. Complete task.

Pass criteria:
- Status transitions are correct
- Refresh/update behavior is stable
- Location permission prompt/handling works

## 6) Wallet Flow

1. Open wallet balance.
2. View recent transactions.
3. Trigger top-up flow.
4. Trigger withdraw/request paths if enabled.

Pass criteria:
- No broken actions
- Currency/amount formatting is correct
- Expected error handling when operations are unavailable

## 7) Profile + Account Closure

1. Update display name/username.
2. Upload avatar.
3. Open delete account flow and review warning copy.
4. (Optional controlled test account) perform account deletion and verify sign-out.

Pass criteria:
- Profile updates persist
- Deletion flow clearly explains result and exits account

## 8) Regression/Non-Functional Checks

- App launch time acceptable
- No obvious UI clipping on common devices
- No fatal JS/native crashes during critical path
- Network error states are visible and recoverable

## 9) Release Sign-Off Template

- Build ID:
- Platform:
- Tester:
- Date:
- Result: PASS / FAIL
- Blocking issues:
- Non-blocking issues:
- Ready for submission: YES / NO
