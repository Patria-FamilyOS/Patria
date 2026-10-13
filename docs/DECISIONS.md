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

## D17. Member email visibility (October 2026)

Member email addresses are visible only to Family admins and Co admins. Other members see names and roles.

## D18. Where people paste an invite (October 2026)

The invite paste box shows on Welcome and Create family. Members already in a family join another through a small Join another family link, not a box on Home. (Phone feedback asked to number this D15; D15 already records how we log builds.)

## D19. Dynamic Type deferred until an accessibility pass (October 2026)

Full Dynamic Type support is deferred to a dedicated accessibility pass before beta with grandparents. Until then, text scaling is capped so no screen breaks. (Phone feedback asked to number this D16; D16 already records invite delivery and decline.)

## D20. Family keys stay on the phone (12 October 2026)

Family keys are created on the phone; Patria never holds a usable family key. See `docs/security/KEYS.md`. (KEYS approval asked to number this D17; D17 already records member email visibility.)

## D21. Who gets the family key (12 October 2026)

Family admin, Co admin, Teen and Elder receive a wrap of the family key. Extended relatives, caregivers, successors and children do not. Recovery private keys are not kept on any device (D27). (Asked as D18; D18 already records where people paste an invite.)

## D22. No automatic wrapping (12 October 2026)

A device gets the family key only after a person taps approve. An admin lets in a member’s first phone. Members approve their own extra phones. Admins cannot approve someone else’s extra phone. (Asked as D19; D19 already records the Dynamic Type deferral.)

## D23. Recovery contacts and the printed code (12 October 2026)

Recovery needs any 2 of 3: contact A, contact B, and an optional 24-word printed code. There is a 48-hour wait with “This wasn’t me.” Nothing about the printed code is stored on the server. Removing a key holder rotates the family key; other members do not need a new printed code unless that person was their recovery contact. (Asked as D20. D27 replaces a single family-wide recovery secret.)

## D24. Crypto libraries for family keys (12 October 2026)

CIR05 uses noble with X25519, XChaCha20-Poly1305 and HKDF-SHA256 only. Switching to libsodium before beta is the security reviewer’s decision. (Asked as D21.)

## D25. When recovery contacts are required (12 October 2026)

Recovery contacts are required before the Legacy Vault, not before Home. (Asked as D22.)

## D26. Recovery contacts in v1 are adult family members with keys (12 October 2026)

Recovery contacts (first version) are adult family members with a key-eligible role (Family admin, Co admin, Elder) whose device has been let in. Not teens, children, extended relatives, caregivers or successors. Contacts outside the family come later with a recovery-contact invite. (Asked as D23; D23 already records the 2-of-3 recovery protocol.)

## D27. Per member recovery key pairs replace the single family recovery key (13 October 2026)

Each key-holding member has an X25519 recovery key pair. The public half is stored on the server. The private half exists only inside that member’s 2-of-3 pair boxes and is wiped from memory after setup and after recovery. No device keeps it. There is no family-wide recovery secret and no `recovery_key_wraps`. The family key under recovery is one sealed box per member per epoch, sealed to that member’s recovery public key with the existing wrap module. Rotation seals the new family key to remaining members’ recovery public keys; it cannot open those private keys. A removed admin, a completed recovery, or two contacts of one member must not be able to open another member’s future recovery boxes.
