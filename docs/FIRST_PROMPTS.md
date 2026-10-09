# First prompts for Cursor

Paste these into Cursor's chat (Agent mode) one at a time. Wait for each to finish, check the result, and commit before moving to the next.

---

## Prompt 1: confirm Cursor understands the project

```
Read .cursor/rules/patria.mdc, docs/PRD.md and the CIR05, CIR01 and CIR02 sections of docs/FEATURES.md.
Do not write any code yet.
In plain language, summarize:
1. What Patria is and who it is for.
2. The tech stack and the privacy rules you must follow.
3. What CIR05, CIR01 and CIR02 need to do, and their acceptance criteria.
4. Any questions or gaps you see before we start building.
```

Check its answer. If it misunderstood anything, correct it in the chat before continuing.

---

## Prompt 2: set up the foundation

```
Set up the foundation of the app in patria-app/, following .cursor/rules/patria.mdc.
1. Make sure TypeScript strict mode is on.
2. Set up Expo Router with a simple placeholder home screen.
3. Add ESLint, Prettier, Jest and React Native Testing Library, with npm scripts: typecheck, lint, test.
4. Create the folder structure from the rules: src/features, src/components, src/theme, supabase/.
5. Create src/theme with color, spacing and typography tokens based on docs/design (use placeholders if no tokens file exists, and tell me).
6. Add a .env.example file and make sure .env is in .gitignore.
First show me your plan and wait for my approval. After building, run typecheck, lint and test and fix any errors.
```

Then run `npx expo start` and check the placeholder screen opens. Commit: "Set up project foundation".

---

## Before Prompt 3: create your Supabase project (you do this, not Cursor)

1. Go to supabase.com, sign up and create a new project called **patria** (choose a region close to Houston, for example US East). Save the database password somewhere safe.
2. In the project, open **Project Settings, then API** and copy the **Project URL** and the **anon public key**.
3. In `patria-app/`, create a file named `.env` (not `.env.example`) containing:
   ```
   EXPO_PUBLIC_SUPABASE_URL=your project url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your anon public key
   ```
4. Never paste the **service role key** into the app or into Cursor's chat.

---

## Prompt 3: plan the first slice (CIR05 part A, CIR01, CIR02)

```
We are building the first slice: sign up, create a family space, and invite members with a role and default circle.
This covers CIR05 steps 1 and 5 and 6, plus the basics of CIR01 (Circles) and CIR02 (Roles) from docs/FEATURES.md.
Out of scope for now: family encryption keys and recovery contacts (CIR05 step 2), photo library connection, and SMS invites. Add clear TODO markers where they will plug in.

Propose a plan covering:
1. Supabase database tables (family spaces, members, roles, circles, invites) as SQL migrations in patria-app/supabase/migrations.
2. Row Level Security policies for every table, and SQL tests proving a user cannot see another family's data.
3. Screens, matching docs/design: sign up / sign in, create family, invite members, accept invite, family ready.
4. Supabase client setup using the EXPO_PUBLIC variables from .env.
5. The tests you will write, mapped to the CIR05, CIR01 and CIR02 acceptance criteria.
Do not write code until I approve the plan.
```

Read the plan. Ask Cursor to explain anything you do not understand before approving.

---

## Prompt 4: build it

```
The plan is approved. Build it step by step.
After each step run typecheck, lint and test, and fix failures before moving on.
When finished:
1. List each acceptance criterion from CIR05, CIR01 and CIR02 and say whether it is met, partly met, or not yet built.
2. List anything that needs a human security review.
3. Tell me exactly how to apply the database migrations to my Supabase project and how to test the flow on my phone.
```

Test it yourself on your phone: sign up, create a family, invite a second email address, accept the invite from another account. Commit: "Add sign up, family space and invites".

---

## Prompt 5: review before moving on

```
Act as a strict senior reviewer. Review everything built for this slice against .cursor/rules/patria.mdc and docs/FEATURES.md.
Look especially for: missing Row Level Security, data leaking between families, secrets or personal data in logs, missing error and loading states, and untested acceptance criteria.
List the problems in order of severity, then fix them one at a time with my approval.
```

---

## What comes next

1. CIR05 part B: family keys and recovery contacts. This is security critical: ask Cursor to propose an approach using an established library, and have a security engineer review it before real families use the app.
2. MEM01 Shared Family Library, then MEM02, MEM03, MEM04 and MEM05.
3. CIR03 SMS and voice participation for grandparents.

Use the same pattern every time: plan, approve, build in small steps, test, review, commit.
