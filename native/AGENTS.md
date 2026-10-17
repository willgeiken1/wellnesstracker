# Native-folder addendum

Follow [../AGENTS.md](../AGENTS.md); root rules win. This addendum adds native-folder guidance only.

- Expo SDK 58 development builds only; never Expo Go. Build locally with `npx expo run:ios` (iOS simulator) or `npx expo run:android` (Pixel/Medium_Phone emulator).
- No paid EAS builds. Never run `eas build`, `eas submit`, or `eas update` unless the plan and Will explicitly say so.
- Use Continuous Native Generation (CNG) and config plugins only. Never hand-edit or commit `native/ios` or `native/android` (the `ios/` and `android/` folders here).
- Always use `npx expo install <package>` for dependency additions. Check [versioned Expo SDK 58 docs](https://docs.expo.dev/versions/v58.0.0/) rather than memory.
- Run `npx tsc --noEmit`, `npx expo lint`, and `npx expo-doctor` from this folder before declaring done; also follow the root dependency checks.
- Codex only pushes branches and opens draft PRs when authorized; never merges, marks ready, touches main, or reads/prints/moves secrets. Task-specific instructions may reserve commits and pushes for the coordinator.
- Expo Router routes live in `src/app/`. Keep non-route code outside that directory.
