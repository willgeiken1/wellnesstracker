# Native permissions — M3-22

Recorded October 22, 2026 at base `f016079`. This is an inventory, not a permission change. Sources: `app.json`, installed SDK 58 config plugins, `expo config --type introspect` (with dotenv disabled), installed library Android manifests, and AndroidX biometric/core AAR manifests. Introspection does not run Xcode build phases or Android's manifest merger; the final store artifacts still need checking before distribution. The older P1 artifact inventory predates SecureStore and Network.

## iOS usage descriptions

These are every `*UsageDescription` key emitted by current configuration/plugins. Strings below are exact, including the build-time product-name placeholder.

| Key | Exact configured string | Feature/source | Still needed? |
| --- | --- | --- | --- |
| `NSLocalNetworkUsageDescription` | `Expo Dev Launcher uses the local network to discover and connect to development servers running on your computer.` | `expo-dev-launcher`; Metro discovery/connection | Debug only. Our build phase removes it in non-debug builds. |
| `NSFaceIDUsageDescription` | `Allow $(PRODUCT_NAME) to access your Face ID biometric data.` | Default `expo-secure-store` plugin string | Not currently used: session storage does not set `requireAuthentication`. Retained unchanged; confirm at M4-06. Keychain storage itself does not need Face ID permission. |

No camera, microphone, photo-library, location, tracking, HealthKit read/write or other usage-description keys are configured. Planned Health/notification features do not imply permissions in this build.

Related local-network keys are `NSBonjourServices = ["_expo._tcp"]` and, when supplied by the native template/build, `NSAppTransportSecurity.NSAllowsLocalNetworking = true`. They are not purpose strings. `withStripLocalNetworkingRelease` removes both plus the local-network description unless a complete `DEBUG=1` preprocessor token is present (configuration names alone do not grant access). Current introspection emits the Bonjour and description keys, but does not emit `NSAllowsLocalNetworking`. Introspection's `NSAppTransportSecurity.NSAllowsArbitraryLoads = true` comes from the placeholder `Info.plist`; the Release-build plist check is in M4-06.

M3-22 validation runs the generated, serialized/plutil-decoded phase against synthetic processed plists with real macOS PlistBuddy: Release/Profile/non-debug custom builds have all three keys absent; Debug retains them. The macOS CI strict step now requires a positive pass count, zero failures, zero skips and zero todos. It runs for PRs touching `native/**` or the native workflow in this public repository; the existing public-repository guard avoids paid private-repository macOS minutes. This is script verification, not a new Xcode Release build. Historical artifact evidence is in [p1-report.md](p1-report.md#release-permissions-recorded-at-p1-merge-main-b5f145e).

## Android permissions

Android permissions have exact identifier strings rather than app-authored purpose strings; any system prompt copy comes from Android. “Release + Debug” below includes permissions contributed by autolinked libraries/AARs, beyond the app manifest emitted by config introspection.

| Exact permission string | Builds / source | Feature | Still needed? |
| --- | --- | --- | --- |
| `android.permission.INTERNET` | Release + Debug; Expo template, FileSystem, Image | Account/network requests and development Metro | Yes. Normal permission; no runtime prompt. |
| `android.permission.VIBRATE` | Release + Debug; template / Haptics | Workout haptic feedback (`features/workout/haptics.ts`) | Yes. Normal permission. |
| `android.permission.ACCESS_NETWORK_STATE` | Release + Debug; Network, Image; also dev-launcher Debug | Connectivity listener used by auth/sync and image retry | Yes. Normal permission. |
| `android.permission.ACCESS_WIFI_STATE` | Release + Debug; Network | Library Wi-Fi/network APIs | Not required by current connectivity-listener usage; declared by the library. Retained unchanged for separate permission review. |
| `android.permission.USE_BIOMETRIC` | Release + Debug; SecureStore → `androidx.biometric:biometric:1.1.0` | Optional authenticated secure storage | Not used by current session storage; library declaration retained unchanged; confirm at M4-06. Normal permission. |
| `android.permission.USE_FINGERPRINT` | Release + Debug; same biometric AAR | Legacy biometric compatibility | Not used by current session storage; library declaration retained unchanged; confirm at M4-06. Normal permission. |
| `com.insightwellness.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Release + Debug; AndroidX core declares and uses it at signature protection level | Non-exported dynamic receiver protection | Yes; library infrastructure, no user prompt. |
| `android.permission.ACCESS_LOCAL_NETWORK` | Debug only; dev client / Metro | Development server discovery/connection | Debug only; not in Release. |
| `android.permission.CHANGE_WIFI_MULTICAST_STATE` | Debug only; dev-launcher debug manifest | Development server discovery | Debug only; not needed in Release. Normal permission. |

Explicitly blocked in `app.json` (manifest-merger removal entries, **not requested**): `android.permission.SYSTEM_ALERT_WINDOW`, `android.permission.READ_EXTERNAL_STORAGE`, `android.permission.WRITE_EXTERNAL_STORAGE`. FileSystem/Image still declare storage upstream, but the app removes those declarations. No Health Connect, camera, audio, location, notification, exact-alarm or foreground-service permission is currently configured. Re-check the merged manifests when those features or dependencies change.

No purpose strings, permissions, entitlements, App Group, HealthKit or push settings were edited in M3-22.
