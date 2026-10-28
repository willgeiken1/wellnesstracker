# M2-19 — PWA importer (draft, HIGH)

Plan §12.3 / M2; PW-01–03, HM-18; Q2, Q27, Q47, Q95, Q96, Q110, Q111, Q124.
Base: native/m2-19-pwa-importer starts exactly at cached origin/main c175534 (#102). No dependency branch stacked underneath it.

The edge function and file importer share a pure normalizer. Signed-in users are offered a preview after the initial row pull; Data also provides retry. The server freezes an owner-scoped, allowlisted legacy snapshot once. Confirmation writes all row batches and completion atomically. Existing IDs, tombstones, native profile and native home layout win. Subsequent requests return the committed plan; they never re-read the live PWA blob. No ongoing bridge, token migration, OAuth reconnect, photo bytes, telemetry or AI requests.

Signed-out users can choose a JSON file from Welcome or open a file share. File URI schemes are restricted to file/content; no remote URL resolution. Merge is the default. Replace shows a deletion count and a separate destructive confirmation, and rejects a stale preview. Home layout imports once, including hidden/unknown widget IDs; original homeV2 sizes stay local. Signed-out imports are offered to the first account after its initial pull. Native per-device consent and app lock are never restored.

Missing legacy IDs derive stable owner-scoped row identities from source keys/content; parent references use those identities. Explicit legacy deletion markers suppress resurrection. Numeric/date anomalies retain a nullable native row and a local review flag with original payload. Additional legacy data without physical native columns stays in owner-scoped local archives; the preview lists flags. Unmatched exercise names remain custom unless explicitly mapped to a bundled bank name. Gated fields remain off the wire; their originals are retained for later rollout. `syncedV1Columns` remains false.

Photos are metadata only. `downloadImportedPhoto` is a viewer-facing lazy callback, enforcing the current owner's private progress path. The Oura tables/tokens are not modified. The photo viewer is a later milestone consumer.

## Deployment dependency — not performed

`supabase/migrations/20261027190000_pwa_import.sql` depends on the unapplied row-sync schema in `native/server/row-sync/0001_row_sync.sql` and `0002_v1_columns.sql`, plus the existing PWA `user_data` and `progress_photos` tables. Those row-sync drafts are not copied into this migration. A reviewed rollout must establish those prerequisites before the import migration/function. Applying or deploying anything is outside this task; no Supabase CLI was run.

Receiving file shares uses SDK 58 expo-sharing CNG configuration. The iOS share extension uses group.com.insightwellness.app; the free-iPhone variant disables that extension. Simulator/Pixel cold/warm share launch and the new document picker need a regenerated development build. No native ios/android files are edited. Reduce Motion uses the existing root Stack configuration; this feature adds no animation.
