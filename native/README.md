# Insight Daily native scaffold

P1 of M0, implementing native-rebuild-plan §0.1, §0.2 and §15.2; decisions Q3, Q4, Q5, Q8 and Q127.

Created with `npx create-expo-app native --template default@sdk-58`. Expo SDK 58, React Native 0.88, Hermes, New Architecture and strict TypeScript. Development builds only. P2b adds the token system, base components, five-tab navigation and working Appearance settings. See [the P2b report](docs/p2-foundation.md) for scope, placeholders, validation and the full file manifest. App icon and splash branding remain scaffold assets.

The app uses `com.insightwellness.app`, the `insight` scheme, iOS 17+ (phone only), and Android API 29+. Native settings live in app.json and config plugins; generated ios/ and android/ directories stay ignored.

Use the commands in [AGENTS.md §3](../AGENTS.md#3-commands-run-from-native). Install dependencies with `npm ci` in this directory. `npm start` starts the development client server; `npm run ios` and `npm run android` build locally. For Android, set ANDROID_HOME to ~/Library/Android/sdk and JAVA_HOME to /opt/homebrew/opt/openjdk@17; start Medium_Phone_API_37.0 first. For iOS, select an iPhone simulator using the iOS 26.5 runtime. No developer account is needed for these simulator builds.

No Health permissions, auth, sync, analytics, widgets, secrets or hosted services are configured. P2b introduces Jest coverage for tokens, contrast, navigation, linking and Appearance; business logic and golden fixtures arrive in later parts.

Our `plugins/withStripLocalNetworkingRelease.js` strips local-network keys from the built Release Info.plist; see the P1 report for the processed-plist dependency and clean-build evidence.

Release permissions, build evidence, cross-family review and follow-ups: [P1 report](docs/p1-report.md).

The native CI workflow runs dependency compatibility, Expo Doctor, plugin tests, typecheck, lint and Jest, with a 15-minute job timeout. Push runs are limited to `main`; pull requests keep their existing path filters.
