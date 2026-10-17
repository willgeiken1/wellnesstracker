# Insight Daily native scaffold

P1 of M0, implementing native-rebuild-plan §0.1, §0.2 and §15.2; decisions Q3, Q4, Q5, Q8 and Q127.

Created with `npx create-expo-app native --template default@sdk-58`. Expo SDK 58, React Native 0.88, Hermes, New Architecture and strict TypeScript. Development builds only. The starter Home/Explore screens and Expo artwork are temporary scaffold assets; the Home heading identifies Insight Daily. Product navigation and branding come later.

The app uses `com.insightwellness.app`, the `insight` scheme, iOS 17+ (phone only), and Android API 29+. Native settings live in app.json and config plugins; generated ios/ and android/ directories stay ignored.

Use the commands in [AGENTS.md §3](../AGENTS.md#3-commands-run-from-native). Install dependencies with `npm ci` in this directory. `npm start` starts the development client server; `npm run ios` and `npm run android` build locally. For Android, set ANDROID_HOME to ~/Library/Android/sdk and JAVA_HOME to /opt/homebrew/opt/openjdk@17; start Medium_Phone_API_37.0 first. For iOS, select an iPhone simulator using the iOS 26.5 runtime. No developer account is needed for these simulator builds.

No Health permissions, auth, sync, analytics, widgets, secrets or hosted services are configured. No native business logic or Jest/golden-fixture suite is introduced in P1.

Commits were made and pushed outside the sandbox; draft PR #67 is open and CI ran on GitHub. Quinn (Claude cross-family review) returned **PASS-WITH-MINORS, RISK LOW**. Both local dev builds reached the Home screen on October 17, 2026: iPhone simulator with iOS 26.5 at about 3:39 AM CT, and Medium_Phone_API_37.0 at about 4:12 AM CT after a couple of emulator restarts. Screenshots are on the Mac at `~/Code/p1-ios.png` and `~/Code/p1-android.png`, not committed. Earlier CoreSimulator and Qt/neon failures were sandbox-only and are resolved.

The native CI workflow runs dependency compatibility, Expo Doctor, typecheck and lint, with a 15-minute job timeout. Push runs are limited to `main`; pull requests keep their existing path filters.

Nearby-devices/local-network access is dev-only: RN 0.88 declares `ACCESS_LOCAL_NETWORK` only in debug manifests, and dev-launcher multicast permission is debug-only. Quinn's review found no local-network/nearby/multicast permission or dev-launcher components in the merged Android release manifest. On iOS, dev-launcher's “Strip Local Network Keys for Release” phase removes `NSBonjourServices` and `NSLocalNetworkUsageDescription` in Release. Local release checks confirmed this on October 17 (Android release permissions: INTERNET, VIBRATE, ACCESS_NETWORK_STATE only; iOS Release Info.plist has neither key); details are in the [P1 report](docs/p1-report.md), which also tracks M1–M6 and the dependency advisory follow-up.
