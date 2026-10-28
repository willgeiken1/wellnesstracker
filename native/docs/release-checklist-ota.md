# OTA release checklist: staged rollout and rollback

Docs only. Every `eas update` still needs Will's explicit go (see `native/AGENTS.md`). Publishing stays Will-only.

## Before publishing an OTA (JS-only) update
- [ ] Change is JS/asset only: no native module changes, no runtime version bump.
- [ ] No local SQLite schema migration in this update (an OTA must never ship a migration; rollback must stay safe).
- [ ] CI green on the commit being published.
- [ ] Will has approved this specific update.

## Staged rollout
1. Publish to a slice first: `eas update --branch <branch> --rollout-percentage=10 --message "<summary>"`
2. Watch Sentry crash/error rates and support reports for at least 24 hours (no health values in any report).
3. Widen: `eas update:edit` and raise the rollout to 50%, then 100% after another clean window.

## Rollback (the undo)
- If errors rise, run `eas update:rollback` on the branch, to the previous update or to the embedded build update.
- Confirm the rollback reached test devices, then log what happened in the release notes.

## Open check before M5
- Confirm EAS Update rollouts are available on the plan Insight will use (no new spending without Will's OK).

Sources: https://docs.expo.dev/eas-update/rollouts/ and https://docs.expo.dev/eas-update/rollbacks/ (LS-16 / M5-05).
