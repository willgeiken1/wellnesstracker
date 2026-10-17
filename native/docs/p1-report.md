# Insight Daily P1 scaffold report

Updated: October 17, 2026. P1 merged via PR #67 at main `b5f145e`; P2a follow-ups: `native/p1-followups`.

## Follow-ups

Quinn's four P1 follow-ups are handled in P2a (`native/p1-followups`, based on main `b5f145e`):

- F1: Release local-network key stripping via [local config plugin](../plugins/withStripLocalNetworkingRelease.js), registered in [app.json](../app.json), with [Jest-free checks](../plugins/withStripLocalNetworkingRelease.test.js).
- F2: Canonical [release permissions](#release-permissions-recorded-at-p1-merge-main-b5f145e) below; coordinator artifact re-checks PASS (see below).
- F3: [README](../README.md) points here for permissions and cross-family review evidence.
- F4: [npm advisory triage](npm-audit-triage.md) records reachability, safe-fix assessment and before/after counts.

## P2a validation

No commits/pushes, device builds, prebuilds, EAS or native project edits. Checks used `EXPO_NO_TELEMETRY=1`, `EXPO_NO_DOTENV=1`, npm cache `/tmp/insight-npm` and a fresh Expo home `/tmp/insight-expo` (the first compatibility attempt hit the protected default cache).

| Check | P2a result |
| --- | --- |
| `node --test plugins/*.test.js` | PASS, 3/3: new and existing phases declare quoted plist input/stamp output paths that survive pbxproj serialization; repeated mod application is unchanged and leaves one app-target strip phase last, after framework embedding. Real PlistBuddy execution on synthetic plists strips all three local-network keys only in Release, preserves Debug/Profile and unrelated ATS settings, writes configuration-specific stamps, and tolerates absent keys/dictionary. |
| `npx tsc --noEmit` | PASS |
| `npx expo lint` | PASS |
| `npx expo-doctor` | PASS, 20/20 |
| `npx expo install --check` | PASS, dependencies up to date |
| `npx expo config --type introspect --platform ios` piped to key/plugin grep | Unsupported: installed SDK 58 CLI rejects `--platform`. Supported `npx expo config --type introspect` with the same grep passes and lists the plugin and ATS key. |
| iOS + Android production Metro exports with source maps into `/tmp` | PASS; advisory reachability evidence in [triage](npm-audit-triage.md). These are JS exports, not native builds. |
| Full / omit-dev npm audits | Exit 1 for known findings; unchanged 27 each (8 moderate, 19 high). |
| `git diff --check` | PASS |

The local-network keys remain in source configuration for Metro; stripping happens in the built Release plist. The coordinator's clean prebuild and Xcode 26.6 Release build (`npx expo run:ios --configuration Release`) found all three keys still present in `Release-iphonesimulator/InsightDaily.app/Info.plist`. The log placed expo-dev-launcher's strip phase, then Insight Daily's strip phase, then `[CP] Embed Pods Frameworks`, before `Preparing InsightDaily » Info.plist`. Both strip phases ran before Xcode wrote the processed plist, which overwrote their changes; both also warned about ambiguous dependencies. Expo-dev-launcher's stripping is therefore ineffective on this clean Xcode 26 build. The P1 "clean" plist result was likely from an incremental build, not reliable clean-build evidence.

The P2a fix declares `$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)` as the phase input so Xcode orders it after plist processing, with a configuration-specific stamp output under `$(DERIVED_FILE_DIR)` to track completion and rerun when the plist changes. The plugin updates its earlier phase in place, remains idempotent, and places it last after framework embedding as an additional ordering measure. Its Release-only script independently deletes `NSAppTransportSecurity.NSAllowsLocalNetworking`, `NSBonjourServices` and `NSLocalNetworkUsageDescription`, ignoring each absent key; Debug keeps all three for Metro/dev-launcher. Synthetic tests verify the script and project declarations; coordinator Release artifact verification passed (below). The root package has no `npm test` script; no web/PWA code changed.

## P1 status (historical)

Commits were made and pushed outside the sandbox; draft PR #67 is open and CI ran on GitHub. Quinn (Claude cross-family review) returned **PASS-WITH-MINORS, RISK LOW**. This update addresses M1–M6 below; the coordinator owns committing and pushing these edits. The release checks below were run on the Mac for this update.

Both development builds launched to the Home screen on October 17, 2026 (launch evidence supplied by the coordinator):

| Platform | Home screen reached | Screenshot on the Mac (not committed) |
| --- | --- | --- |
| iPhone simulator, iOS 26.5 runtime | About 3:39 AM CT | `~/Code/p1-ios.png` |
| Android emulator, Medium_Phone_API_37.0 | About 4:12 AM CT, after a couple of emulator restarts | `~/Code/p1-android.png` |

## Scope and implementation

P1 / M0 scaffold subset of native-rebuild-plan §0.1, §0.2 and §15.2; Q3/Q4/Q5/Q8/Q127. Root AGENTS.md and plan §0 take precedence. The supplied plan/answers/release sequence live in `../insight-native-prep/`; the release sequence records FREEZE LIFTED. Remaining M0 work (local Supabase, golden fixtures/Jest) is outside this scaffold.

- Scaffolded with `create-expo-app --template default@sdk-58`: Expo ~58.0.14, React Native 0.88.0, React 19.3.0, Hermes, New Architecture, strict TypeScript.
- Insight Daily identity, `com.insightwellness.app` on both platforms, `insight` scheme, iOS 17+ phone only, Android minSdk 29 via config plugin; SDK-matched dev client. Generated `native/ios` and `native/android` stay ignored and are never hand-edited.
- Temporary Home/Explore screens and Expo artwork remain; Home identifies Insight Daily. Template CSS/web-ref typing and hydration lint issues were repaired.
- Native CI and Pages exclusions (`native` and `native/`) are in place. No Health, auth, sync, widgets, telemetry SDKs, secrets or paid services configured. No native business logic or Jest/golden-fixture suite added.

## Review minors (Quinn)

| Finding | Handling |
| --- | --- |
| M1 | Added `expo.android.blockedPermissions` for `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`, using full `android.permission.*` names. Verified array format against [Expo SDK 58 app config docs](https://docs.expo.dev/versions/v58.0.0/config/app/#blockedpermissions) and installed config types. |
| M2 | Scoped CI push trigger to `branches: [main]`, retained both path filters and pull-request behavior, added a 15-minute job timeout and `npx expo-doctor` immediately after compatibility check. Existing action SHA pins retained. |
| M3 | Replaced stock `native/AGENTS.md` with a short addendum deferring to root rules: local SDK 58 dev builds, CNG/config plugins, SDK-matched installs, versioned docs, checks, draft-only workflow and secrets/main restrictions. EAS commands require plan and Will's explicit authorization. |
| M4 | Updated this report and README with pushed commits, open draft PR, GitHub CI execution, successful Home launches, screenshot locations and review/release-permission findings. Coordinator release-check placeholders retained below. |
| M5 | Deleted `native/.claude/` (template Expo plugin toggle) and `native/.vscode/` (editor preferences/recommendations); neither is used by this repo's Codex/Claude workflow. |
| M6 | Tracked the 27 dependency advisories below for a later PR; no force upgrades or SDK substitutions. Ran full and `--omit=dev` audits and recorded counts. |

## Release permissions (recorded at P1 merge, main b5f145e)

Android Release merged manifest permissions: `android.permission.INTERNET`, `android.permission.VIBRATE`, `android.permission.ACCESS_NETWORK_STATE`, plus `com.insightwellness.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. AndroidX core declares and uses the app-scoped signature-level permission for non-exported runtime receivers; it is not user-visible. No local-network/nearby/multicast or blocked storage/overlay permission, and no dev-launcher components.

Re-verified on Mac at P2a head: PASS (Oct 17, 7:32 AM CT). Clean `npx expo prebuild --clean`, then `./gradlew :app:processReleaseMainManifest`: exactly the four permissions above.

iOS Release: the P1 artifact check reported `NSBonjourServices` / `NSLocalNetworkUsageDescription` absent, but expo-dev-launcher does not reliably strip them: the coordinator's clean Xcode 26.6 build retained both plus `NSAppTransportSecurity.NSAllowsLocalNetworking` because both strip phases preceded plist processing. The earlier result was likely incremental-build state. The corrected F1 plugin declares the processed plist dependency and a stamp output, runs last, and strips all three keys only in Release; Debug retains all three for Metro/dev-launcher. A clean Release artifact built with the fix was verified (below).

Release Info.plist re-check at P2a head: PASS (Oct 17, 8:13 AM CT). Clean `npx expo prebuild --clean --platform ios`, then `npx expo run:ios --configuration Release --device "iPhone 17 Pro"` built, installed and launched. The built `Info.plist` has `NSAppTransportSecurity = { NSAllowsArbitraryLoads = false }` only, with no `NSAllowsLocalNetworking`, `NSBonjourServices` or `NSLocalNetworkUsageDescription`. Before the fix, the same clean build kept all three.

## Validation for review edits

Commands run from `native/`, with `EXPO_NO_TELEMETRY=1`, `EXPO_NO_DOTENV=1`, temporary npm/Expo caches and no device builds. All requested checks passed on October 17, 2026:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx expo lint` | PASS (exit 0) |
| `npx expo-doctor` | PASS (exit 0), 20/20 checks |
| `npx expo install --check` | PASS (exit 0), dependencies up to date |

`git diff --check` also passed. Verified the permission list, preserved action SHA pins/path filters/pull-request trigger, job timeout/Doctor ordering and removal of template settings. Package manifests and lockfiles were not changed.

## Dependency advisories

P2a triage is recorded in [npm-audit-triage.md](npm-audit-triage.md). Both full and `--omit=dev` audits remain at 27 affected packages (8 moderate, 19 high); no safe SDK-compatible fix is available under this task's constraints. These counts include tooling inherited through production-declared dependencies, not 27 distinct advisories.

## History

Initial October 16 sandbox attempts failed on global caches, CoreSimulator access and Android Qt/neon startup; those sandbox-only build blockers are resolved by the successful October 17 launches outside the sandbox. Git writes also required execution outside the sandbox; commits/push/PR/CI are now recorded above.

Earlier checks passed typecheck, lint, compatibility, Expo Doctor (20/20), and both Hermes exports. The root has no `npm test` script. The earlier fallback `node --experimental-strip-types --test tests/*.test.mjs` ran 459 tests: 451 passed, 8 failed because PostgreSQL binaries/psql were missing; AI payload guard tests passed. That historical result is not a fresh regression run for these edits. No web application code changed.
