# M1-03 edge follow-ups — draft, not deployed

M1-03 / O-7 drafts `native/server/row-sync/0002_v1_columns.sql`. M1-03 changed
nothing under `supabase/`; M1-04 adds the undeployed edge follow-ups below.
Review these changes alongside 0001 + 0002 in M1-04; merging this draft alone does not repair the deployed purge endpoint.
Risk: HIGH (sync/privacy); Quinn review and Will's explicit go required.

## F1: user-scoped range purge (implemented in the M1-04 draft)

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

## F3: zero native rows after GoTrue deletion (implemented in the M1-04 draft)

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

## M1-04 dry-run evidence and remaining human gates

M1-04 implements F1/F3 in the edge sources as a draft; nothing was deployed.
The source migrations 0001/0002 are unchanged. See
[`row-sync/README.md`](../server/row-sync/README.md#apply-tracking-f6) for the
atomic wrapper, rollback, four-file SHA-256 manifest, local dry-run command,
coordinator apply ledger and human apply checklist.

- Automated: fresh in-memory PGlite with the existing minimal auth/users/API-role
  stubs applies the wrapper, checks all 23 tables/policies/grants/triggers/indexes,
  proves A/B isolation under the purge definer, and tests repeat apply failure,
  atomic failure in 0002, exact rollback and successful reapply.
- Automated F3: auth.users parent deletion removes synthetic A's live rows and
  tombstones across every row table, including A's live purge marker, leaving B
  unchanged. PGlite records purge owner postgres with rolbypassrls=true.
- Automated edge gates: mocked Deno entrypoints, Supabase clients and Storage;
  no real HTTP. The range endpoint uses the verified Authorization header and
  a separate public-key client, with no owner argument to the native RPC.
  Hard account deletion verifies exact admin HEAD counts of every native table,
  including already-deleted retries, before returning success.
- Pending human gates: **GoTrue cascade**, **real REVOKE grantor** and **PostgREST
  bigint casting** in a separately approved disposable full local stack. Also
  real local JWT/Storage integration, timezone boundaries and offline sync smoke
  tests. PGlite and mocks do not prove these integrations. Quinn PASS and Will's
  exact-revision HIGH-risk go are still required; there is no apply authorization.

### Draft range request contract

`{from,to,deletedAt,purgeRequestId?,tz?}`: canonical inclusive YYYY-MM-DD dates
within the endpoint's existing bounds; deletedAt (or legacy at) is the original
safe nonnegative integer millisecond cutoff. New callers supply a stable UUID v4
purgeRequestId and IANA timezone. Existing PWA callers without those fields use
UTC and a deterministic UUID derived from user/range/original cutoff/timezone.
Requests lacking an original cutoff fail validation; never invent a cutoff on a
retry. Preserve the request ID, range, timezone and cutoff across all retries;
never reuse the ID for a different request.

The endpoint first creates/reuses the native marker via the user-JWT RPC, then
reads that owner's immutable marker under RLS. Its persisted cutoff (including
the SQL now cap) is reused for the legacy Storage/blob paths. This prevents a
future cutoff being renormalized to a newer time on retry. Any RPC/marker/legacy/
Storage/blob failure returns failure, without raw errors or data in logs.
A marker-version conflict must retry with the same inputs in a fresh transaction.
Native and legacy operations cannot commit atomically together; a partial failure
must be retried, and success is returned only after all required paths finish.
The existing dynamic user_id SQL deletion intentionally skips owner_id row tables;
only hard auth.users cascades physically remove those rows.
