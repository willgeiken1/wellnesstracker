# Free iPhone build — M2-01 / P3b

Opt in with `APP_VARIANT=freeiphone`. The EAS profile is `free-iphone`.
Default `app.json` is unchanged. The free variant uses `com.insightwellness.app`,
local SQLite's `guest` namespace, no account, no auth client, no sync engine and no
Supabase configuration. Demo uses a separate `demo` namespace. Returning from demo
preserves the phone-only log. This is the M2-00 phone-only decision and Q129's
personal-team logging test; it does not change Q12/Q2 for the default app.

Health, widgets/Live Activities and push are unavailable. Health and Notifications
settings say “Not in this build.” The checkout has no actual Health/widget/push
integrations or extension target yet. Config tests preserve the existing default
and additionally check a synthetic default containing those capabilities.

## Will's Mac: build and install with Xcode (recommended)

Only Will performs these steps. No signing, Apple/Expo login, or device installation
was performed by Codex. Use Xcode's Personal Team development signing; internal
ad-hoc distribution is not a substitute for free personal-team signing.

1. Install the Xcode version required by the pinned SDK 58/RN 0.88, its iOS platform
   support and command-line tools; open Xcode once to finish setup. Use the repo's
   supported Node version and CocoaPods. Connect the iPhone by cable, unlock it,
   accept **Trust This Computer**, and enable **Settings → Privacy & Security →
   Developer Mode**, restarting/confirming when asked.
2. In the checkout's `native/` directory, set the variant in this terminal:

   ```sh
   export APP_VARIANT=freeiphone
   export EXPO_NO_DOTENV=1
   export EXPO_NO_TELEMETRY=1
   npm ci
   npx expo install --check
   node scripts/check-free-iphone.cjs --prebuild
   npx expo prebuild --platform ios --clean
   open ios/InsightDailyPhone.xcworkspace
   ```

   The inspection command exports JS and generates an unsigned iOS project in a
   temporary source-only copy. It never copies dotenv files. The final prebuild
   above generates Will's disposable local project and installs pods. Never commit
   `ios/` or `android/`. Do not add a Supabase URL/key for this build.
3. In **Xcode → Settings → Accounts**, Will adds his Apple Account. Select the
   **InsightDailyPhone** application target → **Signing & Capabilities** → enable
   **Automatically manage signing**, choose Will's **Personal Team**, and select
   his connected iPhone as the run destination. Confirm there is one app target,
   no widget/extension target, and no HealthKit, App Groups, Push Notifications,
   iCloud, Associated Domains or Sign in with Apple capability. Keep the pinned
   bundle identifier. If Apple says it is unavailable, stop and record that blocker
   for Will; do not silently change identifiers or buy membership.
4. Choose the **Debug** configuration and **Product → Run**. Xcode signs and
   installs the development build directly. Alternatively, after personal-team
   signing is configured in Xcode, run from the same terminal:

   ```sh
   npx expo run:ios --device --configuration Debug
   ```

5. On the iPhone, if prompted, open **Settings → General → VPN & Device Management**,
   select Will's developer profile and **Trust** it. Labels may vary by iOS version.
   Complete Developer Mode confirmation if it is still pending.
6. Open **Insight Daily (Phone)**. In the development launcher select **Load embedded
   bundle**. This variant enables SDK 58's `embeddedBundle` option and changes only
   this variant's generated bundling phase to embed Debug JS, pin `APP_VARIANT` and
   disable dotenv while bundling. Use the embedded bundle for the logging week;
   it does not need Metro or the Mac to remain running. A cold offline launch may
   return to the launcher: select **Load embedded bundle** again. Verify this on
   the phone before starting the week; unsigned prebuild cannot prove runtime use.

For interactive debugging, start Metro with the same variant and a clean cache:

**Warning:** starting Metro without `APP_VARIANT=freeiphone` loads the full default
bundle, including the default auth and sync code, even in the stripped phone app.

```sh
APP_VARIANT=freeiphone EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npx expo start --dev-client --clear
```

Always stop Metro before switching variants. Regenerate the local iOS project when
switching back to default; never use the stripped generated project for a default
build. An unset `APP_VARIANT` uses the original configuration/provider/screens.
Both variants share the pinned app identifier, so they replace each other on-device.

## EAS profile and its boundary

`eas.json` defines a development client, Debug configuration, internal distribution,
local credentials source and the same variant/dotenv settings. The corresponding
local-build command is:

```sh
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 eas build --local --platform ios --profile free-iphone
```

Codex did not run this command. EAS local still uses EAS orchestration and requires
locally supplied signing credentials; this profile does not create a free Personal
Team provisioning profile or make ad-hoc distribution available to a free team.
Use the Xcode/direct-device route above for the free account. Will must verify EAS
credential compatibility separately if he elects to use EAS; no signed EAS artifact
or free-team EAS installation is claimed. Never use a cloud build for this test.
No credentials file/certificates/profiles are supplied or moved by this change.

## Daily JSON backup and seven-day renewal

Open **Settings → Account → Export JSON backup**, choose **Save to Files**, and
confirm a nonempty `insight-phone-backup.json` was saved. Use dated folders or names
so each day's backup remains separate. Export after each day's logging, at the end
of the week, and before renewal. Exit demo with **Return to phone-only log** before
exporting; demo data is excluded. Canceling the share sheet does not save a backup.

The versioned JSON includes owner-scoped app rows (including tombstones), workout
drafts, timer, weekly progress and milestones. It excludes other owners, demo,
auth credentials, sync metadata and Health/Oura caches. Image files are not embedded.
The existing recovery export is SQLite, not JSON; this adds a minimal JSON export.
There is no JSON restore/import UI in this checkout, and this task does not add one.
Retain the JSON as a recovery source; it cannot yet restore an installation by itself.

Apple's free Personal Team provisioning expires after **seven days**. Before expiry,
export the backup, reconnect the phone, keep the same Apple Account, bundle ID and
app, then repeat Xcode **Product → Run** (or the configured `expo run:ios --device`
command). Xcode renews signing and installs over the existing app. **Do not delete
the app**; uninstalling removes its SQLite data. Re-test launch and your last session
immediately after renewal. After any clean prebuild, reselect the Personal Team.

## Core smoke checklist (Will; record pass/fail/blocked)

- [ ] **Onboarding/demo:** phone log opens without an account; Settings → Account →
  Look around first opens demo; Return to phone-only log preserves the log. The
  existing `/onboarding` route remains a stub, not completed onboarding.
- [ ] **Three sets:** create a freestyle workout, add an exercise, enter and finish
  three sets, background/reopen, and verify values persist.
- [ ] **Rest timer:** complete a set, change/skip rest, lock/unlock the phone and
  check elapsed time on return. No widget, Live Activity or push registration occurs.
- [ ] **Finish:** finish the session and verify summary/history after relaunch.
- [ ] **Offline:** load the embedded bundle, enable Airplane Mode, force-quit/reopen,
  log sets and finish without Metro; verify SQLite history and JSON export to Files.
- [ ] **App lock:** record **blocked/not implemented** for app-level biometric/PIN
  lock in this checkout. Separately test ordinary iPhone lock/unlock persistence;
  that does not establish an app privacy lock.
- [ ] **Barcode:** record **blocked/not implemented**; food logging is a placeholder
  and no scanner/camera module is installed. Do not mark barcode as passed.
- [ ] **Capabilities:** Health/Notifications show “Not in this build”; no permission
  prompt/crash. Inspect signing has no unsupported entitlements or extension.
- [ ] **Backup/renewal:** verify saved JSON, renew in place and confirm logs remain.

## References

- [Apple account and Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [Expo local signing in Xcode](https://github.com/expo/fyi/blob/main/setup-xcode-signing.md)
- [Expo Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/)
- [Expo CLI device builds](https://docs.expo.dev/more/expo-cli/)
- [EAS profile reference](https://docs.expo.dev/eas/json/)
- [EAS local-build limitations](https://docs.expo.dev/build-reference/local-builds/)
- SDK 58 embedded bundle behavior checked against installed
  `expo-dev-client/plugin/src/pluginConfig.ts` and
  `expo-dev-launcher/ios/EXDevLauncherController.m`.
