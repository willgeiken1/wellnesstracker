<!-- DRAFT - NOT APPLIED. Applying needs Quinn PASS + Will's go (HIGH). -->
# Row-sync server draft

`0001_row_sync.sql` is review material for M1/P2c (§7.1/§7.3/§12.1; Q2/Q124). It has only been executed in an in-process PGlite database with synthetic users. It is deliberately outside the repository-root `supabase/` deployment path. No server, project, hosted branch or Docker container was created.

The transaction creates 19 explicit row tables, a global sequence, owner policies/indexes, a write trigger and the invoker-rights `sync_push(rows jsonb)` RPC. The RPC accepts up to 100 row envelopes, dispatches only to statically named tables, rejects unknown fields and spoofed owners, and performs typed upserts. It returns the actual stored row envelope for each input, in input order, so clients can reconcile server-clamped or stale writes even when no new sequence is assigned. RLS independently enforces ownership for SELECT/INSERT/UPDATE/DELETE. Anonymous callers have neither table grants nor RPC execution rights. Direct physical deletes are rejected; clients write minimal tombstones. Only nested account-deletion cascades with an absent auth parent may physically remove rows. All owner FKs use ON DELETE CASCADE.

Every accepted write assigns a fresh `server_seq`. A transaction-scoped advisory lock per owner serializes writes across tables before sequence allocation. This prevents a delayed commit from appearing behind a cursor already consumed by that owner. Retried/stale writes may consume unused sequence values; gaps are harmless. The sequence is not a device timestamp. Pulls order/filter the physical bigint and serialize it as text. LWW compares `(updated_at, device_id COLLATE "C")`; equal normalized versions are immutable retries. Before comparison, updated_at beyond transaction now()+5min is clamped to now() to avoid granting a bad clock priority over later legitimate edits. Tombstones wipe all payload values except immutable weigh-in source; existing value columns already permit NULL. See D1–D4 in `docs/p2-sync.md`. Child rows have no cascading parent foreign keys. `weigh_ins.source` must be `app`; Oura has no server table.

## Future application procedure — requires separate approval

1. Obtain Quinn PASS and Will's explicit HIGH-risk go for the exact SQL revision. Keep the app's production-reference and loopback guards until a separately approved launch PR.
2. Have the coordinator select a disposable, approved local Postgres/Supabase environment and supply configuration privately. Confirm `auth.users`, `auth.uid()` and the API roles already exist. Check that none of these table/function names already exist; this is not an upgrade script or a legacy blob importer.
3. Take a backup/snapshot and run the SQL as one transaction in that approved environment. Verify explicit grants, all 19 owner policies, trigger/RPC behavior, and `(owner_id, server_seq)` indexes using synthetic accounts A/B. Validate the same PostgREST select casts and RPC contract used by the client.
4. Run the PGlite tests and a later approved local REST smoke test before allowing any real accounts. This task does not authorize those later application steps.

## Future rollback procedure

An error during initial application rolls back the enclosing transaction. If the draft has already been applied in an approved disposable environment, stop clients first and preserve a backup before rollback. Remove `sync_push(jsonb)`, then the 19 row tables named in `src/data/catalog.ts`, then `row_sync_guard()` and `row_sync_seq`, in one reviewed transaction. Dropping the tables destroys their rows; never do this to an environment containing data that must be retained. Leave `auth`, its users/roles and unrelated application tables intact. No rollback was run in this task.

## Tests

From `native/`, `npm test -- --ci` runs Expo component tests plus the `data-server` Node project. PGlite stubs only `auth.users`, `auth.uid()` and API roles, then applies this SQL **unmodified**. Tests use `SET LOCAL ROLE authenticated` and the synthetic JWT subject for RPC and pulls. A dedicated test temporarily disables each guard in the test database to prove WITH CHECK works independently of the guard, then restores it. No network is needed for the test suites. Node 24+ is required for the SQLite test adapter; Jest enables VM modules for PGlite's WASM loader.
