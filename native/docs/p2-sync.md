# P2c — M1 foundation, part 2

Implements the supplied plan quotes §7.1/§7.3/§12.1 and M1 (§15.2), Q2/Q11/Q12/Q90/Q93/Q98/Q103/Q124. Q14/Q15 (health-source exclusion), Q47 (no check-ins), and §9 (SI storage with original weight entry) remain binding. The full plan is outside this repository; no Will decision was reinterpreted. This is HIGH-risk draft code for Quinn review and Will's go. Nothing has been applied outside in-process tests.

## Local data

One `insight.db` file uses WAL, foreign-key enforcement and the Drizzle Expo SQLite driver. A bundled, versioned Drizzle migration runs before any private route is admitted. SQL is embedded in a TypeScript string so Metro does not need a SQL import transform. `schema.ts` provides Drizzle table definitions; `catalog.ts` names the physical payload columns and doubles as the wire allowlist. Tests check the catalog against actual SQLite columns and execute the same Drizzle driver/migrator/repository using a thin `node:sqlite` native-method adapter, rather than a separate repository implementation.

All 19 synced tables contain `owner_id`, device-generated UUID-v4 `id`, integer-millisecond `updated_at`, nullable `deleted_at`, and UUID-v4 `device_id`. The tables are profile, weigh_ins, measurements, routines, routine_exercises, sessions, entries, sets, cardio_sessions, food_entries, saved_foods, food_targets, meals, goals, plan_days, machine_notes, home_layout, settings, and photos. Payloads are explicit scalar columns, not a user-data blob. Names are mapped from PWA state concepts (`mod`/`at` become `updated_at`; `exercise`, `origin`, `finishedAt`, `order`, `w`/`r`, and per-side set fields become named columns). M2 will add complete product behavior and further migrations.

Weights use `weight_kg` plus `entered_value`/`entered_unit`, including per-side unilateral set entries. Heights/distances/circumferences use meters; durations use milliseconds; food energy uses kJ and macros/amounts use grams. Photo rows are metadata only (file name, capture time and dimensions), never image bytes or credentials. Nullable fields deliberately permit partial foundation rows and tombstones. No check-in table or feature exists.

`oura_days` is an owner-scoped local cache with no transport path. `weigh_ins.source` is immutable per row: `app` rows can enter the outbox; `healthkit`/`health_connect` rows stay local, including their tombstones. Unknown sources fail closed. The transport and server independently reject non-app sources. Future Health integrations must use these local-only paths; they are not implemented here.

`sync_outbox` stores owner/table/id/revision, referencing the current row in the same database. A mutation commits the row, local logical clock and outbox revision together before emitting a change event. A process can die after commit and retry safely after restart. An acknowledgment removes only the revision that was sent, preserving edits made during an upload. A pull commits its rows, maximum observed clock and cursor together. Storage/database failures become fixed safe errors without SQL parameters, health values or backend details.

Appearance now hydrates and writes `settings` through the repository. It saves the override/accent immediately and subscribes to subsequent pulls. Multiple device-created settings rows are resolved for display by the newest LWW tuple; editing reuses the winning row. Defaults remain System/Citrus. Save failures show a fixed inline error. Guest/demo preferences live in their own local namespaces.

## Server, cursors and conflicts

The draft SQL and future apply/rollback notes live in `native/server/row-sync/`; nothing was added under repo-root `supabase/`. Each server table mirrors the synced payload and adds an owner FK/default and server-assigned bigint sequence. Explicit grants, owner RLS with USING and WITH CHECK, an invoker-rights allowlisted RPC and a stale-write trigger protect both direct operations and RPC use. Tests apply the draft SQL unmodified to PGlite and run as the authenticated role with a synthetic JWT subject. Direct physical DELETE is rejected in favor of tombstones.

Incremental pulls have one durable cursor per owner/table. They filter and sort `server_seq`, and cast it to text before JSON serialization to preserve values above 2^53. Pages are applied atomically before advancing the cursor. A transaction-level per-owner advisory lock is acquired before sequence allocation and held until commit, including direct insert/update paths. This prevents out-of-order commits from falling behind an already consumed cursor. Other owners can write independently. Sequence gaps do not represent missing data.

Client and server use the same LWW rule: larger client `updated_at` wins; equal timestamps use lexicographically larger lowercase UUID `device_id` (server `COLLATE "C"`). Equal tuples are immutable retries. Local mutation stamps are `max(Date.now(), observed_clock + 1)`; pulls advance that clock, so same-millisecond edits, backward clocks and edits to future-dated remote rows do not disappear. This is conflict ordering, not a claim that device time is accurate. A bad forward clock can dominate other devices until they observe it; Quinn should review that specified LWW tradeoff.

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

Repositories have immutable owner namespaces. The same file retains A's rows/outbox while B or guest/demo is active; no row is claimed, copied or uploaded under another owner. Sign-out retains pending changes for the same account to resume later. The provider hides the previous repository immediately on an owner change, closes the previous engine, and checks the current auth owner before each transport operation. Server RLS independently rejects mismatched rows. A failed Supabase sign-out displays a generic error and retains the current session rather than claiming credentials were removed. Successful sign-out uses local scope and gates private routes.

Welcome offers Get started, I have an account, and Look around first. Missing config disables auth and shows “Sign-in isn't set up in this build”; only demo works. Create account validates email, an 8-character minimum and matching confirmation, and handles email confirmation. Sign-in permits existing shorter passwords. DOB/units onboarding is an explicit M2 stub. Demo uses synthetic fixture rows in a separate namespace, creates no sync engine, and is not persisted as a signed-in session. Private tabs, Settings, workout/food deep links and onboarding use Expo Router protected routes; sign-in or demo is required.

Supabase v2 is pinned exactly. The React Native URL polyfill follows the official auth quickstart. Sessions use a serialized, chunked SecureStore adapter: at most 400 Unicode codepoints per chunk (<=1600 UTF-8 bytes), a bounded chunk count and a ready marker written only after all chunks. Replacement invalidates the ready marker first. Interrupted writes restore a complete old/new session or no session, never mixed chunks. Delete clears the marker, chunks and count. iOS writes use WHEN_UNLOCKED_THIS_DEVICE_ONLY. AppState starts/stops auto-refresh; subscriptions are removed on cleanup. No password/token is placed in an error string.

## Threat notes and boundaries

- The production project reference is rejected before client creation, even if the key is missing. This launch guard stays until a separately Will-approved PR removes it. This draft additionally allows only loopback URLs, preventing any hosted Supabase connection. The key must have the publishable prefix; service/secret/legacy JWT keys are refused. Real configuration was neither read nor supplied.
- Owner RLS covers every server row table. WITH CHECK is tested independently of the owner trigger. The RPC is SECURITY INVOKER, fixed search_path, statically dispatched, non-anonymous and atomic per batch. Owner identities and sequence values cannot be overridden through payload fields.
- There is no AI, Sentry, PostHog, Health client, hosted service or notification integration in this change. Transport tests fail closed on unknown fields/health sources/owner mismatch. App-entered health-related values may sync to the owner's row tables; none are sent to AI or analytics. Future telemetry must add the required payload guard/tests before integration.
- Local namespaces are logical isolation in one SQLite file, not file encryption or a device-security boundary. SecureStore protects session material separately. Multi-account retention and explicit future deletion/retention flows need Quinn/Will review.
- UI never displays raw auth/SQL/backend errors; the transport also sanitizes rejected network promises. Tests and fixtures contain synthetic values only. No secrets, real user rows, Health records or `.env` contents were inspected.

## Local validation

Use Node 24+ (tested on 24.21.0). From `native/`, `npm test -- --ci` runs the Expo and data-server Jest projects, including PGlite and fast-check. No Docker, Supabase service or network is needed for those tests. Jest enables VM modules for PGlite, disables Watchman, and runs one worker to bound WASM memory. Parallel workers intermittently exceeded Jest's teardown grace period; the standard serial run exits cleanly. The server setup gives cold WASM initialization 60 seconds; regular tests have a 30-second limit. fast-check runs 25 random histories of 1–30 operations across 2–3 devices, including create/edit/delete, random sync order, timestamp ties, duplicated pushes and retries, then checks all devices against server state. Separate tests cover restart, account isolation, paging, high cursors, tombstones, failed-flight follow-ups, late request cleanup, storage faults and auth/component behavior.

All CLI checks use EXPO_NO_TELEMETRY=1, EXPO_NO_DOTENV=1 and npm_config_cache=/tmp/insight-npm. Expo cache uses __UNSAFE_EXPO_HOME_DIRECTORY=/tmp/insight-expo because the default home cache is outside the writable roots. No real environment values are required. `.env.example` contains empty placeholders only.

Final checks (2026-10-17):

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

## Not done / Quinn review

No blob-to-row importer (M2), DOB/units onboarding implementation, feature logging UI, photo upload, range purge, tombstone GC, health integration, deployed schema, live REST smoke test, simulator/emulator build or screenshots. No prebuild/EAS/Docker/hosted Supabase/production operations or Git mutations were performed. Native-host behavior and entitlement validation remain with the coordinator under the original build boundaries.

Quinn should review per-owner sequence serialization/commit ordering, the client-clock LWW tradeoff, immutable source provenance, retained per-account data, settings-row selection, child survival with deleted parents, and the lack of tombstone GC. Validate the draft against the future approved local PostgREST environment before applying anywhere. This agent's independent code review confirmed the future-clock lost-edit case and suggested the delayed-sign-out race test; both regression tests now pass. That review is not Quinn's cross-family PASS.

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

## Complete file manifest

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
