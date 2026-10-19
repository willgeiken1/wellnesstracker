# M1-03 edge follow-ups — draft, not deployed

M1-03 / O-7 drafts `native/server/row-sync/0002_v1_columns.sql`. Nothing under
`supabase/` was changed. These changes must be reviewed with 0001 + 0002 before
M1-04; merging this draft alone does not repair the deployed purge endpoint.
Risk: HIGH (sync/privacy); Quinn review and Will's explicit go required.

## F1: purge-range must call the row-sync RPC as the requesting user

In `supabase/functions/_shared/range.ts` (the range-purge implementation used by
`purge-range`), keep the existing verified-user authentication, legacy SQL purge,
Storage deletion and user_data cutoff rewrite. Add the following call using a
separate user-JWT client, never the admin/service-role client. Keep both paths:
the legacy purge does not see owner_id tables, and the new RPC does not purge
legacy/social/storage data. Do not return `{ok:true}` until every required path
succeeds; propagate the new RPC error as a failed request.

```ts
// url and publishableKey are the existing public project configuration.
// Preserve the original, verified Authorization header; never log it.
const userClient = createClient(url, publishableKey, {
  global: { headers: { Authorization: req.headers.get('Authorization')! } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await userClient.rpc('sync_purge_range', {
  p_id: purgeRequestId, // UUID v4, stable across retries of the same request
  p_from: fromDay,     // validated canonical inclusive YYYY-MM-DD
  p_to: toDay,
  p_cutoff_ms: cutoffMs, // same original deletion cutoff as the PWA rewrite
  p_tz: timeZone,      // validated IANA time zone
});
if (error) throw new Error('Range deletion failed.');
```

Extend the endpoint's request contract with the stable purge request ID and
original cutoff (validate UUID/date/time-zone and safe nonnegative ms). Carry
them across retries; do not generate another ID or newer cutoff on every server
attempt. The RPC bounds cutoff to transaction now. Reusing an ID is a complete
no-op, even if arguments differ. The caller must not reuse an ID for a different
range. A same-owner marker-version uniqueness conflict is retriable in a fresh
transaction using the same request ID and original cutoff; do not swallow it
and claim success. All components of a retry must keep the original PWA cutoff too.
The RPC takes the owner exclusively from `auth.uid()`; no owner argument.
Use the same normalized from/to/tz/cutoff for both native and legacy paths.

A successful native purge adds a synced marker, tombstones dated logs and their
workout children, and makes clients wipe matching unsynced rows. Do not physically
DELETE row-sync tables. Goals and food_targets are settings, not dated logs.
No health values, dates, payloads, auth headers or RPC errors may enter analytics,
AI, telemetry or logs. Existing client loopback/production guards stay in force.

## F3: delete-account must assert zero native rows after GoTrue deletion

In `supabase/functions/delete-account/index.ts`, after the hard
`auth.admin.deleteUser(id)` and final Storage sweep, before returning success,
use the existing admin client to issue exact HEAD counts for **every** reserved
row-sync table. RLS would hide these rows from an ordinary user; this verification
must use the existing server-only admin client. Never move its key into native.

```ts
const rowSyncTables = [
  'profile', 'weigh_ins', 'measurements', 'routines', 'routine_exercises',
  'sessions', 'entries', 'sets', 'cardio_sessions', 'food_entries',
  'saved_foods', 'food_targets', 'meals', 'goals', 'plan_days',
  'machine_notes', 'home_layout', 'settings', 'photos',
  'custom_exercises', 'plans', 'pauses', 'purges',
] as const;
for (const table of rowSyncTables) {
  const { count, error } = await admin.from(table)
    .select('id', { count: 'exact', head: true }).eq('owner_id', id);
  if (error || count !== 0) {
    // Fail closed; do not return counts, table data, raw errors or IDs.
    return json({ error: 'Account deletion verification failed.' }, 500);
  }
}
```

Run this even on an "already deleted" retry: do not bypass verification on the
idempotent success path. Preserve `userStillExists` and the existing Storage
cleanup. Never attempt a depth-1 row-sync DELETE to fix a nonzero count.

Update header comments in `delete-account/index.ts:3–10`, and the deletion
function comments in the privacy-delete and social-schema SQL migration files
(`supabase/migrations/20261003120000_privacy_delete.sql` and
`supabase/migrations/20261012120000_social_schema.sql`),
to say: **owner_id row-sync tables are removed only by auth.users ON DELETE
CASCADE during a hard GoTrue delete; delete_user_rows intentionally skips them.**
The dynamic user_id legacy loops must never include guarded row-sync tables.
These are follow-up edits only; M1-03 does not modify those deploy-on-merge files.

## M1-04 [dry-run] acceptance, synthetic A and B only

- Apply the reviewed exact 0001 + 0002 revision to disposable local Supabase,
  with all existing legacy migrations. Record checksums and ledger, then test
  PostgREST bigint text casts and actual JWT RPC invocation.
- Call purge-range with A's real local GoTrue JWT. Verify native + legacy +
  Storage cutoff behaviour, stale/never-synced/future-clock pushes, post-cutoff
  edits, stable-ID retry, offline outbox wiping and B isolation. A service-role
  RPC call must not be used as a workaround for the ownership guard.
- Create live rows and tombstones in all 23 row-sync tables for A and B, hard
  delete A through real GoTrue, and assert exact zero A rows while B is unchanged.
  This proves the nested trigger depth/auth-parent visibility assumption that
  PGlite's auth stub cannot prove. Verify the new edge zero-row assertion fails
  closed on an injected nonzero count or query error, and on retries.
- Record `SELECT rolbypassrls FROM pg_roles WHERE rolname='postgres'`; verify
  authenticated/anon grants, service_role TRUNCATE/TRIGGER/REFERENCES revokes,
  FORCE RLS, and RPC invoker/search_path settings on the real local roles.
- Verify local simulator/emulator launch and screenshots when an environment is
  available. None of these application, GoTrue, edge or device checks ran here.

Open question for Will: Should a range purge also remove edits made after the
delete time? (Current design keeps the PWA cutoff semantics: no.)
