# Google Play: v1 setup and Play Console answers (draft)

Drafted Nov 16, 2026, after Will's decision to include Google Play in the Insight Wellness launch. Android v1 ships **without Health Connect** (Will, Nov 16): no Health Connect permissions, Oura is the only connection on Android, and Apple Health stays iPhone-only. Health Connect comes in a later update with its own declaration.

Nothing here is submitted. Every answer is for Will to check and enter in the Play Console. Sources are Google's own help pages, read Nov 16, 2026.

## Timeline (Google's rules for a new personal account)

| Step | Who | Time |
|---|---|---|
| Play Console personal account, $25 one-time; legal name, address, ID if asked, email and phone codes | Will | Payments check up to 5 days |
| Verify a real Android 10+ phone in the Play Console app | Will (borrowed phone is fine) | About a minute |
| Closed test with **12+ testers opted in for 14 days in a row** | Will invites (aim for 14+, via a Google Group) | 14 days |
| Apply for production access | Will | Usually 7 days or less |
| Production review | Google | No fixed time; can be 7 days or longer |

Best case from a Nov 16 sign-up is a production release around Dec 15 to 20. The App Store launch does not wait for Play.

Risk: Google says some "health apps, such as medical apps and human subjects research apps" must use an organization account (D-U-N-S takes up to 30 days). Insight Wellness is a fitness and wellness app, which reads as personal-account eligible, but Google doesn't say so outright.

Sources: support.google.com/googleplay/android-developer/answer/6112435, /13628312, /14151465, /9859751

## Build

- Package `com.insightwellness.app`, min API 29 (Android 10). Expo SDK 58 / React Native 0.88 targets API 36, which Play requires for new apps since Aug 31, 2026 (support.google.com/googleplay/android-developer/answer/11926878). Confirm on the first AAB.
- `eas build --profile production --platform android` makes a signed AAB on EAS (Play App Signing; let EAS create the upload key).
- First upload goes to the closed test track. Upload a first AAB by hand in the Play Console; `eas submit` can take over after.
- Not yet run: an Android release build. CI builds iOS only.

## Data safety (App content › Data safety)

Answers match the published privacy policy (insight-daily-privacy) for an Android build without Health Connect.

- Does the app collect or share user data? **Yes**
- Is all collected data encrypted in transit? **Yes** (HTTPS to Supabase, Sentry, PostHog, Oura, Open Food Facts)
- Can users request deletion? **Yes**, in the app and at the deletion page below
- Is data shared with third parties? **No** (Supabase, Sentry and PostHog are service providers acting for us, which Google does not count as sharing; Open Food Facts gets only a barcode number)

| Data type (Google's category) | Collected | Optional? | Purposes |
|---|---|---|---|
| Personal info › Email address | Yes | Required for an account | Account management |
| Personal info › Name | Yes | Required for an account (profile) | App functionality, account management |
| Personal info › Other info (date of birth, height) | Yes | Required for an account | App functionality |
| Personal info › User IDs (account ID) | Yes | Required for an account | Account management, analytics, app functionality |
| Health and fitness › Health info (weigh-ins, body measurements, food logs, Oura heart rate, HRV, temperature) | Yes | Optional | App functionality |
| Health and fitness › Fitness info (workouts, sets, cardio, Oura sleep, readiness, activity) | Yes | Optional | App functionality |
| Photos and videos › Photos | No | | Photo files stay on the phone; only progress photo details (such as dates) sync, and those are part of fitness info. The app has no file upload to Supabase Storage |
| App activity › App interactions | Yes | Optional (off by default) | Analytics (PostHog) |
| App info and performance › Crash logs, Diagnostics | Yes | Optional (on by default, can be turned off) | Analytics (Sentry) |
| Device or other IDs | Check | | Sentry and PostHog are tied to the account ID. PostHog also makes its own random install ID before sign-in; if analytics can run signed out, mark this collected, optional, analytics |

Account deletion URL: https://willgeiken1.github.io/wellnesstracker/insight-wellness-delete-account (live once this PR merges)

Source: support.google.com/googleplay/android-developer/answer/10787469

## Account deletion (Google's rule)

- In the app: Settings › Account › Delete account (shipped in #180).
- On the web: `insight-wellness-delete-account.md` in this PR, published by GitHub Pages at the address above, with the email route for people without the app.
- Deleting the account deletes its data. Crash reports and usage events already sent to Sentry and PostHog are not deleted, and the page says so. On the free plans Insight uses, Sentry keeps crash reports 30 days and PostHog keeps usage events one year (each service's own retention docs, Nov 18); Will to confirm the plans before the Data safety form.

Source: support.google.com/googleplay/android-developer/answer/13327111

## Health apps declaration (App content › Health apps)

- Health features: **Fitness and wellness** (activity and workout logging, nutrition and food logging, weight and body measurements, sleep and recovery from a connected ring). Not a medical device; no diagnosis or treatment claims.
- Health Connect: **not used in this version**. No Health Connect permissions are requested, so no Health Connect permissions declaration is filed for v1.
- Privacy policy: the same policy as the store listing.

Source: support.google.com/googleplay/android-developer/answer/14738291

## Other App content items

- Privacy policy URL: https://willgeiken1.github.io/wellnesstracker/insight-daily-privacy. Android wording is drafted (iPhone and Android app; Apple Health iPhone only; no Health Connect; deletion page linked; Sentry 30 days and PostHog one year, the free plans' retention, for Will to confirm). It goes live only when Will merges it.
- Ads: **No ads**.
- App access: sign-in required; give Google the demo account (same as Apple's, LT-3).
- Content rating: IARC questionnaire, expected Teen per the plan (13+).
- Target audience: 13+ (the policy says not for under 13).
- Government app, financial features, news: No.

## Already done in the app for Android (this PR)

- Connections lists only Oura on Android; the Apple Health card was already hidden there.
- Edit Home offers only the Steps and Sleep tiles on Android, the two an Oura ring can fill; connecting Oura adds only those two.
- Copy that named Apple Health (welcome, Home tile descriptions, Score, Recovery, Oura notes) has Android wording that names only Oura.
