# Native npm audit triage — P2a

Recorded October 17, 2026 on `native/p1-followups`, based on main `b5f145e` (P1/M0; plan §0.1/§15.2, Q127).

**No runtime-reachable high advisory identified in the current scaffold.** The two high advisories affect JavaScript build/development tools. They remain unfixed because no patched releases are published. This assessment covers the current native entry bundles and installed dependency paths, not future imports.

## Counts and disposition

| Audit | Before: moderate / high / total | After: moderate / high / total |
| --- | --- | --- |
| `npm audit --json` | 8 / 19 / 27 | 8 / 19 / 27 |
| `npm audit --omit=dev --json` | 8 / 19 / 27 | 8 / 19 / 27 |

All runs returned exit 1 for findings; low/critical counts are zero. These are **27 affected-package records from three distinct advisories**, including propagated and cyclic peer-dependency findings. `--omit=dev` keeps Expo/RN's production-declared CLI/build dependencies; it does not measure code shipped on a phone.

No packages fixed or changed. `npm audit fix --dry-run --json` still reported 27 findings and proposed no advisory resolution within current ranges, so an actual install was not applied. No overrides were added:

- **braces 3.0.3:** latest registry release; [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects <=3.0.3 and has no patched version. Await upstream depth guards; no safe patch/minor override exists.
- **node-forge 1.4.0:** latest registry release; [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) affects <=1.4.0 and has no patched version. Await upstream signature-verification fix.
- **uuid 7.0.3:** [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) is fixed in 11.1.1, outside `xcode@3.0.1`'s `^7.0.3` range. This is a major upgrade, disallowed here; await compatible upstream Xcode tooling. Only tooling imports this npm package; Expo's runtime UUID implementation is separate.

Audit's suggested Expo 44.0.6, RN 0.72.17, splash-screen 55.0.25, Reanimated 4.2.2 and Worklets 0.7.4 are downgrades, not safe SDK 58 fixes. None were applied. `npx expo install --check` passes with the existing package manifest/lockfile unchanged.

## Advisory inventory

“Dev-only” below means execution in CLI, configuration, bundler, or build tooling, even when installed through `dependencies`. “Runtime” means Metro-bundled code or linked native code. Reachability describes the **advisory's affected code**, not whether an ancestor package has any runtime code.

| Package | Severity | Advisory ID / URL | Representative dependency path from app root | Role | Runtime-reachable in shipped app bundle? |
| --- | --- | --- | --- | --- | --- |
| `braces@3.0.3` | High | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `expo → @expo/metro → metro-file-map → micromatch → braces` | Dev-only | No — recursive glob parser runs in Metro's file-map tooling; absent from both native export maps. |
| `node-forge@1.4.0` | High | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `expo → @expo/cli → @expo/code-signing-certificates → node-forge` (also CLI direct) | Dev-only | No — Node certificate/signature tooling; absent from both native export maps, no native code. |
| `uuid@7.0.3` | Moderate | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `expo → @expo/config-plugins → xcode → uuid` | Dev-only | No — Xcode project ID generation on the build host; npm uuid absent from both native export maps. |

The remaining affected-package records below inherit those advisories via dependencies/peers; they do not introduce additional advisory IDs. B = [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), F = [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), U = [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Paths are representative; Expo/RN peer cycles can lead back to the same root advisory.

| Package | Severity | Advisory (above) | Dependency path root | Role | Runtime-reachable affected code? |
| --- | --- | --- | --- | --- | --- |
| `@expo/cli` | High | B, F, U | `expo → @expo/cli` | Dev-only tools + runtime require helper | No — bundled `metro-require/require.js` does not import affected tooling. |
| `@expo/code-signing-certificates` | High | F | `expo → @expo/cli → @expo/code-signing-certificates` | Dev-only | No — certificates generated/checked by Node CLI, not app code. |
| `@expo/config` | Moderate | U | `expo → @expo/config` | Dev-only | No — app-config evaluation on host. |
| `@expo/config-plugins` | Moderate | U | `expo → @expo/config-plugins` | Dev-only | No — Xcode project generation on host. |
| `@expo/inline-modules` | Moderate | U | `expo → @expo/cli → @expo/inline-modules` | Dev-only | No — native-module configuration tooling. |
| `@expo/local-build-cache-provider` | Moderate | U | `expo → @expo/local-build-cache-provider` | Dev-only | No — host build-cache tooling. |
| `@expo/metro` | High | B | `expo → @expo/metro` | Dev-only bundler + runtime helpers | No — HMR helper is present; vulnerable glob/file-map tooling is absent. |
| `@expo/metro-config` | High | B, U | `expo → @expo/metro-config` | Dev-only | No — Metro configuration runs on host. |
| `@expo/prebuild-config` | Moderate | U | `expo → @expo/cli → @expo/prebuild-config` | Dev-only | No — prebuild configuration runs on host. |
| `@react-native/community-cli-plugin` | High | B | `react-native → @react-native/community-cli-plugin` | Dev-only | No — RN CLI's Metro server integration. |
| `@react-native/metro-config` | High | B | `react-native-worklets → @react-native/metro-config` (peer) | Dev-only | No — bundler configuration, not Worklets runtime. |
| `@react-native/virtualized-lists` | High | B | `react-native → @react-native/virtualized-lists → react-native` (peer cycle) | Runtime | No — list runtime is shipped, but audit propagates RN's CLI finding through a peer cycle. |
| `expo` | High | B, F, U | `expo` | Runtime + tools | No — runtime shipped; vulnerable code belongs to separate host-side imports. |
| `expo-modules-core` | High | B | `expo → expo-modules-core → react-native-worklets` (peer) | Runtime | No — native/JS runtime shipped; finding flows from Worklets' Metro/RN tooling peers. |
| `expo-splash-screen` | Moderate | U | `expo-splash-screen → @expo/config-plugins` | Runtime + config plugin | No — runtime splash implementation does not load Xcode config tooling. |
| `metro` | High | B | `expo → @expo/metro → metro` | Dev-only | No — bundle server/compiler; vulnerable parser absent from exports. |
| `metro-config` | High | B | `expo → @expo/metro → metro-config` | Dev-only | No — host bundler configuration. |
| `metro-file-map` | High | B | `expo → @expo/metro → metro-file-map` | Dev-only | No — host filesystem crawler. |
| `metro-transform-worker` | High | B | `expo → @expo/metro → metro-transform-worker` | Dev-only | No — host transformation workers. |
| `micromatch` | High | B | `expo → @expo/metro → metro-file-map → micromatch` | Dev-only | No — glob matching in file-map tooling; absent from exports. |
| `react-native` | High | B | `react-native → @react-native/community-cli-plugin → metro` | Runtime + tools | No — linked RN runtime does not execute Node's glob parser. |
| `react-native-reanimated` | High | B | `react-native-reanimated → react-native / react-native-worklets` (peers) | Runtime | No — peer-propagated Metro finding, not animation runtime code. |
| `react-native-worklets` | High | B | `react-native-worklets → @react-native/metro-config / react-native` (peers) | Runtime + tooling | No — runtime linked/bundled; affected dependencies are host-side peers. |
| `xcode` | Moderate | U | `expo → @expo/config-plugins → xcode` | Dev-only | No — Node PBX project manipulation; absent from exports. |

## Verification and limits

Evidence: full/omit-dev audit JSON, `npm explain braces node-forge uuid --json`, installed manifests/imports and registry version queries. The three advisory links above supply affected/fixed ranges. Inspected runtime imports in Expo, RN, Worklets, Reanimated, modules-core and splash-screen; Metro production exports with source maps provide platform-specific bundle evidence. These checks use scaffold/demo code only, with `EXPO_NO_TELEMETRY=1` and `EXPO_NO_DOTENV=1`.

- `npx expo export --platform ios --source-maps --output-dir /tmp/insight-p2a-ios-export`
- `npx expo export --platform android --source-maps --output-dir /tmp/insight-p2a-android-export`

Both exports succeed. Their source-map source lists contain zero modules from npm `braces`, `node-forge`, `uuid`, `micromatch`, `xcode`, or `metro-file-map`. Expo's CLI require polyfill and Metro HMR helper do appear; that does not pull in their vulnerable host tooling. The three affected packages are pure JavaScript tools, not linked native libraries. No simulator/emulator build, prebuild, or Release artifact re-check was performed. Reassess reachability when imports/dependencies change and rerun audits when upstream patches ship.
