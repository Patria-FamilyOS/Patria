# Phone test automation

From `patria-app`:

```bash
npm run e2e:build
npm run e2e
```

`e2e:build` compiles the iOS Simulator app with `.env.e2e.local` only (`EXPO_NO_DOTENV=1`, so `.env` and the hosted test project are not used). `e2e` then runs the Maestro flows.

Maestro runs the numbered tests in `PHONE_TESTS.md` on iOS Simulator. Jest and pgTAP stay as they are.

## What talks to which backend

| Command | Env file | Backend |
| --- | --- | --- |
| `npx expo start` | `patria-app/.env` | Hosted test project (unchanged) |
| `npm run e2e:build` / `npm run e2e` | `patria-app/.env.e2e.local` | Local Docker only (`127.0.0.1` / `localhost`) |

`e2e-setup` and `e2e-db-check` refuse to run if the Supabase URL is not local. The local service role key stays in gitignored `.e2e-secrets` or is read from `npx supabase status`. It is never written to the app env and never logged.

## One-time setup

1. Java 17+, Xcode, iOS Simulator, Docker.
2. `cd patria-app && npx supabase start`
3. Copy `.e2e-secrets.example` to `.e2e-secrets` and set the three test passwords, or let `e2e-setup` generate local-only passwords into that gitignored file (it never prints them). Optionally set `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status`; otherwise setup reads it from status.
4. `npm run e2e:setup` (creates/updates Test 1–3, shortens recovery wait to 8 seconds locally, writes `.env.e2e.local` with the anon key only).
5. Install Maestro (`curl -Ls "https://get.maestro.dev" | bash`).
6. `npm run e2e:build` (first time, and after native or env changes).

The development bundle id `app.patria.dev` is provisional (D28).

## Run

```bash
cd patria-app
npm run e2e
npm run e2e -- --test 9
E2E_DEVICES=3 npm run e2e -- --test 12
npm run e2e -- --record
npm run e2e -- --no-record
```

`E2E_DEVICES` is `2` by default. `1` still works (tests that need a second or third phone are skipped, not failed). `3` automates all of test 12, including **This wasn’t me** on Test 2’s old phone while the new phone waits.

Invite share-sheet **Copy** is attempted; if the sheet is not automatable the step is skipped (manual), and the flow continues with the invite URL from the local database.

Tests 11–12 never write the 24 printed words to a file, log, or screenshot. Optional recordings of those tests stay in `patria-app/e2e-recordings/` (gitignored, this computer only).

## Coverage check

`npm run e2e:check` (also part of `npm run lint`) fails if a numbered test in `PHONE_TESTS.md` has no Maestro flow and is not marked `(manual)` in the heading, or if a flow points at a test that no longer exists.

## Adding a test

Number it after the last test in `PHONE_TESTS.md`, add `patria-app/.maestro/NN_slug.yaml` with `# PHONE_TESTS: NN`, run the flow, and include pass / fail / skip in the summary.
