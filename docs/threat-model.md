# Threat model — Insight Wellness (v1)

Updated Nov 17, 2026. Codex security review reads this file; keep it in step with `SECURITY.md`.

## What we protect
- **Health data:** Apple Health and Health Connect readings, Oura days, body weight, workouts, food logs, mood, energy and stress check-ins.
- **Account:** Supabase sign-in, the user's synced rows, the Oura connection.
- **Secrets:** Oura client secret and tokens, Supabase service-role key, deploy tokens (all server or CI only).

## Where data lives
- **Phone:** main SQLite database (in iCloud backup) holds the user's own logs; Health readings sit in a separate SQLite file in Caches (never backed up).
- **Supabase (Ohio):** synced rows under row-level security; Oura tokens and OAuth states readable only by the service role.
- **Sentry and PostHog (US):** crash and usage events with Health values stripped; both off when the user switches them off.
- **No AI in v1:** AI meal estimates and workout summaries are hidden in release builds.

## Entry points
- The app (signed-in user, or demo mode with no account).
- Edge Functions: `delete-account`, `oura-connect`, `oura-callback`, `oura-sync`, `purge-range`, `pwa-import`, and the AI functions kept off for v1.
- Oura's OAuth redirect and API replies; HealthKit and Health Connect reads; imported PWA files.
- CI and deploy workflows, including the one-time row-sync table apply.

## Threats to check
| Threat | Where | Expected guard |
|---|---|---|
| Health value reaches AI, Sentry, PostHog or logs | app telemetry, crash text, AI payloads | allowlist strip, egress tests with sentinel fields |
| Health readings land in iCloud backup | `native/src/data` | Health store in Caches; main file scrubbed after the move |
| User reads or writes another user's rows | sync, Edge Functions | RLS on `auth.uid()`; functions act only for the JWT's user |
| Oura token or OAuth state exposed or replayed | `oura-*` functions, `oura_*` tables | service-role only; single-use state bound to the user |
| Oura data returns after Disconnect | `oura-sync` racing Disconnect | sync checks the connection after writing and removes what it wrote |
| Deletion reported done but data kept | `delete-account`, app | server confirms; app erases only after confirmation |
| Lost or duplicated rows | sync and merge | version checks, regression and property tests |
| Secret committed or shipped | repo, app config, CI | publishable key only in app; secrets in CI environments |
| Untrusted import or API reply corrupts data | PWA import, Oura, sync replies | validation before storing; rejected rows surfaced, not dropped |
