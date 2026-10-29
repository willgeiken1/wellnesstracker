# INS-04 native shell

Scope: `native/design/REDESIGN.md` §1.1, §3.5 and §3.7; INS-00 at ca00f9e; Will's I5.

The existing five NativeTabs labels and URLs are preserved. Each tab now owns an index route inside a native Stack, enabling the SDK 58 `headerLargeTitleEnabled` option. Settings stays a push from the avatar and also has a large title. iOS uses a UIKit bar button; Android/web retain a labeled action with the existing touch-target token.

Screen scroll views use automatic content and indicator insets. On iOS, automatic content insets handle the bottom safe area; tab content keeps only the existing page spacing. Android/web additionally reserve the bottom inset supplied by the safe-area provider, without assuming a tab-bar height. Tests cover bottom insets of 0, 34 and 83 pt.

Reduce Transparency defaults to solid until the OS query resolves, remains solid on query failure, follows preference changes, and ignores a stale initial query after an event. The solid background uses the existing `bg` token. iOS 26 owns Liquid Glass rendering and its accessibility adaptation; the explicit background/blur fallback also covers older iOS versions. On iOS, standard tab colors come from the system, with only the accent tint applied. Android/web tab icons, labels and indicators use the existing theme tokens, and tab headers use the same surface/text tokens as Settings.

The installed universal Expo UI Picker has no segmented mode. The iOS component therefore uses the SwiftUI Picker with `pickerStyle('segmented')`; Android uses Compose segmented buttons. Each native tree has a universal Host and uses only the current accent and mode. The existing web fallback remains. There were no custom sheets or switches in the shared shell requiring conversion.

No screen contents, tokens, body-map implementation/frame/props, Home widget model/tray, check-ins/import, data migrations, sync logic or feature flags were changed. Route screen files moved without content changes.

Sources checked: [Expo native tabs](https://docs.expo.dev/router/advanced/native-tabs/), [SDK 58 Router](https://docs.expo.dev/versions/v58.0.0/sdk/router/), and installed SDK 58 package declarations.

Skills: native UI, Expo UI, test-driven development and verification (see repo guidance in `AGENTS.md` and `native/AGENTS.md`).

Verification limitations:

- Registry DNS is unavailable. Dependencies were copied from existing local code-only dependency directories, then 44 package versions were restored from integrity-checked cached tarballs to match the lockfile. React Native and its tooling remain at 0.88.0, whereas the unchanged lockfile requires 0.88.1; dependency-health checks cannot certify the pinned installation.
- Root `npm test` cannot run: the root package has no test script. Native checks are run separately.
- No iOS simulator or Pixel emulator was available to launch; device screenshots and real Liquid Glass/inset rendering still need visual verification.
- Git metadata is mounted read-only. `git add` fails creating the external worktree `index.lock`; staging and committing are unavailable in this sandbox. The runner must commit the working-tree diff.

Validation results (2026-10-29):

- PASS: native TypeScript and Expo lint.
- PASS: complete app Jest project, 66 suites / 1,156 tests / 2 snapshots (`npm test -- --ci --selectProjects app --runInBand`).
- PASS: five moved screen sources remain byte-for-byte identical to HEAD.
- PASS: `git diff --check`; no changes under the excluded token, body-map, server, migration or sync paths.
- FAIL (sandbox): the complete combined run finished with 99 suites / 1,931 tests passing, 1 suite / 1 test failing, and 2 snapshots passing. The sole failure is `tests/server/edge-gates.test.ts`: its `execFileSync` Node subprocess returns `EPERM`. Running its underlying checks directly with `node --test --test-isolation=none native/tests/server/row-sync-edge-gates.node.mjs` passes all 20 tests. No test was skipped, suppressed or rewritten to hide this failure. The earlier short server timeout was insufficient; the full run completed without it.
- BLOCKED: commit/clean working tree, because the Git metadata mount is read-only. No push, merge, rebase or PR was attempted.
