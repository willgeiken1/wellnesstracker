# Native npm audit triage — M3-22

Recorded October 22, 2026 at base `f016079`, Node 24.21.0 / npm 11.19.0, after the SDK 58 patch update in #78. Supersedes the October 17 P2a snapshot. Package manifests and lockfile are unchanged in this task.

## Results and action

| Command (from native/) | Moderate | High | Total affected-package records | Exit |
| --- | ---: | ---: | ---: | ---: |
| `npm audit --omit=dev` (captured with `--json`) | 19 | 21 | 40 | 1 |
| `npm audit` (captured with `--json`) | 18 | 30 | 48 | 1 |

Both reports contain **three distinct advisories**, below; low/critical are zero. These totals are dependency/peer propagation records, not 40 or 48 distinct vulnerabilities. npm's omit-dev graph reports different propagated severity counts; it is not a shipped-bundle reachability analysis. Expo/RN production dependencies include host CLI/bundler tools and peer cycles (even test packages can appear in the omit-dev report).

No fix applied: npm proposes incompatible major downgrades (Expo 44.0.6, Jest 25.0.0 or jest-expo 56.0.0), not an SDK 58 patch/minor remedy. Registry checks return latest braces 3.0.3, node-forge 1.4.0 and sprintf-js 1.1.3, all within the reported affected ranges. Thus no available non-major patch/minor release resolves these findings. No SDK change, override, forced audit fix, or unrelated dependency bump was made. Re-run both audits when upstream fixes land; accept the current host-tool exposure with the reasons below while waiting for Expo/tooling updates.

## Advisory inventory

| Advisory / installed package | Severity and affected range | Dependency path / affected behavior | Reaches shipped phone app? | Action |
| --- | --- | --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces@3.0.3` | High; `<=3.0.3` | `expo → @expo/metro → metro-file-map → micromatch → braces`; recursive glob parsing can exhaust the host stack. Also reached by Jest tooling. | No affected module in either production export map; pure JS build/test tool, no native library. | **Wait for Expo/upstream**. No patched release. Accept current build/test exposure: this parser handles repository glob patterns, not app user input. |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), `node-forge@1.4.0` | High; `<=1.4.0` | `expo → @expo/cli → @expo/code-signing-certificates → node-forge` (CLI also uses it directly); RSA signature verification can accept an invalid nested algorithm structure. | No affected module in either production export map; Node certificate tooling, no native library. | **Wait for Expo/upstream**. No patched release. Accept current host-tool exposure; this app does not import forge or enable an app-side certificate verification feature. |
| [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), `sprintf-js@1.0.3` | Moderate; `<=1.1.3` | `jest → @jest/core → @jest/transform → babel-plugin-istanbul → @istanbuljs/load-nyc-config → js-yaml@3.15.2 → argparse@1.0.10 → sprintf-js`; unbounded precision formatting can exhaust resources. | No affected module in either production export map; coverage/config/argument parsing on the host. | **Wait for upstream tooling**. Latest 1.1.3 is also affected; updating within 1.x would not fix it. Accept current test/build exposure: no app user formatting reaches this package. |

The earlier uuid advisory is absent from both current audit reports; do not carry its old affected-package list forward. No claim is made about arbitrary future imports or web/server deployments.

## Evidence

- Installed dependency paths/manifests and `npm explain sprintf-js --json` identify host-only uses. Audit JSON supplies the linked advisory IDs/ranges and proposed remediation values; registry version queries confirm no patched release is available today.
- Fresh `expo export --platform ios --source-maps` and `expo export --platform android --source-maps` both passed with dotenv and telemetry disabled. Source maps contain 1,579 iOS sources and 1,714 Android sources, with **zero** sources from each of `braces`, `node-forge`, and `sprintf-js`. These packages have no native code to link. This is current bundle evidence, not the historical P1 export result.
- `expo install --check` reports dependencies up to date. `expo-doctor` passes 20/20. Export outputs and audit JSON are temporary verification artifacts, not shipped files.
- No real user/Health values, environment files or secrets were used. Exports are JS/Hermes bundle checks, not new simulator/emulator/store builds.

## All propagated package records

The following union inventories every package record in the two reports. Severity is npm's reported inherited severity, not an additional advisory in that package's runtime. Each row's immediate `via` dependencies allow tracing it back to the three advisory roots above. All share the root actions above; none has an allowed patch/minor fix. “Full only” means absent from this omit-dev report.

| Package | Full severity | Omit-dev severity | Immediate advisory dependency (`via`) |
| --- | --- | --- | --- |
| `@expo/cli` | high | high | `@expo/code-signing-certificates`, `@expo/metro`, `@expo/metro-config`, `node-forge` |
| `@expo/code-signing-certificates` | high | high | `node-forge` |
| `@expo/metro` | high | high | `metro`, `metro-config`, `metro-file-map`, `metro-transform-worker` |
| `@expo/metro-config` | high | high | `@expo/metro` |
| `@istanbuljs/load-nyc-config` | moderate | moderate | `js-yaml` |
| `@jest/core` | moderate | moderate | `@jest/reporters`, `@jest/transform`, `jest-config`, `jest-resolve-dependencies`, `jest-runner`, `jest-runtime`, `jest-snapshot` |
| `@jest/environment` | high | Full only | `@jest/fake-timers` |
| `@jest/expect` | moderate | moderate | `jest-snapshot` |
| `@jest/fake-timers` | high | Full only | `jest-message-util` |
| `@jest/globals` | moderate | moderate | `@jest/expect` |
| `@jest/reporters` | moderate | moderate | `@jest/transform` |
| `@jest/transform` | high | moderate | `babel-plugin-istanbul`, `jest-haste-map`, `micromatch` |
| `@react-native/community-cli-plugin` | high | high | `@react-native/metro-config`, `metro` |
| `@react-native/jest-preset` | high | Full only | `babel-jest`, `jest-environment-node` |
| `@react-native/metro-config` | high | high | `metro-config` |
| `@react-native/virtualized-lists` | high | high | `react-native` |
| `@testing-library/react-native` | high | high | `jest`, `react-native` |
| `argparse` | moderate | moderate | `sprintf-js` |
| `babel-jest` | high | moderate | `@jest/transform`, `@jest/transform`, `babel-plugin-istanbul` |
| `babel-plugin-istanbul` | moderate | moderate | `@istanbuljs/load-nyc-config` |
| `braces` | high | high | `GHSA-vfj7-8cjw-p6xm` |
| `expo` | high | high | `@expo/cli`, `@expo/metro`, `@expo/metro-config`, `expo-modules-core` |
| `expo-modules-core` | high | high | `react-native-worklets` |
| `expo-router` | high | high | `@testing-library/react-native` |
| `jest` | moderate | moderate | `@jest/core`, `jest-cli` |
| `jest-circus` | moderate | moderate | `@jest/expect`, `jest-runtime`, `jest-snapshot` |
| `jest-cli` | moderate | moderate | `@jest/core`, `jest-config` |
| `jest-config` | moderate | moderate | `babel-jest`, `jest-circus`, `jest-runner` |
| `jest-environment-node` | high | Full only | `@jest/environment`, `@jest/fake-timers` |
| `jest-expo` | high | Full only | `@jest/globals`, `@react-native/jest-preset`, `babel-jest`, `jest`, `jest-snapshot`, `jest-watch-typeahead` |
| `jest-haste-map` | high | Full only | `micromatch` |
| `jest-message-util` | high | Full only | `micromatch` |
| `jest-resolve-dependencies` | moderate | moderate | `jest-snapshot` |
| `jest-runner` | moderate | moderate | `@jest/transform`, `jest-runtime` |
| `jest-runtime` | moderate | moderate | `@jest/globals`, `@jest/transform`, `jest-snapshot` |
| `jest-snapshot` | moderate | moderate | `@jest/transform` |
| `jest-watch-typeahead` | moderate | Full only | `jest` |
| `js-yaml` | moderate | moderate | `argparse` |
| `metro` | high | high | `metro-config`, `metro-file-map`, `metro-transform-worker` |
| `metro-config` | high | high | `metro` |
| `metro-file-map` | high | high | `micromatch` |
| `metro-transform-worker` | high | high | `metro` |
| `micromatch` | high | high | `braces` |
| `node-forge` | high | high | `GHSA-86w9-cpqp-85rv` |
| `react-native` | high | high | `@react-native/community-cli-plugin`, `@react-native/virtualized-lists` |
| `react-native-reanimated` | high | high | `react-native`, `react-native-worklets` |
| `react-native-worklets` | high | high | `@react-native/metro-config`, `react-native` |
| `sprintf-js` | moderate | moderate | `GHSA-hp3w-g68c-fv3c` |
