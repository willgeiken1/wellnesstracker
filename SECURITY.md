# Security — wellnesstracker (Insight Wellness)

## Reporting
Email insight.wellnessos@gmail.com. Don't open a public issue that contains user data, a token or a working exploit.

## Security review guidelines
Codex and every reviewer use these with `docs/threat-model.md` and `AGENTS.md` §4 and §7. Report a finding as P0/P1 when it can expose, lose or corrupt a user's data.

1. **Health data stays on its paths.** Health, Oura, body-weight and check-in values never reach AI, Sentry, PostHog, logs or crash text, and Health readings never land in files iCloud backs up.
2. **Row-level security on every user table.** Each new or changed table in `supabase/` or `native/server/` enables RLS with policies keyed to `auth.uid()`; no grant to `anon` beyond what sign-in needs.
3. **Service role only in Edge Functions.** `supabase/functions/` may use the service role; the app never does. A function acts only for the user its JWT names.
4. **Oura tokens never leave the server.** `oura_tokens` and `oura_oauth_states` have no `anon` or `authenticated` access; OAuth `state` is single-use and bound to the user; Disconnect removes tokens and synced days.
5. **Deletion is complete and confirmed.** `delete-account` removes every row the user owns (or the user's storage objects) and the app erases its copy only after the server confirms.
6. **No secrets in the repo or the app.** Only the Supabase publishable key and public client DSNs ship in the app.
7. **Inputs from outside are untrusted.** Oura, HealthKit, Health Connect, imported PWA files and sync replies are validated before they are stored or shown.

Out of scope: the static privacy and support pages, and design files.
