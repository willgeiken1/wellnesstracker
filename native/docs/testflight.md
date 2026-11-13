# First TestFlight build (M4-02)

The store build runs on EAS cloud's free tier, as the plan decided (O-12). Everything else stays local.
Only Will does the steps that sign in to Apple or Expo. Agents never handle his passwords, keys or codes.

## What this repo sets up

- `eas.json` has a `production` profile: store distribution, Release build, build number kept by EAS and raised on every build (`appVersionSource: remote`, `autoIncrement`), and Node pinned to the CI version. The `free-iphone` profile is unchanged.
- `app.json` sets `ios.config.usesNonExemptEncryption: false`, so each build says the app only uses standard encryption (HTTPS) and TestFlight stops asking the export question.
- Capabilities come from the config plugins: HealthKit and the App Group `group.com.insightwellness.app` on `com.insightwellness.app`, and the App Group on the share extension `com.insightwellness.app.share`. EAS registers the extension and the App Group and turns the capabilities on during the first build.

## Will's one-time steps

1. **Register the App ID.** At developer.apple.com/account, open Certificates, Identifiers & Profiles, then Identifiers, then +. Pick App IDs, then App. Description `Insight Wellness`, Bundle ID Explicit `com.insightwellness.app`. Tick **HealthKit** and **App Groups**, then Register. If Apple says the ID is taken, stop and tell Claude; don't pick another one.
2. **Create the app record.** At appstoreconnect.apple.com, open Apps, then + and New App. Platform iOS, name `Insight Wellness`, primary language English (U.S.), bundle ID `com.insightwellness.app`, SKU `insight-wellness` (any unique text works; nobody sees it), Full Access. If the name is taken, stop and tell Claude. On an individual account, the App Store shows your legal name as the seller. The name under the icon on the phone still comes from `app.json` (`Insight Daily`) until that changes separately.
3. **Create the Expo project.** Sign in or sign up (free) at expo.dev, create a project with the slug `insight-daily`, and send Claude its project ID (not a secret). Claude adds it to `app.json` as `extra.eas.projectId`.
4. **Add the build's public settings.** In that project on expo.dev, open Environment variables and add these two to the **production** environment as plain text: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Use the publishable key only, never the service-role key.

## Build and upload (Will's Mac, after the PR merges)

From `native/` on an up-to-date `main`:

```sh
npm ci
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

- When asked, sign in to your Apple account in the terminal and pick the team **WILLIAM GERHARD GEIKEN**. Let EAS create the distribution certificate and the provisioning profiles for the app and the share extension.
- For the upload, let EAS create an App Store Connect API key when it offers to. It stores the key on Expo for later uploads.
- This uses one of EAS's free monthly builds. Free builds can wait in a queue before they start.

## Install on the iPhone

1. When the build finishes processing in App Store Connect (usually 10 to 30 minutes), open the app's **TestFlight** tab.
2. Under Internal Testing, add a group, add yourself, and turn on the build.
3. Install **TestFlight** from the App Store on the iPhone and accept the invite.

Internal testing needs no Beta App Review. External testing (M4-11) does.
