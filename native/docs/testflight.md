# First TestFlight build (M4-02)

The store build runs on EAS cloud's free tier, as the plan decided (O-12). Everything else stays local.
Only Will does the steps that sign in to Apple or Expo. Agents never handle his passwords, keys or codes.

## Automatic deploys (Will approved, Nov 27 2026)

Will asked for builds and updates to happen on their own after each merge to main, replacing the manual steps below.
- `.eas/workflows/deploy-production.yml` runs on Expo's servers when a change to `native/` merges to main. If the native code changed (new fingerprint), it builds the `production` profile and submits it to TestFlight; the build number rises on its own. If only JavaScript changed, it publishes an over-the-air update to the `production` channel instead.
- The store build includes expo-updates (`runtimeVersion` policy `fingerprint`, checked on launch). The phone-only `free-iphone` build keeps updates off. Updates reach only builds that include expo-updates.
- One-time setup, Will only: connect the repo in the Expo project's GitHub settings with base directory `native`; let EAS store the App Store Connect API key (`npx eas-cli@latest credentials --platform ios`, production, App Store Connect API Key, set up for EAS Submit). The app's App Store ID (6835021129) is in `eas.json` as `submit.production.ios.ascAppId`. All of this works from a phone in Safari: link GitHub under expo.dev account settings, Connections, then connect the repo with base directory `native` in the project's Project settings, GitHub; after that, Workflows on expo.dev also offers Run workflow for a deploy by hand.
- Free plan: 15 iOS builds and 60 workflow minutes a month. Each native merge uses a build.

## What this repo sets up

- `eas.json` has a `production` profile: store distribution, Release build, build number kept by EAS and raised on every build (`appVersionSource: remote`, `autoIncrement`), and Node pinned to the CI version. The `free-iphone` profile is unchanged.
- `app.json` sets `ios.config.usesNonExemptEncryption: false`, so each build says the app only uses standard encryption (HTTPS) and TestFlight stops asking the export question.
- Capabilities come from the config plugins: HealthKit and the App Group `group.com.insightwellness.app` on `com.insightwellness.app`, and the App Group on the share extension `com.insightwellness.app.share`. EAS registers the extension and the App Group and turns the capabilities on during the first build.

## Will's one-time steps

1. **Register the App ID.** At developer.apple.com/account, open Certificates, Identifiers & Profiles, then Identifiers, then +. Pick App IDs, then App. Description `Insight Wellness`, Bundle ID Explicit `com.insightwellness.app`. Tick **HealthKit** and **App Groups**, then Register. If Apple says the ID is taken, stop and tell Claude; don't pick another one.
2. **Create the app record.** At appstoreconnect.apple.com, open Apps, then + and New App. Platform iOS, name `Insight Wellness`, primary language English (U.S.), bundle ID `com.insightwellness.app`, SKU `insight-wellness` (any unique text works; nobody sees it), Full Access. If the name is taken, stop and tell Claude. On an individual account, the App Store shows your legal name as the seller. The name under the icon also reads `Insight Wellness` (from `app.json`).
3. **Create the Expo project.** Sign in or sign up (free) at expo.dev and create a project with the slug `insight-daily`. Done Nov 15: its ID is in `app.json` as `extra.eas.projectId`.
4. **Account/sync settings only, if approved for this build.** `EXPO_PUBLIC_` values are baked into the app when it is built, and the cloud build never reads a `.env` file or your Mac's shell (`EXPO_NO_DOTENV=1`). A setting missing from the Expo project's **production** environment is missing from that build, and adding it later needs a new build. Only the two public account/sync values below belong in this step. Database changes and enabling accounts/sync require their own release approval; these are not telemetry settings:

   ```sh
   npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://pvodxxmfgflvgvbdotlv.supabase.co
   npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "PASTE_PUBLISHABLE_KEY_HERE"
   ```

   - Replace `PASTE_PUBLISHABLE_KEY_HERE` with the key and keep the quotes. Angle brackets would break the command in Terminal.

   - The publishable key starts with `sb_publishable_` and is under Project Settings, API Keys in the Supabase dashboard. Never use the secret or service-role key; `native/src/auth/config.ts` refuses anything else.
   - For an account-enabled build, reconcile the row-sync flag and the separate schema-deployment receipt against the intended target. A flag is not a migration receipt. If either is unknown, stop; do not run a migration to resolve conflicting records. See `docs/DEPLOY.md`, "Row-sync tables for the iPhone app", for the separately approved process.
   - **Reporting hold:** do not request, create, copy, or set a Sentry DSN or PostHog key for this build. If previous build settings might supply either, stop and have the authorized release owner verify the effective configuration privately. Do not paste configuration values into logs, tickets, or chat.
   - **Before building or uploading:** require the reviewed reporting-hold source and a verified build configuration. Do not treat missing keys, this documentation change, or a source test as proof that an installed build sends nothing. Inspect the exact built artifact before a separately approved upload. A TestFlight-only device check can follow a restricted internal install for that purpose: validate that same build with synthetic inputs, including upgrade and queued-report behavior, before broader distribution. Historical reports and older installed clients remain separate reviews.

## Readable crash reports (only once reporting is approved)

Store builds upload their source maps and debug symbols to Sentry, so crash reports show real file names and lines. The upload runs only in a build that has `SENTRY_AUTH_TOKEN`; without it the build skips the upload and still succeeds. The reporting hold above still applies: don't add this token for a build that is under the hold.

1. In Sentry (US), create a React Native project named `insight-app` in the `insight-0j` organization. Its DSN is the `EXPO_PUBLIC_SENTRY_DSN` setting.
2. In Sentry, open Settings, then Organization Tokens, and create a token. Organization tokens can only upload source maps and debug files.
3. Store it as a secret in the Expo project's production environment, pasting the token in place of the placeholder and keeping the quotes:

   ```sh
   npx eas-cli@latest env:create --environment production --visibility secret --name SENTRY_AUTH_TOKEN --value "PASTE_SENTRY_TOKEN_HERE"
   ```

## Build and upload (Will's Mac, after the PR merges)

From `native/` on an up-to-date `main`:

```sh
npm ci
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
```

- When asked, sign in to your Apple account in the terminal and pick the team **WILLIAM GERHARD GEIKEN**. Let EAS create the distribution certificate and the provisioning profiles for the app and the share extension.
- Do not auto-submit. Record the exact build ID. Once the release owner has verified pre-upload source, configuration, and artifact evidence and approved upload, submit that specific artifact, not the latest build. Internal distribution or any public release is a separate decision. For an authorized upload, EAS can store an App Store Connect API key on Expo for later uploads.
- This uses one of EAS's free monthly builds. Free builds can wait in a queue before they start.

## Install on the iPhone

1. When the build finishes processing in App Store Connect (usually 10 to 30 minutes), open the app's **TestFlight** tab.
2. Under Internal Testing, add a group, add yourself, and turn on the build.
3. Install **TestFlight** from the App Store on the iPhone and accept the invite.

Internal testing needs no Beta App Review. External testing (M4-11) does.
