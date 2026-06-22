# App Privacy + Data Safety Mapping

Last updated: 2026-04-15

Use this as a working sheet when completing:
- Apple App Privacy (nutrition labels)
- Google Play Data Safety form

Validate final answers with legal/compliance before submission.

## 1) Data Inventory (Current Mobile Scope)

| Data Type | Collected | Purpose | Shared | Required for App Functionality |
|---|---|---|---|---|
| Name | Yes | Account profile, social display | Service providers as needed | Yes |
| Email | Yes | Auth, account recovery, communication | Service providers as needed | Yes |
| Username | Yes | Public profile identity | Not sold; app ecosystem only | Yes |
| Phone number | Yes (when provided) | Auth flows, wallet/checkout/notifications | Service providers as needed | Conditional |
| User ID / account identifiers | Yes | Auth/session, linking user data | Backend infrastructure providers | Yes |
| User-generated content (posts/media/comments) | Yes | Core social/media features | Infra/CDN/storage providers | Yes |
| Messages/chats | Yes | Messaging feature | Infra providers | Conditional |
| Wallet/payment transaction records | Yes | Wallet and order processing | Payment/service providers | Conditional |
| Approx/precise location | Yes (foreground) | Errands arrival verification | Not sold; service processing only | Conditional |
| Device/app diagnostics (operational logs) | Yes (operational) | Security, abuse prevention, reliability | Infra/ops providers | No |

## 2) Data Usage Purposes

- App functionality (social feed, marketplace, errands, wallet)
- Account management and authentication
- Safety and moderation (report/block, abuse handling)
- Security and fraud prevention
- Customer support and troubleshooting

## 3) Data Sharing Statement (Draft)

Morongwa may share necessary data with infrastructure, payment, messaging, and operational service providers strictly to run app features, process transactions, and maintain platform security/compliance. Data is not sold.

## 4) User Controls (Store-Review Relevant)

- In-app account closure available in profile.
- In-app report and block controls for user-generated content/users.
- Privacy policy and terms links available from auth screens.

## 5) Apple App Privacy Suggested Buckets

Potentially relevant categories to evaluate in App Store Connect:
- Contact Info (Name, Email, Phone)
- User Content (Photos/Videos/Audio, Messages)
- Financial Info (if wallet/payment records are user-linked)
- Location (Precise/Coarse, depending on implementation)
- Identifiers (User ID)

For each selected category, mark whether used for:
- App Functionality
- Developer Communications
- Analytics
- Fraud Prevention/Security

## 6) Google Play Data Safety Suggested Answers (Draft)

- Data collected: Yes
- Data shared: Yes (service providers only, not sold)
- Data encrypted in transit: Yes (HTTPS/TLS expected)
- Data deletion request support: Yes (in-app account closure flow + support channels)

Likely declared data types:
- Personal info
- Financial info
- Messages
- Photos/videos
- Location
- App activity (if logging/telemetry applies)
- Device or other identifiers

## 7) Final Verification Checklist

- [ ] Privacy policy text matches declared collection and sharing.
- [ ] Data Safety and App Privacy forms are internally consistent.
- [ ] Reviewer notes mention report/block and account deletion capabilities.
- [ ] No field claims data is "not collected" when feature clearly uses it.
