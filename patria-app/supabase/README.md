# Patria database (Supabase)

Slice 1 schema for CIR05, CIR01 and CIR02. Row Level Security must stay the source of access control. Never put the **service role key** in the app, in git, or in chat.

## Set up the Supabase CLI on a Mac

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it. The local database runs in Docker.
2. Install the CLI with Homebrew:

   ```bash
   brew install supabase/tap/supabase
   supabase -v
   ```

   If you prefer not to install globally, from `patria-app/` you can run `npx supabase@latest` in place of `supabase` below.
3. In Terminal:

   ```bash
   cd patria-app
   supabase start
   ```

   The first start downloads images and can take several minutes. When it finishes it prints the local API URL, `anon` key, and `service_role` key. Copy the URL and **anon** key into `patria-app/.env` later as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Do not copy `service_role` into `.env` for the app.

## Run the tests locally

With Docker running and `supabase start` already done:

```bash
cd patria-app
supabase test db
```

That applies migrations to the local database and runs pgTAP files in `supabase/tests/`. Every file runs in a transaction that is rolled back.

To recreate the local database from migrations and run tests:

```bash
supabase db reset
supabase test db
```

If `supabase start` or `supabase test db` fails, check that Docker Desktop is running.

## Apply migrations to your hosted Supabase project

1. Create a project at [supabase.com](https://supabase.com) (a US East region is fine if you are in Houston).
2. In the dashboard: **Project Settings → General** and copy the project ref (also in the project URL).
3. In the dashboard: **Project Settings → API** and copy the Project URL and the **anon public** key only.
4. Link and push (from `patria-app/`):

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

5. In the Table Editor, confirm the eight public tables exist and that RLS is enabled on each.

`supabase db push` applies SQL migrations. It does not run pgTAP on the cloud project. Keep using `supabase test db` locally as the proof that D8 holds.
