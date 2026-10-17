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
| Citrus | #D5F56B / #C7B5FA / #F5BEDB | #D5F56B / #C7B5FA | #5E7A00 / #665092 |
| Sea Glass | #2D6876 / #67B39F / #CEDFCC | #67B39F / #A9D3C4 | #2D6876 / #276B57 |
| Dusk | #A9B8FF / #CDBEF3 / #F3CAD6 | #A9B8FF / #CDBEF3 | #4654B8 / #665092 |
| Sandstone | #F4BE8C / #E7D3BC / #CBDCC4 | #F4BE8C / #E7D3BC | #9A5622 / #735A40 |

Dark surface, raised surface, text and muted text match the PWA. Light background/surfaces/text also match. Light muted text changes from #6E7073 to #696B6E: the original has 4.223:1 against #ECEDE9, while the native value has 4.545:1. Subtracting five from each RGB channel is the smallest uniform integer-channel reduction that clears 4.5:1; subtracting four gives 4.478:1.

The PWA already supplies accessible light accent-text values and the brighter Sea Glass dark accent; native adopts those semantic choices rather than using raw pastel swatches as foregrounds. Light accent-2 is darkened to the values above for readable semantic use. Success, warning and Oura ring roles receive light-theme counterparts (#276B57, #8C501C, #665092); the plan did not prescribe exact colors for these roles. Danger follows the PWA: #FF7B7B with dark ink in dark mode, #B52E2E with white in light mode. Primary buttons use dark ink on dark-theme accents and white on light-theme accents.

The contrast suite checks text and muted text against bg/surface/surface-2 at 4.5:1, accent glyphs against those surfaces at 3:1, and button foregrounds at 4.5:1 for both themes and all four accents.

## Placeholders and next part

Every feature screen other than Appearance is explicitly marked **M2/M3 placeholder**, uses EmptyState, and has an action leading to another route or Home. Segments select their corresponding placeholder; they contain no synthetic health values. Appearance controls are the working M1 feature.

P2c adds settings persistence in the SQLite settings table and the separately scoped data/auth/sync foundation. Theme/accent state is intentionally in memory, with a TODO at the state owner; process restart resets preferences. P2b introduces no SQLite, Supabase, authentication, sync, AI, telemetry, Health, notification or paid-service integration. Egress guards/golden business fixtures belong with the features that introduce those payloads and logic.

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
- `npm test -- --ci`: PASS; 22 tests across five suites. Tests cover source mapping, eight contrast combinations, native tab declarations, theme/accent changes, native intent normalization, routes, modal exit, Settings access, tab segments, food logging stub and Reduce Motion changes.
- `npx expo export --platform web --output-dir /tmp/insight-p2b-web`: PASS. Temporary output is outside the repository.
- Root `npm test`: unavailable; the existing root package has no test script. The workflow's non-quota Node test command was attempted separately: 430 passed, six failed because root zod/PostgreSQL prerequisites are absent. Quota integration tests were not run; no local PostgreSQL/Supabase test service was configured in this task. PWA source files are unchanged.

Native tab declarations are rendered with a host mock in Jest; route tests use the real JS fallback navigator. Expo Router's test location bypasses native getInitialURL, so route tests apply the actual native intent hook before rendering, and separate tests cover cold/warm hook behavior. These checks do not prove native-host layout or device accessibility behavior.

Per task instructions, no simulator/emulator build, prebuild, EAS command, screenshots, staging, commit or push was performed. Native launch, large Dynamic Type and VoiceOver/TalkBack checks remain for the coordinator's simulator/emulator validation. The native CI workflow adds Jest after lint and retains pinned action SHAs and read-only permissions.

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

### Added (46)

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
