# Insight Daily P1 scaffold report

Date: October 16, 2026. Branch: `native/p1-expo-scaffold`, starting HEAD `79db13d`.
Status: scaffold implemented; P1 exit criteria NOT met. Neither native build launched, and no commits could be made because of the managed sandbox. Nothing pushed or merged.

## Scope and sources

Read repository AGENTS.md and ../insight-native-prep/native-rebuild-plan.md (§0 takes precedence), native-rebuild-answers.md, native-release-sequence.md, native-prep/skills/expo-dev-builds.md and reference notes. Release sequence records FREEZE LIFTED. Implements P1 / M0 scaffold subset of §0.1, §0.2 and §15.2, Q3/Q4/Q5/Q8/Q127. Remaining M0 work (local Supabase, golden fixtures/Jest) is outside this scaffold.

## Built

- Created native/ with `create-expo-app --template default@sdk-58`: Expo ~58.0.14, React Native 0.88.0, React 19.3.0, strict TypeScript, Hermes, New Architecture.
- Insight Daily name, insight-daily slug, com.insightwellness.app for both platforms, insight scheme, iOS 17.0 deployment target, phone only, Android minSdk 29 via expo-build-properties. Generated projects confirm those values.
- Added SDK-matched expo-dev-client and expo-build-properties. Native scripts build locally and start with --dev-client. No accounts/services configured.
- Kept template Home/Explore UI and temporary Expo artwork. Home heading says Insight Daily. Product navigation and icon design remain later work.
- Repaired template typecheck issues: explicitly include Expo CSS declarations and type the web tab ref for RN 0.88's host element. Replaced the template's effect-based hydration flag with useSyncExternalStore so Expo lint passes without disabling rules.
- Added native CI workflow for npm ci, dependency compatibility, typecheck and lint. Reused action SHA pins already present in repo. Remote CI has NOT run.
- Added native and native/ to Pages exclusions. AGENTS.md matches the prep source exactly, and the complete prep PR template is copied verbatim.
- Generated native/ios and native/android are ignored, never hand-edited. Node modules and env files are ignored. logger/ and all web behavior are unchanged. No health, sync, widgets, auth, secrets, telemetry SDKs or paid services added.

## Commands and results

Commands in native/ unless noted. For npm operations the writable cache was `npm_config_cache=/private/tmp/insight-p1-npm`; Expo used `EXPO_NO_TELEMETRY=1`, and later `EXPO_NO_CACHE=1`. Build attempts also used `__UNSAFE_EXPO_HOME_DIRECTORY=/private/tmp/insight-p1-expo`, an Expo CLI-supported shell override for an empty temporary state directory; no credentials copied.

| Command | Result |
| --- | --- |
| root: git status --short --branch / git worktree list | Already on requested native/p1-expo-scaffold branch; only preexisting untracked AGENTS.md |
| root: git worktree add ../wt-native-p1-expo-scaffold native/p1-expo-scaffold | Failed: branch already checked out here; no other worktree created |
| node --version / npm --version / xcodebuild -version | v24.21.0 / 11.19.0 / Xcode 26.6 (17F113) |
| xcrun simctl list devices available | Failed: CoreSimulatorService connection invalid/refused; sandbox log write denied; iOS 26.5 device could not be selected/verified |
| emulator -list-avds | Pass: Medium_Phone_API_37.0 available |
| npx ctx7@latest library Expo ... / docs /expo/expo ... | Pass after temporary npm cache; current config plugin docs retrieved |
| root: npx create-expo-app native --template default@sdk-58 | Initial attempts failed on ~/.npm and ~/.expo permissions; succeeded with temporary npm cache and EXPO_NO_TELEMETRY=1 |
| npx expo install expo-dev-client expo-build-properties | Initial Expo cache write failed; passed with EXPO_NO_CACHE=1 |
| npx expo install --check | Pass: dependencies up to date |
| npx tsc --noEmit | Initially failed on template CSS declarations/web ref; passed after fixes |
| npx expo lint | Installed ESLint/config automatically; first invocation had stale module detection, next found template hydration rule error; passed after fix |
| npx expo-doctor | Pass: 20/20 checks |
| npx expo run:ios --device 'iPhone 17 Pro' | Failed after successful prebuild: React Native shared cache inaccessible, CocoaPods trunk setup failed under ~/.cocoapods, and CLI could not determine Simulator app ID. No compilation/install/launch confirmed |
| npx expo run:android --device Medium_Phone_API_37.0 | Failed after successful prebuild: emulator quit before opening. No compilation/install/launch confirmed |
| emulator @Medium_Phone_API_37.0 -no-snapshot-save | Failed (exit 134): Qt requires neon processor feature. Emulator version 37.2.12.0, android-37.0 arm64-v8a image |
| npx expo export --platform ios --platform android --output-dir /private/tmp/insight-p1-bundle | Pass: both Hermes bundles generated (iOS 1545 modules, Android 1640). This is bundling only, not native launch evidence |
| root: npm test | Failed: repository has no test script; left package.json unchanged |
| root: npm ci --ignore-scripts | Pass; installed existing test dependency zod, no root lockfile changes |
| root: node --experimental-strip-types --test tests/*.test.mjs | First run also lacked zod. After npm ci: 459 tests, 451 passed, 8 failed because PostgreSQL binaries/psql are missing. See failures below |
| git diff --check; manifest/lock/config assertions; cmp prep rules/template | Pass; identity, OS floors, lockfile and Pages exclusions verified |
| git check-ignore native/ios native/android native/node_modules | Pass: all ignored |
| git add AGENTS.md .github/pull_request_template.md _config.yml; git commit ... | Both failed: .git/index.lock Operation not permitted. No commits created |

Android build environment: ANDROID_HOME=/Users/willgeiken/Library/Android/sdk and JAVA_HOME=/opt/homebrew/opt/openjdk@17 as requested.

The eight existing database-test failures after installing root dependencies:
1. home_v2_pick and merge_user_data keep the copy with more distinct ids
2. delete and range SQL functions run with the storage delete trigger
3. progress photo paths stay inside the owner's folder
4. parallel consumes stop at 10 photos and 20 descriptions
5. one user hitting the cap does not block another user
6. anon and authenticated cannot call the quota functions or touch ai_usage
7. seeded accounts match the social visibility oracle
8. two accounts cannot read, forge, or bypass a block on the social feed

The raw synthetic test log is /private/tmp/insight-p1-tests.log. AI payload guard tests pass after zod installation; no native egress feature exists to exercise yet. No native Jest suite was introduced. Browser harnesses were not run; no web app code changed.

## Sandbox/tool blockers and remaining work

- .git is read-only in this managed session. Could not stage or create the requested small commits. Suggested grouping: (1) rules, template and Pages exclusions; (2) native scaffold and CI. All changes remain in the working tree on the requested branch.
- CoreSimulator XPC access is unavailable. Cannot boot, install, inspect the Home screen or capture iOS screenshots here. The requested iOS 26.5 runtime remains unverified from this sandbox.
- CocoaPods/React Native global caches are unwritable. No native generated files were altered to work around this.
- Android's Qt neon failure prevents AVD boot. Actual launch requires resolution outside this session; no unsupported emulator replacement attempted.
- Default npm cache is unwritable; temporary cache works. Expo telemetry disabled and network response cache disabled avoids global writes. No secrets inspected.
- npm install reported 27 native dependency advisories (8 moderate, 19 high). No force upgrade or unapproved SDK substitution applied. Review dependency advisories before promoting this scaffold.
- GitHub authentication/push, draft PR, remote CI and Quinn's Claude review are pending by design. Never merge. No screenshot claims: neither Home screen was observed.

## Open questions / next checks

1. Re-run the two local builds in a session with normal Git/toolchain access and verify the requested iOS 26.5 iPhone and Medium_Phone Home screens, then capture screenshots.
2. Resolve the emulator Qt/neon failure and provide PostgreSQL test binaries/throwaway test database before claiming all checks green.
3. Plan AGENTS.md references library/work/native-rebuild-plan.md, but this Mac's supplied source lives in ../insight-native-prep/. Keep the locked source intact; decide its durable repo location separately.
4. SDK 58's default template includes web demonstrations; P1 preserves them with minimal typing/lint repairs. Later product navigation should replace starter UI and artwork.

P1 is not ready to mark complete until actual simulator launches, local commits, later remote CI and Quinn review are finished.

Report delivery: requested ../codex-p1-report.md was denied by the sandbox. This copy is inside the writable native/ directory.
