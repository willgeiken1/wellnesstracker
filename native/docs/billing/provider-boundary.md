# Billing provider boundary (draft)

This slice adds an independently tested `PurchaseProvider` implementation around an injected `BillingPort`. It is not installed or mounted in the app. No real purchase has been implemented or verified. The intended future iOS/Android processor is RevenueCat, subject to setup and privacy review before any SDK installation, account, or spend.

## Scope and decisions

Source: Will's approved Nov 3 launch delegation, superseding the old pricing-after-launch wording in native plan §0.2 (Q10/Q118–120). This is preparatory billing work for native launch, under §0.1 review rules; it does not claim a numbered native milestone is complete. Existing Plus interfaces and merged pw-01/pw-02/pw-03 are reused. Draft #138 (`9f7c76838d31245f85dcb3c7cef4f8a791557b9a` when inspected) owns app/paywall wiring; none of its changed paths are edited here.

- Preserve planned $4.99/month, $39.99/year, seven-day trials, and $34.99 first-year waitlist offer. Waitlist eligibility remains undecided. No waitlist product or eligibility rule is enabled by this slice.
- Actual store products, localized prices and verified trial eligibility must come from the future adapter. A planned trial must never be treated as proof that a particular customer is eligible. The current contract can represent an ineligible offer with `trialDays: 0`.
- Basics and advanced trends remain free. AI food is the first Plus feature; workout AI commentary comes later. This module neither changes feature policy nor authorizes server quota access.

## Lifecycle contract

The future adapter must bind one authenticated account before constructing the port, normalize SDK receipts into `{ active, expiresAtMs }`, and supply ordered entitlement notifications. No customer object, health data, email, analytics attributes or raw SDK error belongs in this port. Store identity mapping and server validation are follow-ups, not implemented here.

A successful confirmation grants Plus only for an active receipt with a finite future access deadline. Null receipts, missing/non-boolean `active`, and non-finite `expiresAtMs` fail closed without throwing, including subscription callbacks. Trials and store-confirmed grace periods use that same effective deadline. Auto-renewal cancellation alone must not revoke remaining paid access; revocation/refund must normalize to inactive. The adapter must never derive access from a purchase button press or a pending transaction.

Purchase, restore and refresh serialize: a concurrent operation returns pending without starting a second transaction. A monotonic local revision orders confirmations: a revoked response supersedes active snapshots received mid-operation, while a revocation notification prevents an older in-flight active response from restoring access. The port must still deliver its own snapshots in source order. Cancelled/pending purchases do not grant or overwrite ownership. Unreachable refreshes (returned errors, throws, or timeouts) report a code-only error and retain previously confirmed active access only until the earlier of last confirmation plus `OFFLINE_GRACE_MS` and expiry plus `OFFLINE_GRACE_MS`. The named constant is seven days; the cutoff is exclusive. Repeated failures never renew confirmation time. Revoked receipts end access immediately. Cancelled/pending refreshes and malformed receipts do not enable offline grace. Subscriber failures cannot break other listeners.

The app integration must refresh on foreground and at the effective expiry deadline; this module does not schedule entitlement-expiry timers. Port operations have a 30-second timeout (injectable as the third `createBillingProvider` argument); a hung operation resolves as failure, releases the busy guard, and cannot apply a late result. The existing entitlement store caches UI state, so without that integration an already-rendered Plus state can outlive expiry. During an outage, the app must also refresh at the offline-grace cutoff to update cached UI state. Dispose before logout/account changes; disposal emits free, disconnects notifications, suppresses late results, and prevents future operations. Create a new account-scoped instance afterward. Unmounting one observer only removes that observer; the owner must dispose the provider.

## Validation and limits

`native/tests/billing-boundary.test.ts` uses synthetic receipts and an injected clock. No SDK or network is used. Tests cover purchase/restore, pending/cancel, invalid product, expiration, revocation, stale responses, concurrent operations, disposal, listener failures, sanitized errors, product metadata filtering, seven-day offline grace cutoffs, malformed receipts, revocation ordering and hung-operation timeouts.

Normal CI discovers the tests with the existing Jest app configuration. Run from `native/`:

```sh
npx tsc --noEmit
npx expo lint
npm test -- --ci
```

The focused billing suite has 47 synthetic tests, including fake-timer timeout checks. No dependency or manifest changes are part of this fix. As of Nov 4, 2026, Expo Doctor passes 20/20 checks; the online Expo dependency check reports nine version updates for separate dependency maintenance.

Risk: MEDIUM (billing lifecycle). Quinn exact-head review is pending. No merge. Real SDK mapping, identity/transfer semantics, refund/grace behavior, store catalog/trial/waitlist configuration, localized price presentation, foreground/expiry wiring and store sandbox tests remain blocked on the approved setup/privacy review and subsequent implementation. No manifests, #138 wiring, server quota, privacy files, 3D code, SQL, secrets or deployment are changed.
