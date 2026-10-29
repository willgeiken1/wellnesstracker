# AGENTS.md — wellnesstracker (Insight Daily native)
DRAFT 2026-10-16. Hold until FREEZE LIFTED; lands via a docs-only draft PR (Quinn review → Will's go).

## 1. Source of truth
- Plan: `library/work/native-rebuild-plan.md`. **§0 overrides every other section.** Answers: `native-rebuild-answers.md` (Q1–Q133, all decided). Never change or reinterpret a Will decision; if the plan seems wrong, stop and ask in the PR.
- Each PR implements a named plan section + milestone (M0–M5, §15.2). No scope beyond it.
- Skills and version notes: `native/docs/agents/` (expo-dev-builds, healthkit-rn, health-connect-rn, ios-widgets-live-activity) and `native/docs/reference/`. Re-check versions with `npx expo install --check` at kickoff. Scope tables (Health types, widgets) live in the plan (§10.1 / §10.2); skills cite them.

## 2. Stack pins (do not substitute)
- Expo **SDK 58** (RN 0.88, New Architecture, Hermes, strict TS). Scaffold with `npx create-expo-app native --template default@sdk-58` (default still gives 57). **Development builds only**, never Expo Go. CNG: config plugins only; never hand-edit or commit `native/ios` / `native/android`.
- HealthKit: `@kingstinct/react-native-healthkit` (v16+) **+ `react-native-nitro-modules`** (required peer).
- Health Connect: **`react-native-health-connect` v4+** (built-in config plugin) + `expo-build-properties` (minSdk 29, compile/target 36). **Never install `expo-health-connect`** (deprecated; duplicate-class build failure).
- Widgets / Live Activity / Android ongoing notification: `expo-widgets` (`createWidget`, `createLiveActivity`, `createCustomNotification`). Default for the Android ongoing notification: `createCustomNotification`; confirm +15/Skip actions in the M3 spike, fallback a small Expo module. Do not pin before the spike. No react-native-android-widget.
- Bundle/package `com.insightwellness.app`; widget extension `com.insightwellness.app.widgets`; App Group `group.com.insightwellness.app` (single source — skills use these ids). iOS 17+, Android 10+ (API 29); phone only.
- Code lives in `wellnesstracker/native/`. The first native PR must add `native` and `native/` to `_config.yml` `exclude:` so GitHub Pages never publishes it.

### Product decisions a coder can't infer
- **Account required** (Q12) with **"Look around first" demo mode** (Q90).
- **US-only** (Q114).
- **Row-level sync** at native launch (Q2); no blob/bridge.
- **Notifications local only** in v1 (Q67); no APNs.
- **Separate free Sentry and PostHog projects** for native (Q130).

### Paid-team boundary
Real-iPhone builds with HealthKit, App Groups (widgets / Live Activity snapshots), or background delivery need the paid Apple Developer team (accounts last, §0.1). Until then: **iOS simulator** + **Android Studio Pixel emulator** only. **Will has an iPhone only (Oct 16 8:35 PM CT)** — no personal Android phone, USB debugging, or phone screen lock. A free Personal Team can sideload a stripped build for the real-week logging test (Q129) but cannot sign HealthKit or App Groups entitlements; Health-based features stay on the simulator until the Apple account is bought. Real Android hardware before Play launch = Play closed testing (12+ testers) or an optional borrowed phone — not a gate. Local-only Live Activities (Q67) need no APNs. Simulator HealthKit works (add samples in Health.app); confirm App Groups / widgets on the sim in the M0 spike.

## 3. Commands (run from `native/`)
| Task | Command |
|---|---|
| Install dep (SDK-matched) | `npx expo install <pkg>` |
| Regenerate native projects | `npx expo prebuild --clean` |
| iOS simulator dev build | `npx expo run:ios` |
| Android Pixel emulator dev build | `npx expo run:android` (start Pixel AVD first; Health Connect test data) |
| Dev server | `npx expo start --dev-client` |
| Typecheck / lint / unit | `npx tsc --noEmit` · `npx expo lint` · `npx jest` |
| Dependency health | `npx expo-doctor` · `npx expo install --check` |
| PWA + quota suite (repo root) | `npm test` (must stay green) |
Local builds are free. **No paid EAS builds**; free-tier EAS only when the plan says so. Skills link here; do not duplicate this table.

## 4. Hard rules
1. **No health data to AI.** Health/HealthKit/Health Connect/Oura values, body weight, check-in mood, energy and stress values, and anything derived never go to any AI model, Sentry or PostHog. AI payloads go through the ported `strip.ts` guard (fail-closed allowlist) with tests; the AI workout summary (Q46) sends no health values.
2. **Fixtures only.** Use synthetic/demo data (`native/fixtures/`). Never read, copy, paste or log real user data, real Health data, or production DB rows.
3. **No secrets.** Never read, print, move or commit keys, tokens, `.env` contents or keychain items. Only the Supabase publishable key and public client DSNs belong in the app, set by Will. Never use the service-role key. Local Supabase (`supabase start`) for sync work. **Never copy or move secrets between the box and the Mac (either direction); Will sets env values on the Mac himself.**
4. **No spend.** No paid tiers, credits, hosted Supabase branches, or paid builds. Medium reasoning effort; never the top model.
5. **Safety.** No `danger-full-access`, no force-push, no edits to `main`, no merges, no deleting branches you didn't create.
6. **Check-ins kept in native (Will, Oct 28 2026 10:16 PM CT, supersedes Q47).** Mood, energy and stress check-ins are an optional Home tray tile that syncs for signed-in users. Mood, energy and stress values never go to any AI model, Sentry or PostHog (rule 1). Sync follows the normal guards (draft PRs, Quinn review, no health data to AI/analytics), and `ROW_SYNC_ENABLED` stays off until Will says otherwise. Q47 (Oct 16, "no check-ins in native") is superseded for the tile only. The 988 crisis card ships with the check-in tile (Will, Oct 29 2026 4:46 AM CT, lifts the earlier crisis-card ban): crisis words are matched on the phone only, with no network call of any kind. Still banned until Will rules: the importer ignores check-in data. The tile can't ship until the egress tests (sentry-scrub, usage, describe) include mood, energy and stress as sentinel fields.

## 5. Workflow
1. `git worktree add ../wt-native-<topic> -b native/<topic> origin/main` (outside ~/agent-os).
2. Tests first (TDD); port golden fixtures before porting logic.
3. Small commits; push the branch; open a **draft PR** filled with the template. Never mark ready, never merge.
4. **Cross-family review:** Codex-written code → Claude (Quinn) reviews; Claude-written code → GPT/Codex reviews. After Quinn PASS + green CI, the EA may merge **LOW-risk** native PRs; anything above LOW needs Will's go. HIGH risk (privacy, sync, auth, deletion, AI, Health) needs Will's explicit go. Matches plan §0.1.
5. Fix review findings on the same branch; reply per finding ID.

## 6. Definition of done
Typecheck, lint, Jest and `npm test` green · golden fixtures match · egress/leak test passes (no health fields in AI/Sentry/PostHog payloads) · dev build launches on **iOS simulator** and **Pixel emulator** · screenshots attached · plan section + Q numbers cited.
