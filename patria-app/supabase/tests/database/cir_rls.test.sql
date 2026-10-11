-- pgTAP: family isolation and DECISIONS.md D8 permission matrix.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = extensions, public, auth;

SELECT plan(127);

CREATE OR REPLACE FUNCTION tests_create_auth_user(p_id uuid, p_email text, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email',
    p_id::text,
    now(),
    now(),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION tests_jwt(p_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claim.sub', p_id::text, true);
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text,
    true
  );
$$;

SELECT tests_create_auth_user('11111111-1111-1111-1111-111111111111', 'elena@example.com', 'Elena Rivera');
SELECT tests_create_auth_user('22222222-2222-2222-2222-222222222222', 'marco@example.com', 'Marco Rivera');
SELECT tests_create_auth_user('33333333-3333-3333-3333-333333333333', 'jordan@example.com', 'Jordan Rivera');
SELECT tests_create_auth_user('44444444-4444-4444-4444-444444444444', 'rosa@example.com', 'Rosa Rivera');
SELECT tests_create_auth_user('55555555-5555-5555-5555-555555555555', 'cousin@example.com', 'Alex Cousin');
SELECT tests_create_auth_user('66666666-6666-6666-6666-666666666666', 'uncle@example.com', 'Sam Uncle');
SELECT tests_create_auth_user('77777777-7777-7777-7777-777777777777', 'sitter@example.com', 'Pat Sitter');
SELECT tests_create_auth_user('88888888-8888-8888-8888-888888888888', 'oldsitter@example.com', 'Old Sitter');
SELECT tests_create_auth_user('99999999-9999-9999-9999-999999999999', 'heir@example.com', 'Chris Heir');
SELECT tests_create_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other@example.com', 'Other Admin');
SELECT tests_create_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'invitee@example.com', 'New Invitee');

SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT public.create_family_space('The Rivera Family', 'Mom');
RESET ROLE;

SELECT tests_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SET LOCAL ROLE authenticated;
SELECT public.create_family_space('The Other Family', NULL);
RESET ROLE;

RESET ROLE;
CREATE TEMP TABLE fx AS
SELECT
  (SELECT id FROM public.family_spaces WHERE name = 'The Rivera Family') AS rivera,
  (SELECT id FROM public.family_spaces WHERE name = 'The Other Family') AS other,
  (
    SELECT c.id
    FROM public.circles AS c
    JOIN public.family_spaces AS s ON s.id = c.family_space_id
    WHERE s.name = 'The Rivera Family' AND c.kind = 'household'
  ) AS household;
GRANT SELECT ON TABLE fx TO authenticated, anon;

INSERT INTO public.space_members (family_space_id, user_id, role, relationship_label)
SELECT rivera, user_id, role, label
FROM fx,
LATERAL (VALUES
  ('22222222-2222-2222-2222-222222222222'::uuid, 'co_admin'::public.space_role, 'Dad'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'teen', NULL),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'elder', 'Grandparent'),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'extended_relative', NULL),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'extended_relative', NULL),
  ('77777777-7777-7777-7777-777777777777'::uuid, 'caregiver', NULL),
  ('88888888-8888-8888-8888-888888888888'::uuid, 'caregiver', NULL),
  ('99999999-9999-9999-9999-999999999999'::uuid, 'successor', NULL)
) AS v(user_id, role, label);

UPDATE public.space_members
SET caregiver_access_ends_at = now() - interval '1 hour'
WHERE user_id = '88888888-8888-8888-8888-888888888888';

SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '22222222-2222-2222-2222-222222222222');
SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '33333333-3333-3333-3333-333333333333');
SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '44444444-4444-4444-4444-444444444444');
SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '55555555-5555-5555-5555-555555555555');
SELECT tests_jwt('66666666-6666-6666-6666-666666666666');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '66666666-6666-6666-6666-666666666666');
SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '77777777-7777-7777-7777-777777777777');
SELECT tests_jwt('88888888-8888-8888-8888-888888888888');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '88888888-8888-8888-8888-888888888888');
SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SELECT public.ensure_only_me_circle((SELECT rivera FROM fx), '99999999-9999-9999-9999-999999999999');

INSERT INTO public.child_profiles (id, family_space_id, display_name, date_of_birth, created_by)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc', rivera, 'Lily', (CURRENT_DATE - 2555), '11111111-1111-1111-1111-111111111111'
FROM fx;

INSERT INTO public.circle_members (circle_id, user_id)
SELECT c.id, u
FROM fx
JOIN public.circles AS c ON c.family_space_id = fx.rivera AND c.kind = 'household'
CROSS JOIN (VALUES
  ('22222222-2222-2222-2222-222222222222'::uuid),
  ('33333333-3333-3333-3333-333333333333'::uuid),
  ('44444444-4444-4444-4444-444444444444'::uuid)
) AS x(u);

INSERT INTO public.circle_members (circle_id, child_profile_id)
SELECT c.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'
FROM fx
JOIN public.circles AS c ON c.family_space_id = fx.rivera AND c.kind = 'household';

INSERT INTO public.circle_members (circle_id, user_id)
SELECT c.id, u
FROM fx
JOIN public.circles AS c ON c.family_space_id = fx.rivera AND c.kind = 'extended_family'
CROSS JOIN (VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid),
  ('44444444-4444-4444-4444-444444444444'::uuid),
  ('55555555-5555-5555-5555-555555555555'::uuid)
) AS x(u)
WHERE NOT EXISTS (
  SELECT 1 FROM public.circle_members cm WHERE cm.circle_id = c.id AND cm.user_id = u
);

INSERT INTO public.circles (id, family_space_id, name, kind)
SELECT 'dddddddd-dddd-dddd-dddd-dddddddddddd', rivera, 'Mom''s side', 'custom' FROM fx;

INSERT INTO public.circle_members (circle_id, user_id)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '66666666-6666-6666-6666-666666666666');

SELECT has_table('public'::name, 'profiles'::name);
SELECT has_table('public'::name, 'family_spaces'::name);
SELECT has_table('public'::name, 'space_members'::name);
SELECT has_table('public'::name, 'child_profiles'::name);
SELECT has_table('public'::name, 'circles'::name);
SELECT has_table('public'::name, 'circle_members'::name);
SELECT has_table('public'::name, 'circle_item_type_defaults'::name);
SELECT has_table('public'::name, 'invites'::name);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass), 'RLS on profiles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.family_spaces'::regclass), 'RLS on family_spaces');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.space_members'::regclass), 'RLS on space_members');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.child_profiles'::regclass), 'RLS on child_profiles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.circles'::regclass), 'RLS on circles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.circle_members'::regclass), 'RLS on circle_members');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.circle_item_type_defaults'::regclass), 'RLS on circle_item_type_defaults');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.invites'::regclass), 'RLS on invites');

-- Isolation
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT other FROM fx)), 0, 'admin cannot see another family space');
SELECT is((SELECT count(*)::int FROM public.space_members WHERE family_space_id = (SELECT other FROM fx)), 0, 'admin cannot see another family members');
RESET ROLE;

SELECT tests_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 0, 'other admin cannot see Rivera space');
RESET ROLE;

SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT is(
  public.space_role((SELECT other FROM fx), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  NULL,
  'cannot learn another family role through space_role'
);
SELECT is(
  public.is_space_admin((SELECT other FROM fx), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  false,
  'cannot probe another family through is_space_admin'
);
SELECT is(
  public.can_view_member(
    (SELECT other FROM fx),
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  false,
  'cannot learn another family membership through can_view_member'
);
SELECT is(
  public.space_role((SELECT rivera FROM fx), '22222222-2222-2222-2222-222222222222')::text,
  'family_admin',
  'space_role ignores a supplied user id and returns the caller'
);
SELECT throws_ok(
  $sql$SELECT public.ensure_only_me_circle((SELECT other FROM fx), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$sql$,
  '42501',
  NULL,
  'cannot create Only Me in another family'
);
SELECT throws_ok(
  $sql$SELECT email FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222'$sql$,
  '42501',
  NULL,
  'column privileges block selecting profile emails'
);
RESET ROLE;

SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SELECT is(
  public.admin_member_email((SELECT rivera FROM fx), '22222222-2222-2222-2222-222222222222'),
  (SELECT email FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222'),
  'admin can read a member email through the admin rpc'
);

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$SELECT public.admin_member_email((SELECT rivera FROM fx), '11111111-1111-1111-1111-111111111111')$sql$,
  '42501',
  NULL,
  'teen cannot read member emails through the admin rpc'
);
RESET ROLE;

-- View space name
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT isnt_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'admin can view space name');
RESET ROLE;

SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
SELECT isnt_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'co admin can view space name');
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT isnt_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'teen can view space name');
RESET ROLE;

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
SELECT isnt_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'elder can view space name');
RESET ROLE;

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
SELECT isnt_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'extended relative can view space name');
RESET ROLE;

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
SELECT isnt_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'active caregiver can view space name');
RESET ROLE;

SELECT tests_jwt('88888888-8888-8888-8888-888888888888');
SET LOCAL ROLE authenticated;
SELECT is_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'expired caregiver cannot view space name');
RESET ROLE;

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
SELECT is_empty('SELECT 1 FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)', 'successor cannot view space name');
RESET ROLE;

-- View member list
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT cmp_ok((SELECT count(*)::int FROM public.space_members WHERE family_space_id = (SELECT rivera FROM fx)), '>=', 8, 'admin sees all members');
SELECT isnt_empty('SELECT 1 FROM public.child_profiles WHERE family_space_id = (SELECT rivera FROM fx)', 'admin sees child profiles');
RESET ROLE;

SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
SELECT cmp_ok((SELECT count(*)::int FROM public.space_members WHERE family_space_id = (SELECT rivera FROM fx)), '>=', 8, 'co admin sees all members');
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT cmp_ok((SELECT count(*)::int FROM public.space_members WHERE family_space_id = (SELECT rivera FROM fx)), '>=', 8, 'teen sees all members');
RESET ROLE;

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
SELECT cmp_ok((SELECT count(*)::int FROM public.space_members WHERE family_space_id = (SELECT rivera FROM fx)), '>=', 8, 'elder sees all members');
RESET ROLE;

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*) > 0 FROM public.space_members WHERE user_id = '11111111-1111-1111-1111-111111111111'), 'extended relative sees members in a shared circle');
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '66666666-6666-6666-6666-666666666666'), 0, 'extended relative does not see members only in another custom circle');
SELECT is((SELECT count(*)::int FROM public.child_profiles WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 0, 'extended relative does not see a child only in Household');
RESET ROLE;

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE family_space_id = (SELECT rivera FROM fx)), 1, 'caregiver cannot view the member list (own row only)');
SELECT is_empty('SELECT 1 FROM public.child_profiles WHERE family_space_id = (SELECT rivera FROM fx)', 'caregiver cannot see child profiles');
RESET ROLE;

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE family_space_id = (SELECT rivera FROM fx)), 1, 'successor cannot view the member list (own row only)');
RESET ROLE;

-- Rename
SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
UPDATE public.family_spaces SET name = 'The Rivera Household' WHERE id = (SELECT rivera FROM fx);
SELECT is((SELECT name FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 'The Rivera Household', 'co admin can rename family space');
UPDATE public.family_spaces SET name = 'The Rivera Family' WHERE id = (SELECT rivera FROM fx);
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
UPDATE public.family_spaces SET name = 'Hacked' WHERE id = (SELECT rivera FROM fx);
SELECT is((SELECT name FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 'The Rivera Family', 'teen cannot rename family space');
RESET ROLE;

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
UPDATE public.family_spaces SET name = 'Hacked' WHERE id = (SELECT rivera FROM fx);
SELECT is((SELECT name FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 'The Rivera Family', 'elder cannot rename');
RESET ROLE;

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
UPDATE public.family_spaces SET name = 'Hacked' WHERE id = (SELECT rivera FROM fx);
SELECT is((SELECT name FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 'The Rivera Family', 'extended relative cannot rename');
RESET ROLE;

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
UPDATE public.family_spaces SET name = 'Hacked' WHERE id = (SELECT rivera FROM fx);
RESET ROLE;
SELECT is((SELECT name FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 'The Rivera Family', 'caregiver cannot rename');

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
UPDATE public.family_spaces SET name = 'Hacked' WHERE id = (SELECT rivera FROM fx);
RESET ROLE;
SELECT is((SELECT name FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 'The Rivera Family', 'successor cannot rename');

-- Invite
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
SELECT fx.rivera, '11111111-1111-1111-1111-111111111111', 'invitee@example.com', 'teen', c.id
FROM fx
JOIN public.circles AS c ON c.family_space_id = fx.rivera AND c.kind = 'household';
SELECT is((SELECT count(*)::int FROM public.invites WHERE email = 'invitee@example.com' AND status = 'pending'), 1, 'admin can invite any role');
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
       SELECT rivera, '33333333-3333-3333-3333-333333333333', 'teen-invite@example.com', 'teen', c.id
       FROM fx JOIN public.circles c ON c.family_space_id = fx.rivera AND c.kind = 'household'$sql$,
  '42501',
  NULL,
  'teen cannot invite'
);
RESET ROLE;

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
       SELECT rivera, '44444444-4444-4444-4444-444444444444', 'elder-invite@example.com', 'elder', c.id
       FROM fx JOIN public.circles c ON c.family_space_id = fx.rivera AND c.kind = 'household'$sql$,
  '42501',
  NULL,
  'elder cannot invite'
);
RESET ROLE;

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
       SELECT rivera, '55555555-5555-5555-5555-555555555555', 'ext-invite@example.com', 'teen', c.id
       FROM fx JOIN public.circles c ON c.family_space_id = fx.rivera AND c.kind = 'household'$sql$,
  '42501',
  NULL,
  'extended relative cannot invite'
);
RESET ROLE;

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
       SELECT rivera, '77777777-7777-7777-7777-777777777777', 'care-invite@example.com', 'teen', c.id
       FROM fx JOIN public.circles c ON c.family_space_id = fx.rivera AND c.kind = 'household'$sql$,
  '42501',
  NULL,
  'caregiver cannot invite'
);
RESET ROLE;

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    $sql$INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
         VALUES (%L, '99999999-9999-9999-9999-999999999999', 'succ-invite@example.com', 'teen', %L)$sql$,
    (SELECT rivera FROM fx),
    (SELECT household FROM fx)
  ),
  '42501',
  NULL,
  'successor cannot invite'
);
RESET ROLE;

SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
UPDATE public.invites SET status = 'revoked' WHERE email = 'invitee@example.com' AND status = 'pending';
SELECT is((SELECT status::text FROM public.invites WHERE email = 'invitee@example.com'), 'revoked', 'co admin can revoke a pending invite');
RESET ROLE;

INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
SELECT fx.rivera, '11111111-1111-1111-1111-111111111111', 'invitee@example.com', 'teen', c.id
FROM fx
JOIN public.circles AS c ON c.family_space_id = fx.rivera AND c.kind = 'household';

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
UPDATE public.invites SET status = 'revoked' WHERE email = 'invitee@example.com' AND status = 'pending';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.invites WHERE email = 'invitee@example.com' AND status = 'pending'), 1, 'teen cannot revoke an invite');

-- D8 Revoke a pending invite: No
SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
UPDATE public.invites SET status = 'revoked' WHERE email = 'invitee@example.com' AND status = 'pending';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.invites WHERE email = 'invitee@example.com' AND status = 'pending'), 1, 'elder cannot revoke an invite');

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
UPDATE public.invites SET status = 'revoked' WHERE email = 'invitee@example.com' AND status = 'pending';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.invites WHERE email = 'invitee@example.com' AND status = 'pending'), 1, 'extended relative cannot revoke an invite');

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
UPDATE public.invites SET status = 'revoked' WHERE email = 'invitee@example.com' AND status = 'pending';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.invites WHERE email = 'invitee@example.com' AND status = 'pending'), 1, 'caregiver cannot revoke an invite');

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
UPDATE public.invites SET status = 'revoked' WHERE email = 'invitee@example.com' AND status = 'pending';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.invites WHERE email = 'invitee@example.com' AND status = 'pending'), 1, 'successor cannot revoke an invite');

-- Child profiles
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
INSERT INTO public.child_profiles (family_space_id, display_name, created_by)
SELECT rivera, 'Luis', '11111111-1111-1111-1111-111111111111' FROM fx;
SELECT isnt_empty($$SELECT 1 FROM public.child_profiles WHERE display_name = 'Luis'$$, 'admin can add a child profile');
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.child_profiles (family_space_id, display_name, created_by)
       SELECT rivera, 'Nope', '33333333-3333-3333-3333-333333333333' FROM fx$sql$,
  '42501',
  NULL,
  'teen cannot add a child profile'
);
RESET ROLE;

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.child_profiles (family_space_id, display_name, created_by)
       SELECT rivera, 'Nope', '44444444-4444-4444-4444-444444444444' FROM fx$sql$,
  '42501',
  NULL,
  'elder cannot add a child profile'
);
RESET ROLE;

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.child_profiles (family_space_id, display_name, created_by)
       SELECT rivera, 'Nope', '55555555-5555-5555-5555-555555555555' FROM fx$sql$,
  '42501',
  NULL,
  'extended relative cannot add a child profile'
);
RESET ROLE;

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.child_profiles (family_space_id, display_name, created_by)
       SELECT rivera, 'Nope', '77777777-7777-7777-7777-777777777777' FROM fx$sql$,
  '42501',
  NULL,
  'caregiver cannot add a child profile'
);
RESET ROLE;

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.child_profiles (family_space_id, display_name, created_by)
       SELECT rivera, 'Nope', '99999999-9999-9999-9999-999999999999' FROM fx$sql$,
  '42501',
  NULL,
  'successor cannot add a child profile'
);
RESET ROLE;

-- Change role
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'elder' WHERE user_id = '33333333-3333-3333-3333-333333333333';
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333'), 'elder', 'admin can change a member role');
UPDATE public.space_members SET role = 'teen' WHERE user_id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'family_admin' WHERE user_id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333'), 'teen', 'teen cannot change roles');

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'teen' WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 'elder', 'elder cannot change roles');

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'teen' WHERE user_id = '55555555-5555-5555-5555-555555555555';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '55555555-5555-5555-5555-555555555555'), 'extended_relative', 'extended relative cannot change roles');

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'teen' WHERE user_id = '77777777-7777-7777-7777-777777777777';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '77777777-7777-7777-7777-777777777777'), 'caregiver', 'caregiver cannot change roles');

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'teen' WHERE user_id = '99999999-9999-9999-9999-999999999999';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '99999999-9999-9999-9999-999999999999'), 'successor', 'successor cannot change roles');

-- D8 Remove a member: Yes (family admin) / Leave
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '66666666-6666-6666-6666-666666666666';
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '66666666-6666-6666-6666-666666666666'), 0, 'admin can remove a member');
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 1, 'teen cannot remove a member');

-- D8 Remove a member: No
SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333'), 1, 'elder cannot remove a member');

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333'), 1, 'extended relative cannot remove a member');

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333'), 1, 'caregiver cannot remove a member');

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333'), 1, 'successor cannot remove a member');

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '33333333-3333-3333-3333-333333333333'), 0, 'teen can leave the family space');

INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT rivera, '33333333-3333-3333-3333-333333333333', 'teen' FROM fx;

SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '22222222-2222-2222-2222-222222222222';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '22222222-2222-2222-2222-222222222222'), 0, 'co admin can leave when another admin remains');

SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$DELETE FROM public.space_members WHERE user_id = '11111111-1111-1111-1111-111111111111'$sql$,
  '23514',
  NULL,
  'last admin cannot leave'
);
RESET ROLE;

-- D7 last remaining Family admin or Co admin cannot self-demote until another admin exists
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$UPDATE public.space_members SET role = 'teen' WHERE user_id = '11111111-1111-1111-1111-111111111111'$sql$,
  '23514',
  NULL,
  'last admin cannot change their own role'
);
RESET ROLE;

INSERT INTO public.space_members (family_space_id, user_id, role, relationship_label)
SELECT rivera, '22222222-2222-2222-2222-222222222222', 'co_admin', 'Dad' FROM fx;

SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'teen' WHERE user_id = '11111111-1111-1111-1111-111111111111';
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '11111111-1111-1111-1111-111111111111'), 'teen', 'admin can change their own role when another admin remains');
RESET ROLE;
UPDATE public.space_members SET role = 'family_admin' WHERE user_id = '11111111-1111-1111-1111-111111111111';

-- D8 Leave the family space: Yes
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '11111111-1111-1111-1111-111111111111';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '11111111-1111-1111-1111-111111111111'), 0, 'family admin can leave when another admin remains');
INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT rivera, '11111111-1111-1111-1111-111111111111', 'family_admin' FROM fx;

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 0, 'elder can leave the family space');
INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT rivera, '44444444-4444-4444-4444-444444444444', 'elder' FROM fx;

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '55555555-5555-5555-5555-555555555555';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '55555555-5555-5555-5555-555555555555'), 0, 'extended relative can leave the family space');
INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT rivera, '55555555-5555-5555-5555-555555555555', 'extended_relative' FROM fx;

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '77777777-7777-7777-7777-777777777777';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '77777777-7777-7777-7777-777777777777'), 0, 'caregiver can leave the family space');
INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT rivera, '77777777-7777-7777-7777-777777777777', 'caregiver' FROM fx;

-- Custom circles
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
INSERT INTO public.circles (family_space_id, name, kind)
SELECT rivera, 'Care team', 'custom' FROM fx;
SELECT isnt_empty($$SELECT 1 FROM public.circles WHERE name = 'Care team'$$, 'admin can create a custom circle');
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.circles (family_space_id, name, kind) SELECT rivera, 'Nope', 'custom' FROM fx$sql$,
  '42501',
  NULL,
  'teen cannot create a custom circle'
);
RESET ROLE;

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.circles (family_space_id, name, kind) SELECT rivera, 'Nope', 'custom' FROM fx$sql$,
  '42501',
  NULL,
  'elder cannot create a custom circle'
);
RESET ROLE;

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.circles (family_space_id, name, kind) SELECT rivera, 'Nope', 'custom' FROM fx$sql$,
  '42501',
  NULL,
  'extended relative cannot create a custom circle'
);
RESET ROLE;

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.circles (family_space_id, name, kind) SELECT rivera, 'Nope', 'custom' FROM fx$sql$,
  '42501',
  NULL,
  'caregiver cannot create a custom circle'
);
RESET ROLE;

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $sql$INSERT INTO public.circles (family_space_id, name, kind) SELECT rivera, 'Nope', 'custom' FROM fx$sql$,
  '42501',
  NULL,
  'successor cannot create a custom circle'
);
RESET ROLE;

-- Default circles per item type
SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
UPDATE public.circle_item_type_defaults
SET circle_id = (SELECT c.id FROM public.circles c JOIN fx ON c.family_space_id = fx.rivera WHERE c.kind = 'extended_family')
WHERE family_space_id = (SELECT rivera FROM fx) AND item_type = 'photo';
SELECT is(
  (
    SELECT c.kind::text
    FROM public.circle_item_type_defaults d
    JOIN public.circles c ON c.id = d.circle_id
    JOIN fx ON d.family_space_id = fx.rivera
    WHERE d.item_type = 'photo'
  ),
  'extended_family',
  'co admin can change default circles per item type'
);
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
UPDATE public.circle_item_type_defaults
SET circle_id = (SELECT c.id FROM public.circles c JOIN fx ON c.family_space_id = fx.rivera WHERE c.kind = 'household')
WHERE family_space_id = (SELECT rivera FROM fx) AND item_type = 'photo';
RESET ROLE;
SELECT is(
  (
    SELECT c.kind::text
    FROM public.circle_item_type_defaults d
    JOIN public.circles c ON c.id = d.circle_id
    JOIN fx ON d.family_space_id = fx.rivera
    WHERE d.item_type = 'photo'
  ),
  'extended_family',
  'teen cannot change default circles'
);

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
UPDATE public.circle_item_type_defaults
SET circle_id = (SELECT c.id FROM public.circles c JOIN fx ON c.family_space_id = fx.rivera WHERE c.kind = 'household')
WHERE family_space_id = (SELECT rivera FROM fx) AND item_type = 'photo';
RESET ROLE;
SELECT is(
  (
    SELECT c.kind::text
    FROM public.circle_item_type_defaults d
    JOIN public.circles c ON c.id = d.circle_id
    JOIN fx ON d.family_space_id = fx.rivera
    WHERE d.item_type = 'photo'
  ),
  'extended_family',
  'caregiver cannot change default circles'
);

-- D8 Change default circles per item type: No
SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
UPDATE public.circle_item_type_defaults
SET circle_id = (SELECT c.id FROM public.circles c JOIN fx ON c.family_space_id = fx.rivera WHERE c.kind = 'household')
WHERE family_space_id = (SELECT rivera FROM fx) AND item_type = 'photo';
RESET ROLE;
SELECT is(
  (
    SELECT c.kind::text
    FROM public.circle_item_type_defaults d
    JOIN public.circles c ON c.id = d.circle_id
    JOIN fx ON d.family_space_id = fx.rivera
    WHERE d.item_type = 'photo'
  ),
  'extended_family',
  'elder cannot change default circles'
);

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
UPDATE public.circle_item_type_defaults
SET circle_id = (SELECT c.id FROM public.circles c JOIN fx ON c.family_space_id = fx.rivera WHERE c.kind = 'household')
WHERE family_space_id = (SELECT rivera FROM fx) AND item_type = 'photo';
RESET ROLE;
SELECT is(
  (
    SELECT c.kind::text
    FROM public.circle_item_type_defaults d
    JOIN public.circles c ON c.id = d.circle_id
    JOIN fx ON d.family_space_id = fx.rivera
    WHERE d.item_type = 'photo'
  ),
  'extended_family',
  'extended relative cannot change default circles'
);

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
UPDATE public.circle_item_type_defaults
SET circle_id = (SELECT c.id FROM public.circles c JOIN fx ON c.family_space_id = fx.rivera WHERE c.kind = 'household')
WHERE family_space_id = (SELECT rivera FROM fx) AND item_type = 'photo';
RESET ROLE;
SELECT is(
  (
    SELECT c.kind::text
    FROM public.circle_item_type_defaults d
    JOIN public.circles c ON c.id = d.circle_id
    JOIN fx ON d.family_space_id = fx.rivera
    WHERE d.item_type = 'photo'
  ),
  'extended_family',
  'successor cannot change default circles'
);

SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'successor' WHERE user_id = '44444444-4444-4444-4444-444444444444';
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 'successor', 'admin can name a successor');
UPDATE public.space_members SET role = 'elder' WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;

SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'successor' WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 'elder', 'teen cannot name successors');

-- D8 Name successors: No
SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'successor' WHERE user_id = '55555555-5555-5555-5555-555555555555';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '55555555-5555-5555-5555-555555555555'), 'extended_relative', 'elder cannot name successors');

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'successor' WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 'elder', 'extended relative cannot name successors');

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'successor' WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 'elder', 'caregiver cannot name successors');

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
UPDATE public.space_members SET role = 'successor' WHERE user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
SELECT is((SELECT role::text FROM public.space_members WHERE user_id = '44444444-4444-4444-4444-444444444444'), 'elder', 'successor cannot name successors');

-- Delete space
SELECT tests_jwt('33333333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
DELETE FROM public.family_spaces WHERE id = (SELECT rivera FROM fx);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 1, 'teen cannot delete the family space');

SELECT tests_jwt('44444444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
DELETE FROM public.family_spaces WHERE id = (SELECT rivera FROM fx);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 1, 'elder cannot delete the family space');

SELECT tests_jwt('55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
DELETE FROM public.family_spaces WHERE id = (SELECT rivera FROM fx);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 1, 'extended relative cannot delete the family space');

SELECT tests_jwt('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
DELETE FROM public.family_spaces WHERE id = (SELECT rivera FROM fx);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 1, 'caregiver cannot delete the family space');

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
DELETE FROM public.family_spaces WHERE id = (SELECT rivera FROM fx);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT rivera FROM fx)), 1, 'successor cannot delete the family space');

SELECT tests_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SET LOCAL ROLE authenticated;
DELETE FROM public.family_spaces WHERE id = (SELECT other FROM fx);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE id = (SELECT other FROM fx)), 0, 'admin can delete their family space');

-- D8 Delete the family space: Yes (co admin)
SELECT tests_jwt('11111111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT public.create_family_space('Disposable Co Admin Space', NULL);
RESET ROLE;
INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT id, '22222222-2222-2222-2222-222222222222', 'co_admin'
FROM public.family_spaces WHERE name = 'Disposable Co Admin Space';
SELECT tests_jwt('22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
DELETE FROM public.family_spaces WHERE name = 'Disposable Co Admin Space';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.family_spaces WHERE name = 'Disposable Co Admin Space'), 0, 'co admin can delete the family space');

-- Accept once
RESET ROLE;
CREATE TEMP TABLE invite_tok (
  kind text PRIMARY KEY,
  token text NOT NULL
);
INSERT INTO invite_tok (kind, token)
SELECT 'pending', token
FROM public.invites
WHERE email = 'invitee@example.com' AND status = 'pending'
ORDER BY created_at DESC
LIMIT 1;
GRANT SELECT ON TABLE invite_tok TO authenticated, anon;

SELECT tests_jwt('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SET LOCAL ROLE authenticated;
SELECT public.accept_invite((SELECT token FROM invite_tok WHERE kind = 'pending'));
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, 'matching email can accept a pending invite once');
SELECT throws_ok(
  format($sql$SELECT public.accept_invite(%L)$sql$, (SELECT token FROM invite_tok WHERE kind = 'pending')),
  '23505',
  NULL,
  'invite cannot be accepted a second time'
);
RESET ROLE;

INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id, expires_at)
SELECT fx.rivera, '11111111-1111-1111-1111-111111111111', 'invitee@example.com', 'teen', fx.household, now() - interval '1 day'
FROM fx;
INSERT INTO invite_tok (kind, token)
SELECT 'expired', token
FROM public.invites
WHERE email = 'invitee@example.com' AND expires_at < now()
ORDER BY created_at DESC
LIMIT 1;

SELECT tests_jwt('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($sql$SELECT public.accept_invite(%L)$sql$, (SELECT token FROM invite_tok WHERE kind = 'expired')),
  '23514',
  NULL,
  'expired invite cannot be accepted'
);
RESET ROLE;

-- D12 revoked (never accepted) invite cannot be accepted
INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
SELECT fx.rivera, '11111111-1111-1111-1111-111111111111', 'invitee@example.com', 'teen', fx.household
FROM fx;
UPDATE public.invites
SET status = 'revoked'
WHERE id = (
  SELECT id FROM public.invites
  WHERE email = 'invitee@example.com' AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
);
INSERT INTO invite_tok (kind, token)
SELECT 'revoked', token
FROM public.invites
WHERE email = 'invitee@example.com' AND status = 'revoked'
ORDER BY created_at DESC
LIMIT 1;
SELECT tests_jwt('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    $sql$SELECT public.accept_invite(%L)$sql$,
    (SELECT token FROM invite_tok WHERE kind = 'revoked')
  ),
  '23514',
  NULL,
  'revoked invite cannot be accepted'
);
RESET ROLE;

SELECT throws_ok(
  $sql$UPDATE public.space_members
       SET caregiver_access_ends_at = now() + interval '40 days'
       WHERE user_id = '77777777-7777-7777-7777-777777777777'$sql$,
  '23514',
  NULL,
  'caregiver access cannot exceed 30 days'
);

SELECT tests_jwt('99999999-9999-9999-9999-999999999999');
SET LOCAL ROLE authenticated;
DELETE FROM public.space_members WHERE user_id = '99999999-9999-9999-9999-999999999999';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.space_members WHERE user_id = '99999999-9999-9999-9999-999999999999'), 0, 'successor can leave the family space');

INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
SELECT fx.rivera, '11111111-1111-1111-1111-111111111111', 'decline@example.com', 'elder', fx.household
FROM fx;
INSERT INTO invite_tok (kind, token)
SELECT 'declined', token
FROM public.invites
WHERE email = 'decline@example.com' AND status = 'pending'
ORDER BY created_at DESC
LIMIT 1;

SELECT is(
  (SELECT inviter_display_name FROM public.get_invite_preview(
    (SELECT token FROM invite_tok WHERE kind = 'declined')
  )),
  'Elena Rivera',
  'invite preview includes who invited'
);

SELECT public.decline_invite(
  (SELECT token FROM invite_tok WHERE kind = 'declined')
);

SELECT is(
  (SELECT status::text FROM public.invites WHERE email = 'decline@example.com' ORDER BY created_at DESC LIMIT 1),
  'declined',
  'decline invalidates a pending invite'
);

SELECT is_empty(
  format(
    $sql$SELECT * FROM public.get_invite_preview(%L)$sql$,
    (SELECT token FROM invite_tok WHERE kind = 'declined')
  ),
  'declined invite has no preview'
);

SELECT tests_jwt('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    $sql$SELECT public.accept_invite(%L)$sql$,
    (SELECT token FROM invite_tok WHERE kind = 'declined')
  ),
  '23514',
  NULL,
  'declined invite cannot be accepted'
);
RESET ROLE;

RESET ROLE;
SELECT tests_create_auth_user(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'autoprofile@example.com',
  'Auto Profile'
);
SELECT is(
  (SELECT display_name FROM public.profiles WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'Auto Profile',
  'new auth user gets a profile automatically'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
