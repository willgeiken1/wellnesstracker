# Insight Daily P1 scaffold report

Updated: October 17, 2026. Branch: `native/p1-expo-scaffold`. Draft PR: #67.

## Current status

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

## Development-only permissions and release checks

Quinn's review evidence: nearby-devices/local-network permission is dev-only. `ACCESS_LOCAL_NETWORK` appears only in RN 0.88 debug manifests; dev-launcher multicast permission is debug-only. The Android release manifest merge has no local-network/nearby/multicast permission and no dev-launcher components. On iOS, dev-launcher's “Strip Local Network Keys for Release” phase removes `NSBonjourServices` and `NSLocalNetworkUsageDescription` in Release. Coordinator artifact checks:

iOS Release Info.plist check: PASS (Oct 17, about 4:42 AM CT). `npx expo run:ios --configuration Release --device "iPhone 17 Pro" --no-bundler` built (0 errors), installed and launched to the Home screen from the embedded bundle; the build log shows the "[Expo Dev Launcher] Strip Local Network Keys for Release" phase ran. The built `Release-iphonesimulator/InsightDaily.app/Info.plist` has no `NSBonjourServices` and no `NSLocalNetworkUsageDescription` (the generated source Info.plist does contain `NSBonjourServices`, so the strip is what removes it). Note: the Expo template's ATS exception `NSAppTransportSecurity.NSAllowsLocalNetworking = true` remains in Release; it is not a permission prompt and is left for a later hardening pass.

Android release permissions: PASS (Oct 17). After `npx expo prebuild --platform android --clean`, `./gradlew :app:processReleaseMainManifest` merged the release manifest with only `INTERNET`, `VIBRATE` and `ACCESS_NETWORK_STATE`, plus AndroidX's app-scoped signature permission `com.insightwellness.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (not user-facing). No `SYSTEM_ALERT_WINDOW`, storage, local-network, nearby or multicast permission and no dev-launcher components.

## Validation for review edits

Commands run from `native/`, with `EXPO_NO_TELEMETRY=1`, `EXPO_NO_DOTENV=1`, temporary npm/Expo caches and no device builds. All requested checks passed on October 17, 2026:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx expo lint` | PASS (exit 0) |
| `npx expo-doctor` | PASS (exit 0), 20/20 checks |
| `npx expo install --check` | PASS (exit 0), dependencies up to date |

`git diff --check` also passed. Verified the permission list, preserved action SHA pins/path filters/pull-request trigger, job timeout/Doctor ordering and removal of template settings. Package manifests and lockfiles were not changed.

## Tracked follow-up: dependency advisories

Owner: coordinator / later dependency-triage PR. Open; not fixed in P1. `npm install` reported **27 advisories (8 moderate, 19 high)** in native dependencies, attributed to build tooling/development dependencies rather than app runtime. Fresh audits on October 17 confirm:

| Command | Moderate | High | Total |
| --- | --- | --- | --- |
| `npm audit --omit=dev` | 8 | 19 | 27 |
| `npm audit` | 8 | 19 | 27 |

Both audits report zero low/critical findings; advisories remain. The affected paths originate in tooling packages such as Metro, config plugins/Xcode, `node-forge`, `braces` and `uuid`, and propagate to Expo/RN packages. `--omit=dev` retains these transitive tools through production-declared Expo/RN dependencies, so it is not a clean production audit or proof that the shipped app is unaffected. The follow-up must confirm runtime reachability and SDK-compatible fixes. No force upgrades, lockfile changes or SDK substitutions in P1.

## History

Initial October 16 sandbox attempts failed on global caches, CoreSimulator access and Android Qt/neon startup; those sandbox-only build blockers are resolved by the successful October 17 launches outside the sandbox. Git writes also required execution outside the sandbox; commits/push/PR/CI are now recorded above.

Earlier checks passed typecheck, lint, compatibility, Expo Doctor (20/20), and both Hermes exports. The root has no `npm test` script. The earlier fallback `node --experimental-strip-types --test tests/*.test.mjs` ran 459 tests: 451 passed, 8 failed because PostgreSQL binaries/psql were missing; AI payload guard tests passed. That historical result is not a fresh regression run for these edits. No web application code changed.
