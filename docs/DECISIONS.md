# Patria build decisions

This file answers open questions raised while planning. Where it is more specific than `PRD.md` or `FEATURES.md`, this file wins. Add new decisions at the bottom with a date.

---

## D1. Slice 1 scope (October 2026)

Slice 1 builds: email sign up and sign in, create a family space, invite members with a role and default circle, accept an invite, revoke an invite, see the member list, and the default circles.

Not in slice 1 (add TODO markers where they plug in):
* Family encryption keys and recovery contacts (CIR05 step 2)
* Photo library connection and first Story (CIR05 steps 3 and 4)
* SMS invites and elder participation by phone (CIR03)
* Merging two family spaces created by two parents
* Linked households and shared children across homes (CIR04)
* Teen private space (GROW02)

These CIR05 acceptance criteria are **not yet** for slice 1 and must be listed as such: first Story within 10 minutes, welcome SMS within 1 minute, family keys created on device.

## D2. Design

Use the exported screens in `docs/design/` when present. Where a screen is missing, build a clean placeholder screen using the theme tokens, and list which screens were placeholders. Never invent a final visual design.

## D3. Source of truth for onboarding

`FEATURES.md` is the source of truth for CIR05. The PRD table in section 9.8 lists CIR01 to CIR04 only; CIR05 was added in the Feature Requirements Document.

## D4. Sign in methods

Slice 1: email and password, with email verification, through Supabase Auth.
Before App Store submission: add Sign in with Apple and Google sign in. (Apple requires Sign in with Apple when an app offers other third party sign in options.)

## D5. One person, many family spaces

The schema must allow one user to belong to many family spaces from day one (many to many membership with a role per space). The app shows a family space switcher only if a user belongs to more than one.

## D6. Children under 13

In version 1, children under 13 are **managed profiles** created by a Family admin. They have no login and no device access. They can be tagged in items and appear in the member list. Child logins come later with Age Bands (GROW01).

## D7. Family admin and Co admin

* **Family admin and Co admin have exactly the same permissions.** Both can do everything in the table in D8. The two names exist only so a family can label who set up the space versus who helps run it.
* A family space can have more than one Family admin or Co admin (for example both parents and a grandparent).
* A family space must always have **at least one Family admin or Co admin**. The last remaining admin (of either kind) cannot be removed, cannot leave and cannot change their own role until another admin exists.
* Wherever `PRD.md` or `FEATURES.md` says "only Family admins" can do something, read it as "Family admins and Co admins".
* In code and database policies, treat both as one permission level (for example a helper such as `is_space_admin()` that returns true for either role), so the two can never drift apart.

## D8. Permission matrix for slice 1 actions

Server side Row Level Security must enforce this table. Write a test for every Yes and every No.

| Action | Family admin and Co admin | Teen (13 to 17) | Elder | Extended relative | Caregiver | Successor | Child (no login) |
|---|---|---|---|---|---|---|---|
| View family space name | Yes | Yes | Yes | Yes | Yes (while active) | No | n/a |
| View member list | Yes, all | Yes, all | Yes, all | Only members in circles they share | No | No | n/a |
| Rename family space | Yes | No | No | No | No | No | n/a |
| Invite a member | Yes, any role | No | No | No | No | No | n/a |
| Revoke a pending invite | Yes, any | No | No | No | No | No | n/a |
| Add a child profile | Yes | No | No | No | No | No | n/a |
| Change a member's role | Yes | No | No | No | No | No | n/a |
| Remove a member | Yes, anyone except the last admin | No | No | No | No | No | n/a |
| Leave the family space | Yes, unless the last admin | Yes | Yes | Yes | Yes | Yes | n/a |
| Create or edit custom circles | Yes | No | No | No | No | No | n/a |
| Change default circles per item type | Yes | No | No | No | No | No | n/a |
| Name successors (custody) | Yes | No | No | No | No | No | n/a |
| Delete the family space | Yes | No | No | No | No | No | n/a |

"Last admin" means the last remaining Family admin or Co admin.

Rules that go with the table:
* Caregiver access always has an end date (default 24 hours, maximum 30 days) and ends automatically.
* Successors have no access at all until a custody handover completes (GROW04, later phase).
* A role change is shown to the affected person the next time they open the app, and in a notification.
* A teen cannot be moved to a role with less privacy without being notified.

## D9. "Only Me" versus teen private space

They are different mechanisms.
* **Only Me** is a visibility circle any member can choose for an item. Slice 1 includes it as a default circle.
* **Teen private space** (GROW02, later phase) is a separate encrypted area protected by the teen's own key, with an agreement between teen and parents. Not in slice 1.

## D10. How fast access changes take effect

* Access is enforced on the server by Row Level Security, so removing someone from a circle or the family space blocks them **immediately** on the server.
* In slice 1 the app refreshes data when it opens, when it returns to the foreground, and when the user pulls to refresh. Realtime updates (under 60 seconds across devices) come in a later slice.

## D11. Languages

Slice 1 is English only. Keep all user facing text in one place so translation can be added later. Supporting other languages (including Spanish, Yoruba, Igbo and Hausa) is product intent for later phases.

## D12. Invites

* Invites are sent by shareable link (and QR code later). Email delivery of invite links can use Supabase's email or a later email provider; SMS comes with CIR03.
* Invites expire after 14 days, can be revoked, and can only be accepted once.
* Before accepting, the invitee sees a plain language summary of their role and what others in the family can see about them.

## D13. Admin roles merged in permissions (October 2026)

Family admin and Co admin now have identical permissions (see D7 and D8). This replaces the earlier version where Co admins could not change roles, remove admins, delete the space or manage successors.

## D14. Slice 1 database shape (October 2026)

Approved schema for CIR05 / CIR01 / CIR02 (no UI, no cryptography).

* **profiles** are 1:1 with Supabase Auth users (`id` = `auth.users.id`). Display name is stored here because the create-family mockup collects "Your name" separately from role.
* **space_members** is many-to-many (D5). Role is per space. `relationship_label` (Mom, Dad, Grandparent, Guardian) is display-only and never used in RLS.
* **Children under 13** live in **child_profiles**, not `space_members` and not Auth (D6). They can be members of circles (so an extended relative only sees a child if they share a circle).
* **Default circles** Household, Extended Family and Close Friends are created with the family space and cannot be deleted. **Only Me** is one circle **per member per space** (not one shared family circle), because one person can belong to many spaces (D5) and Only Me must not leak across spaces. Only Me is not teen private space (D9).
* **circle_item_type_defaults** exists so D8 "change default circles per item type" can be enforced and tested before photos and tasks exist. New spaces default every item type to Household.
* **Invites** are email + shareable token, 14-day expiry, revocable, accepted once (D12). Phone/SMS is a TODO column for CIR03. Creating a membership always goes through `create_family_space` (founder) or `accept_invite` (everyone else), not a direct insert into `space_members`.
* **Caregiver** rows must have `caregiver_access_ends_at` (default 24 hours, hard maximum 30 days). After that time they are treated as inactive for space access.
* **Successors** may have a membership row so they can be named, but RLS gives them no family data. They may leave (delete their own membership).
* **Last admin** means the last Family admin or Co admin (D7). A trigger blocks remove, leave, and self-demotion that would leave zero admins. Deleting the whole family space is allowed for an admin and cascades.
* Family encryption keys and recovery contacts are **not** stored. `family_spaces` has a TODO comment for key metadata later. The server must never receive an unencrypted family key.

## D15. How we record build choices (October 2026)

Append a dated entry to `docs/BUILD_LOG.md` whenever we implement a slice or make a technical choice, with what we did and why. `DECISIONS.md` stays the short, numbered source of truth. `BUILD_LOG.md` is the narrative.

## D16. Invite delivery and decline (October 2026)

* An invite always stores an email (so accept can match the signed-in account) **and** a shareable `patria://invite/{token}` link. The inviting person can send the link with the phone share sheet **or** open an email draft to that address. Same token either way.
* **Decline** invalidates the token on the server (`declined` status). Accept and preview then fail.
* Pending invites still expire after 14 days even if nobody declines (`expires_at`).
