# Billing provider boundary (draft)

This slice adds an independently tested `PurchaseProvider` implementation around an injected `BillingPort`. It is not installed or mounted in the app. No real purchase has been implemented or verified. The intended future iOS/Android processor is RevenueCat, subject to setup and privacy review before any SDK installation, account, or spend.

## Scope and decisions

Source: Will's approved Nov 3 launch delegation, superseding the old pricing-after-launch wording in native plan §0.2 (Q10/Q118–120). This is preparatory billing work for native launch, under §0.1 review rules; it does not claim a numbered native milestone is complete. Existing Plus interfaces and merged pw-01/pw-02/pw-03 are reused. Draft #138 (`9f7c76838d31245f85dcb3c7cef4f8a791557b9a` when inspected) owns app/paywall wiring; none of its changed paths are edited here.

- Preserve planned $4.99/month, $39.99/year, seven-day trials, and $34.99 first-year waitlist offer. Waitlist eligibility remains undecided. No waitlist product or eligibility rule is enabled by this slice.
- Actual store products, localized prices and verified trial eligibility must come from the future adapter. A planned trial must never be treated as proof that a particular customer is eligible. The current contract can represent an ineligible offer with `trialDays: 0`.
- Basics and advanced trends remain free. AI food is the first Plus feature; workout AI commentary comes later. This module neither changes feature policy nor authorizes server quota access.

## Lifecycle contract

The future adapter must bind one authenticated account before constructing the port, normalize SDK receipts into `{ active, expiresAtMs }`, and supply ordered entitlement notifications. No customer object, health data, email, analytics attributes or raw SDK error belongs in this port. Store identity mapping and server validation are follow-ups, not implemented here.

Only an active receipt with a finite future access deadline yields Plus. Trials and store-confirmed grace periods use that same effective deadline. Auto-renewal cancellation alone must not revoke remaining paid access; revocation/refund must normalize to inactive. The adapter must never derive access from a purchase button press or a pending transaction.

Purchase, restore and refresh serialize: a concurrent operation returns pending without starting a second transaction. Notifications supersede in-flight responses. Cancelled/pending purchases do not grant or overwrite ownership. A failed refresh clears cached access and reports a code-only error. Subscriber failures cannot break other listeners.

The app integration must refresh on foreground and at the effective expiry deadline; this module does not schedule timers. The existing entitlement store caches UI state, so without that integration an already-rendered Plus state can outlive expiry. No offline grace policy is invented. Dispose before logout/account changes; disposal emits free, disconnects notifications, suppresses late results, and prevents future operations. Create a new account-scoped instance afterward. Unmounting one observer only removes that observer; the owner must dispose the provider.

## Validation and limits

`native/tests/billing-boundary.test.ts` uses synthetic receipts and an injected clock. No SDK or network is used. Tests cover purchase/restore, pending/cancel, invalid product, expiration, revocation, stale responses, concurrent operations, disposal, listener failures, sanitized errors and product metadata filtering.

Normal CI can discover the test with the existing Jest app configuration. In the current environment the reused dependencies are older than main: the React compiler plugin is absent, and whole-app typecheck reports missing camera/image/picker modules. No dependency was installed to work around this. The isolated verification uses the existing TypeScript and Jest binaries:

```sh
# From repository root; output is disposable and outside the checkout.
node native/node_modules/typescript/bin/tsc --outDir /tmp/billing-tests --module commonjs --target es2022 --strict --skipLibCheck --types jest,node native/src/features/billing/provider.ts native/tests/billing-boundary.test.ts --typeRoots native/node_modules/@types
node native/node_modules/jest/bin/jest.js --config '{"rootDir":"/tmp/billing-tests","testMatch":["**/billing-boundary.test.js"],"transform":{},"testEnvironment":"node"}' --runInBand
```

Risk: MEDIUM (billing lifecycle). Quinn exact-head review is pending. No merge. Real SDK mapping, identity/transfer semantics, refund/grace behavior, store catalog/trial/waitlist configuration, localized price presentation, foreground/expiry wiring and store sandbox tests remain blocked on the approved setup/privacy review and subsequent implementation. No manifests, #138 wiring, server quota, privacy files, 3D code, SQL, secrets or deployment are changed.
