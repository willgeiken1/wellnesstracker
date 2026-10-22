# P2b — M1 foundation, part 1

P2b implements the quoted native rebuild plan §4 (navigation), §6 (design system), §7.2 (code layout), and the M1 foundation portion of §15.2. Decisions covered: Q21/Q84 (five tabs and navigation), Q78 (four accents), Q79 (system/light/dark override), Q81 (line icons). Q47 remains respected: no native check-in feature. The full plan is outside this repository; the task's quoted sections governed this work.

## Included behavior

- Home, Workouts, Food, Progress and Insights use SDK 58 native tabs on iOS/Android, with tap navigation and no swipe pager. Workouts, Progress and Insights have working local segments. Each tab has an avatar control opening the Settings stack.
- Settings lists Account, Profile & units, Appearance, Workout, Health & devices, Notifications, Privacy, Data and About. Appearance applies theme and accent immediately to content, navigation, status bar and native interface appearance. Defaults are system theme and Citrus; missing system preference falls back to dark.
- Home's Start freestyle opens `/workout` as a full-screen modal. Its explicit close action also works after a cold deep link. Food opens `/food/log`. The native intent hook preserves the host portion of `insight://food/log` and `insight://workout/start`; the latter redirects to `/workout`. Both cold and warm normalization are covered. Unknown Insight links return Home.
- Tokens originate in `src/design/tokens.json`; `tokens.ts` supplies typed mappings without copying values. Base components: ThemedText, Screen, Button, Card, ListRow, SegmentedControl, EmptyState, Chip, Badge and Icon. EmptyState requires an action. Controls expose labels/roles/selection state, use at least 44 pt on iOS or 48 dp elsewhere, and allow text to grow without fixed control heights. Body text uses the system font; headings/numerals use OFL Lexend Medium. Numeric text enables tabular numerals. Text scaling is enabled with an uncapped multiplier.
- Spacing is the seven-step 4-point scale; input/card/sheet radii are 8/12/20. iOS cards use shadows; Android cards use tonal elevation. Motion tokens are 120/220 ms; stack duration uses the sheet token. Reduce Motion disables stack transitions and zeroes both motion tokens, including while its initial preference is pending. Base controls have no animated transitions or haptics.
- User-facing app copy is centralized in the typed English catalog and `t()` helper. Native system navigation labels retain OS localization. Web keeps a simple JS tab fallback.
- Dead template screens, components, styles, hooks, reset script and unused illustration/tab assets are removed. App icon/splash assets remain for future branding work.

SDK 58's documented, non-unstable import is [`expo-router/native-tabs`](https://docs.expo.dev/versions/v58.0.0/sdk/router/native-tabs/); the older `unstable-native-tabs` path applies to SDK 54–57. Native tab labels serve as accessible control labels. Native tab icons use unfilled SF Symbols on iOS and small 72 px transparent line-art PNGs on Android; other icons use expo-symbols on iOS and react-native-svg elsewhere. The PNGs are raster equivalents of the line geometry in Icon, allowing native tab image tinting without an additional icon dependency. Fonts load through [`expo-font` useFonts](https://docs.expo.dev/versions/v58.0.0/sdk/font/), with an explicit system-font error state. Linking uses Expo's [`+native-intent` hook](https://docs.expo.dev/router/advanced/native-intent/).

## Colors and deviations

`logger/index.html` now imports the PWA CSS rather than containing the variables inline. Sources are `logger/js/pages/settings.js` ACCENTS, `logger/css/theme.css`, and `logger/css/appearance.css`. The original picker swatches are retained exactly:

| Palette | Original swatches | Native dark accent / accent-2 | Native light accent / accent-2 |
| --- | --- | --- | --- |
| Citrus | #D5F56B / #C7B5FA / #F5BEDB | #D5F56B / #C7B5FA | #587400 / #665092 |
| Sea Glass | #2D6876 / #67B39F / #CEDFCC | #67B39F / #A9D3C4 | #2D6876 / #276B57 |
| Dusk | #A9B8FF / #CDBEF3 / #F3CAD6 | #A9B8FF / #CDBEF3 | #4654B8 / #665092 |
| Sandstone | #F4BE8C / #E7D3BC / #CBDCC4 | #F4BE8C / #E7D3BC | #9A5622 / #735A40 |

Dark surface, raised surface, text and muted text match the PWA. Light background/surfaces/text also match. Light muted text changes from #6E7073 to #696B6E: the original has 4.223:1 against #ECEDE9, while the native value has 4.545:1. Subtracting five from each RGB channel is the smallest uniform integer-channel reduction that clears 4.5:1; subtracting four gives 4.478:1.

The PWA supplies the starting light accent-text values and the brighter Sea Glass dark accent; native adopts those semantic choices rather than using raw pastel swatches as foregrounds. Light accent-2 is darkened to the values above for readable semantic use. Success, warning and Oura ring roles receive light-theme counterparts (#276B57, #8C501C, #665092); the plan did not prescribe exact colors for these roles. Danger follows the PWA: #FF7B7B with dark ink in dark mode, #B52E2E with white in light mode. Primary buttons use dark ink on dark-theme accents and white on light-theme accents.

The contrast suite checks text, muted text and both accent tokens against bg/surface/surface-2 at 4.5:1; accent, accent-2, success, warning, danger and ring-oura glyphs at 3:1; and button foregrounds against their filled backgrounds at 4.5:1 for both themes and all four accents. Light Citrus is now #587400; see the review fixes below.

## Placeholders and next part

P3 now replaces the workout placeholders with the M2 offline logger, template editor, rest timer and finish summary; see [p3-logger.md](p3-logger.md). Sea Glass is the new fallback accent, following Will’s Oct 17 decision. Food, Body Atlas, platform live displays and the remaining M2 surfaces stay in their own follow-ups.

Every feature screen other than Appearance is explicitly marked **M2/M3 placeholder**, uses EmptyState, and has an action leading to another route or Home. Segments select their corresponding placeholder; they contain no synthetic health values. Appearance controls are the working M1 feature.

P2c now supplies SQLite settings persistence and the separately scoped data/auth/sync foundation; see [p2-sync.md](p2-sync.md). Theme/accent preferences survive process restart under the active owner namespace. P2b itself introduced no SQLite, Supabase, authentication, sync, AI, telemetry, Health, notification or paid-service integration. The next milestone adds M2 product behavior and the separately scoped blob-to-row importer; the P2c server SQL remains draft-only and unapplied.

## Dependencies

All additions used `npx expo install`; test tooling used its `-- --save-dev` form. Resolved direct additions:

| Dependency | Version | Use |
| --- | --- | --- |
| @expo-google-fonts/lexend | 0.4.1 | OFL heading/numeral font |
| react-native-svg | 15.16.0 | Line icons |
| jest-expo | 58.0.11 | Expo Jest preset |
| jest | 30.5.2 | Test runner |
| @types/jest | 30.0.0 | Test types |
| @testing-library/react-native | 14.1.0 | Component/navigation rendering |

expo-font was already installed at 58.0.8; its config plugin is now registered. No existing direct dependency was upgraded. The package lock records the added test dependency graph.

## Validation

Commands run with EXPO_NO_TELEMETRY=1 and EXPO_NO_DOTENV=1. npm cache uses `/tmp/insight-npm`; Expo's home cache uses `/tmp/insight-expo` because the default cache is outside writable roots. Jest disables Watchman so it does not attempt to create a home-directory state folder.

- `npx tsc --noEmit`: PASS.
- `npx expo lint`: PASS, no warnings.
- `npx expo-doctor`: PASS, 20/20 checks.
- `npx expo install --check`: PASS at kickoff and final validation.
- `npm test -- --ci`: PASS; 78 tests across five suites after review fixes. Tests cover source mapping, eight contrast combinations, native tab declarations, theme/accent changes, native intent normalization, routes, modal exit, Settings access, tab segments, food logging stub and Reduce Motion changes.
- `npx expo export --platform web --output-dir /tmp/insight-p2b-web`: PASS. Temporary output is outside the repository.
- Root `npm test`: unavailable; the existing root package has no test script. The workflow's non-quota Node test command was attempted separately: 430 passed, six failed because root zod/PostgreSQL prerequisites are absent. Quota integration tests were not run; no local PostgreSQL/Supabase test service was configured in this task. PWA source files are unchanged.

Native tab declarations are rendered with a host mock in Jest; route tests use the real JS fallback navigator. Expo Router's test location bypasses native getInitialURL, so route tests apply the actual native intent hook before rendering, and separate tests cover cold/warm hook behavior. These checks do not prove native-host layout or device accessibility behavior.

Per task instructions, no simulator/emulator build, prebuild, EAS command, screenshots, staging, commit or push was performed. Native launch, large Dynamic Type and VoiceOver/TalkBack checks remain for the coordinator's simulator/emulator validation. The native CI workflow adds Jest after lint and retains pinned action SHAs and read-only permissions.

## Review fixes (Quinn #68)

This edit-only review pass stays within P2b / M1 foundation (plan §4, §6, §7.2, §15.2; Q21/Q84, Q78/Q79/Q81). The full plan remains unavailable in this worktree; no product decision is changed.

| Finding | Change / evidence |
| --- | --- |
| B1 | `+native-intent.ts` parses every input using a deliberately non-Insight base for bare paths. Only case-insensitive `insight:` passes; host + pathname becomes a lowercase route without trailing slashes, query or fragment. The explicit allowlist is `/food/log` and `/workout/start`; everything else returns `/`, including bare paths, other app schemes, HTTPS and malformed input. Credentials/ports are rejected. All 23 inputs are tested with both initial values. |
| B1b / #69 minor 5 | New `withDevSchemeDebugOnly.js`, registered after `expo-dev-client`. Android removes only `exp+insight-daily` data from main-manifest intent filters and adds it to `app/src/debug/AndroidManifest.xml`, preserving existing debug content and app schemes. Scheme-only filters are removed entirely from main to avoid broad data-free VIEW handlers. iOS adds an idempotent app-target script phase gated on configuration != Debug, with processed Info.plist input and configuration-specific stamp output. It removes dev-only URL entries (only the matching scheme within mixed entries), keeps `insight` / `com.insightwellness.app`, verifies removal and exits 1 on failures. Native generated folders were not created in this worktree. |
| M2 | Expanded both-theme / four-accent / three-surface checks to all six glyph roles at 3:1. Text-color source audit: `ThemedText` and native tabs use text/text-muted; JS tabs use accent/text-muted; Button uses on-accent/on-danger/text; SegmentedControl uses on-accent/text; navigation headers use text. The suite enforces 4.5:1 on their actual backgrounds, plus accent-2 for future text safety. Light Citrus changes #5E7A00 → #587400: 4.861:1 on bg, 5.367:1 on surface, 4.563:1 on surface-2. This is the smallest equal reduction of its nonzero RGB channels clearing all three surfaces: #597500 still gives 4.499:1 on surface-2. Original picker swatches are unchanged. |
| M3 | Known-value contrast anchors: black/white = 21.00, #777777/white = 4.48 (both rounded to two decimals), identical colors = 1. |
| M4 | Copied the installed Lexend package's complete `LICENSE_FONT` (OFL 1.1, including copyright and reserved font name) to `assets/fonts/licenses/Lexend-OFL.txt`; this package has no OFL.txt. Added translated Licenses row under About, linked to a clearly marked placeholder naming Lexend and RepDB; route test verifies it. TODO: About › Licenses must include the full Lexend (OFL 1.1) and RepDB notices before release. |
| M5 | README explicitly attributes Release local-network stripping to our `withStripLocalNetworkingRelease.js` and links the P1 report. The plugin and its test were not edited. |
| M6 | PASS (coordinator, Oct 17 9:33–9:40 AM CT, Maestro 2.11 flow `openLink`). iPhone 17 Pro sim: `insight://food/log` → Food log; `insight://WORKOUT/START` → Active workout; `insight://settings/privacy?x=1` and `com.insightwellness.app://settings/privacy?x=1` → Home (blocked). Medium_Phone_API_37.0: the same first three; Android doesn't register `com.insightwellness.app://` at all, so the OS refuses it. Debug build schemes: insight, com.insightwellness.app, exp+insight-daily. Android prebuild: `exp+insight-daily` appears 0× in the main manifest and 1× in the debug manifest. Screenshots: docs/screenshots/p2b/*-m6-*. |
| M7 prep | Host-tree responder walks audit every pressable in the rendered JS tab shell, Settings list and Appearance independently of role queries. Separate walks cover all five tab screens, Settings and Appearance with fontScale 2, requiring roles and nonempty labels/text; text must enable uncapped scaling, have no line cap, and have no fixed-height/max-height ancestor. The JS tab fallback now explicitly supplies accessibilityRole through Expo's PlatformPressable and enables tab-label scaling. Native tab triggers have explicit accessibilityLabel; native roles remain provided by the OS tab host. These are structural tests, not a layout engine. Coordinator device results (Oct 17): iOS at accessibility-XXXL and Android at font_scale 2.0, Home text scales and wraps without clipping (docs/screenshots/p2b/*-m7-*). Open items: (a) at AXXXL the iOS native tab bar wasn't visible in the Home screenshot, which needs a manual look; (b) the automated large-text pass of Settings/Appearance didn't run, because the dev-client floating Tools button overlaps the header avatar and took the tap; (c) no live VoiceOver/TalkBack pass. VoiceOver can't be scripted on the sim, and TalkBack is installed on the emulator but was not driven headless. Labels and roles are covered by the Jest walk above. |

SDK 58 investigation (installed source, no version assumptions): `expo-dev-client` 58.0.14's `plugin/src/withDevClient.ts` registers `withGeneratedIosScheme` / `withGeneratedAndroidScheme`; these append the generated `exp+insight-daily` scheme to iOS CFBundleURLTypes and Android main-manifest data. Expo's `@expo/config-plugins/build/plugins/withMod.js` executes mods as a stack. The Android plugin therefore uses `withBaseMod` and awaits `nextMod` before moving the generated data. Its tests compose the **actual installed** generated Android scheme mod with ours, catching a simple callback that would run too early.

Launcher handling precedes the application router: iOS `expo-dev-launcher/ios/ReactDelegateHandler/ExpoDevLauncherAppDelegateSubscriber.swift` passes open URLs to `EXDevLauncherController.m`'s `onDeepLink`, which recognizes launcher URLs and calls `loadApp` (cold startup also processes launch options). Android `android/src/debug/java/expo/modules/devlauncher/DevLauncherPackageDelegate.kt` handles warm `onNewIntent` through `DevLauncherController.tryToHandleIntent` and installs its activity delegate for cold startup. Router 58.0.23's `build/getLinkingConfig.js` invokes `redirectSystemPath` for app initial URLs; `build/link/linking.js` invokes it for URL events. Returning `/` for a launcher URL reaching this hook does not prevent native dev-launcher consumption. Debug retains its registered scheme. A native launch smoke check remains the coordinator's job.

Review validation uses EXPO_NO_TELEMETRY=1, EXPO_NO_DOTENV=1, npm_config_cache=/tmp/insight-npm and `__UNSAFE_EXPO_HOME_DIRECTORY=/tmp/insight-expo` (the supported SDK 58 shell override; EXPO_HOME does not redirect this cache). No environment files or credentials were read. Requested checks:

- `npx tsc --noEmit`: PASS.
- `npx expo lint`: PASS.
- `npx expo-doctor`: PASS, 20/20.
- `npx expo install --check`: PASS, dependencies up to date.
- `node --test plugins/*.test.js`: PASS, 7/7; includes real PlistBuddy on synthetic XML/binary plists for Debug/Release/Profile, unrelated/app scheme preservation, repeated execution, missing/malformed plist and failed-deletion rejection, idempotent serialized Xcode mods, and Android fresh/existing debug overlays with upstream mod composition.
- `npm test -- --ci`: PASS, 78 tests / 5 suites.

No git commands, prebuild, simulator/emulator, EAS or paid services were used. M6/M7 device results are recorded above; a native Release artifact check of the dev-scheme strip is still pending.

## M3-22 review-nit disposition (October 22, 2026)

Rechecked the merged #68 commit (`9c1963b`), the PR body (Quinn PASS-WITH-MINORS at `ffe96e2`), and the “Review fixes (Quinn #68)” table above. GitHub's comments/reviews/thread endpoints returned empty lists; this repository table is the available finding-level record. The external `library` review notes and full rebuild plan are not in this worktree.

- B1/B1b and M2/M3/M5 already have fixes recorded above; no duplicate implementation is needed. M6 already has coordinator device evidence.
- M4's remaining full in-app Lexend/RepDB notices are skipped here: the license file and Licenses route already exist, but completing that screen changes UI, expressly excluded from M3-22. It remains a before-release follow-up.
- M7's large-text tab-bar/Settings/Appearance checks and live VoiceOver/TalkBack pass remain skipped: they require interactive native-host accessibility validation, not a small local code nit. No new device evidence is claimed.
- The Release artifact re-check of the dev-scheme strip remains deferred to an authorized native build. M3-22 verifies synthetic processed plists with real PlistBuddy, not a signed/store artifact.

No additional unresolved small local LOW code nit could be established from these sources. M3-22 adds this explicit disposition so the open follow-ups are not mistaken for completed release checks.

## Complete file manifest

Paths are relative to the repository root. No file was staged. The native ignore file narrowly re-includes `src/design/tokens.json`; the repository-wide rule for other files named tokens.json remains in force.

### Modified (11)

- `.github/workflows/native.yml`
- `native/.gitignore`
- `native/README.md`
- `native/app.json`
- `native/package-lock.json`
- `native/package.json`
- `native/src/app/_layout.tsx`
- `native/src/components/app-tabs.tsx`
- `native/src/components/app-tabs.web.tsx`
- `native/src/components/themed-text.tsx`
- `native/tsconfig.json`

### Added (49)

- `native/assets/fonts/licenses/Lexend-OFL.txt`
- `native/plugins/withDevSchemeDebugOnly.js`
- `native/plugins/withDevSchemeDebugOnly.test.js`
- `native/assets/images/navigation/food.png`
- `native/assets/images/navigation/home.png`
- `native/assets/images/navigation/insights.png`
- `native/assets/images/navigation/progress.png`
- `native/assets/images/navigation/workouts.png`
- `native/docs/p2-foundation.md`
- `native/jest.config.js`
- `native/src/app/(tabs)/_layout.tsx`
- `native/src/app/(tabs)/food.tsx`
- `native/src/app/(tabs)/index.tsx`
- `native/src/app/(tabs)/insights.tsx`
- `native/src/app/(tabs)/progress.tsx`
- `native/src/app/(tabs)/workouts.tsx`
- `native/src/app/+native-intent.ts`
- `native/src/app/food/log.tsx`
- `native/src/app/settings/[section].tsx`
- `native/src/app/settings/_layout.tsx`
- `native/src/app/settings/appearance.tsx`
- `native/src/app/settings/index.tsx`
- `native/src/app/workout/_layout.tsx`
- `native/src/app/workout/index.tsx`
- `native/src/app/workout/start.tsx`
- `native/src/components/badge.tsx`
- `native/src/components/button.tsx`
- `native/src/components/card.tsx`
- `native/src/components/chip.tsx`
- `native/src/components/empty-state.tsx`
- `native/src/components/icon.tsx`
- `native/src/components/list-row.tsx`
- `native/src/components/screen.tsx`
- `native/src/components/segmented-control.tsx`
- `native/src/core/contrast.ts`
- `native/src/design/theme-provider.tsx`
- `native/src/design/tokens.json`
- `native/src/design/tokens.ts`
- `native/src/features/settings/appearance.tsx`
- `native/src/features/settings/sections.ts`
- `native/src/features/shell/placeholder.tsx`
- `native/src/features/shell/tabs.ts`
- `native/src/i18n/en.ts`
- `native/tests/linking.test.ts`
- `native/tests/motion.test.tsx`
- `native/tests/routes.test.tsx`
- `native/tests/setup.ts`
- `native/tests/shell.test.tsx`
- `native/tests/tokens.test.ts`

### Removed (30)

- `native/assets/images/expo-badge-white.png`
- `native/assets/images/expo-badge.png`
- `native/assets/images/expo-logo.png`
- `native/assets/images/logo-glow.png`
- `native/assets/images/react-logo.png`
- `native/assets/images/react-logo@2x.png`
- `native/assets/images/react-logo@3x.png`
- `native/assets/images/tabIcons/explore.png`
- `native/assets/images/tabIcons/explore@2x.png`
- `native/assets/images/tabIcons/explore@3x.png`
- `native/assets/images/tabIcons/home.png`
- `native/assets/images/tabIcons/home@2x.png`
- `native/assets/images/tabIcons/home@3x.png`
- `native/assets/images/tutorial-web.png`
- `native/scripts/reset-project.js`
- `native/src/app/explore.tsx`
- `native/src/app/index.tsx`
- `native/src/components/animated-icon.module.css`
- `native/src/components/animated-icon.tsx`
- `native/src/components/animated-icon.web.tsx`
- `native/src/components/external-link.tsx`
- `native/src/components/hint-row.tsx`
- `native/src/components/themed-view.tsx`
- `native/src/components/ui/collapsible.tsx`
- `native/src/components/web-badge.tsx`
- `native/src/constants/theme.ts`
- `native/src/global.css`
- `native/src/hooks/use-color-scheme.ts`
- `native/src/hooks/use-color-scheme.web.ts`
- `native/src/hooks/use-theme.ts`
