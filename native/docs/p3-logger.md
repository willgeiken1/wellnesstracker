# P3 — M2 logging parity, part 1: workout logger

Implements the authorized logger portion of plan §3.1 W1–W8/W10/W13/W14/W16–W18, §4, §5.5–5.6 and §9, M2 (§15.2). Binding decisions include Q2, Q22–24, Q27–28, Q47 FINAL, Q62, Q76, Q81–83, Q90/Q98/Q111, and Will’s Oct 17 equipment, suggestion-card, sync-badge, rest-minimization and muscle-attribution decisions. The Oct 17 Sea Glass/theme-accent and quiet PR badge/buzz/shelf decisions supersede older Citrus and popup designs. Source references were read from `~/Code/insight-p3-ref/`; they remain unchanged.

## Built

Workouts has routines, history and an explicitly deferred cardio segment. Start a template in one tap, start empty, create/edit/rename/reorder/delete a template, and Undo its confirmed deletion. The searchable, virtualized bundled exercise picker also accepts custom names. Templates store target sets/reps. Home and Workouts offer Resume for unfinished sessions. `/workout/start?routine=<UUID-v4>` works through both the route and the allowlisted Insight native intent; unrelated query parameters are discarded. A second start resumes the existing workout.

The full-screen logger has an elapsed clock, set progress, finished-exercise folding, previous-set columns, editable values, done checks, right-swipe completion, per-exercise add/remove/reorder actions, and long-press/accessibility-action set deletion. An opened blank remains blank. Weight hints may be accepted by marking done; reps always require an explicit entry, including explicit zero. Every keystroke on an unfinished set is saved locally. Completed-set edits commit through Next, while a separate local input buffer preserves unfinished keypad edits. The keypad has four columns, equipment steps, a long-press numeric scroll wheel, a barbell-only plate line, and weight → reps → next-set navigation. It never opens the system number keyboard or resizes the underlying logger. Completed-set values retain their canonical kg when only reps change, including after a display-unit change.

The logger uses the existing account pending/status API for its badge: offline/pending is saved locally, idle after pending briefly shows Synced for 1.5 seconds, then hides. Demo/guest says Saved on phone. No sync engine or auth file was edited. The mounted logger keeps the screen awake. Set completion and rest-end haptics honor the local workout haptics switch. Workout settings expose 60/90/120/180-second global rest, Unwind/Converge, and haptics.

The rest sheet starts with each completed set, supports −15/+15/Skip, remembers an exercise’s adjusted rest, and minimizes by dragging its handle, closing it, or its explicit accessible Minimize action. The inline mini bar expands on tap. Absolute timestamps survive backgrounding/repository recreation. Timer state identifies the completed set, so unchecking that set cancels its rest. The controller stays mounted while the keypad is open. Foreground rest completion fires one silent haptic and changes the mini bar to “next set ready”; no audio is used. Reduce Motion uses static contours updated once per second; otherwise SVG contours update in the foreground at 20 Hz. No background JS delivery guarantee is claimed: an elapsed timer is reconciled once on the next foreground/open.

Finish allows a workout name, editable duration, a local start date/time, notes (2,000 characters), and Save as template for empty workouts. Default timestamps preserve their original seconds; an explicitly changed date/time has minute precision. Both start and calculated end must be in the past. Summary shows Saved to History, date/time range, time/volume/sets/PR count, PR badges and Epley estimates, notes and a quiet milestones shelf. PR haptics use a distinct light/heavy two-pulse pattern, once per summary/session, after the OS Reduce Motion preference resolves; disabled haptics or Reduce Motion suppress it. Done returns to the tab shell. There is no AI card or placeholder.

## Data mapping and durability

All synced mutations use `Repository.save/remove`; each row/outbox write remains synchronous SQLite with no network call on its execution path. New `Repository.atomic` wraps multi-row logger changes in one transaction, suppresses intermediate notifications, and publishes after commit. Its nested logger operations reuse the same transaction instead of issuing nested BEGIN statements. Rollback leaves neither rows nor notifications. Existing sync validation, LWW clocks, outbox shape, conflict handling and transport are unchanged.

| Concern | Existing synced rows |
| --- | --- |
| Templates and target sets/reps | `routines`, `routine_exercises` |
| Workout identity, origin, dates, duration and notes | `sessions`; origin `template` or `empty` |
| Exercise membership/order | `entries` |
| Completed sets | `sets`; canonical `weight_kg`, original `entered_value/entered_unit`, reps and position |
| Uncheck/remove | Explicit set/entry tombstones, including child set tombstones when removing an exercise |
| Global rest | Existing `settings.rest_seconds`; edits preserve other settings columns |

Local migration `0003_workout_local` adds three owner-scoped tables, deliberately absent from `syncedTables`, catalog, schema and wire payloads:

| Local table | Contents and rationale |
| --- | --- |
| `workout_local` | Namespaced JSON keys for entry drafts/set identities, provisional keypad buffers, target-rep snapshots, absolute timer state, per-exercise rest, seen suggestion jumps, rest style, haptics preference, once-only PR buzz flags and session timezone offset. These are device UI state, not new synced columns. Equipment is bundled static metadata. |
| `workout_weekly` | Recomputed per-ISO-week muscle totals, stored under `weekly`; derivable from finished session/entry/set rows and bundled muscle metadata. |
| `workout_milestones` | Quiet PR token records under `milestones`, keyed logically by session/exercise; recomputation replaces the aggregate, preventing duplicate tokens on repeated finish/edit. |

Existing owner-wipe and all-owner-wipe operations now include all three local tables, atomically. Auth/sign-out orchestration is unchanged. These tables are not an encryption boundary. Session day is persisted at finish; week attribution uses that saved local day so changing timezone later does not move an old workout to another week. Timestamp offsets are local metadata because synced columns are frozen. Unsaved UI state and tokens do not transfer between devices. Remote history remains available through the existing synced tables; aggregates are rebuilt on local finish/edit/removal.

## Rules

- The static library contains 503 distinct names from PWA `state.js` defaults and `body.js` bank plus the reference lifts. Names/muscles only are carried from the PWA (Q27); no media/diagrams are copied. Default-workout muscle ordering is retained. For bank records, the first distinct basic muscle derived through the PWA advanced→basic mapping is main, the rest helpers. Explicit bundled equipment metadata is conservative; unknown/custom names always become `other` with no muscles. Quinn should check main/helper assignments and ambiguous equipment before gym testing.
- Progression uses only done working sets from the last finished session. Every set must meet its template target reps; without a template target, each prior set’s own reps is its target. One miss repeats the previous weight. No history gives no weight hint. The latest previous working weight is the base. Barbell/dumbbell: +5 lb or +2.5 kg, dumbbell value per hand. Machine/cable: default +10 lb/+5 kg. Bodyweight/other: no jump. Warm-ups are excluded. The conflicting PWA “two misses → deload” and readiness/RPE layers are not ported into this decision.
- A full explanation appears only on its first visible presentation for an exercise/canonical suggested weight. A local flag is persisted at presentation, so dismissal or restart never repeats that jump. The gray matching previous weight or suggested weight remains available. Reps stay empty until typed.
- PRs compare heaviest weight at ≥1 rep and best Epley `kg × (1 + reps/30)` against all earlier finished sessions of that exercise. Ties, first-ever sessions, undone and warm-up sets do not qualify. Multiple record criteria in one exercise produce one quiet token. Duplicate exercise entries are grouped for record detection. Estimates are labelled Est. / ≈.
- Each done working set attributes main = 1, each distinct helper = 0.5. Unfinished sessions, undone sets and warm-ups are excluded. ISO week starts Monday in local time, including year boundaries. Targets are constant 10–20; editing comes later.
- Display weights round to 0.5 lb / 0.25 kg, without rewriting canonical history; estimated 1RM and summary volume use whole displayed units.
- Weight 0–1,000 kg; whole reps 0–100. Empty is distinct from zero. Above 50 reps or >50% above the matching prior weight asks a neutral confirmation. There are no red failure states. Notes are capped at 2,000 characters. No future workout dates are accepted.
- Plates use a 45 lb/20 kg bar and per-side descending standard plates (45/35/25/10/5/2.5 lb; 25/20/15/10/5/2.5/1.25 kg). Unrepresentable or below-bar loads are labelled rather than claimed exact. Keypad steps match equipment; reps step by one.

## Mockup differences and follow-ups

Existing P2 tokens control colors, font sizes, radii and shadows; Sea Glass is now the fallback accent and training follows the chosen accent. Both light/dark references informed the layout. Unfilled line icons replace emoji. No contours appear on set rows, keypad or exercise lists. New copy is in `src/i18n/en.ts`.

The token is an accent-tinted circular SVG summit **placeholder**, not final 3D art. The summary omits the workout-print thumbnail pending its own terrain implementation. The keypad wheel is a horizontal snapping numeric strip. Date/time and duration currently use accessible text fields instead of another native date-picker dependency. Large text can scroll within the keypad sheet. Skip is immediate; at rest end the mini bar supplies the quiet visual cue instead of a ripple animation. The default timer card is shorter than the full-height reference, preserving access on smaller screens. Cardio is clearly marked as follow-up.

Follow-ups: Live Activity/Dynamic Island/Android ongoing notification and background end delivery; app-icon Start workout quick action (§10.6); exercise swap/skip (W11/Q30); drop-set and warm-up/to-failure tag UI; unilateral L/R and weaker-side PR; cardio in Workouts; readiness layer; AI summary and consent/egress guard; editable Body Atlas targets; final 3D token art; per-machine stack steps; full workout fingerprint; machine-note UI; richer history editing; native date/time picker and device gesture/accessibility polish. Warm-up eligibility is supported by pure rules and local draft metadata; the frozen synced set columns carry no tag, so cross-device tag semantics must be resolved in that follow-up. No synced schema change was made or is required for the shipped working-set logger.

## Review and validation

Tests use synthetic fixtures only. Rules cover equipment in lb/kg, every-set-hit/one miss, no history, first-time cards, attribution/week boundaries, PRs/ties/first-ever/undone/warm-up eligibility, plates, keypad and validation. Actual SQLite tests cover template start, draft and done state after repository recreation, pending rows with fetch disabled, uncheck tombstones, row removal/reorder, canonical unit preservation, local preference persistence, no local-table outbox rows, aggregate replacement, rollback notifications and both wipe paths. Existing tombstone-upgrade tests now simulate the pre-0002 database by removing all later migration markers **and** the new local tables; their privacy assertions are unchanged. Components cover keypad Next, barbell-only plates, set-done→timer/minimize/expand, badge timing and the quiet summary PR card. Existing shell tests now supply the workout hook boundary and expect Sea Glass rather than Citrus.

No simulator/emulator, prebuild, native generation, screenshots, Docker, Supabase connection, AI/telemetry, secrets, paid service, staging, commit or push was used. The production reference guard, synced schemas, sync engine, auth and server SQL are untouched. Device launch, native haptic feel, foreground/background behavior, layout in both themes, largest Dynamic Type, VoiceOver/TalkBack and the <50 ms set-save target still require the coordinator’s simulator and gym validation; Node tests cannot establish device performance.

Quinn: review the repository transaction/notification boundary and new local wipe coverage; conservative library main/helper/equipment assignments; template delete/Undo identity preservation; canonical-unit edits; first-jump presentation persistence; duplicate-entry PR grouping and backdated chronology; local-only tag/aggregate limits; and native timer/keypad gestures. No cross-family PASS is claimed.

Final validation (Node 24.21.0, native folder; telemetry/dotenv disabled, npm cache `/tmp/insight-npm`, Expo home `/tmp/insight-expo`):

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npx expo lint` | PASS, no warnings |
| `npx expo-doctor` | PASS, 20/20 |
| `npx expo install --check` | PASS at kickoff and final; dependencies up to date |
| `npm test -- --ci` (with JSON results) | PASS, **494 tests / 26 suites**; 460 existing + 34 new |
| Whitespace diff check | PASS |

Jest JSON results: `/tmp/insight-p3-results.json`. The final run took 18.633 seconds; only the existing Node VM Modules experimental notice was emitted. Additional regression coverage verifies absolute expiry fires once after timer remount, PR signature waits for the OS preference and stays once-only, and display rounding preserves canonical data. Root `npm test` remains unavailable because the root package has no test script; no PWA files changed. No native-host test result or screenshot is claimed.

## Reviewable file chunks

Paths are relative to `native/`; shared files span concerns.

- Core rules: `src/core/workout/rules.ts`, `src/core/workout/library.ts`.
- Data: `src/data/workout/store.ts`, `src/data/migrations.ts`, `src/data/repository.ts`.
- UI screens: `src/features/workout/active.tsx`, `templates.tsx`, `picker.tsx`, `keypad.tsx`, `set-row.tsx`, `badge.tsx`, `settings.tsx`, `primitives.tsx`, `use-workout.ts`; `src/app/(tabs)/index.tsx`, `workouts.tsx`; `src/app/+native-intent.ts`; `src/app/settings/[section].tsx`; `src/app/workout/_layout.tsx`, `index.tsx`, `start.tsx`, `template.tsx`; `src/design/theme-provider.tsx`; `src/i18n/en.ts`.
- Rest timer: `src/features/workout/timer.tsx`, `haptics.ts`; `package.json`, `package-lock.json` (also shared with summary).
- Finish summary: `src/features/workout/finish.tsx`, `summary.tsx`; `src/app/workout/summary.tsx`.
- Tests/docs: `tests/workout-rules.test.ts`, `tests/workout-ui.test.tsx`, `tests/server/workout.test.ts`, `tests/server/repository.test.ts`, `tests/linking.test.ts`, `tests/routes.test.tsx`, `tests/shell.test.tsx`, `tests/appearance-persistence.test.tsx`; `docs/p3-logger.md`, `docs/p2-foundation.md`.

Direct runtime additions via `npx expo install`: `expo-haptics` 58.0.7 for silent feedback; `expo-keep-awake` 58.0.3 for the active logger. No new test dependency, backend service or paid capability was added. API references: [SDK 58 Haptics](https://docs.expo.dev/versions/v58.0.0/sdk/haptics/) and [KeepAwake](https://docs.expo.dev/versions/v58.0.0/sdk/keep-awake/).
