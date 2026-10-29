# Insight native redesign contract (INS-00)

Status: DRAFT, docs only, Oct 28, 2026. Scope: the native iPhone app in `native/` (I1). The PWA gets a light polish only (INS-11) and is out of scope here.

Binding inputs, newest first:
- `decisions-ui.md`: Will's UI interview answers I1-I12 and X1 (Oct 28, 9:38-9:48 PM CT). These override everything below them.
- Prototype v2 (`insight-mockup-v2/insight-prototype-v2.html`, Oct 23) is the visual source of truth (I2). I3 (the Claude canvas export) was skipped, since v2 answers it.
- `ui-redesign-2026-10-28/`: PLAN.md, SOURCE-DESIGN.md, CHECKLIST-insight.md, before/CRITIQUE.md, task-breakdown.md.
- `design/README.md` (D3-D24 token and component rules) and `native/src/design/tokens.ts` (+ `tokens.json`).

Rules for anyone building from this file:
- This file specifies layout and behaviour only. Final colour, type and motion values come from the INS-01 token proposal. Until Will's save tap, build against the current `tokens.ts` names. **Never edit `tokens.ts` or `tokens.json` outside INS-01.**
- Every example number here is synthetic. Real health values never appear in specs, shots, fixtures or analytics (AGENTS.md §4.1-4.2).
- The 2D body map is built on **react-native-body-highlighter** (MIT licence).
- Kai owns the body map component. No redesign task changes its component, frame size or props (CHECKLIST M8).
- Tab labels stay as shipped (Q3): Home, Workouts, Food, Progress, Insights. This file uses "Train" for the Workouts tab and "Eat" for the Food tab, matching the task names. Nothing is renamed.

---

## 1. Principles

### 1.1 Branded surfaces and data, native controls (I5)
- **Branded:** background and surface tones, the accent, the pillar data colours (training, food, recovery, sleep, water), rings, charts, the body map card and the Score.
- **Standard iPhone controls, unstyled beyond tint:** the tab bar (`NativeTabs` from `expo-router/native-tabs`, Liquid Glass on iOS 26, with a solid `bg` fallback under Reduce Transparency), large titles (`headerLargeTitle` on every tab root), and sheets (`@expo/ui` `BottomSheet` or a router `formSheet`/`pageSheet` with a grabber and detents). Also pickers and segmented controls (`@expo/ui` `Picker`, `variant="segmented"`), `Switch`, `Slider`, `DateTimePicker`, context menus (`@expo/ui` `ContextMenu`), grouped lists (`@expo/ui` `List`/`Section` for short fixed rows; `FlatList` for long lists), `RefreshControl`, `ActivityIndicator`, and SF Symbols via `expo-symbols`.
- Native controls take only `tintColor` = `accent`. No custom-drawn switches, segmented controls, back chevrons or title text. The existing `@/components/segmented-control` is replaced by the native segmented `Picker` in INS-04.
- No floating pill tab bar and no custom centred dialogs ("the Web Modal"). Consequential confirms use the system `Alert`; everything else is a sheet.

### 1.2 Cards only for the body map and the Score; everything else on tone-stepped panels (I12)
| Surface | Used for | Look |
|---|---|---|
| Page (`tone 0`) | Screen background | `bg` |
| Panel (`tone 1`) | The brief, the week strip, today's workout, the food ring, every tray widget, grouped content blocks | `surface.panel` (v2's derived `surface2`: `surface` mixed 7% toward `text` in dark, 5% in light). **No border, no shadow**, `radius.card` |
| Card (`tone 2`) | **Only** the body map card and the Insight Score card on Home | `surface.card` (v2 `surface`), `radius.card` (12 pt, D12) plus the soft shadow (D11), or a hairline in light mode |
| Grouped list | Settings, routines, meals, history | Native inset-grouped list, hairline separators (`hair`) |

Spacing: row gap < group gap < section gap (`space.s` 8 / `space.l` 16 / `space.xl` 24). Screen edge padding is `space.l`. No nested panels inside panels. No decorative pastel slabs. Saturated colour appears only as a pillar colour, the accent, or a status colour, and always means the same thing (CHECKLIST M2).

### 1.3 Type (X1)
- All labels are **sentence case, semibold, 13-15 pt**. Use iOS text styles so Dynamic Type works: `footnote` (13) semibold for tile and section labels, `subheadline` (15) semibold for row titles and panel headers.
- **No `textTransform: 'uppercase'`, and no `letterSpacing` on labels.** Native list section headers must render sentence case (custom header `Text`, not the default uppercased header).
- Numbers: a large number with a small muted unit (D13), tabular figures everywhere (D8, `fontVariant: ['tabular-nums']`).
- Body text is `body` (17). Tab labels are system. Nothing below 11 pt; nothing clips at the largest Dynamic Type size.
- Font: SF Pro (system). v2's Lexend is mockup-only unless INS-01 proposes it.

### 1.4 Motion (I6)
Custom motion exists **only** for the four I6 signature moments (§4) and the one-time tray glow (I9b). Everything else is either system-provided (sheet presentation, push, tab switch: tabs never slide) or functional press feedback (opacity, 100-150 ms). No looping, breathing or idle animation. Every animation goes through the shared Reduce Motion hook (D12).

### 1.5 Voice
Plain facts (Q20). An error states the fact plus one fix (FP71). Specific actions ("Start Push day", "Log breakfast"), never "Get started". No health claims, no exclamation marks, no "Oura" in headlines. The demo shows an "Example data" chip in the header, never a banner (Q25).

---

## 2. Home

### 2.1 Layout
```
┌ Large title "Home" ─────────── [Edit•]  (Score ring 32pt) ┐  ← nav bar
│ Tue, Oct 28 · [Example data]              (demo only)     │
│ ┌ CARD: Body map ───────────────────────────────────────┐ │
│ │  Kai's body map component (slot + frame unchanged)    │ │
│ └───────────────────────────────────────────────────────┘ │
│ ┌ CARD: Insight Score ──────────────────────────────────┐ │
│ │  ring · score or "Needs 5 more days" · 3 pillar rows  │ │
│ └───────────────────────────────────────────────────────┘ │
│ ▭ PANEL: Today's workout  "Push day · 6 exercises" [Start]│
│ ▭ PANEL: Food ring  ring + "1,240 of 2,100 kcal" (synth.) │
│ … tray widgets the user added, in their chosen order …    │
└───────────────────────────────────────────────────────────┘
```
- Scroll view first child, `contentInsetAdjustmentBehavior="automatic"`, `RefreshControl` (pull = sync + ripple, §4).
- Nav bar right items: `Edit` (plain text button; it carries the unlock dot, §2.4) and the **Score ring** (32 pt, tappable → Score detail push). Avatar → Settings sits at the left of the large-title row.
- **Starting Home (nothing connected) is exactly 4 widgets, in this order (I9a):** `bodyMap`, `insightScore`, `todayWorkout`, `foodRing`. Only the first two are cards (I12).

### 2.2 Insight Score (I8)
- On by default for new users. It can be hidden in Settings › Insight Score; hiding it removes both the header ring and the card.
- **From day 1** the header ring shows a progress ring with the centre label "Needs N more days" (VoiceOver: "Insight Score needs 5 more days of logging", synthetic N). The arc fills with days logged toward the baseline. Once there is enough data, the centre shows the score number.
- The card mirrors this: the ring, then "Needs N more days" or the score, then 3 pillar rows (training, food, recovery) with pillar colours, then "How it's worked out" → Score detail (visible equations, adjustable weights, a one-line disclaimer: FP41).
- The baseline length (N's source) belongs to the Score model, not this file. Threshold is 7 days (Q-B, resolved; I8/Q7).

### 2.3 Widget catalogue (I9, I9a)
Every PWA extra survives as an optional tray widget. "Default" = on the starting Home. Ids are the INS-02 registry ids.

| # | id | Title (sentence case) | Required service | Default | Surface | Notes |
|---|---|---|---|---|---|---|
| 1 | `bodyMap` | Body map | none | **yes** | card | Kai's component; frame unchanged |
| 2 | `insightScore` | Insight Score | none | **yes** | card | "Needs N more days" from day 1 (I8) |
| 3 | `todayWorkout` | Today's workout | none | **yes** | panel | Planned or last routine + Start; Resume when active |
| 4 | `foodRing` | Food | none | **yes** | panel | Calorie ring + 3 macro arcs; absorbs PWA "Food today" |
| 5 | `water` | Water | none | no | panel | **Designed now, build in M3** (I10); see §3.2.4 |
| 6 | `weekStrip` | This week's days | none | no | panel | Week strip with tiny rings (D29) |
| 7 | `brief` | Brief | none | no | panel | PWA "Morning brief"; 2-3 lines, time-of-day title |
| 8 | `yourWeek` | Your week | none | no | panel | PWA "This week" recap |
| 9 | `headline` | Daily headline | none | no | panel | PWA extra |
| 10 | `pattern` | Today's pattern | none | no | panel | PWA extra |
| 11 | `weeklyGoal` | Weekly goal | none | no | panel | PWA extra |
| 12 | `weeklyReport` | Weekly report | none | no | panel | Opens Insights › Weekly |
| 13 | `trendChips` | Trend chips | none | no | panel | Gaining / maintaining / losing chips (PWA) |
| 14 | `foodYesterday` | Yesterday's food | none | no | panel | PWA extra |
| 15 | `weightTrend` | Weight trend | none | no | panel | Sparkline only; no value in analytics |
| 16 | `cardio` | Cardio | none | no | panel | PWA extra |
| 17 | `cardioMinutes` | Cardio minutes | none | no | panel | PWA extra |
| 18 | `musclesWeek` | Muscles this week | none | no | panel | PWA extra; links to Insights › Muscles |
| 19 | `workoutPrint` | Workout print | none | no | panel | Contour fingerprint (D114) |
| 20 | `checkIn` | Check in | none | no | panel | Optional tray tile: mood, energy and stress check-ins that sync for signed-in users (Will, Oct 28 2026 10:16 PM CT, supersedes Q47). **Unblocked for INS-02/INS-05.** |
| 21 | `steps` | Steps | Apple Health or Oura | no | panel | |
| 22 | `sleepDuration` | Sleep duration | Apple Health or Oura | no | panel | |
| 23 | `hrv` | HRV | Apple Health or Oura | no | panel | |
| 24 | `sleepScore` | Sleep score | Oura | no | panel | PWA extra |
| 25 | `readiness` | Readiness | Oura | no | panel | PWA extra |
| 26 | `lastNight` | Last night | Oura | no | panel | PWA extra |
| 27 | `restingHr` | Resting heart rate | Oura | no | panel | Oura only: no heart rate read from Apple Health (Q125) |

Fitbit and WHOOP are later services (I9). Their widgets are stubs in the registry and don't appear in the tray until a connector ships.

### 2.4 Edit / Add widgets tray (I9, I9b)
- **Entry:** `Edit` in the Home nav bar opens a `pageSheet` titled "Edit Home", with `Done` on the right.
- **Section "On Home":** native list in edit mode, with drag handles to reorder and a minus button to remove. `bodyMap` and `insightScore` can be removed like any other widget (I9: "curated default", not locked).
- **Section "Add widgets":** grouped by source. "Always available" comes first, then "Apple Health", then "Oura". Each row shows the SF Symbol, title, a one-line description, and a `+` button. Rows for an unconnected service are dimmed, and the group footer is one "Connect Apple Health" / "Connect Oura" row → Settings › Health & devices. No upsell copy.
- **Unlock cue (I9b):** when connecting a service unlocks widgets:
  1. A **6 pt accent dot** appears at the top-right of the `Edit` label (VoiceOver: "Edit, new widgets available"). It clears the first time the tray opens.
  2. In the tray, each newly unlocked row **glows once**: an accent outline that fades in and out over 1.2 s, the first time that row is visible. It never glows again (persisted per widget id). With Reduce Motion, the row gets a static `accentSoft` background for that one viewing instead.
  3. **No alerts, sheets, toasts or banners** about the unlock. The v2 "New tiles are ready" card is dropped.
- States: the tray is all local, so it has no loading or offline state. An empty "On Home" list shows "Nothing on Home. Add a widget below."

### 2.5 Health no-data state and permissions sheet (I7)
- When a Health-backed widget (or Recovery) has no samples (iOS can't tell "denied" from "no data"), the widget shows its title plus a **gray** line: **"No data from Health yet"** (`text.muted`, no pillar colour, no chart).
- Tapping it opens a medium-detent sheet titled "Check Apple Health":
  1. "Open the Health app, tap your profile, then Apps › Insight Daily."
  2. "Turn on the categories you want to share (Steps, Sleep, HRV)."
  3. "Make sure the app or device that records them (for example your watch or Oura) is writing to Health."
  4. "New data shows here within a few minutes."
  - Buttons: "Open Health" (primary, opens the Health app) and "Done".
  - Footer: "Insight only reads what you allow. Health data never goes to AI or analytics."
- Oura expired: a gray widget with "Oura disconnected" and a "Reconnect" button (FP73).

### 2.6 Home states and acceptance
- **States:** first launch (4 defaults, body map empty state "Your map fills in as you log", Score ring "Needs N more days"); data; demo (Example data chip); offline (slim top banner "Offline · logs save here and sync when you reconnect.", FP51); sync error (a panel row with the fact + "Try again"); Health no-data (§2.5).
- **Accept:**
  - [ ] A fresh install renders exactly `[bodyMap, insightScore, todayWorkout, foodRing]`.
  - [ ] Exactly 2 card surfaces on Home.
  - [ ] The Score ring is in the header on day 1, with "Needs N more days".
  - [ ] Edit dot + one-time glow are wired to INS-02 state, with no modal API.
  - [ ] "No data from Health yet" opens the sheet.
  - [ ] Largest Dynamic Type: no clipping.
  - [ ] Every target ≥ 44 pt.

---

## 3. Screen specs

Shared across all tabs: large title, `Example data` chip in demo, the offline banner, the four data states (loading = skeleton panels only when a load exceeds 0.3 s; empty; error; content), 44 pt targets, and sentence-case labels.

### 3.1 Train (Workouts tab)
- **Layout:** large title "Workouts". Segmented `Picker`: Routines / History / Cardio.
  - **Routines:** an "Up next" panel (routine name, exercise count, `Start` primary button), then a grouped list of routines (pillar-training SF Symbol, name, last done), then "New routine" and "Start empty workout" rows. Long-press → `ContextMenu` (Edit, Duplicate, Delete with system confirm).
  - **History:** a grouped list by week. Each row: date, routine, volume (tabular), workout print thumbnail, PR badge.
  - **Cardio:** a weekly minutes ring panel and a 2x3 machine grid of panels.
- **Logger (push, not a tab):** dense set rows (weight × reps, a check that triggers `haptics.setDone`, swipe to delete), the custom keypad (branded), the rest timer as a pinned bottom bar (−15 / +15 / Skip, ≥ 44 pt). The plate calculator is a `BottomSheet`.
- **Finish:** a finish sheet (duration, date `DateTimePicker`, notes) → summary push (time, volume, PRs, print). FP96.
- **States:** no routines ("No routines yet" + "Start empty workout"); no history ("Your finished workouts show here"); active workout (Resume bar); save error (fact + "Try again"; the draft is kept).
- **Accept:**
  - [ ] No coloured routine slabs.
  - [ ] Native segmented picker.
  - [ ] Set rows ≥ 44 pt.
  - [ ] Haptics only from the D13 list.
  - [ ] Four states captured.

### 3.2 Eat (Food tab)
- **Layout:** large title "Food" and a date pager (`‹ Today ›`).
  1. **Header panel:** calorie contour ring with 3 macro arcs (protein, carbs, fat), "1,240 of 2,100 kcal" (synthetic), macro rows with tabular numbers. The ⓘ button opens the targets info sheet ("Targets assume…" moves here).
  2. **Log row:** 5 equal native buttons (Search, Scan, Snap, Describe, Saved), SF Symbols with labels.
  3. **Water row (§3.2.4).**
  4. **Meals:** grouped list sections Breakfast / Lunch / Dinner / Snacks. Each row: food, amount, kcal. AI estimates show `est.` + a confidence dot (FP55) and a dashed ≈ arc in the ring (D63).
- **3.2.4 Water: designed now, build in M3 (I10).** In Food it's a row between the log row and Meals: a small vessel glyph, "750 of 2,500 ml" (synthetic), and quick-add container buttons (glass, bottle). Tap adds the default container; long-press opens container choice; drag fills (`haptics.waterTick`, `haptics.waterGoal`); 5 s undo toast. Colour is `pillar.water` (token pending, Q-C). Hidden behind a feature flag until M3. The INS-08 layout reserves the slot, so turning it on causes no reflow.
- **States:** empty day ("Nothing logged today" + "Log breakfast"); barcode not found ("Barcode not in the database" → Describe / Snap, with the code kept: FP54); AI quota reached (inline row, FP72); offline (logs queue locally); error.
- **Accept:**
  - [ ] The ring header and 5-button row fit above the fold at 375×667.
  - [ ] Meals use a grouped list, no pink slabs.
  - [ ] The water slot is present in the layout spec, flag off, and marked M3.
  - [ ] No food or health values in AI payloads beyond the `strip.ts` allowlist.

### 3.3 Progress
- **Layout:** large title "Progress". Segmented `Picker`: Body / Photos / Goals & PRs.
  - **Body:** a weight chart panel with a range `Picker` (1M / 3M / 1Y / All), the latest weigh-in row, and measurements as a grouped list with sparklines.
  - **Photos:** a 3-column grid.
  - **Goals & PRs:** goals with dashed projection + ETA; PRs list.
- **Body map slot:** wherever the body map renders, the slot, frame and props are **unchanged**. Kai owns them (CHECKLIST M8). This contract only sets the surrounding spacing.
- **States:** no weigh-ins ("Add your first weigh-in" → native sheet with a numeric field); no photos; no goals; error.
- **Accept:**
  - [ ] Diff touches no body map component files.
  - [ ] The chart uses the training/recovery pillar colour rule.
  - [ ] Four states.

### 3.4 Insights
- **Layout:** large title "Insights". Segmented `Picker`: Trends / Recovery / Muscles / Weekly.
  - **Trends:** "What affects you" pattern panels first (effect direction arrow, plain sentence, "Correlation, not cause"), then 14-day chart panels (calories, training volume). Charts trace per §4.
  - **Recovery:** a sleep panel, HRV / sleep / steps tiles with source badges, and a 30-day band. Uses the Health no-data state (§2.5).
  - **Muscles:** the body atlas (Kai, unchanged).
  - **Weekly:** a timeline of weekly reports with the chart inline (no gray paragraph walls).
- **States:** fewer than 7 days ("Trends need a few days. Log for a week and patterns show up here."); Health no-data; Oura expired; error.
- **Accept:**
  - [ ] Recovery has no separate tab.
  - [ ] Single segment level.
  - [ ] No repeated gray report paragraphs.
  - [ ] Chart trace once per day.

### 3.5 Settings and Appearance
- **Settings** (avatar → push, large title): a search field, a profile row, then grouped sections: Account, Health & devices, Insight Score (`Switch`), Notifications, Appearance, Privacy, Data & export, About (with the one-line health disclaimer). `Switch` for booleans, `Picker` for enums, sentence-case section headers.
- **Health & devices:** rows for Apple Health and Oura, each with a status (Connected / Not connected / Reconnect). Later: Fitbit, WHOOP. Connecting triggers the I9b cue (§2.4).
- **Appearance:** a live preview panel (Home mini), a mode `Picker` (Auto / Light / Dark), the theme grid of the **13** palette swatches (§5: 11 open plus 2 secrets shown locked "???", with a "2 secrets to find" counter, FP11), then presets Basic / Calm / Fluid / Glass / Chrome / Max, the 4 axes (Theme, Material, Motion, Intensity: FP2), Effects (merged, FP95), "Back to Calm" (FP70), and a Reduce Motion note. Building all palettes is INS-10, after INS-01.
- **About → Credits:** a credit row for the 3D model: "Male base muscular anatomy" by CharacterZone, Sketchfab, licensed CC BY (attribution required). Also list react-native-body-highlighter (MIT).
- **Accept:**
  - [ ] All native controls.
  - [ ] Theme choice persists.
  - [ ] About shows the CC BY credit row for "Male base muscular anatomy" by CharacterZone (Sketchfab).
  - [ ] Locked secrets are not selectable.
  - [ ] Widget style offers only system Theme / Tinted (FP43).

### 3.6 Onboarding
Welcome → Account (Apple, Google, email: FP47; account required Q12, with "Look around first" demo Q90) → About you (goal Lose / Maintain / Gain, units, optional birthday / height) → Start (routine or empty) → Health (HealthKit request listing Steps, Sleep, HRV, with no heart rate per Q125; an optional Oura row, FP46) → optional skippable look carousel (FP6) → Home with the 4 defaults.
- Each step: a large title, one primary button pinned above the safe area (never under the keyboard), and "Skip" where allowed. The notification ask comes after the first finished workout (FP45), not in onboarding.
- **Accept:**
  - [ ] At most 3 steps + Health before Home.
  - [ ] Primary actions reachable at the largest text size.
  - [ ] Demo lands on Home with the Example data chip.

### 3.7 Empty, offline and error states (all tabs)
| State | Pattern | Copy shape |
|---|---|---|
| Empty | Panel with an SF Symbol, one line, one action | "Nothing logged today" + "Log breakfast" |
| Loading | Skeleton panels only after 0.3 s; never show empty before the first load resolves | n/a |
| Offline | Slim top banner, not a card (FP51) | "Offline · logs save here and sync when you reconnect." |
| Error | Inline gray row in place, not a modal (Q18) | Fact + one fix: "Couldn't sync. Try again." |
| Health no data | Gray widget + sheet (I7) | "No data from Health yet" |
| Oura expired | Gray widget + Reconnect (FP73) | "Oura disconnected" |

**Accept:**
- [ ] Every tab has empty, offline and error captured (CHECKLIST M7).
- [ ] At most one Oura connect entry per screen.

---

## 4. Motion spec (I6)
All motion uses Reanimated on the UI thread and animates transform/opacity (or stroke offset) only. Durations come from `motion[preset].durationMs` (D11). Values here are starting points for INS-06.

| Moment | Trigger | What moves | Duration | Never | Reduce Motion |
|---|---|---|---|---|---|
| Opening animation | **Once per app session.** First Home render after a cold launch; the session ends when the process is killed (Q-D) | Body map card + Score ring + food ring arcs sweep from 0 to value; panels fade up 8 pt, staggered 40 ms | ≤ 700 ms total | On tab revisit, foreground return, or pull | Final state shown instantly; no fade |
| Chart trace | **First visit to a chart each local calendar day** | Line stroke draws left → right; bars grow from the baseline | 600 ms | Second visit the same day; data refresh | Chart drawn complete |
| Glow | n/a | **Static.** Accent glow on the Score ring / map is a fixed style, not animated | none | Pulsing, breathing | Unchanged (already static) |
| Ripple | **Only on pull-to-refresh release** | One accent ring expands from the pull point and fades | 1 s | On load, on tap, on sync from other causes | No ripple; system `RefreshControl` spinner only |
| Tray unlock glow (I9b) | First time a newly unlocked row is visible in the tray | Accent outline fades in and out | 1.2 s, once | Ever again for that widget | Static `accentSoft` background for that viewing |

- Haptics are separate from motion and follow the D13 allowlist only.
- **Accept (INS-06):**
  - [ ] Session-once and day-once tests.
  - [ ] Reduce Motion test for each row.
  - [ ] No entrance replay on tab revisit (CHECKLIST M11).
  - [ ] Ripple fires only from `onRefresh`.

---

## 5. Palette (I4): input to the INS-01 token proposal
Count from `PALETTES` in `insight-prototype-v2.html` (line 466, parsed): **13 palettes**, of which 2 are secret unlocks (Midnight Neon, Holographic Chrome). The v2 critique's "12 palettes" undercounts; its own name list has 13. Each palette has **12 role colours**, each a dark / light pair.

| # | Name | Proposed id | bg | surface | text | muted | accent | onAccent | training | food | recovery | sleep | success | warn |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Sea Glass Tide | `seaGlassTide` | #0C1416 / #F2F6F4 | #142124 / #FFFFFF | #EEF5F3 / #122022 | #9DB3B0 / #556866 | #5FD8BC / #0E7A66 | #111111 / #FFFFFF | #93E07A / #3E7F1E | #F2A65A / #B4580E | #4AA8F0 / #1A6FB0 | #E9B2EC / #6B4FC4 | #5FD38A / #1F7A43 | #F2C14E / #8F6400 |
| 2 | Mountain Mist | `mountainMist` | #101417 / #EEF1F2 | #1A2026 / #FFFFFF | #ECF0F2 / #161C20 | #9AA7B0 / #58646C | #8FC1D9 / #2F6F8C | #111111 / #FFFFFF | #7DBF8E / #2F6B3E | #E3A86F / #9A5418 | #8FB4F0 / #2D5FA8 | #C3A3E0 / #7A4B9E | #79C99A / #2A6B44 | #E8C26A / #7F5E00 |
| 3 | Moonlight Dusk | `moonlightDusk` | #0E0F1A / #F1F1F8 | #181A2B / #FFFFFF | #EEEFFA / #161728 | #A2A5C2 / #5A5D78 | #A3ABFF / #4B55C8 | #0E0F1A / #FFFFFF | #6FD6C4 / #0F7466 | #F4A98A / #A64E2C | #8EC5FF / #2A62A8 | #C9A6FF / #7442B8 | #6FD69A / #24774A | #F2CC6B / #835F00 |
| 4 | Desert Mirage | `desertMirage` | #15110E / #F6F1EA | #211B17 / #FFFCF8 | #F6F0EA / #231B15 | #B5A698 / #6B5D51 | #F2B48A / #A85F33 | #111111 / #FFFFFF | #A9C77E / #3E5C1C | #F08C64 / #B85A3C | #7FC0C2 / #1F6E70 | #B9A2E0 / #6D4FA8 | #8CCB8A / #2F6E35 | #EFC461 / #80600A |
| 5 | Spring Citrus | `springCitrus` | #0F110C / #F4F5EE | #1A1D15 / #FFFFFF | #F3F5EC / #171A10 | #A3A893 / #5B6150 | #D5F56B / #5C7A08 | #0F110C / #FFFFFF | #D5F56B / #5C7A08 | #FF795C / #A85400 | #4FD1D9 / #0B7178 | #A99BFF / #5B4BC4 | #7EE08F / #25793A | #FFD24D / #7D6000 |
| 6 | Lotus Garden | `lotusGarden` | #121014 / #F7F2F3 | #1D1A20 / #FFFFFF | #F5F1F6 / #1E1720 | #AFA6B3 / #655A69 | #F28C82 / #B3443A | #121014 / #FFFFFF | #7ED9B0 / #16765A | #F28C82 / #B3443A | #86B8F2 / #2862A6 | #D1A3E6 / #83439E | #7ED99A / #26743F | #F0C860 / #7E5F00 |
| 7 | Aurora Fjord | `auroraFjord` | #0B1218 / #EFF4F6 | #152029 / #FFFFFF | #EDF4F7 / #10202A | #9CB0BC / #536873 | #62D2C8 / #0B6F6A | #111111 / #FFFFFF | #F2F28D / #A58B12 | #DF4323 / #78290D | #75D4EF / #2E87E0 | #C84AEB / #4F2484 | #6DD49A / #1E7444 | #F5C451 / #855C00 |
| 8 | Berry Meadow | `berryMeadow` | #120E13 / #F8F1F4 | #1E1820 / #FFFFFF | #F7F0F6 / #22131C | #B3A5B1 / #6A5562 | #F06FA0 / #B12A63 | #120E13 / #FFFFFF | #D5F4A1 / #4A9F13 | #E8AA2C / #723E13 | #305DE6 / #11268B | #E83063 / #D32A79 | #7EDB95 / #25763F | #F7CE5A / #7D5E00 |
| 9 | Golden Hour | `goldenHour` | #13110B / #F8F4EA | #1F1C14 / #FFFEFA | #F8F3E6 / #241E10 | #B9AF96 / #685F48 | #F2C14E / #8A6400 | #111111 / #FFFFFF | #E8BD2D / #6F4A15 | #CE3A37 / #CD6D58 | #70E5EF / #1990C2 | #784DEB / #4A2AB2 | #8FD39A / #2A6F3A | #F59E58 / #9A4A0C |
| 10 | Glacier Bloom | `glacierBloom` | #0D1117 / #F0F3F8 | #171D26 / #FFFFFF | #EEF2F8 / #121A26 | #A0ABBB / #56637A | #9DC4FF / #2758B8 | #0D1117 / #FFFFFF | #6DEAE7 / #119CA0 | #E66E8B / #9B2C4A | #8794CE / #132185 | #E4C675 / #938314 | #74D69C / #24733F | #F2B85A / #8E5300 |
| 11 | Forest Ember | `forestEmber` | #0C120E / #EFF4F0 | #162019 / #FFFFFF | #EDF5EF / #112016 | #9DB2A3 / #52685A | #7CD68E / #1F6E36 | #0C120E / #FFFFFF | #AEECAD / #255F39 | #E06245 / #C0502E | #4D6AEA / #4B92CC | #ECD358 / #87883A | #8CDCA0 / #246B3A | #FFB34D / #8F5200 |
| 12 | Midnight Neon (secret: neon) | `midnightNeon` | #060A1A / #EDEFFA | #0D1430 / #FFFFFF | #EAF0FF / #0B1030 | #8D98C6 / #5A6390 | #FF4FD8 / #C2189A | #111111 / #FFFFFF | #7CFF4F / #2E8A12 | #FF9A1F / #C25A00 | #3DA2FF / #1F5FD6 | #C77DFF / #8A2BE2 | #5FD38A / #1F7A43 | #F2C14E / #8F6400 |
| 13 | Holographic Chrome (secret: holo) | `holographicChrome` | #101215 / #E7EAEE | #1E2126 / #FBFCFD | #F4F6F8 / #15181C | #A3AAB3 / #5D646D | #E9B8FF / #8A3FB8 | #111111 / #FFFFFF | #9BE36D / #3F8A1C | #FFB36B / #B85D0E | #6EC1FF / #1E6DB8 | #E2A6FF / #8A47B8 | #79C99A / #2A6B44 | #E8C26A / #8F6400 |

Cells are `dark / light` hex, copied verbatim from v2. They are placeholder-grade: none is contrast-proofed until INS-01.

Other colours in v2, outside `PALETTES`:
- `water`: one shared placeholder `#4FC3F7` for every palette ("placeholder, token proposal"). INS-01 must propose a per-palette water hue distinct from `recovery` (Q-C).
- Derived per palette: `surface2` (the I12 panel tone), `hair` (text at 9%), `hair2` (text at 20%), `accentSoft` (accent at 16%), `ai` (accent/sleep mix), and `accentOnText`.
- Secret backgrounds: Neon uses a radial gradient; Holo uses a linear gradient.
- Duplicates to resolve in INS-01: Spring Citrus `accent` = `training`, and Lotus Garden `accent` = `food`. Both break "colour always means one pillar" (CHECKLIST M2).
- **Carry into INS-01:** these duplicate-colour notes go into the INS-01 token proposal as required fixes; INS-01 must resolve both.

### 5.1 Proposed token names (INS-01 proposal; do not apply here)
Theme ids are the camelCase palette names in the table (`seaGlassTide` … `holographicChrome`). Each id has `dark` and `light` modes. Leaf paths follow design/README.md (D3, meaning not looks):

| v2 role | Proposed token path (`themes.<id>.<mode>.…`) |
|---|---|
| bg | `color.surface.base` |
| surface2 (derived) | `color.surface.panel` (I12 panels) |
| surface | `color.surface.card` (map + Score cards, sheets) |
| text | `color.text.primary` |
| muted | `color.text.secondary` |
| accent | `color.accent.default` |
| onAccent | `color.text.onAccent` |
| accentSoft (derived) | `color.accent.soft` |
| training / food / recovery / sleep | `color.pillar.training` / `.food` / `.recovery` / `.sleep` |
| water (placeholder) | `color.pillar.water` |
| success / warn | `color.status.success` / `color.status.warning` |
| hair / hair2 (derived) | `color.separator.default` / `color.separator.strong` |
| ai (derived) | `color.ai.estimate` |
| secret | `meta.secret` (`neon` / `holo`), `meta.locked` default true |

**Today's names vs I4.** Today's `native/src/design/tokens.json` has two `themes` (`dark`, `light`) and four `accents` (`citrus`, `sea`, `dusk`, `sand`), with kebab-case leaves (`surface-2`, `text-muted`, `ring-oura`). `design/README.md` names `calm`/`dusk`/`sandstone`. I4 says both get renamed to the v2 list above. INS-01 carries the rename map, a contrast table for every pair (D6: 4.5:1 text, 3:1 graphics), and the save tap. `tokens.ts` stays untouched until then.

---

## 6. Decision index
| Id | Decision (short) | Implemented in |
|---|---|---|
| I1 | Redesign native iPhone; PWA light polish only | Header, Scope; INS-11 note |
| I2 | Prototype v2 is the visual source of truth | Header; §5 |
| I3 | Claude canvas export skipped (moot via I2) | Header (not used) |
| I4 | v1 ships v2's full palette list; tokens renamed | §5, §5.1, §3.5 |
| I5 | Branded surfaces/data + standard native controls | §1.1; native controls named in §2-§3 |
| I6 | Opening once/session; chart trace first visit/day; static glow; ripple on pull | §1.4, §4 |
| I7 | Health no data = gray "No data from Health yet" + permissions sheet | §2.5, §3.4, §3.7 |
| I8 | Score on by default; "needs N more days" ring in header from day 1 | §2.1, §2.2 |
| I9 | All PWA extras as optional tray widgets; service connect unlocks | §2.3, §2.4 |
| I9a | Starting Home = body map, Score ring, today's workout, food ring | §2.1, §2.3 rows 1-4, §2.6 |
| I9b | Unlock cue = dot on Edit + one-time glow; no pop-ups | §2.4, §4 |
| I10 | Water designed into Home + Food now, built in M3 | §2.3 row 5, §3.2.4 |
| I11 | App Store screenshot order: map, logger, AI food; after M3-01 | §7 |
| I12 | Cards only for body map + Score; rest on tone-stepped borderless panels | §1.2, §2.1, §2.6 |
| X1 | Sentence-case semibold 13-15 pt labels; no tiny tracked uppercase | §1.3; all titles in §2.3 |

## 7. App Store screenshot order (I11)
Keep the order: **1. map (Home), 2. logger (Train), 3. AI food (Eat: Snap / Describe)**. The store shots wait for M3-01 (the Home map hero). They're captured with demo/synthetic data only, after INS-12 QA.

## 8. Open questions for Will (do not resolve in code)
- **Q-A (resolved):** Check-ins stay in the native app as an optional tray tile (mood, energy, stress) that syncs for signed-in users (Will, Oct 28 2026 10:16 PM CT, supersedes Q47). AGENTS.md §4.6 still reflects Q47 and needs updating to match.
- **Q-B (resolved):** The full Score appears at **7 days** of data; before that, Home shows the "Needs N more days" countdown ring. Not 28 days (I8/Q7).
- **Q-C:** Water colour per palette (v2 has one shared placeholder that sits close to `recovery` blue).
- **Q-D:** "Once per session" is defined here as once per process launch, so a foreground return doesn't replay it. Confirm.
- **Q-E (resolved):** Home's body map is **react-native-body-highlighter** (2D, tappable), Will's Oct 28 pick. Kai's 3D model comes later; the card frame stays the same.
