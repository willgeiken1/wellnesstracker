# BA-2D: v1 flat body atlas

Scope: the BA-2D task specification, risk MED, UI over existing local workout
logs. 3D / GLB / M3-11 / M3-12 belongs to BA-3D in v1.x. Stable advanced keys
are copied exactly from the existing 44-key PWA bank for that future work.

## Implementation

- `assets/atlas/geometry.json`: original polygon vertices and compound paths,
  front/back and male/female; skin and muscle layers. Both lateral halves use
  one path ID. Four standalone SVG exports plus a browser ES module export.
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
- Live PWA advanced atlas consumes the same geometry; the worker caches its
  new module. Its existing volume policy and basic atlas are unchanged.

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

Final automated validation (2026-10-28): typecheck and Expo lint passed; full
native Jest passed **1,269 tests / 70 suites / 2 snapshots**, both projects,
on CI-pinned Node 24.21.0. Expo Doctor passed 20/20 checks. The root PWA sweep
passed 453 tests and failed 10 needing PostgreSQL tools or OS network isolation;
those remain failures. The focused live-atlas/worker/bank suite passed 39 tests.
