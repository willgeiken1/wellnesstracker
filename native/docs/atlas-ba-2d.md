# BA-2D: v1 flat body atlas

Scope: the BA-2D task specification, Risk HIGH (Quinn fix round 1), UI over existing local workout
logs. 3D / GLB / M3-11 / M3-12 belongs to BA-3D in v1.x. Stable advanced keys
are copied exactly from the existing 44-key PWA bank for that future work.

## Implementation

- `assets/atlas/geometry.json`: original polygon vertices and compound paths,
  front/back and male/female; skin and muscle layers. Both lateral halves use
  one path ID. Four standalone SVG exports for the native atlas.
- `features/atlas/volume.ts`: pure rolling seven-day weighted counts, target
  ranges, session-dependent linear recency fade, sequential blue fills and
  nonduplicating basic rollups. See `assets/atlas/SOURCES.md` for attribution.
- `read-logs.ts`: completed M2-06 logs, excluding warmups and unfinished work;
  read-only custom exercise resolution avoids preference promotion or outbox
  writes. Repository revision changes update Insights through `useWorkout`.
- `BodyAtlas`: responsive full/compact display, native SVG path hit detection,
  selection outline/card, common/scientific labels, optional light haptic,
  controls for side/outline and the same complete accessible list. Screen
  readers start in list mode. Static rendering respects Reduce Motion.
- Insights refreshes recency once per minute and on foreground, cleaning up
  timers and listeners. `/muscle/[key]` is an explicitly labeled detail stub.
- The body map is native-only per Will (2026-10-28, 7:15 AM CT). Fix round 2
  removed the PWA diagram swap; `logger/` matches main, with no worker bump.

## Review and validation

Tests cover all canonical keys/mappings, exposed hit area, edge/mirrored hits,
weighted attribution and window boundaries, target/fade fixtures, log edits,
custom lifts and read-only behavior, list parity, screen-reader initial mode,
light/dark rendered fill snapshots, haptic payloads, network/log traps and a
closed runtime import boundary excluding telemetry/AI/network modules.

`docs/screenshots/ba-2d/original-geometry.png` is an inspected browser rendering
of the exported SVGs, **not** an iOS/Android app screenshot. Native build,
VoiceOver/TalkBack, real haptic feel and touch ergonomics remain manual checks.
No production data, network sync, auth, schema/migrations or egress is added.

Initial implementation validation (2026-10-28): typecheck and Expo lint passed; full
native Jest passed **1,269 tests / 70 suites / 2 snapshots**, both projects,
on CI-pinned Node 24.21.0. Expo Doctor passed 20/20 checks. The root PWA sweep
passed 453 tests and failed 10 needing PostgreSQL tools or OS network isolation;
those remain failures. The focused live-atlas/worker/bank suite passed 39 tests.

## Fix round 1 (PR #111)

At fix round 1, the PWA split (blocker 1) and threshold comparison (F5)
awaited Will's decision. Fix round 2 below records the native-only decision.

Native map paths now expose selected accessibility state through a small
react-native-svg 15.16 adapter: the library's normal extraction forwards labels
but drops state/role. Invisible 44 pt non-scaling strokes behind the visible
paths expand touch areas in full/compact maps; exact paths retain priority.
Neighboring targets overlap, so the hint names the list for precise selection.
Physical touch ergonomics and screen-reader behavior still require device checks.

Unfinished or invalid finish times are skipped before numeric conversion.
Recency uses day labels after 24 hours and an outside-seven-day label for older
training. Tests isolate warmup, zero-rep and not-done exclusions. Memoized log
reads depend on the revision-specific WorkoutStore facade; heatmaps depend on
sessions and the current minute. Muscle/value lookups use Maps, and unknown
muscle keys show a friendly alert.

There is no native Sentry or PostHog integration today. The PWA's telemetry
defaults do not imply native route recording. A source/dependency gate rejects
native SDK imports and navigation recording hooks until a future integration
supplies tested global scrubbing for route params, screen names and breadcrumbs.
The existing atlas import-closure and network/log trap tests remain in place.

About → Licenses now credits ColorBrewer Blues, Cynthia Brewer, Penn State,
Apache-2.0; the sources distinguish the three original dark palette adaptations.

Fix round 1 validation: CI-pinned Node 24.21.0, required typecheck → Expo lint →
`npm test -- --ci` passed **1,281 tests / 70 suites / 2 snapshots** in both
projects (390.334 seconds). Focused atlas/routes checks passed 34 tests and the
shell accessibility sweep passed 9 tests. Expo dependency compatibility passed;
Expo Doctor passed 20/20 checks. PWA paths have no working-tree changes.

## Fix round 2 (PR #111)

Per Will (2026-10-28, 7:15 AM CT), the body map is native-only. The PWA
diagram swap and its root test were removed; `logger/`, `sw.js` and root
`tests/` match `origin/main` exactly. There is no service-worker cache bump.
Quinn F5 (PWA versus native threshold) no longer applies. Native implementation,
strings, accessibility and Reduce Motion behavior are unchanged.
