# OTA release checklist: staged rollout and rollback

Docs only. Every `eas update` still needs Will's explicit go (see `native/AGENTS.md`). Publishing stays Will-only.

## Prerequisites (not set up yet)

OTA updates are not wired up in this repo yet. Each step below is a separate change that needs Will's OK before it lands:

1. Add the `expo-updates` dependency (pinned exact version).
2. In `app.config.js`, set `updates.enabled` to `true` and add an `updates.url` for the EAS project.
3. Add a `runtimeVersion` policy in `app.config.js`, so an OTA only reaches builds with matching native code.
4. Add build channels (for example `preview` and `production`) to the build profiles in `eas.json`.

Until all four land, nothing in this checklist can run.

Note: `eas update --branch <name>` must target the branch mapped to the build's channel, or the update never reaches those builds.

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
