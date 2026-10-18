# P2c — M1 foundation, part 2

Implements the supplied plan quotes §7.1/§7.3/§12.1 and M1 (§15.2), Q2/Q11/Q12/Q90/Q93/Q98/Q103/Q124. Q14/Q15 (health-source exclusion), Q47 (no check-ins), and §9 (SI storage with original weight entry) remain binding. The full plan is outside this repository; no Will decision was reinterpreted. This is HIGH-risk draft code for Quinn review and Will's go. Nothing has been applied outside in-process tests.

## Local data

One `insight.db` file uses WAL, foreign-key enforcement and the Drizzle Expo SQLite driver. A bundled, versioned Drizzle migration runs before any private route is admitted. SQL is embedded in a TypeScript string so Metro does not need a SQL import transform. `schema.ts` provides Drizzle table definitions; `catalog.ts` names the physical payload columns and doubles as the wire allowlist. Tests check the catalog against actual SQLite columns and execute the same Drizzle driver/migrator/repository using a thin `node:sqlite` native-method adapter, rather than a separate repository implementation.

All 19 synced tables contain `owner_id`, device-generated UUID-v4 `id`, integer-millisecond `updated_at`, nullable `deleted_at`, and UUID-v4 `device_id`. The tables are profile, weigh_ins, measurements, routines, routine_exercises, sessions, entries, sets, cardio_sessions, food_entries, saved_foods, food_targets, meals, goals, plan_days, machine_notes, home_layout, settings, and photos. Payloads are explicit scalar columns, not a user-data blob. Names are mapped from PWA state concepts (`mod`/`at` become `updated_at`; `exercise`, `origin`, `finishedAt`, `order`, `w`/`r`, and per-side set fields become named columns). M2 will add complete product behavior and further migrations.

Weights use `weight_kg` plus `entered_value`/`entered_unit`, including per-side unilateral set entries. Heights/distances/circumferences use meters; durations use milliseconds; food energy uses kJ and macros/amounts use grams. Photo rows are metadata only (file name, capture time and dimensions), never image bytes or credentials. Nullable fields deliberately permit partial foundation rows and tombstones. No check-in table or feature exists.

`oura_days` is an owner-scoped local cache with no transport path. `weigh_ins.source` is immutable per row: `app` rows can enter the outbox; `healthkit`/`health_connect` rows stay local, including their tombstones. Unknown sources fail closed. The transport and server independently reject non-app sources. Future Health integrations must use these local-only paths; they are not implemented here.

`sync_outbox` stores owner/table/id/revision, referencing the current row in the same database. A mutation commits the row, local logical clock and outbox revision together before emitting a change event. A process can die after commit and resume pending uploads after restart; clamped lost-ack retries have the accepted version-ordering limitation below. An acknowledgment removes only the revision that was sent, preserving edits made during an upload. A pull commits its rows, maximum observed clock and cursor together. Storage/database failures become fixed safe errors without SQL parameters, health values or backend details.

Appearance now hydrates and writes `settings` through the repository. It saves the override/accent immediately and subscribes to subsequent pulls. Multiple device-created settings rows are resolved for display by the newest LWW tuple; editing reuses the winning row. Defaults remain System/Citrus. Save failures show a fixed inline error. Guest/demo preferences live in their own local namespaces.

## Server, cursors and conflicts

The draft SQL and future apply/rollback notes live in `native/server/row-sync/`; nothing was added under repo-root `supabase/`. Each server table mirrors the synced payload and adds an owner FK/default and server-assigned bigint sequence. Explicit grants, owner RLS with USING and WITH CHECK, an invoker-rights allowlisted RPC and a stale-write trigger protect both direct operations and RPC use. Tests apply the draft SQL unmodified to PGlite and run as the authenticated role with a synthetic JWT subject. Direct physical DELETE is rejected in favor of tombstones.

Incremental pulls have one durable cursor per owner/table. They filter and sort `server_seq`, and cast it to text before JSON serialization to preserve values above 2^53. Pages are applied atomically before advancing the cursor. A transaction-level per-owner advisory lock is acquired before sequence allocation and held until commit, including direct insert/update paths. This prevents out-of-order commits from falling behind an already consumed cursor. Other owners can write independently. Sequence gaps do not represent missing data.

Client and server use the same LWW rule: larger client `updated_at` wins; equal timestamps use lexicographically larger lowercase UUID `device_id` (server `COLLATE "C"`). The server compares timestamps after clamping; identical incoming tuples are not necessarily immutable retries. Local mutation stamps are `max(Date.now(), observed_clock + 1)`; pulls advance that clock, so same-millisecond edits, backward clocks and edits to future-dated remote rows do not disappear. This is conflict ordering, not a claim that device time is accurate. D2 below bounds future server timestamps and reconciles acknowledged client revisions with their accepted server versions.

Tombstones use exactly the same ordering as live rows. Parent tombstones never cascade into child tables; sets, entries and routine exercises retain their own versions. Tombstones have no TTL/GC in this foundation, preserving convergence for devices offline for a long time.

The pure TS engine accepts an injected Transport. Production wiring uses supabase-js RPC/select; tests use authenticated PGlite RPC/select semantics. Network operations are asynchronous, serialized, and do not hold SQLite transactions open across awaits. Committed changes debounce for 2 seconds; foreground, reconnect and Account's Sync now also trigger a sync. Requests arriving during a flight retain a serialized follow-up, including after a failed slow push. Errors leave the durable outbox intact and display an offline state. Cleanup stops timers/listeners and prevents late requests from acknowledging or applying pages after account departure.

## PWA cloud.js mapping

| PWA merge rule | Row-level mapping |
| --- | --- |
| Sessions union by id; newer `mod` wins | Each session is independently merged by updated_at/device_id. |
| Logged sets survive; set count protects live freestyle | Every entry/set has its own id/version; an older parent or parent tombstone never deletes children. Row-level deletion requires an explicit versioned child tombstone. |
| Freestyle origin/order/extra/removed/swaps recovered from older copies | Origin stays on sessions; exercise membership/order stays in independently versioned entries. Added/removed/swapped exercises become entry creates/edits/tombstones. No whole-session replacement can erase independent sets. M2 owns those editing operations. |
| Timed deletion marks compete with session edits; untimed empty discard cannot erase logged data | New writes always have explicit versioned tombstones. No legacy untimed markers are imported in P2c. There is no cascading empty-discard operation. |
| Measurements by day/`at`, weigh-in merge | Independent measurement/weigh-in rows use LWW; only app-source weigh-ins sync. |
| Food, cardio and machine-note per-item merges/deletes | Dedicated rows and explicit tombstones; missing rows never imply deletion. |
| Goals, routines, plan and settings clocks | Dedicated goal/routine/plan-day/settings rows, all using the same total ordering. Empty/newer routine data is explicit rather than blob-level fallback. |
| homeV2 layout selection preserving widget membership | One home_layout row per widget; position/hidden state does not replace the whole layout. M2 must reuse the existing widget id when editing. |
| Purge marker union and date-range cleanup | Future deletion workflows must emit explicit per-row tombstones; range purge/import is outside P2c. No expiry/implicit deletion is introduced. |
| Check-ins, AI brief/reports, credential/app-lock fields, Oura | Excluded. No check-ins or AI/report payloads. Credentials stay in SecureStore; Oura stays in local cache. |
| Blob RPC/fallback user_data upsert | Absent; row sync never calls merge_user_data or user_data. |

PWA same-time “local/server copy wins” and set-count tie heuristics are replaced by the requested deterministic device-id tie-break. Independent child rows preserve the underlying logged data rather than selecting one entire session blob. P2c does not import or reinterpret old blobs.

## Accounts and auth

Repositories have immutable owner namespaces. No row is claimed, copied or uploaded under another owner. Explicit sign-out now wipes the departing account’s local rows and sync metadata after a sync attempt and a confirmation warning (D3 below). Merely switching auth owners still isolates their namespaces. The provider hides the previous repository immediately on an owner change, closes the previous engine, and checks the current auth owner before each transport operation. Server RLS independently rejects mismatched rows. Sign-out uses local scope and removes device session storage even when network revocation fails, then gates private routes behind Welcome. Local storage failures remain errors; the UI does not claim successful erasure.

Welcome offers Get started, I have an account, and Look around first. Missing config disables auth and shows “Sign-in isn't set up in this build”; only demo works. Create account validates email, an 8-character minimum and matching confirmation, and handles email confirmation. Sign-in permits existing shorter passwords. DOB/units onboarding is an explicit M2 stub. Demo uses synthetic fixture rows in a separate namespace, creates no sync engine, and is not persisted as a signed-in session. Private tabs, Settings, workout/food deep links and onboarding use Expo Router protected routes; sign-in or demo is required.

Supabase v2 is pinned exactly. The React Native URL polyfill follows the official auth quickstart. Sessions use a serialized, chunked SecureStore adapter: at most 400 Unicode codepoints per chunk (<=1600 UTF-8 bytes), a bounded chunk count and a ready marker written only after all chunks. Replacement invalidates the ready marker first. Interrupted writes restore a complete old/new session or no session, never mixed chunks. Delete clears the marker, chunks and count. iOS writes use WHEN_UNLOCKED_THIS_DEVICE_ONLY. AppState starts/stops auto-refresh; subscriptions are removed on cleanup. No password/token is placed in an error string.

## Threat notes and boundaries

- The production project reference is rejected before client creation, even if the key is missing. This launch guard stays until a separately Will-approved PR removes it. This draft additionally allows only loopback URLs, preventing any hosted Supabase connection. The key must have the publishable prefix; service/secret/legacy JWT keys are refused. Real configuration was neither read nor supplied.
- Owner RLS covers every server row table. WITH CHECK is tested independently of the owner trigger. The RPC is SECURITY INVOKER, fixed search_path, statically dispatched, non-anonymous and atomic per batch. Owner identities and sequence values cannot be overridden through payload fields.
- There is no AI, Sentry, PostHog, Health client, hosted service or notification integration in this change. Transport tests fail closed on unknown fields/health sources/owner mismatch. App-entered health-related values may sync to the owner's row tables; none are sent to AI or analytics. Future telemetry must add the required payload guard/tests before integration.
- Local namespaces are logical isolation in one SQLite file, not file encryption or a device-security boundary. SecureStore protects session material separately. Explicit sign-out erases account rows; switching owners without signing out preserves their separate namespaces. Account deletion cascades server rows (D4).
- UI never displays raw auth/SQL/backend errors; the transport also sanitizes rejected network promises. Tests and fixtures contain synthetic values only. No secrets, real user rows, Health records or `.env` contents were inspected.

## Local validation

For an Android emulator reaching Metro on the Mac, run `adb reverse tcp:8081 tcp:8081`. If the separately approved local Supabase runs on Mac loopback, reverse its API port too (default: `adb reverse tcp:54321 tcp:54321`) and use the loopback URL from the emulator. Reapply these mappings after restarting the emulator. These are validation instructions only; no emulator or service was started for this review.

Use Node 24+ (tested on 24.21.0). From `native/`, `npm test -- --ci` runs the Expo and data-server Jest projects, including PGlite and fast-check. No Docker, Supabase service or network is needed for those tests. Jest enables VM modules for PGlite, disables Watchman, and runs one worker to bound WASM memory. Parallel workers intermittently exceeded Jest's teardown grace period; the standard serial run exits cleanly. The server setup gives cold WASM initialization 60 seconds; regular tests have a 30-second limit. fast-check runs 25 random histories of 1–30 operations across 2–3 devices, including create/edit/delete, random sync order, timestamp ties, duplicated pushes and retries, then checks all devices against server state. Separate tests cover restart, account isolation, paging, high cursors, tombstones, failed-flight follow-ups, late request cleanup, storage faults and auth/component behavior.

All CLI checks use EXPO_NO_TELEMETRY=1, EXPO_NO_DOTENV=1 and npm_config_cache=/tmp/insight-npm. Expo cache uses __UNSAFE_EXPO_HOME_DIRECTORY=/tmp/insight-expo because the default home cache is outside the writable roots. No real environment values are required. `.env.example` contains empty placeholders only.

Original P2c checks (2026-10-17, before Quinn #70):

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npx expo lint` | PASS, no warnings |
| `npx expo-doctor` | PASS, 20/20 |
| `npx expo install --check` | PASS at kickoff and final; exact Supabase pin agrees with lockfile |
| `npm test -- --ci` | PASS, 92 tests / 16 suites (49 Expo tests, 43 data/server tests), including 25 fast-check histories |
| Root `npm test` | Unavailable: existing root package has no test script |
| Workflow-equivalent non-quota PWA Node tests | 430 passed / 6 failed out of 436; same missing Zod/local PostgreSQL prerequisites recorded in P2b |
| Root quota integration | Not run: no local PostgreSQL service; Docker/services were prohibited |
| Native build / screenshots / live PostgREST | Not run, per task restrictions |

The final standard Jest run exited cleanly with serial execution. An earlier two-worker run passed but reported forced worker teardown. Open-handle diagnostic runs stalled without producing a report and were interrupted; no claim is made that those diagnostics proved the absence of handles. The isolated Node project and final serial full suite exited normally. Initial Expo cache permission failures were resolved by redirecting its cache to `/tmp`.

Regression tests were observed failing before fixes for pulled future clocks, edits queued behind failed uploads, delayed sign-out completion after a newer account event, and raw rejected-network errors. All now pass. No Git mutations, native builds, service application or production operation was used for validation.

## Review fixes (Quinn #70)

HIGH-risk draft review fixes only, 2026-10-17. Server SQL remains **DRAFT / NOT APPLIED** outside synthetic in-process PGlite tests. No Git operations, prebuild, simulator/emulator, Docker, hosted Supabase, root `supabase/` edits, secrets or paid services were used.

| Finding | Changes and regression evidence |
| --- | --- |
| B1 — privileges | All 19 tables revoke ALL from PUBLIC/anon/authenticated, then grant authenticated SELECT/INSERT/UPDATE only, with ENABLE and FORCE RLS. The sequence revokes ALL first, then grants authenticated USAGE only. USAGE is sufficient for invoker `nextval`; SELECT and UPDATE are unnecessary, and UPDATE would permit `setval`. Trigger EXECUTE is revoked from all three roles; PostgreSQL checks EXECUTE when creating the trigger, not when it fires. Only authenticated may execute `sync_push(jsonb)`. Both functions explicitly remain SECURITY INVOKER with an empty pinned search_path. |
| B1 + item 6 — server tests | `tests/server/pglite.ts` installs permissive Supabase-style default grants before applying the unmodified draft. `rls.test.ts` checks every table privilege for anon/authenticated, the sequence/function matrix, both RLS flags, all public functions' `prosecdef=false`/search_path, and explicit SECURITY INVOKER declarations. Attack cases cover cross-owner SELECT/INSERT/UPDATE/DELETE, owner spoofing/reassignment, anon operations, owner DELETE, direct guard calls, anon nextval/setval, authenticated setval, TRUNCATE, and direct server_seq assignment. A direct server_seq write cannot select the resulting sequence: the trigger replaces it with nextval. |
| Item 6 — client regressions | `repository.test.ts` checks owner-scoped get/cursors and newer pending local revisions surviving pull and subsequently pushing. `conflicts.test.ts` switches A → B → A through real PGlite pulls and checks the exact cursor used, including B's sequence below A's. `transport.test.ts` asserts the explicit owner_id query filter. `auth-client.test.ts` checks createClient storage/persistSession/autoRefreshToken/detectSessionInUrl options and exercises chunking, readback, delete and keychain accessibility through the actual configured adapter. These owner/storage paths were already implemented; the tests make the guarantees explicit. |
| Item 7 — Android loopback | Local validation above and `native/README.md` document `adb reverse tcp:8081 tcp:8081` for Metro and reversal of the approved loopback Supabase API port (normally 54321). No adb command was run. |
| Item 8 — provenance collisions | A second bundled SQLite migration adds owner/table/id conflict records with a fixed reason and no row payload. Pulls preserve immutable local provenance, flag the id, continue the page and atomically advance its cursor. Flagged ids are excluded from pending uploads and subsequent pull replacement. The SQL guard emits dedicated SQLSTATE P2001 on an existing weigh-in source mismatch, before stale-write handling; the production transport maps only that code to a fixed typed error. The engine isolates a failed atomic batch into at most one singleton push per row, flags only colliding ids, and continues valid rows. Ordinary network/validation errors still leave rows pending. Local rows/outbox remain retained, including edits made after flagging. Account shows the conflict count separately from pending and does not claim Up to date while conflicts exist. |

Conflict tests cover same-page and paged pull continuation, conflict deduplication, owner isolation, persistence after SQLite restart, valid rows draining after a pushed collision, SQLSTATE mapping through the production transport, and repeated syncs/edits without retrying a flagged id. Server-side source collision fixtures temporarily remove the source CHECK and seed a synthetic legacy/corrupt row, then restore the constraint; the production schema continues to accept app-source weigh-ins only. The push-only corruption test does not claim that invalid remote Health-source payloads are valid pull data. Conflict resolution UI/actions are not added; records remain available for later review without automatic identity/source rewriting.

Red-before-green was observed for the permissive-default privilege matrix, pull-page stalling, pushed collision/offline behavior, dedicated SQLSTATE mapping, SQL source immutability and Account conflict display. Existing owner/filter/storage behavior passed its new regressions without implementation changes.

## Decisions (Will, Oct 17, 2026)

D1–D4 are decided and implemented here; none remain pending Will. The SQL header remains **DRAFT / NOT APPLIED**; only synthetic in-process PGlite execution is authorized by this task.

- **D1 — minimal tombstones.** `server/row-sync/0001_row_sync.sql` wipes every payload column in the invoker guard on INSERT and UPDATE, through both direct writes and RPC. Only identity/version/sequence metadata and `weigh_ins.source` survive; source is required for immutable provenance checks. Relationship ids, dates, names, measurements, notes, settings, and photo metadata are values and become NULL. All value columns were already nullable, so no NOT NULL relaxation was needed. `src/data/rows.ts` canonicalizes local/pulled tombstones and produces minimal outgoing envelopes; `src/data/sync/supabase.ts` validates before stripping payload values. `src/data/repository.ts` also wipes local-only Health-source tombstones while retaining their source. Bundled migration `0002_minimal_tombstones` in `src/data/migrations.ts` wipes existing SQLite tombstones without changing versions/outbox. Resurrection still uses the original LWW rule; children retain their own versions and tombstones have no GC.
- **D2 — future cap: CLAMP to transaction `now()`.** The shared SQL guard compares integer millisecond `updated_at` with transaction `now() + 300000` and clamps only values strictly beyond that boundary to `now()`, before INSERT/upsert/direct UPDATE LWW comparison. Clamping to `now()+5min` would grant a bad clock a five-minute priority over legitimate later edits; clamping to now avoids that priority while accepting writes. Exactly +5min remains accepted, including its bounded skew tradeoff. The existing client had no wall-clock cap; its monotonic `max(Date.now(), observed_clock+1)` behavior is retained. The invoker RPC now returns each actual stored row (including a stale write’s existing version). `src/data/sync/supabase.ts` validates acknowledgment count/identity/allowlisted values; `src/data/sync/engine.ts` passes the result to the repository. The repository atomically replaces only the exact sent local revision and acknowledges its outbox entry; a newer pending local revision remains protected. This also reconciles a clamped write that loses LWW and therefore produces no new sequence for incremental pull. An interrupted request/ack keeps the durable outbox for retry. On a correction, the observed clock is recomputed from this owner’s stored rows so the rejected timestamp does not poison later edits. Known lost-ack limitation: if a clamped write's acknowledgment is lost, the client retains the original future timestamp. A retry can be re-clamped to a newer transaction `now()` and treated as a new version, potentially overwriting an intervening edit. Will accepted this on Oct 17, 2026 as no worse than having no clamp. No deduplication or SQL behavior change is introduced for this limitation. A client cannot discover trusted server time while offline; the server is authoritative. RPC/SQL tests use transaction time for deterministic boundary checks.
- **D3 — device sign-out wipe.** `src/data/repository.ts` atomically erases all 19 synced tables, outbox (including flagged changes), conflict flags, every owner-scoped sync-state row/cursor, settings and the local Oura cache for the departing owner; other owners and device metadata remain intact. `src/auth/provider.tsx` attempts sync before wiping, refuses unacknowledged unsynced loss, closes the engine to prevent late sync application, wipes the repository and uses `scope:'local'`. `src/auth/screens.tsx` attempts sync before showing the existing confirmation. After the bounded sync attempt, the confirmation warns about device erasure and the actual owner outbox count (including flagged rows), using singular/plural i18n text; zero pending changes skips the warning. Confirming explicitly acknowledges loss even if another edit arrives while the dialog is open. `src/auth/client.ts` explicitly preserves the SDK’s existing default storage key and removes its session/user/verifier chunks, marker and count even after network failure. A late sign-out never removes a newer account’s credentials or access. Demo exit wipes the demo namespace. No remote/global session revocation or server-row deletion is introduced by sign-out.
- **D4 — account deletion cascade.** All 19 SQL owner FKs now use `ON DELETE CASCADE`. The DELETE guard permits only a nested cascade whose auth parent is already absent; ordinary physical row deletion remains ungranted and guarded. No table/RPC/sequence grants, RLS/FORCE RLS, invoker rights or pinned search paths were loosened. This supplies the FK behavior, not an account-deletion UI/API or permission to delete real accounts.

Regression evidence: `tests/server/decisions.test.ts` covers all-table tombstone RPC storage, direct live-to-tombstone UPDATE, pulls, stale/new resurrection, future clamps before LWW, exact +5min/+5min+1ms, client convergence after a clamp (including a stale clamp behind an already-consumed cursor), owner/demo SQLite wipes, and account cascade isolation plus `pg_constraint.confdeltype='c'` for every owner FK. `repository.test.ts` adds local app/Health-source wiping and migration upgrade coverage; `transport.test.ts` asserts the minimal outgoing tombstone payload and rejects invalid acknowledgments. Repository coverage also checks newer in-flight edits surviving a clamped acknowledgment. Auth provider/client/UI tests cover local network-failure cleanup, SecureStore keys, subsequent user isolation, demo exit, sync attempt, and warning acknowledgment. Red-before-green was observed for missing tombstone minimization, server caps, account cascades, local wipes, the changed sign-out policy, upgrade cleanup and the stale-clamp/cursor case. The existing provider test asserting that a failed sign-out retains access was intentionally replaced with returned-error/rejected-network cases requiring local wipe, as D3 changes that behavior; the existing UI confirmation test now asserts the loss warning and explicit acknowledgment. The PGlite transport harness and RPC mocks in `transport.test.ts`/`conflicts.test.ts` now return stored-row acknowledgments for D2’s intentional push contract change. All other existing test expectations, including future-clock monotonic edits, remain intact.

### Quinn #70 recheck minors

- **Item 1 (Will, Oct 17, 2026):** Corrected the retry claims in this document and SQL comments. A lost clamped acknowledgment can cause a retry to re-clamp to a newer `now()` and become a new version/overwrite. Will accepted that limitation as no worse than no clamp; SQL behavior is unchanged.
- **Item 3 (Will, Oct 17, 2026):** `src/auth/sign-out.ts` and `sign-out-storage.ts` implement a durable departure journal; provider boot recovers it before creating the production auth client or restoring a session. Sign-out and demo exit use the same journal → transactional owner wipe → SecureStore session clear → journal removal path. The original newer-session guards remain in place.

- **Item 2:** The shared SQL guard sets `deleted_at` to the clamped `updated_at` only when a future tombstone is clamped. RPC acknowledgments already copy the authoritative stored row into SQLite; PGlite/SQLite regressions verify both timestamps converge, ordinary deletion timestamps remain unchanged, and the next local clock is recomputed.
- **Item 4:** `src/auth/sign-out-sync.ts` bounds both screen and provider pre-sync attempts with `SIGN_OUT_SYNC_TIMEOUT_MS = 10_000`, clearing the timer on early completion. Account disables sign-out, displays a spinner and exposes busy/disabled accessibility state while awaiting sync/sign-out; a ref blocks duplicate submissions. Timeout continues to the unsynced-loss check.
- **Item 5:** `Repository.unsyncedCount()` counts this owner's outbox rows, including conflict-flagged rows exactly once. Account reads it after pre-sync, skips the warning for zero and uses singular/plural i18n warning text for positive counts. Tests cover 0, 1 and 3 and owner isolation.
- **Item 6:** Added regressions independently cover clock recomputation, each newer-session guard, screen/provider sync ordering, the exact SecureStore auth key, and the photos metadata cleanup statement during an actual SQLite migration upgrade. The existing Account confirmation test's warning expectation changes to the counted plural text; its alert callback is now wrapped in `act` for the new busy-state updates. No other existing behavior expectations change.

Initial validation for items 2/4/5/6 (before items 1/3): `npx tsc --noEmit` and `npx expo lint` pass; `npx expo-doctor` passes 20/20; `node --test plugins/*.test.js` passes 9/9; `npm test -- --ci` passes 391/391 in 19 suites (all 375 existing tests plus 16 added cases). `npx expo install --check` reports dependencies up to date. Ten targeted, individually applied mutations were killed: clock recomputation, each newer-session check, provider/screen pre-sync separately, storage key, photo cleanup, timeout, busy state and SQL deletion-time clamp. Production files were restored after each mutation before full validation. Commands used `EXPO_NO_TELEMETRY=1`, `EXPO_NO_DOTENV=1`, `npm_config_cache=/tmp/insight-npm`; Expo's shell-only `__UNSAFE_EXPO_HOME_DIRECTORY=/tmp/insight-expo` kept its cache in the writable temporary directory. No Git, build, simulator, Docker, hosted/production Supabase or repo-root `supabase/` operations were performed.

The local wipe is a plain SQLite `DELETE`; consider `PRAGMA secure_delete`. Photo files must also be deleted from disk once photo storage exists. The `ON DELETE CASCADE` behavior must be verified with a local `supabase start` + `auth.admin.deleteUser` before the SQL is applied anywhere. That verification is not performed here. The SQL retains its **DRAFT / NOT APPLIED** header and is exercised only with synthetic in-process PGlite. Quinn items 1 and 3 are now implemented as described above; the prior items 2/4/5/6 remain in place.

### Durable sign-out recovery (item 3)

The marker is a single small SecureStore item, `insight.sign-out-pending.v1`, containing only the departing owner id, start timestamp and recovery phase. SecureStore was chosen because it survives a process crash and the entire SQLite owner wipe, while remaining separate from the chunked session keys erased by `clearLocalSession`. It uses the existing device-only, when-unlocked accessibility policy. No schema migration, health values or session credentials are added to the marker.

The sequence is: durably write `pending` → wipe all owner data/metadata in the existing single SQLite transaction → checkpoint `wiped` → clear the session/user/verifier SecureStore keys → checkpoint `session-cleared` → remove the marker. Phase checkpoints are written only after the corresponding operation succeeds. If the process dies before a checkpoint, recovery repeats that operation idempotently; if the last checkpoint is `session-cleared`, boot only removes the marker. The marker is never included in the SQLite wipe or session-key cleanup. A failed storage operation retains the marker and blocks auth/sync; the app reports a local recovery error rather than claiming completion.

Boot opens SQLite, reads/resumes the journal, and completes recovery before calling `getAuthClient`, subscribing to auth events, restoring a session, or constructing a sync engine. This ordering matters because creating a Supabase client can itself start session restoration/refresh. Session cleanup can now prepare the existing SecureStore adapter without creating a client. Account recovery fails closed if configuration cannot identify that session storage; a config-free demo has no auth session to erase. Concurrent boot consumers (including StrictMode) share the same in-flight recovery. During normal departure the sync engine is closed, auto-refresh is stopped, old-owner auth events are ignored, and further sign-in/demo entry and sync remain gated until journal removal. The two existing newer-session checks still preserve a replacement account's credentials and access; completion treats an old session already replaced by a newer auth event as cleared for the departing owner.

Regression tests cover real SQLite close/reopen at all three phases, session-clear and marker-removal failures, failed marker writes, owner isolation, repeated/concurrent recovery, normal account/demo departure, boot gating and production client creation order. SecureStore adapter tests cover the independent marker item and fail-closed parsing. The existing tests' behavior expectations remain intact; provider mocks now include the journal boundary and the auth-client cleanup test uses an isolated module to exercise cleanup before any client exists.

Final items 1/3 validation (Oct 17, 2026): `npx tsc --noEmit` and `npx expo lint` pass; `npx expo-doctor` passes 20/20; `node --test plugins/*.test.js` passes 9/9; `npm test -- --ci` passes **417/417 tests in 21 suites**. All 391 previous tests remain green, including items 2/4/5/6. Added 26 cases: 9 in `tests/server/sign-out.test.ts`, 5 in `tests/sign-out-storage.test.ts`, 10 in `tests/auth-provider.test.tsx`, and 2 in `tests/auth-client.test.ts`. Existing test behavior expectations are unchanged. Dependency health reports up to date. The same telemetry/dotenv/cache settings and prohibited-operation boundaries listed above were retained; no Git or applied SQL operations occurred.

## Recheck minors (Quinn #70, e6afd46)

Scoped follow-up, Oct 17, 2026, including Will's approved corrupt-marker escape. Server SQL remains **DRAFT / NOT APPLIED** except in synthetic, in-process PGlite tests. All earlier fixes and the accepted lost-ack limitation remain in place.

| Item | Files and change | Added regression cases |
| --- | --- | --- |
| 1 — independent deletion bound | `server/row-sync/0001_row_sync.sql` bounds `deleted_at > write_now + 300000` to the already-clamped `updated_at`, independently of the existing updated-time clamp. | 3 in `tests/server/decisions.test.ts`: direct insert, sync RPC and update, each with normal updated time and deletion time `8e12`, plus preservation at the inclusive five-minute boundary. |
| 2 — surviving mutants | `tests/server/sign-out.test.ts`, `tests/auth-client.test.ts`, `tests/auth-ui.test.tsx`; no unrelated production changes. | 4: late pull after engine close/wipe cannot call `applyPage` or repopulate real SQLite; config-free demo boot removes its marker while retaining unrelated stored session bytes; strict account boot without storage configuration retains its marker and session; two calls to the same destructive alert callback while sign-out is pending invoke sign-out once. The provider engine-construction gate and the late-pull guard were each mutation-checked, alongside strict storage recovery and the destructive-confirmation ref. All four guard removals were observed failing, with source bytes restored after each experiment. |
| 3 — corrupt/unreadable marker escape | `src/auth/sign-out.ts` distinguishes marker-read failure from valid-marker recovery failure and exposes the ordered escape. `src/data/repository.ts` / `database.ts` provide the all-owner transactional wipe. `src/auth/provider.tsx`, `screens.tsx`, `src/app/_layout.tsx` and `src/i18n/en.ts` wire the locked-screen destructive action, confirmation, busy guard, fixed error and retry. | 7: actual corrupt JSON and a throwing SecureStore read both show the confirmed escape; wipe/session-clear/marker-removal failures retain the marker, block restoration/sync, show an error and allow retry after remount; real SQLite tests cover every owner/table/cache/sync-metadata namespace, idempotent repeats, and rollback of the whole wipe on an injected late-table failure. Existing valid-marker recovery tests also assert the escape is absent. |
| 4 — failed-departure retry | `src/auth/provider.tsx` releases the attempt guard on failure while keeping routes, auth entry, refresh and sync locked. It retains the original departure repository/session context so a retry still works after auth emits SIGNED_OUT. The locked screen offers Finish signing out. `src/i18n/en.ts` accurately says sign-out did not finish, some data may already have been erased, and retry can finish it. | 5: retry succeeds without restart after marker-write, wipe, session-clear and marker-removal failures; error copy is asserted in `tests/auth-ui.test.tsx`. Existing newer-account protection tests remain intact. |
| 5 — single pre-sync cap | Included: `src/auth/provider.tsx` exposes one prepared bounded sync attempt; `src/auth/screens.tsx` awaits it, and provider departure consumes that same promise for the same engine. Standalone provider sign-out still performs its own bounded pre-sync. A new screen attempt replaces a cancelled attempt; a different engine cannot reuse it. | 1 integration test in `tests/auth-provider.test.tsx` uses fake timers and a stalled engine: warning appears at 10 seconds, confirmation wipes without another wait, and sync was called once. |
| 6 — open / unchanged | Local Supabase cascade verification (`supabase start` + `auth.admin.deleteUser`), `PRAGMA secure_delete`, and physical photo-file deletion remain open. | No service was started, no connection was made, and no photo-file deletion or secure-delete claim is added. |

The corrupt-marker escape deliberately has no intermediate marker replacement: **one transaction wipes all owners → strict SecureStore session clear → marker removal**. Wipe failure leaves the session intact; session-clear or marker-removal failure may follow committed erasure but still leaves the app locked. Retaining the original corrupt/unreadable marker makes an interrupted attempt repeat the same idempotent sequence at the next boot. No auth client is created, session restored, or sync started before completion. A missing session-storage configuration fails closed rather than claiming credentials were cleared. Valid markers retain their existing owner-scoped checkpoint recovery; they never offer the all-owner escape. Demo recovery without auth configuration removes its own marker and keeps unrelated session storage; account recovery requires identifiable session storage and retains its marker when that requirement fails.

Validation uses Node 24.21.0 from `native/`, with `EXPO_NO_TELEMETRY=1`, `EXPO_NO_DOTENV=1`, `npm_config_cache=/tmp/insight-npm`, and `__UNSAFE_EXPO_HOME_DIRECTORY=/tmp/insight-expo`. The four mutation experiments only removed the provider departure engine gate, late-pull guard, strict configured-storage guard, or destructive-confirmation ref guard, one at a time; each targeted regression failed, and every original file was restored before subsequent edits/checks. Red-before-green was also observed for the independent SQL bound, escape/retry paths, accurate failure copy, shared pre-sync cap, and retry after SIGNED_OUT.

Final validation: `npx tsc --noEmit` PASS; `npx expo lint` PASS without warnings; `npx expo-doctor` PASS 20/20; `node --test plugins/*.test.js` PASS 9/9; `npm test -- --ci` PASS **437/437 tests in 21 suites**, including all 417 previous tests and 20 added cases; `npx expo install --check` reports dependencies up to date. Machine-readable Jest results: `/tmp/insight-recheck-results.json`. The plugin runner reports 9 tests and 0 named suites. No Git operations, prebuild, simulator/emulator, Docker, Supabase connections of any kind, root `supabase/` changes, `.github/` changes, package/lockfile edits, secrets, paid services, or PII logging were used.

### 52134a5 — items 1–5 (2026-10-17)

This subsection supersedes the immediate unreadable-marker escape described in the historical e6afd46 notes above. Scope remains Quinn #70 recheck minors only. Server SQL remains **DRAFT / NOT APPLIED**. Item 6 above is open and unchanged.

| Item | Files and change | Regression evidence |
| --- | --- | --- |
| 1 — transient marker reads and loss warning | `src/auth/sign-out-storage.ts` separates native read failures from present-but-invalid markers with typed safe errors in `src/auth/sign-out.ts`. `src/auth/provider.tsx` counts **3 consecutive read failures per mounted boot recovery** before offering escape; earlier failures offer only Try again, which rereads the marker. Try again remains available after the threshold. A successful read returns to normal recovery; a valid marker whose wipe fails cannot retain escape eligibility. `src/auth/screens.tsx`, `src/data/database.ts`, and `src/i18n/en.ts` add the all-owner loss warning, counting every outbox row including flagged rows, with a number-free fallback when counting fails. No auth client/session restoration or sync runs while boot recovery is locked. | 6 new cases: 5 in `tests/auth-provider.test.tsx` cover transient failure then valid-marker recovery, threshold then missing/valid markers (including failed owner wipe), numeric warning and count failure; 1 in `tests/sign-out-storage.test.ts` distinguishes actual SecureStore read errors from parse errors. Existing corrupt-marker escape remains immediate; existing unreadable-marker escape now explicitly retries to the threshold. Existing ordered escape/failure tests remain green. |
| 2 — strict boot recovery | `src/auth/provider.tsx` calls `clearLocalSession(true)` for account markers and `clearLocalSession()` with **no argument** for demo markers. | 2 new parameterized cases in `tests/auth-provider.test.tsx` assert exact argument lists. Replacing strict boot cleanup with no-argument cleanup was observed failing the account case; source was restored before final checks. The demo case caught the previous explicit `false` argument. |
| 3 — production wiring | `tests/recovery-layout.test.tsx` renders the actual `src/app/_layout.tsx` root with locked auth state and finds the real recovery action. `tests/server/database-wiring.test.ts` calls the actual `openLocalDatabase`, with the native SQLite opening boundary adapted to in-memory `node:sqlite`; `tests/server/sqlite.ts` shares that adapter. | 3 new cases: locked layout mount; successful production-wired all-owner wipe (including repeat); and injected late-table deletion failure rolling back every table/namespace. SQLite assertions include all 19 synced tables, outbox, cursors/state, conflicts and Oura cache for both accounts, demo and guest. Count assertions include flagged rows across both accounts and zero after erasure. |
| 4 — failed-departure gates | `tests/auth-provider.test.tsx` strengthens the existing wipe/marker/session/removal failure cases; production gate behavior is retained. | All 4 existing cases now assert blocked sign-in without a client call, ignored different-owner and signed-out auth events, retained locked state, no sync, and a successful retried sign-out releasing the lock. No new cases counted here. |
| 5 — failure copy | `src/auth/sign-out.ts` exposes a fixed typed departure failure; `src/auth/provider.tsx` emits it once departure has begun. `src/auth/screens.tsx` and `src/i18n/en.ts` retain the existing possible-erasure copy for that path and use exactly “Sign-out did not finish. Nothing was erased. Try again.” for pre-wipe failures. | 3 new cases in `tests/auth-ui.test.tsx` cover unsynced guard, count failure and pre-sync failure. The existing failed-departure case now explicitly exercises the typed post-start failure and asserts the retained copy. |

Final validation on Node 24.21.0, from `native/`: `npx tsc --noEmit` PASS; `npx expo lint` PASS without warnings; `npx expo-doctor` PASS 20/20; `node --test plugins/*.test.js` PASS **9 tests / 0 named suites**; `npm test -- --ci` PASS **451 tests / 23 suites** (all 437 previous cases plus 14 new cases). Jest results: `/tmp/insight-52134a5-results.json`. Red-before-green was observed for transient-read handling, the valid-marker recovery failure edge, exact demo boot arguments, and pre-wipe copy. The strict-boot mutant failed as intended.

Checks retained `EXPO_NO_TELEMETRY=1`, `EXPO_NO_DOTENV=1`, `npm_config_cache=/tmp/insight-npm`, and `__UNSAFE_EXPO_HOME_DIRECTORY=/tmp/insight-expo`. No Git operations, prebuild, simulator, emulator, Docker, Supabase connections of any kind, root `supabase/`, `.github/`, package/lockfile edits, secrets, paid services, or PII logging were used. Earlier fixes and the accepted limitations remain intact; item 6 is unchanged.

### Decision validation (2026-10-17)

Final checks ran from `native/` with EXPO_NO_TELEMETRY=1, EXPO_NO_DOTENV=1, npm_config_cache=/tmp/insight-npm and Expo home `/tmp/insight-expo`.

| Required command | D1–D4 result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npx expo lint` | PASS, no warnings |
| `npx expo-doctor` | PASS, 20/20 |
| `node --test plugins/*.test.js` | PASS, 9/9 |
| `npm test -- --ci` | PASS, 375/375 tests in 19 suites: 110 app + 265 data/server, including PGlite and property histories |
| `npx expo install --check` | PASS at kickoff; dependencies up to date |

The final full-suite confirmation also wrote machine-readable Jest results to `/tmp/insight-final-results.json`: success=true, 0 failed tests/suites. The suite grew from 339 to 375 tests. No Git operations, native generation/builds, simulator/emulator, Docker, hosted/production Supabase, root `supabase/` edits, secret inspection or paid services were used. The SQL remains unapplied outside synthetic PGlite. Live PostgREST and device/build validation remain outside this task's authorization.

Files edited for these decisions (paths relative to `native/`): `server/row-sync/0001_row_sync.sql`, `server/row-sync/README.md`; `src/data/rows.ts`, `src/data/migrations.ts`, `src/data/repository.ts`, `src/data/sync/engine.ts`, `src/data/sync/supabase.ts`; `src/auth/client.ts`, `src/auth/provider.tsx`, `src/auth/screens.tsx`, `src/i18n/en.ts`; `tests/server/decisions.test.ts` (new), `tests/server/pglite.ts`, `tests/server/repository.test.ts`, `tests/server/transport.test.ts`, `tests/server/conflicts.test.ts`, `tests/auth-client.test.ts`, `tests/auth-provider.test.tsx`, `tests/auth-ui.test.tsx`; and this document.

### Historical review validation (2026-10-17, before D1–D4)

All commands ran from `native/` with EXPO_NO_TELEMETRY=1, EXPO_NO_DOTENV=1, npm_config_cache=/tmp/insight-npm and Expo home redirected to `/tmp/insight-expo` where applicable.

| Required command | Final result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npx expo lint` | PASS, no warnings |
| `npx expo-doctor` | PASS, 20/20 checks |
| `npx expo install --check` | PASS at kickoff and final; dependencies up to date |
| `node --test plugins/*.test.js` | PASS, 7/7 tests |
| `npm test -- --ci` | PASS, 200/200 tests across 18/18 suites, including 25 fast-check histories; exited cleanly |

The first full run passed 197 tests across 17 suites; the final run includes the three additional integration tests. Jest still emits Node's VM Modules experimental warning; no test failures, forced worker teardown or lint warnings were reported in the final checks. Prohibited build/service/live REST validation was not run.

### Review file manifest

21 files changed in this review pass (paths relative to `native/`):

- Server: `server/row-sync/0001_row_sync.sql`.
- Data: `src/data/migrations.ts`, `src/data/schema.ts`, `src/data/repository.ts`, `src/data/sync/conflict.ts` (new), `src/data/sync/engine.ts`, `src/data/sync/supabase.ts`.
- Account display: `src/auth/provider.tsx`, `src/auth/screens.tsx`, `src/i18n/en.ts`.
- Tests: `tests/server/pglite.ts`, `tests/server/rls.test.ts`, `tests/server/repository.test.ts`, `tests/server/triggers.test.ts`, `tests/server/transport.test.ts`, `tests/server/conflicts.test.ts` (new), `tests/auth-client.test.ts` (new), `tests/auth-provider.test.tsx`, `tests/auth-ui.test.tsx`.
- Docs: `docs/p2-sync.md`, `README.md`.

Quinn should re-review the exact effective grants under Supabase defaults, trigger execution after EXECUTE revocation, P2001 provenance detection under invoker RLS, bounded batch isolation, and durable flagged-row exclusion/counting. Validate the grant/RPC contract in a separately approved local PostgREST environment before any application. No cross-family PASS or Will approval is claimed.

## Not done / Quinn review

No blob-to-row importer (M2), DOB/units onboarding implementation, feature logging UI, photo upload, range purge, tombstone GC, health integration, deployed schema, live REST smoke test, simulator/emulator build or screenshots. No prebuild/EAS/Docker/hosted Supabase/production operations or Git mutations were performed. Native-host behavior and entitlement validation remain with the coordinator under the original build boundaries.

Quinn should review per-owner sequence serialization/commit ordering, the client-clock LWW tradeoff, immutable source provenance, explicit sign-out erasure, settings-row selection, child survival with deleted parents, and the lack of tombstone GC. Validate the draft against the future approved local PostgREST environment before applying anywhere. This agent's independent code review confirmed the future-clock lost-edit case and suggested the delayed-sign-out race test; both regression tests now pass. That review is not Quinn's cross-family PASS.

Documentation checked: [Expo SDK 58 SQLite](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/), [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [Supabase React Native auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Supabase changelog](https://supabase.com/changelog), and the installed Drizzle driver/migrator implementations (0.45.4). Explicit grants account for current Data API exposure requirements.

## New direct dependencies

| Package | Resolved version | Use |
| --- | --- | --- |
| @supabase/supabase-js | 2.118.0 | Exact v2 pin; auth and row transport |
| drizzle-orm | 0.45.4 | Local SQL driver and migrations |
| expo-sqlite | 58.0.13 | SDK-matched WAL database |
| expo-secure-store | 58.0.2 | SDK-matched session storage |
| expo-crypto | 58.0.7 | SDK-matched device/row UUIDs |
| expo-network | 58.0.3 | SDK-matched reconnect trigger |
| react-native-url-polyfill | 4.0.0 | React Native WHATWG URL support |
| @electric-sql/pglite | 0.5.10 | Dev: in-process Postgres/WASM |
| fast-check | 4.10.2 | Dev: randomized convergence properties |
| @types/node | 24.19.2 | Dev: Node 24 SQLite/test types |

App additions used `npx expo install`; pure JS test tooling used `npm i -D`. Existing runtime dependencies were not upgraded. The install audit reports 56 dependency findings (26 moderate, 30 high); no broad automatic upgrades were attempted in this scoped change.

## Original P2c file manifest

Paths below are relative to `native/`. 15 modified and 43 added (58 total); no files removed. No Git operation is needed to reproduce this manifest.

### Modified

- `.gitignore`
- `app.json`
- `docs/p2-foundation.md`
- `jest.config.js`
- `package-lock.json`
- `package.json`
- `src/app/_layout.tsx`
- `src/app/settings/_layout.tsx`
- `src/app/settings/index.tsx`
- `src/components/button.tsx`
- `src/design/theme-provider.tsx`
- `src/features/settings/appearance.tsx`
- `src/i18n/en.ts`
- `tests/routes.test.tsx`
- `tsconfig.json`

### Added

- `.env.example`
- `docs/p2-sync-plan.md`
- `docs/p2-sync.md`
- `fixtures/demo.ts`
- `fixtures/sync.ts`
- `jest.app.config.js`
- `jest.server.config.js`
- `server/row-sync/0001_row_sync.sql`
- `server/row-sync/README.md`
- `src/app/auth/_layout.tsx`
- `src/app/auth/create-account.tsx`
- `src/app/auth/index.tsx`
- `src/app/auth/sign-in.tsx`
- `src/app/onboarding.tsx`
- `src/app/settings/account.tsx`
- `src/auth/client.ts`
- `src/auth/config.ts`
- `src/auth/provider.tsx`
- `src/auth/screens.tsx`
- `src/auth/storage.ts`
- `src/data/catalog.ts`
- `src/data/database.ts`
- `src/data/migrations.ts`
- `src/data/repository.ts`
- `src/data/rows.ts`
- `src/data/schema.ts`
- `src/data/sync/engine.ts`
- `src/data/sync/supabase.ts`
- `tests/appearance-persistence.test.tsx`
- `tests/auth-gate.test.tsx`
- `tests/auth-provider.test.tsx`
- `tests/auth-storage.test.ts`
- `tests/auth-ui.test.tsx`
- `tests/server/expo-sqlite-stub.js`
- `tests/server/pglite.ts`
- `tests/server/repository.test.ts`
- `tests/server/rls.test.ts`
- `tests/server/rows.test.ts`
- `tests/server/setup.ts`
- `tests/server/sqlite.ts`
- `tests/server/sync.test.ts`
- `tests/server/transport.test.ts`
- `tests/server/triggers.test.ts`
