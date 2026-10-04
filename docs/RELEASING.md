# Releasing Insight

The site is the static files in `logger/`, published by GitHub Pages from `main`. There is no build. Pushes to `main` that change `supabase/` deploy project `pvodxxmfgflvgvbdotlv` through `.github/workflows/supabase-deploy.yml`. This note does not change either of those.

## Version

`logger/js/version.js` is the only place the version is written. It is a semantic version (`MAJOR.MINOR.PATCH`), starting at `1.0.0`.

- The service worker cache name is `insight-shell-v` plus that version (`insight-shell-v1.0.0`).
- The Sentry release is the version itself (`1.0.0`).

`logger/sw.js` loads the file with `importScripts`. `logger/js/sentry.js` imports it. Tests fail if either file writes its own cache or release string, if any `insight-shell-v` plus an integer (the old hand bumps) shows up under `logger/` or `tests/`, or if a path in the service worker `SHELL` list is missing on disk.

Changing the version changes the cache name. The next online load installs that cache and deletes every other one, including `insight-shell-v29`. Offline behavior is otherwise the same: network-first, the cache is only the fallback, and a navigate that misses the cache falls back to `index.html`.

Bump `INSIGHT_APP_VERSION` in the pull request that should ship user-facing changes. Patch for a fix, minor for a feature, major when a phone still on the previous shell cannot tolerate the new backend. A migration still has to work for that previous shell, because open installs pick up the new page on the next online load, not at deploy time.

## Ship

1. Merge the pull request into `main`. Pages publishes that commit. If `supabase/` changed, the deploy workflow applies migrations and deploys the functions that changed. The Tests workflow runs on that push and on pull requests into `main`.
2. Confirm `INSIGHT_APP_VERSION` is the version you want to mark. If the merge did not bump it, bump it in a follow-up commit on `main` before tagging.
3. Tag that commit `vX.Y.Z`, where `X.Y.Z` is `INSIGHT_APP_VERSION`. Push the tag. Leave an existing release tag where it is.
4. Open a GitHub Release for the tag and generate the notes. `.github/release.yml` groups merged pull requests into Features (`enhancement` or `feature`), Fixes (`bug` or `fix`), and Other.

## After it is live

- **Sentry.** Look for new issues on the release equal to `INSIGHT_APP_VERSION`.
- **PostHog.** Check that these events are still arriving: `tab_viewed`, `workout_logged`, `food_logged`, `morning_brief_customized`, `readiness_plan_toggled`, `privacy_export`, `insights_opened`, `weekly_report_opened`.
- **Edge functions.** In the Supabase dashboard for project `pvodxxmfgflvgvbdotlv`, read the logs for the functions this release deployed. The Deploy Supabase action should be green when `supabase/` changed.
- **Live shell.** Open <https://willgeiken1.github.io/wellnesstracker/logger/js/version.js> and confirm the version. `logger/sw.js` on that host should `importScripts` that file.

## Roll back

Pages deploys from `main`, not from the tag. Revert the bad commits on `main` (the frontend and, if needed, the edge functions) so the next push republishes the previous shell and redeploys the previous functions. Then set `INSIGHT_APP_VERSION` to a new patch. That new cache name makes open installs drop the bad shell. Do not reuse the broken version's cache name.

Migrations that have already run stay applied. Fix them with a new migration. Do not edit or delete a migration production has applied, and do not point the database back at an older migration.
