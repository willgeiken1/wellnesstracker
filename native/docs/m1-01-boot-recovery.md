# M1-01 — Boot-error recovery (issue #72)

Boot failures outside the sign-out-marker read/parse case show a calm recovery screen before private navigation or auth restoration. It covers database open/lock failures, migrations, pending sign-out wipe failures, and session-clear failures. Existing marker recovery remains separate.

Retry starts the boot sequence again. Failed database initialization releases its cached promise and closes the failed connection. The new recovery flow offers no reset or erase-all action. Repeating a pending sign-out wipe requires an explicit warning and confirmation; canceling or directly requesting an unconfirmed retry cannot wipe. If a DB failure initially hid a pending sign-out, Retry first stops at that confirmation gate. Existing first-boot resumption of a previously requested durable sign-out is retained.

There was no existing JSON export/share path. Export copies insight.db and any WAL into an isolated cache directory, opens only that copy with query_only, and serializes a WAL-aware SQLite snapshot for the system share sheet. No migration or repository access runs during export. If SQLite cannot read the copy, export shares the raw main file; the screen warns that recent changes may be missing. The original files are never written or deleted. Temporary copies are removed after sharing or failure. Export does not upload; the user chooses a destination in the system sheet.

Contact support opens a mail draft to insight.wellnessos@gmail.com. The subject is fixed. The body has exactly app version, platform, and an allowlisted error class; arbitrary exception names/messages, stored records, health values, notes, account addresses, and tokens are never included. The user sends the draft themselves.

The screen reuses scrollable Screen, labeled Buttons and ThemedText, including unlimited Dynamic Type and standard touch targets. It adds no animations, so it has no motion to disable under Reduce Motion. Details are hidden initially. Export/mail failures show fixed calm copy while retaining recovery.

## Test coverage

- auth-provider.test.tsx: injected database-open, migration, locked-DB, recovery-wipe, and session-clear failures render recovery while auth/sync stay gated; clearing each fault and Retry finishes boot. Pending-wipe retries require confirmation, including a marker first discovered after a DB failure. Existing marker tests remain, with expectations updated where a subsequent non-marker fault now renders boot recovery.
- database-boot.test.ts: exercises the real database initialization wrapper with open, lock, and migration faults; verifies failed connections close and subsequent attempts succeed.
- boot-export.test.ts: WAL-aware snapshot, unreadable-DB raw fallback, share failure cleanup, and unavailable share sheet without reading files; all data are synthetic.
- boot-diagnostics.test.ts: exact three-field mail body and fail-closed malicious diagnostic inputs.
- boot-recovery.test.tsx: actual support/export buttons, safe mail draft, details/Dynamic Type, calm action failures, no sign-out from those actions.
- recovery-layout.test.tsx: production root mounts the new recovery while private routes and technical errors remain hidden; existing marker recovery still mounts.

## Scope and validation

Plan step M1-01 / GitHub #72. The referenced library/work/native-rebuild-plan.md and answers are absent from this checkout; no additional section or Q-number mapping is inferred. No files in supabase/ or native/server/, schema, synced columns, or sync protocol changed. No simulators/emulators, git writes, real data, hosted services, or analytics were used.

TypeScript and Expo lint pass. The full native Jest command passes all 34 suites and 631 tests. Details are recorded in the draft PR body at the worktree root. Expo dependency check and doctor report pre-existing patch mismatches: @expo/ui 58.0.20 to ~58.0.21; expo 58.0.14 to ~58.0.15; expo-image 58.0.15 to ~58.0.16; expo-router 58.0.23 to ~58.0.24. These remain outside this small change. New expo-sharing and expo-file-system dependencies use SDK 58 versions selected by expo install; a rebuilt development client is needed to verify the native share sheet. Device checks are deferred by the task's explicit restriction.


## PR #74 review follow-up — 2026-10-19

Addressed OPEN 1–3 only: the recovery-wipe test invokes Cancel and verifies no new wipe, session clear, marker removal, or ready state; diagnostics assert raw mailto encoding, including `%0A`; each export best-effort sweeps stale `boot-export-*` cache directories and guards final staging cleanup. Added synthetic tests for sweep filtering, repeated exports, unavailable sharing, and listing/deletion failures preserving export success or the original error. Mutations wiring Cancel to `retryBoot(true)` and removing `encodeURIComponent` both fail the strengthened tests. Export scope and `bootExportHint` copy remain unchanged; items 4–7 were not addressed.

Validation from `native/`: TypeScript and Expo lint pass with no diagnostics; `npm test -- --ci` passes 34 suites / 638 tests. Commands ran offline with telemetry and dotenv loading disabled. No git writes, simulator use, network access, secrets, or changes under `supabase/` or `native/server/`.
