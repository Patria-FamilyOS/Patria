# Patria build log

Dated record of what we implemented and **why** we chose each option. Short rules that other docs must follow live in `DECISIONS.md`. This file is the narrative.

How to add an entry: newest at the top, date, slice or topic, what changed, options considered, why we picked one, and what we deliberately deferred.

---

## 2026-10-10 — Local CI database tests pass

New migration keeps profile emails unreadable while restoring `REFERENCES` on `profiles.id` so admins can insert invites. Invite email matching uses a definer helper. pgTAP now names schemas for `has_table`, grants fixture reads, and looks up invite tokens before switching to `authenticated`.

---

## 2026-10-10 — pgTAP fixture role and plan

Granted SELECT on the temp `fx` table to `authenticated` and `anon`, set `plan(127)`, and kept the file in one `BEGIN`/`ROLLBACK`. Real table grants were not changed.

---

## 2026-10-10 — D8 pgTAP coverage and CI

Added pgTAP for revoked invites, last-admin self-demote, and the remaining D8 cells. GitHub Actions runs app Jest and a fresh local Supabase `test db` with no hosted project.

---

## 2026-10-10 — Lock helpers, invite tokens, admin-only emails

SECURITY DEFINER access helpers now always use the signed-in user as the viewer. Trigger functions set `search_path`. Only Me circles require a matching membership. Profile emails are not selectable on the table; admins read them through a dedicated function. Invite lists no longer load share tokens until Share is tapped. Local API no longer exposes the GraphQL schema.

---

## 2026-10-10 — Auth gate routes (no shared `/`)

### What we built

`/` is only the session gate. Welcome lives at `/(signed-out)/welcome` and home at `/(signed-in)/home`. Signed-out and signed-in layouts wait for the session, then bounce the wrong group back to `/`. Create family stays under signed-in, so it needs a session. After sign-in, a saved invite token still sends the person to `/invite/{token}`.

### Why

Route groups hid the path, so welcome, home, and the gate all claimed `/`. Sign-in looked successful in Supabase but the app stayed on auth screens.

---

## 2026-10-10 — Profiles on Auth insert, friendly errors, Mom

### What we built

A new migration recreates `handle_new_user` so every `auth.users` row gets a `public.profiles` row (including people added in the Supabase dashboard). Existing Auth users without a profile are backfilled. Sign-up no longer writes the profile from the app. Family create and other screens show copy-file messages instead of database errors. The create-family chip reads **Mom**.

### Options we chose, and why

Dashboard-created test users never hit sign-up, so they had no profile and `create_family_space` failed on `family_spaces_created_by_fkey`. The trigger is the single writer at account creation. Display name comes from `raw_user_meta_data.display_name`, or empty if that key is missing. We did not edit already-applied migrations.

UI never shows Postgres or Auth error text (it can include emails and constraint names). We do not log those errors either.

### Deferred

`db push` and `supabase test db` still need Docker / the remote project from a human.

---

## 2026-10-09 — Slice 1 screens: auth, family, invites

### What we built

Email sign up / sign in / verify, create family space, placeholder family home with members, invite by **link and email**, accept/decline, add child profile, admin change role and remove.

Database (function + enum only): `declined` invite status, `decline_invite()`, `get_invite_preview` now includes `inviter_display_name`. No table changes.

### Options we chose, and why

**1. Invite is both a link and an email (D16)**

The invite row still stores email so `accept_invite` can match the signed-in account. After create, the admin can **Share invite link** (`patria://invite/{token}`) and/or **Send by email** (opens the phone mail app with that same link). We did not add a server mailer in this slice.

**2. Decline invalidates the token**

`decline_invite` sets status `declined`. Preview and accept then fail. Pending invites also expire after 14 days (`expires_at`), so a forgotten invite dies even if nobody taps Decline.

**3. Family home is a placeholder, not HOME-01**

HOME-01 includes Sync, memories and tasks, which are out of D1. Home shows family name, members, roles, admin actions, and a switcher only when the user is in more than one space (D5).

**4. Mail composer instead of Supabase Auth invite**

Supabase `inviteUserByEmail` needs the service role key, which must not live in the app. The mail app on the phone is the safe way to send the link in slice 1.

### Deferred

Keys, photo library, SMS, merge spaces, custom circle editor, vault, push notifications. Database tests were not run here because Docker was not running.

---

## 2026-10-09 — App foundation (Expo Router, no feature screens)

### What we built

* Expo Router with a signed-out group, a signed-in group, and a root redirect (signed out by default via `SESSION_PLACEHOLDER_SIGNED_IN`)
* Theme tokens, a single `src/lib/copy.ts` for English UI text (D11)
* Supabase JS client that persists the Auth session in Expo SecureStore (chunked because of the size limit)
* TanStack Query at the app root
* ESLint, Prettier, Jest, React Native Testing Library
* `.env.example` and `.env` in `.gitignore`
* Left `patria-app/supabase/` migrations and tests untouched

### Options we chose, and why

**1. Placeholders, not CIR05 screens**

D2: do not invent a final visual. The design PNGs exist for create-family / invite / home, but this step is foundation only.

**2. Colors from the mockups; fonts and spacing as placeholders**

`docs/design/` has no `tokens.md`. We used cream `#F7F1E8`, green `#2F4F3E`, and orange `#C8553D` from the screens and the README examples. Heading/body fonts are system serif and system sans until Figma names are exported.

**3. SecureStore instead of AsyncStorage**

The official Supabase Expo snippet uses AsyncStorage, which is not encrypted. The plan required secure device storage. We chunk values so large session JSON does not hit Android’s ~2KB SecureStore limit. Web (Expo web only) still uses `localStorage`.

**4. Jest-expo plus shims**

SDK 57’s `jest-expo` expects `@react-native/jest-preset` and a `react-native/setup-env` file that RN 0.86 does not ship. We map that module to a local empty shim. RNTL 14 needed React 19.3’s test renderer; we kept RNTL 13 to match React 19.2.3 from Expo.

**5. No Auth yet**

The signed-in tree exists so later screens have a home. The gate is a boolean, not a session listener.

### Deferred

Feature screens, email sign-in, family space UI, real fonts, loading a session on launch.

---

## 2026-10-09 — Slice 1 database: CIR05, CIR01, CIR02 (no UI)

### What we built

Secure Supabase schema under `patria-app/supabase/`:

* Tables: `profiles`, `family_spaces`, `space_members`, `child_profiles`, `circles`, `circle_members`, `circle_item_type_defaults`, `invites`
* Row Level Security on every table, matching DECISIONS D8
* RPCs: `create_family_space`, `accept_invite`, `get_invite_preview`
* pgTAP tests for family isolation and every Yes/No in the D8 matrix
* No app screens, no cryptography

### Why this order

CIR05 / CIR01 / CIR02 are the trust layer. Every later feature hangs off “who belongs, who sees what, who can do what.” D1 says the first product slice is sign up, family space, invites, roles, and default circles. Building UI before RLS would make it easy to ship screens that leak data.

### Options we chose, and why

**1. Children under 13 as `child_profiles`, not Auth users**

D6: they have no login in v1. Putting them in `auth.users` would create accounts they cannot use and would fight COPPA. A separate table makes “no device access” a hard fact, while still letting us tag them in circles and show them on the invite screen (Sofia and Luis in `CIR05-02`).

**2. Family admin and Co admin share one helper (`is_space_admin`)**

D7: same permissions, two labels. One function means the two roles cannot drift apart in policies. The last-admin rule counts both.

**3. Only Me is per member per space, not one family-wide circle**

The approved plan allowed `family_space_id` null for Only Me. We did **not** do that. D5 allows one person in many family spaces; a single global Only Me circle would mix those spaces. Each membership gets its own Only Me circle owned by that user in that space. This is still D9 (visibility circle), not GROW02 teen private space.

**4. Membership inserts only through RPCs**

If any authenticated user could `INSERT` into `space_members`, RLS would have to re-encode invite rules (expiry, once-only, email match). `create_family_space` bootstraps the first admin (otherwise “must be an admin to add a member” has no first admin). `accept_invite` enforces D12 in one transaction.

**5. Caregiver end date on `space_members`, not a separate table**

D8 only needs “while active” plus default 24 hours / max 30 days. A column plus a trigger is enough. Expired caregivers keep their row (history) but `space_role()` treats them as inactive for space reads.

**6. Successors are members with no data access**

They must exist so admins can “name successors” (D8). A separate table would duplicate membership. RLS: they can `SELECT`/`DELETE` only their own `space_members` row (so they can leave) and cannot read `family_spaces` or anyone else.

**7. `circle_item_type_defaults` before we have photos or tasks**

D8 includes “change default circles per item type.” Without a table, we could not write a Yes/No test. Placeholder item types: photo, story, note, task, document. New spaces default all of them to Household, matching “children’s content defaults to Household” in FEATURES.

**8. `relationship_label` is not a role**

The create-family mockup uses Mom / Dad / Grandparent / Guardian. Those are how someone describes themselves in the family, not what they can do. Permissions stay on `space_role`. Mixing them would make “Mom” an admin by accident.

**9. Extended relatives see the member list only through shared circles**

D8: “Only members in circles they share.” Shared means a non-Only Me circle. Only Me never has a second person, so it cannot be used to peek. Children follow the same rule via `circle_members.child_profile_id`.

**10. No encryption columns yet**

D1 and the approved plan: keys and recovery contacts are later. We left a TODO comment on `family_spaces` rather than nullable crypto columns that would invite storing plaintext by mistake.

**11. Tests are pgTAP via `supabase test db`**

Project rules require a SQL test for every policy. pgTAP runs inside Postgres, so it can `SET ROLE authenticated` and set `auth.uid()` the same way the API does. App-level tests cannot prove RLS.

**12. SELECT denials return empty rows, not errors**

Postgres RLS on `SELECT` filters; it does not throw. Tests for “cannot view” assert empty results. `INSERT`/`UPDATE`/`DELETE` that violate `WITH CHECK` raise `42501`.

### Mockups we used (UI still not built)

* `CIR05-01` — display name, email, relationship chips, privacy line (“family holds the keys”)
* `CIR05-02` — family name in the title, pending invite, SMS invite (not built; CIR03), child profiles with no email
* `CIR05-03` — space ready, invite summary, Family Sync and keys called out (Sync and keys not in this slice)
* `HOME-01` — “Good evening, the Rivera family” and member initials (needs `family_spaces.name` and member list)

The create screen has no family-name field. We still store `family_spaces.name` so later screens can say “the Rivera family.” The app can default it from a last name when UI is built.

### Deferred on purpose

* Family encryption keys and recovery contacts
* Photo library / first Story
* SMS / phone invites (nullable `phone` TODO on `invites`)
* Merging two parent-created spaces
* Linked households (CIR04)
* Teen private space (GROW02)
* Role-change push notifications (D10: refresh on open is enough for slice 1)
* Realtime fan-out under 60 seconds (D10)

### How to run

See `patria-app/supabase/README.md`.
