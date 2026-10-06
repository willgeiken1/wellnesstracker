# Insight Privacy Policy

_Last updated: October 6, 2026_

Insight is a personal fitness app built and run by an individual developer as a hobby project, shared with a small group of friends and family. This page explains, in plain language, what information Insight handles, where it goes, and the choices you have.

## What Insight collects

**Your account.** Your email address and a password. Your password is handled by Supabase's sign-in service and is not stored in readable form.

**Your profile.** The name, date of birth, sex, height, weight, weigh-ins, units, and daily activity level you enter. Insight uses these to calculate things like strength relative to bodyweight, calorie and protein targets, and how your heart rate variability compares with others your age.

**Your training.** Workouts, sets, reps, weights, notes, routines, goals, cardio sessions, and app settings such as your color theme.

**Your food.** Meals you log, their calories and macros, your favorites, and your daily targets.

**Progress photos.** Only if you add them. They are saved on your device and, when you are signed in, in a private storage area tied to your account.

**Oura Ring data.** Only if you connect your ring. Insight reads your sleep, readiness, heart rate variability, resting heart rate, body temperature, and step data. The login tokens that let Insight fetch this are kept in a private table that the app itself cannot read; only Insight's server functions can use them.

**Usage counts.** How many food photos (10 a day) and written meal descriptions (20 a day) you send for an estimate. Each count resets at midnight in your time zone.

## Who else handles your information

- **Supabase** provides Insight's database, sign-in, photo storage, and server functions. Your account data, backups, and photos are stored there.
- **Anthropic** estimates nutrition. When you use "Snap your plate," a resized copy of the photo, and any note you type with it, is sent through Insight's server to Anthropic's Claude service. A written meal description you submit for an estimate is sent the same way. Insight does not keep the photo or the description after the estimate comes back. Anthropic handles that content under its own terms and privacy policy.
- **Open Food Facts** looks up packaged foods. When you scan or type a barcode, only the barcode number is sent.
- **Oura** supplies your ring data when you choose to connect it, using your permission.
- **Sentry** receives error reports when something in the app crashes. A report can include the crash details, basic device and browser information, and the id of your Insight account if you are signed in, so crash reports are linked to your account id. It does not include workouts, food, notes, photos, health numbers, or your email. IP addresses are not stored. Sentry is hosted in the United States.
- **PostHog** receives notes about which features get used, only if you turn on Share usage analytics. These notes are linked to your account id, so they are not anonymous. The list is short and fixed: which tab you opened; that a workout was saved; that a food log was saved and whether it came from a photo, a written description, or a manual entry; that the morning brief was changed; that the readiness plan was switched between normal and readiness; that a data export finished; that Insights was opened; or that a weekly report was opened. Those notes do not include health values, food text, notes, photos, or email. Location lookup from the IP address is turned off, and PostHog does not record your screen. PostHog is hosted in the United States.
- **GitHub Pages** hosts the app's files. **Google Fonts** and public code libraries (jsDelivr, and unpkg when the barcode scanner loads) deliver fonts and code to your browser. Like any website, these services can see your IP address and basic browser information when your device downloads from them.

Sentry and PostHog have separate switches in Settings → Privacy. **Send crash reports** controls Sentry. It is on by default, and you can turn it off. **Share usage analytics** controls PostHog. It is off until you turn it on. If you used an earlier version of Insight with its single sharing switch on, that choice carried over to this phone, and you can turn it off at any time. Both choices are kept on this device, not in your account.

## What Insight does not do

- It does not sell your information.
- It does not show ads.
- It does not use advertising trackers. Crash reports are sent only while Send crash reports is on, and the feature-usage notes above only while Share usage analytics is on.
- It does not currently share your data with other Insight users. Other users cannot see your workouts, food, photos, or health data.

## Where your data lives

A copy of your data is kept in your browser on your device so Insight works offline. If you sign in, it is also backed up to your account in Supabase. The person who runs Insight's database has technical access to stored data and will only use it to keep the app running or to fix problems.

## Your choices

- **Send crash reports** in Settings → Privacy. On by default, and remembered on this device. Turn it off to stop crash reports to Sentry.
- **Share usage analytics** in Settings → Privacy. Off until you turn it on, and remembered on this device. Turn it on to send the feature-usage notes above to PostHog; turn it off to stop them. Your workouts, food, and account are unchanged either way.
- **Edit or delete your information** inside the app: profile, workouts, sets, food entries, goals, cardio sessions, and photos can all be changed or deleted.
- **Delete a date range** in Settings → Privacy. This removes workouts, food logs, cardio, measurements, weigh-ins, check-ins, planned days, progress photos, and stored Oura days between the two dates you pick. Your account, routines, and saved meals stay. Oura's own copy of your ring data is not deleted. A later sync will not bring those days back into Insight.
- **Export your data** in Settings → Privacy. Insight downloads a zip of CSV files (workouts, sets, food, measurements, weigh-ins, cardio, Oura days, goals, and a list of progress photos). The photo image files are not in the zip.
- **App lock** in Settings → Privacy. Optional. When it is on, this phone asks for Face ID, Touch ID, or the device passcode before showing Insight. If the device can't do that, Insight asks for a 6-digit code instead. Insight never receives your face, fingerprint, or device passcode. If that unlock isn't available, sign in again with your email and password to open the app. That does not delete anything.
- **Disconnect Oura** in Settings. This removes the Oura login tokens and the Oura data Insight stored. You can also remove Insight's access from your Oura account.
- **Delete your account** in Settings → Privacy. You confirm by typing DELETE. This permanently removes your sign-in and everything stored with the account, including workouts, food, cardio, measurements, Oura data, and photos, and it erases the copy on that phone. You can also email the address below.
- **Sign out** at any time in Settings. Signing out does not erase the copy kept in your browser; clear your browser's site data, or use Erase this phone in Privacy when you are signed out, to remove it.

## How long data is kept

Until you delete it, delete the date range it falls in, or delete your account.

## Children

Insight is not intended for anyone under 13, and it asks for a date of birth during setup.

## Not medical advice

Insight's calorie, readiness, and training estimates are for general fitness use. They are not medical advice, and they are not a substitute for a doctor or other health professional.

## Changes to this policy

If Insight changes in a way that affects your information, this page will be updated and the date at the top will change.

## Contact

Questions, or a request to delete your account: insight.wellnessos@gmail.com
<!-- pages-retrigger: 2026-10-05 -->
