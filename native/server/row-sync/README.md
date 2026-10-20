<!-- DRAFT - NOT APPLIED. Applying needs Quinn PASS + Will's go (HIGH). -->
# Row-sync server draft

`0001_row_sync.sql` is review material for M1/P2c (§7.1/§7.3/§12.1; Q2/Q124). It has only been executed in an in-process PGlite database with synthetic users. It is deliberately outside the repository-root `supabase/` deployment path. No server, project, hosted branch or Docker container was created.

The 0001 baseline transaction creates 19 explicit row tables (23 after 0002), a global sequence, owner policies/indexes, a write trigger and the invoker-rights `sync_push(rows jsonb)` RPC. The RPC accepts up to 100 row envelopes, dispatches only to statically named tables, rejects unknown fields and spoofed owners, and performs typed upserts. It returns the actual stored row envelope for each input, in input order, so clients can reconcile server-clamped or stale writes even when no new sequence is assigned. RLS independently enforces ownership for SELECT/INSERT/UPDATE/DELETE. Anonymous callers have neither table grants nor RPC execution rights. Direct physical deletes are rejected; clients write minimal tombstones. Only nested account-deletion cascades with an absent auth parent may physically remove rows. All owner FKs use ON DELETE CASCADE.

Every accepted write assigns a fresh `server_seq`. A transaction-scoped advisory lock per owner serializes writes across tables before sequence allocation. This prevents a delayed commit from appearing behind a cursor already consumed by that owner. Retried/stale writes may consume unused sequence values; gaps are harmless. The sequence is not a device timestamp. Pulls order/filter the physical bigint and serialize it as text. LWW compares `(updated_at, device_id COLLATE "C")`; equal normalized versions are immutable retries. Before comparison, updated_at beyond transaction now()+5min is clamped to now() to avoid granting a bad clock priority over later legitimate edits. Tombstones wipe all payload values except immutable weigh-in source; existing value columns already permit NULL. See D1–D4 in `docs/p2-sync.md`. Child rows have no cascading parent foreign keys. `weigh_ins.source` must be `app`; Oura has no server table.

## Future application procedure — requires separate approval

1. Obtain Quinn PASS and Will's explicit HIGH-risk go for the exact SQL revision. Keep the app's production-reference and loopback guards until a separately approved launch PR.
2. Have the coordinator select a disposable, approved local Postgres/Supabase environment and supply configuration privately. Confirm `auth.users`, `auth.uid()` and the API roles already exist. Check that none of these table/function names already exist; this is not an upgrade script or a legacy blob importer.
3. Take a backup/snapshot and run the SQL as one transaction in that approved environment. Verify explicit grants, all 23 owner policies after both scripts, trigger/RPC behavior, and `(owner_id, server_seq)` indexes using synthetic accounts A/B. Validate the same PostgREST select casts and RPC contract used by the client.
4. Run the PGlite tests and a later approved local REST smoke test before allowing any real accounts. This task does not authorize those later application steps.

## Future rollback procedure

An error during initial application rolls back the enclosing transaction. If the draft has already been applied in an approved disposable environment, stop clients first and preserve a backup before rollback. Remove `sync_push(jsonb)` and `sync_purge_range(uuid,date,date,bigint,text)`, then all 23 row tables named in `src/data/catalog.ts`, then `row_sync_guard()` and `row_sync_seq`, in one reviewed transaction. Dropping the tables destroys their rows; never do this to an environment containing data that must be retained. Leave `auth`, its users/roles and unrelated application tables intact. No rollback was run in this task.

## Tests

From `native/`, `npm test -- --ci` runs Expo component tests plus the `data-server` Node project. PGlite stubs only `auth.users`, `auth.uid()` and API roles, then applies this SQL **unmodified**. Tests use `SET LOCAL ROLE authenticated` and the synthetic JWT subject for RPC and pulls. A dedicated test temporarily disables each guard in the test database to prove WITH CHECK works independently of the guard, then restores it. No network is needed for the test suites. Node 24+ is required for the SQLite test adapter; Jest enables VM modules for PGlite's WASM loader.

## M1-03 / O-7: one v1 schema batch (DRAFT, NOT APPLIED)

`0002_v1_columns.sql` follows 0001 and contains every M1-03 synced-schema change,
F1/F2/F4/F5 from Quinn's cascade check, and the replacement `sync_push`/guard.
Both files remain review-only. The only executions here are isolated in-process
PGlite tests with synthetic fixtures; no Supabase environment was contacted.
Edge F1/F3 remains work described in `../../docs/m1-03-edge-followups.md`.

There are now **23 reserved public table names**. Future `supabase/` migrations
must not create/reuse them, add `user_id` to them, or install physical-delete
paths: `profile`, `weigh_ins`, `measurements`, `routines`, `routine_exercises`,
`sessions`, `entries`, `sets`, `cardio_sessions`, `food_entries`, `saved_foods`,
`food_targets`, `meals`, `goals`, `plan_days`, `machine_notes`, `home_layout`,
`settings`, `photos`, `custom_exercises`, `plans`, `pauses`, `purges`.
Reserve `row_sync_seq`, `row_sync_guard`, `sync_push`, `sync_purge_range`, and
these tables' guard triggers/owner policies/indexes as well.

All additions are nullable; there is no old-row backfill or UI activation.
`custom_exercises` holds name/main_muscle/equipment and optional helpers.
`plans` holds mode (`rotation`/`fixed`) and days_per_week (1–7); null mode is
interpreted as rotation by the future UI, without writing defaults into old rows.
`pauses` uses start_day/end_day (inclusive); no reason column exists.
`bar_weight` uses the exercise's unit_override, falling back to account weight
unit; `step` uses that same unit. Food nutrients apply to food_entries and
saved_foods, not food_targets (there are no fiber/sugar/sodium targets).
`plate_set` is JSON text containing an array of plate weights in the account's
weight unit; `helpers` is JSON text containing an array of muscle identifiers;
`rest_per_exercise` is JSON text containing an exercise-name → seconds map.
These are explicit named text columns in the existing scalar wire protocol,
not arbitrary row payloads. Their feature-specific editors/validation remain
M2 work. `rest_style` and `tag` store feature-defined text identifiers.

Purge ranges compare canonical day strings for dated logs. Photos use captured_at
(milliseconds since epoch), converted to a calendar day in the marker timezone;
the RPC sweep, trigger backstop, and client use the same inclusive day range.
The RPC validates the supplied timezone and caps cutoff at now, stamps at
now+5min and uses the report's purge device ID. Children are keyed through
sessions, swept first, and late parent/child arrivals are checked too. Markers
survive device restarts and are pulled before uploads. A stale row is stored as
a tombstone and its payload is erased, including queued offline payloads.
The guard uses the marker's version for a rejected insert, allowing later
children to identify a purged parent after its day/reference fields are wiped.
This extends the report's suggested deleted_at-only backstop for child safety.

Cutoff is still the incoming row's updated_at, exactly as in PWA semantics.
A previously purged row loses a same-transaction +5-minute clock tie to the
purge stamp. A never-synced row whose timestamp is *after* cutoff is an edit
kept by design, even if the clock caused that timestamp. The existing clamp to
now for more than +5 minutes remains unchanged. The purge device constant is
the report's `ffffffff-ffff-4fff-bfff-ffffffffffff`; it wins ties against normal
random device IDs, but is not a new special priority in the LWW comparator.

### Apply tracking (F6)

These files are outside `supabase/migrations` and are **not tracked by
supabase_migrations.schema_migrations**. `supabase db reset` does not replay
them and `db diff` does not provide their apply history. M1-04 must arrange the
single reviewed apply window for 0001 then 0002, with a reviewed transaction
wrapper/rollback script (strip file-level BEGIN/COMMIT when wrapping both).
Do not treat the old 0001-only application/rollback outline above as sufficient
for the combined batch. Rollback must also account for the new RPC/tables and
replacement functions; never delete data to roll back a live environment.

Maintain a separate coordinator-owned apply ledger (no secrets or user rows):

| Applied at (UTC) | Environment | Exact source commit SHA | 0001 SHA-256 | 0002 SHA-256 | Approvals / outcome |
| --- | --- | --- | --- | --- | --- |
| Not applied | None | Wrapper must record the exact committed revision | Compute at apply | Compute at apply | Pending Quinn PASS + Will's HIGH go |

Before applying, record the full 40-character `git rev-parse HEAD` and SHA-256
of each exact file, plus reviewer/approver references. After applying, record
transaction result and verification evidence. A failed/rolled-back attempt also
gets an entry. Never use only a branch name or an abbreviated SHA. No real apply
entry can be supplied by this draft: commits and application are wrapper-owned.

Purge markers are immutable and pull-only to clients. `sync_push` rejects them,
authenticated has SELECT only, and the guard rejects client inserts/updates even
if write grants are accidentally restored. Only `sync_purge_range` uses SECURITY
DEFINER (empty search_path, static SQL, auth.uid() required, explicit owner filters
on every read/write); its definer identity may insert markers but never update
them. Keep its owner a trusted migration role that clients cannot assume. Other
functions remain SECURITY INVOKER. No client-settable configuration flag permits
marker writes. Anonymous and service_role execution are revoked on the purge RPC.

Purge marker versions are unique per owner. Two distinct purges created in the
same transaction/millisecond with the fixed purge device can share a timestamp;
0002 rejects the second with a uniqueness conflict, rolling back that transaction.
Retry the request with its stable ID in a **fresh transaction**. This avoids
mistaking a parent's erased payload for a different range's larger cutoff. The
client's SQLite schema enforces the same version uniqueness. This adds no LWW
priority and does not change the cutoff or future-clock clamp.

Draft baseline: `96c110b0436420b9ca3a3c3536c365767fc9f8fd` (not an applied
revision). Unmodified 0001 SHA-256:
`b4fe761bda269908deef756845ce6c3641642332f7bf6c9e2f5b28a9d927d532`.
The apply ledger must still record the wrapper's eventual exact commit and both
final file checksums; this baseline is not evidence of an apply.
