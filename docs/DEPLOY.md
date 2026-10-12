# Deploying the Supabase backend

Pushes to `main` that change files under `supabase/` deploy project `pvodxxmfgflvgvbdotlv`. The workflow is `.github/workflows/supabase-deploy.yml`. Run it by hand from the Actions tab with **Run workflow** on `main`. A manual run always deploys the `main` branch.

## Secret

Add this repository secret under Settings → Secrets and variables → Actions:

| Secret | Required | What it is |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | yes | Personal access token from the Supabase dashboard (Account → Access Tokens). `supabase link`, `supabase db push`, and `supabase functions deploy` use it. |
| `SUPABASE_DB_PASSWORD` | no | Database password. The access token is enough, which is how the manual deploy worked. When this secret is set, the CLI receives it as `SUPABASE_DB_PASSWORD`. |

The workflow fails if `SUPABASE_ACCESS_TOKEN` is missing. It does not print either value.

Create the token at <https://supabase.com/dashboard/account/tokens>.

## What a run does

The Supabase CLI is pinned to **2.119.0**.

- When `supabase/migrations/` changes, the job runs `supabase link --project-ref pvodxxmfgflvgvbdotlv`, then `supabase db push --yes`.
- It deploys only the functions whose folders changed between `github.event.before` and `github.sha`. Every deploy uses `--no-verify-jwt --use-api`.
- A change under `supabase/functions/_shared/` (or any other folder that is not a function) redeploys every function. That shared code is bundled into the functions that import it. `_shared` is not deployed as a function.
- A manual run, or a push whose diff cannot be computed, applies pending migrations and deploys every function.
- Two deploys never run at the same time. The next one waits.

`link`, `db push`, and `functions deploy` run against the committed `supabase/` directory.

## Live checks

`.github/workflows/live-checks.yml` opens the deployed GitHub Pages app. **Run workflow** also deletes a throwaway account and checks that its rows and progress photo are gone, when the service role secret is set. The Monday 16:00 UTC schedule runs the page check only. That step receives the email and password, and it does not receive the service role key. The workflow does not run on pull requests or pushes. Pick this branch before the workflow is on `main`.

The job stays green and skips when the email or password secret is missing. It does not print any of these values. The purge check fails if the page cannot push its save. If the delete check fails after the throwaway account exists, it deletes that account, and any cleanup error is redacted before it is reported. A later run signs into the same address when the account is still there.

Add the secrets under Settings → Secrets and variables → Actions:

| Secret | Required | What it is |
| --- | --- | --- |
| `INSIGHT_TEST_EMAIL` | yes, or the job skips | A mailbox you can throw away. The local part must contain `insight-live` as its own word, for example `you+insight-live@gmail.com`. The job can reset this password and it deletes the account. Do not use a personal login. |
| `INSIGHT_TEST_PASSWORD` | yes, or the job skips | Password for that address. 8 to 200 characters. |
| `INSIGHT_TEST_SERVICE_ROLE_KEY` | yes for the delete check | Service role (or secret) key for project `pvodxxmfgflvgvbdotlv`. Email confirmation is on, so CI cannot finish signup by itself. The key is used only to confirm this address, seed that user's rows and one progress photo, and after delete count that those are gone. The page check still runs when this secret is absent; the delete check skips. |

The service role can read every account. The test refuses any address that does not carry the `insight-live` marker, and it does not list other users.

Local run, with the same variables in the environment and Chromium installed:

```
npm ci
npx playwright install chromium
npm run pw:live
```

`npm run pw:live` exits 0 without printing the values when the email or password is unset.
