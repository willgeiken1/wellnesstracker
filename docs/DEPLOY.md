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
