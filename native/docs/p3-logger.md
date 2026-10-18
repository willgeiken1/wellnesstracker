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

The token is an accent-tinted circular SVG summit **placeholder**, not final 3D art. The summary uses a static synthetic SVG contour thumbnail until the full workout fingerprint is implemented. The keypad wheel is a horizontal snapping numeric strip. Date/time and duration currently use accessible text fields instead of another native date-picker dependency. Large text can scroll within the keypad sheet. Skip is immediate; at rest end the mini bar supplies the quiet visual cue instead of a ripple animation. The timer now uses a tall sheet matching the reference proportions; its controls remain accessible when minimized. Cardio is clearly marked as follow-up.

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


## Device fix round 1 — Oct 18

The repository subscription discarded its changing revision and returned a stable store, allowing React Compiler to cache stale method-derived render values. A monotonic, in-memory repository revision now feeds `useSyncExternalStore`; each revision creates a fresh, stateless workout facade. Home, Workouts, active/fallback, templates, keypad rows, timer and summary reads therefore invalidate together. No sync engine, auth, persisted schema, synced columns or outbox behavior changed. Timer and summary also subscribe when mounted independently. Suggestion marking is idempotent across revisions; PR haptic effects depend on the stable repository so revision updates cannot cancel the signature.

The workout modal now has its own safe-area provider, headerless template/summary screens opt into the top inset, and sheets have a provider plus top-safe bounds. Close workout explicitly returns Home. The keypad stays mounted across Weight → Reps → next set, with an ungrouped accessible modal container and the requested key/set/timer/finish/save/summary test IDs. This follows the [safe-area modal guidance](https://appandflow.github.io/react-native-safe-area-context/docs/api/safe-area-provider/) and [React Native accessibility guidance](https://reactnative.dev/docs/accessibility).

Bundled equipment uses ordered name inference plus overrides (including Smith/machines, goblet squats and inverted rows). Custom names remain `other`. Coverage: **503 bundled exercises; 189 other (37.6%)**, down from 276 (54.9%); barbell 67, dumbbell 57, machine 76, cable 57, bodyweight 57. Remaining ambiguous/band/kettlebell/plate exercises retain conservative metadata. The four mockup lifts and Close-Grip Bench Press are covered explicitly. Set-count queries already exclude tombstones; compiler invalidation fixes stale displayed totals. SQLite regression coverage verifies deleted exercises/sets and prior sessions do not enter active totals. Clocks, rounded weights/countdowns and summary volume now reject nonfinite display inputs; the empty logger has no NaN text in the component regression.

Jest now compiles production `src/` with the installed React Compiler (test/mock factories remain uncompiled). Regression evidence includes failing old-code start/count tests and a direct memoized subscription-reader test that fails on the old hook's first draft edit. The keypad component test checks live 135 lb / 8 reps, LAST TIME updates, retained key identity across Next, row values, done/rest and progress; summary edits refresh without remounting. Native-host reproduction of the original keypad header symptom remains a coordinator check.

Changed files this round (relative to `native/`):
- Subscription/data: `src/data/repository.ts`, `src/data/workout/store.ts`, `src/features/workout/use-workout.ts`.
- Rules/library: `src/core/workout/library.ts`, `rules.ts`.
- Screens/accessibility: `src/app/workout/_layout.tsx`; `src/components/button.tsx`, `screen.tsx`; `src/features/workout/active.tsx`, `templates.tsx`, `keypad.tsx`, `set-row.tsx`, `primitives.tsx`, `timer.tsx`, `finish.tsx`, `summary.tsx`.
- Tests/docs: `jest.app.config.js`, `tests/workout-ui.test.tsx`, `tests/workout-rules.test.ts`, `tests/server/workout.test.ts`, this document. No dependencies added.

Validation: typecheck and lint pass without warnings; Expo Doctor 20/20; Expo dependency check up to date; Jest **515 tests / 26 suites** (21 added this round). Root `npm test` still has no script. Telemetry/dotenv disabled, npm cache and Expo home redirected to `/tmp`; no secrets read. No simulator/emulator, prebuild, git staging/commit/push, or backend changes were performed. Quinn/coordinator: recheck Dynamic Island clearance, sheet accessibility after Next, cold/warm starts and collapse on the simulator; no native-host validation is claimed here.


## Device fix round 2 — Oct 18

Keypad digits now replace the existing value on first entry after opening or moving to a field; later digits append. Untouched Next preserves the value, while backspace and ± steps use it directly. Inputs reject values above 1,000 kg (2,204.6 lb at entry precision) / 100 reps and excess decimals (lb: 1; kg: 2), showing a muted limit hint. Steps and the numeric wheel share these limits. Oversized legacy drafts never produce a plate line; valid plate lines group repeats (for example, `45 × 3 + 10 + 2.5`) on one line. Only template sessions show the TEMPLATE eyebrow; empty sessions show the workout title alone. Scope: plan §5.5 / §9, M2; Q5 keypad behavior.

Regression coverage includes replace/append/reopen/Next, untouched backspace and steps, range and precision boundaries, wheel limits, compact/hidden plates, and both header origins. Validation: typecheck and lint PASS; Expo Doctor PASS 20/20; dependency check PASS; Jest PASS 539 tests across 26 suites. No dependencies, sync/auth/schema changes, git writes or simulator runs.

## Device fix round 3 — Oct 18

Scope: M2, plan §5.5/§5.6/§9; Q22 (weight hints), Q23 (rest). Sheets now avoid the software keyboard; the exercise picker fills the available safe height with search above a shrinking, scrollable results list that retains taps while typing. Picker search/results and the suggestion card expose the requested automation IDs. The logger shares one persistent native Modal across picker, keypad, rest and finish, avoiding competing iOS presenters during rest-to-picker transitions. Close/backdrop/system-back dismiss the keyboard and reset the relevant state; session identity resets logger UI state. Exercise options use a stateless native Alert.

With no matching history hint, a blank weight hints the preceding in-session weight (including through untouched blank sets). Rows, keypad and Done use the same rule; untouched Next leaves the hint uncommitted, Done accepts it, and reps remain blank until typed. Existing history/progression hints retain priority. Empty progress exposes an accessible 0–100 range at 0%, avoiding the native 0/0 percentage.

Six component regressions cover keyboard-height padding and result selection, dismissal/reopening across sheets and fresh sessions, exercise-options cancel/reopen/action, in-session hints/Next/Done/manual reps, empty progress accessibility, and suggestion targeting. No dependencies or sync/auth/schema/backend changes. No git writes or simulator runs; native iOS keyboard geometry and presentation timing still need coordinator confirmation.

Validation: typecheck/lint PASS; Expo Doctor PASS 20/20; dependency check PASS; Jest PASS **545 tests / 26 suites**. Root `npm test` has no configured script. Telemetry and dotenv loading disabled; caches redirected to `/tmp`.


## Visual-fidelity round 1 (2026-10-18)

Shared semantic tokens now include the brighter Sea Glass accent and accent-tinted surfaces. Source PNG measurements (1206×2622 / 3): 16 pt page inset, 12 pt card gaps, 60 pt folded exercise cards, 48 pt set rows, 38 pt visible input/check shapes with expanded touch areas, and 52 pt keypad keys. Logger headers, chips, done-row fills, hint typography, keypad value/plate/grid layout, tall rest sheet and summary hero/stats/PR/shelf have been refined in both themes. System appearance remains the default in demo. Light Sea Glass is slightly darker than the sampled mockup to retain the existing 4.5:1 text-contrast gate. The token art remains a synthetic SVG approximation, not the final rendered 3D asset.

The picker keeps one native presenter, uses immediate native dismissal to avoid the close/reopen animation race, removes hidden sheet descendants, and remounts fresh search/results on every open. Timer −15/close/minimize remain VoiceOver actions; visible controls are +15 s and Skip. Keypad/rest dismiss through backdrop, back, escape or downward handle swipe. Suggestion dismissal is a long press or accessibility action, with no large X. Counted copy uses the tested `pluralize` helper.

Coordinator fixture links, available only in development **and** signed-out demo mode:

- `insight://dev/logger-fixture?state=logger&offline=1`
- `insight://dev/logger-fixture?state=keypad&offline=1`
- `insight://dev/logger-fixture?state=rest&offline=1`
- `insight://dev/logger-fixture?state=summary&offline=1`

`offline=0` uses normal demo badge copy. Open after entering Look around first. The native-intent gate allowlists only these states; the route dynamically loads the separate fixture module after checking development/demo/account guards. Release links and signed-in calls do nothing to the repository. All seeded rows use the existing repository API; history produces six genuine prior PR tokens and the completed fixture produces the seventh. Reopening replaces the previous synthetic fixture session and preserves its synthetic history; an existing demo workout is finished before the fixture starts. No network, auth, schema, sync engine or server changes are involved.

Two supplied fixture details conflict with the mockup: 3+3+4+3 is **13 sets**, so the fixture reports 13 rather than inventing 16; completed volume is likewise derived from its actual rows. The specified previous Bench 8/8/7/6 session cannot trigger the production all-working-sets-hit rule. A development/demo-only local presentation hint supplies 190 and the two-set explanation for the screenshot; production progression and untyped reps remain unchanged. Summary dates reflect the generated session. No AI summary or placeholder is present.

No simulator/emulator or native build was run in this round. Pixel-level screenshot comparison, native animation/reopen timing, VoiceOver feel and largest Dynamic Type still need the coordinator's device pass. Typecheck, lint, Doctor and complete Jest results are recorded below after verification.

Round 1 validation: `EXPO_NO_TELEMETRY=1 npx tsc --noEmit` PASS; `npx expo lint` PASS without warnings; `npx expo-doctor` PASS **20/20**; `npm test -- --ci` PASS **572/572 tests in 29 suites**. Dependency check at kickoff: up to date. All Expo commands also disabled dotenv, with npm cache and Expo home under `/tmp`. Machine-readable results: `/tmp/p3-fidelity-results.json`. Coverage includes collapsed/expanded cards, full-width done styling, chips, plurals, picker removal/reopen, both system appearances, rest accessibility actions, newest shelf token, native fixture intents, actual fixture states and development/demo/signed-in guards. No app dependencies were added. No Git writes or simulator/native-build operations were performed.

## Round 2 (2026-10-18)

Fixture requests now own their full-screen presentation instead of replacing the nested workout stack. Each native fixture link receives a fresh request id; the previous presentation unmounts before seeding, and the finished session is committed before its summary renders. Unfocused logger routes hide their native sheet presenter and mini bar. Regression coverage opens logger → keypad → rest → summary → logger in dark then light without relaunching, reopens an identical logger link after manually opening its keypad, and opens a summary fixture over a normal logger keypad.

Fixture-owned Previous history is rebuilt immediately before the live session, repairing cached round-1 fixtures and preventing unrelated newer demo history from replacing 185 × 8 / 8 / 7 / 6. The keypad shows 185 × 7. Reps display muted template-target hints (matching history when no target exists); the draft remains blank until typed, and Done still requires entered reps. Production progression/history selection is unchanged.

Measured Finish artwork is 204 × 99 px / 3 = 68 × 33 pt (with an expanded hit area); its label is 15 pt and the centered title is 18 pt. Overflow dots use the normal muted token. Summit SVG art adds a shaded rim, highlight and ground shadow. Both-theme tests cover tinted done rows, filled checks and their glyph colors, chips, summary cards and Done. Existing differences remain: 13 actual fixture sets/derived volume rather than the mockup's 16/14,820, generated dates, contrast-preserving light accent, and approximate SVG token art. No AI card or placeholder. No dependencies, Git writes, simulator/emulator runs or native generation/builds; native pixel verification remains with the coordinator.

Round 2 validation: TypeScript PASS; Expo lint PASS without warnings; Expo Doctor PASS **20/20**; Expo dependency check PASS (up to date); complete Jest PASS **578/578 tests in 30 suites**. Results: `/tmp/p3-round2-results.json`. Commands disabled telemetry and dotenv, used `/tmp/insight-npm`, and redirected Expo's cache with its shell-only `__UNSAFE_EXPO_HOME_DIRECTORY=/tmp/insight-expo` override after the default home cache was blocked by the sandbox.


## Round 3 (2026-10-18)

Scope: M2, plan §5.5/§5.6; Q22/Q23. Logger chrome stays outside the bounded exercise ScrollView, with explicit top safe-area padding (initial window inset fallback), no automatic list inset adjustment, and a nonshrinking header. There is no active-exercise auto-scroll in this implementation. Rest artwork now uses a broad, closed organic contour: at 1:05, four complete inner rings plus a 5/15 outer arc over a full faint track. The active dash starts at twelve o'clock and measures perimeter length. Artwork spans about 320 pt on the 402 pt reference screen, with bold centered time; sheet top spacing was tightened to match the handle/REST placement. Reduced-motion cadence, Converge preference, absolute expiry, haptics and accessible timer actions remain intact.

Older shelf tokens use semantic grey-green face, rim and highlight colors in both modes; only the new shelf token keeps full accent and its + badge. Regression tests cover pinned header/list separation and top padding, closed full rings and outer fractions across block boundaries/zero, plus muted versus newest token gradients in both themes. Mutation checks confirmed these tests reject missing top padding, open/gapped contours and accent-colored older tokens.

No dependencies, Git writes, simulator/emulator runs, prebuilds, sync/auth/schema/backend changes, AI or analytics. Pixel-level confirmation remains with the coordinator because device runs are excluded. Existing differences remain: synthetic SVG token art, 13 actual fixture sets and derived volume, generated dates, and the contrast-preserving light accent. AI summary remains out of scope without a placeholder.

Round 3 validation: TypeScript PASS; Expo lint PASS without warnings; Expo Doctor PASS **20/20**; kickoff dependency check PASS (up to date); complete Jest PASS **586/586 tests in 30 suites**. Commands disabled telemetry/dotenv and used the existing `/tmp` npm/Expo caches. Eight regression cases added; targeted suite PASS 58/58.

## Quinn PR #73 minor fixes — Oct 18

M2 logger review items 1–8 (plan §5.5/§5.6/§9; Q15/Q23): owner wipe tests now cover weekly attribution and milestones while preserving demo rows. Real-SQLite fixture coverage rejects an account-owned repository even with demo enabled, exercises individual route gates and one-gate-only combinations, and checks zero outbox rows for rejected and valid demo fixtures. Nested `atomic()` failures mark the outer transaction rollback-only even if caught; sync mutation entry points (`ack`, `applyPage`, `flagConflict`) and `wipe` reject calls during a logger transaction. Regression tests verify rollback leaves no rows, outbox work or notifications, and subsequent transactions recover.

Picker searches reset the results offset without animation. PR haptics follow the in-app haptics setting independently of Reduce Motion; both motion settings and disabled haptics are tested, retaining once-per-summary behavior. Attribution coverage explicitly verifies that a main muscle repeated as a helper counts once. The dark rest track uses `text-muted` at 40% opacity; light retains `surface-2`. Both token choices are tested. No dependencies, synced columns, sync engine, auth or server files changed; no Git writes or device/build commands were run.

Review-fix validation: TypeScript PASS; Expo lint PASS; full Jest PASS **605/605 tests across 30 suites**; Expo Doctor PASS **20/20**; dependency check PASS. Telemetry and dotenv loading disabled; Expo's cache redirected to `/tmp/insight-expo` for the dependency check after the default cache was blocked by the sandbox.
