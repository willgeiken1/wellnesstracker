# M2-19 — PWA importer (draft, HIGH)

Plan §12.3 / M2; PW-01–03, HM-18; Q2, Q27, Q47, Q95, Q96, Q110, Q111, Q124.
Base: native/m2-19-pwa-importer starts exactly at cached origin/main c175534 (#102). No dependency branch stacked underneath it.

The edge function and file importer share a pure normalizer. Signed-in users are offered a preview after the initial row pull; Data also provides retry. The server freezes an owner-scoped, allowlisted legacy snapshot once. Confirmation writes all row batches and completion atomically. Existing IDs, tombstones, native profile and native home layout win. Previews expire after 15 minutes; an explicit preview refreshes an expired snapshot with a new UUID, and the client returns the reviewed UUID at confirmation. Edge and SQL reject mismatched UUIDs; SQL checks expiry under the owner lock. Completion erases the snapshot and raw plan in the same transaction. Only the winning request returns its in-memory plan; retries and other devices receive an empty receipt and recover rows through normal sync. Local-only legacy details cannot be recovered from the server if that successful response is lost. No ongoing bridge, token migration, OAuth reconnect, photo bytes, telemetry or AI requests.

Signed-out users can choose a JSON file from Welcome or open a file share. File URI schemes are restricted to file/content; no remote URL resolution. Merge is the default. Replace shows a deletion count and a separate destructive confirmation, and rejects a stale preview. Home layout imports once, including hidden/unknown widget IDs; original homeV2 sizes stay local. Signed-out imports are offered to the first account after its initial pull. Native per-device consent and app lock are never restored.

Missing legacy IDs derive stable owner-scoped row identities from source keys/content; parent references use those identities. Explicit legacy deletion markers suppress resurrection. Numeric/date anomalies retain a nullable native row and a local review flag with original payload. Additional legacy data without physical native columns stays in owner-scoped local archives; the preview lists flags. Unmatched exercise names remain custom unless explicitly mapped to a bundled bank name. Gated fields remain off the wire; their originals are retained for later rollout. `syncedV1Columns` remains false.

Photos are metadata only. `downloadImportedPhoto` is a viewer-facing lazy callback, enforcing the current owner's private progress path. The Oura tables/tokens are not modified. The photo viewer is a later milestone consumer.

## Deployment dependency — not performed

`supabase/migrations/20261027190000_pwa_import.sql` depends on the unapplied row-sync schema in `native/server/row-sync/0001_row_sync.sql` and `0002_v1_columns.sql`, plus the existing PWA `user_data` and `progress_photos` tables. Those row-sync drafts are not copied into this migration. A reviewed rollout must establish those prerequisites before runtime import use. Fix round 2 supports either SQL install order. Applying or deploying anything is outside this task; no Supabase CLI was run.

Receiving file shares uses SDK 58 expo-sharing CNG configuration. The iOS share extension uses group.com.insightwellness.app; the free-iPhone variant disables that extension. Simulator/Pixel cold/warm share launch and the new document picker need a regenerated development build. No native ios/android files are edited. Reduce Motion uses the existing root Stack configuration; this feature adds no animation.

## Fix round 1 — Quinn items 2–6

The free-iPhone inspection copies the shared pure importer into the matching temporary repository layout so Metro can resolve its watch folder. The full inspection exports iOS and scans configuration, bundles, and source maps for backend/telemetry imports and synthetic canaries.

Both legacy privacy RPCs now handle `native_pwa_imports` under the same owner lock as snapshot/commit. Account deletion explicitly deletes the archive before auth deletion. Range deletion clears the entire archive (JSON has no reliable date columns) and preserves a completion marker, including when purge precedes preview. A native `purges` marker triggers the same invalidation. This conservatively disables further account-blob import after a range purge so an unchanged legacy source cannot restore deleted data. Existing social cleanup remains intact.

Direct authenticated RPC calls remain supported because the edge uses the user's JWT and a publishable key. SQL validates owner identity and rejects nested identity overrides before any existing-row/singleton skip; `sync_push` validates accepted row fields. No service-role client was introduced. This follows the authorization and empty search-path guidance in [Supabase's database-function documentation](https://supabase.com/docs/guides/database/functions).

The edge caps streamed request bodies at 64 KiB (including missing/false Content-Length) and snapshots at 5 MiB, returning HTTP 413 with a payload-free error. SQL also refuses oversized snapshots before saving them. Tests use synthetic fixtures, PGlite/SQLite, and an entirely mocked edge client, including failure after a 100-row SQL batch and after two SQLite writes, then retry and duplicate-commit checks. No remote SQL/function apply or deployment is performed; blocker 1 remains outside scope.

## Fix round 1b — migration-chain compatibility

The native `purges` table is created by the separate row-sync draft, not by any file in `supabase/migrations`. The importer migration now installs its native purge trigger only when that table exists. The legacy `purge_user_range_rows` and `delete_user_rows` RPCs continue to erase the snapshot and raw plan without requiring row-sync tables. A PGlite regression loads every migration in filename order with CI's Supabase stubs, exercises both privacy RPCs, and verifies that purges before or after a preview prevent refreezing/importing the archive.

Loading the migration chain alone does not enable row import: the reviewed rollout must install row-sync 0001/0002 before runtime import use. Fix round 2 installs the purge trigger in either SQL order. This continuation run on will-worker changes source and tests only.

## Fix round 2 — install order, preview conflicts and expiry sweep

Row-sync 0002 now creates the native purge trigger when it creates `public.purges`.
The importer migration replaces the same trigger if row-sync was installed first;
both orders work, and the CI Supabase migration chain remains independent of row-sync.
The fresh-install RPC tests run the entire Supabase chain before row-sync 0001/0002
and assert the trigger exists before testing native range purge invalidation.
Range purge still marks the import completed, including before any preview (R2-4).

`native_pwa_snapshot(true)` previews and freezes a snapshot; `false` only reads an
existing preview for commit and returns SQL NULL when none is available. Both
snapshot lookup and commit delete incomplete snapshots older than 15 minutes
across owners. Completed receipts never expire. Commit returns SQL NULL for a
missing/expired/replaced preview so the sweep persists instead of rolling back
with an exception. The edge maps that conflict (and prior SQL preview errors) to
HTTP 409; native displays the localized Preview again message in an accessible
alert. No scheduled jobs or remote setup are required. Row-sync remains required before runtime import use.
