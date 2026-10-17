-- pgTAP: D30 default circle membership.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = extensions, public, auth, storage;

SELECT plan(22);

CREATE OR REPLACE FUNCTION tests_create_auth_user(p_id uuid, p_email text, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    p_id, 'authenticated', 'authenticated', p_email,
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_name),
    now(), now(), '', '', '', ''
  );
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', p_id::text, now(), now(), now()
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

SELECT tests_create_auth_user('d3011111-1111-1111-1111-111111111111', 'd30-admin@example.com', 'D30 Admin');
SELECT tests_create_auth_user('d3022222-2222-2222-2222-222222222222', 'd30-elder@example.com', 'D30 Elder');
SELECT tests_create_auth_user('d3033333-3333-3333-3333-333333333333', 'd30-ext@example.com', 'D30 Ext');
SELECT tests_create_auth_user('d3044444-4444-4444-4444-444444444444', 'd30-care@example.com', 'D30 Care');
SELECT tests_create_auth_user('d3055555-5555-5555-5555-555555555555', 'd30-invite@example.com', 'D30 Invite');

SELECT tests_jwt('d3011111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT public.create_family_space('D30 Family', 'Mom');
RESET ROLE;

CREATE TEMP TABLE fx AS
SELECT
  (SELECT id FROM public.family_spaces WHERE name = 'D30 Family') AS space,
  (
    SELECT c.id FROM public.circles AS c
    JOIN public.family_spaces AS s ON s.id = c.family_space_id
    WHERE s.name = 'D30 Family' AND c.kind = 'household'
  ) AS household,
  (
    SELECT c.id FROM public.circles AS c
    JOIN public.family_spaces AS s ON s.id = c.family_space_id
    WHERE s.name = 'D30 Family' AND c.kind = 'extended_family'
  ) AS extended,
  (
    SELECT c.id FROM public.circles AS c
    JOIN public.family_spaces AS s ON s.id = c.family_space_id
    WHERE s.name = 'D30 Family' AND c.kind = 'close_friends'
  ) AS friends;
GRANT SELECT ON TABLE fx TO authenticated, anon;

SELECT is(
  (
    SELECT count(DISTINCT kind)::int
    FROM public.circles
    WHERE family_space_id = (SELECT space FROM fx)
      AND kind IN ('household', 'extended_family', 'close_friends', 'only_me')
  ),
  4,
  'new family has Household, Extended Family, Close Friends and Only Me'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM public.circle_members
    WHERE circle_id = (SELECT friends FROM fx)
  ),
  0,
  'Close Friends starts empty'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT household FROM fx)
      AND user_id = 'd3011111-1111-1111-1111-111111111111'
  ),
  'creator is in Household'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT extended FROM fx)
      AND user_id = 'd3011111-1111-1111-1111-111111111111'
  ),
  'creator is in Extended Family'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.circles AS c
    JOIN public.circle_members AS cm ON cm.circle_id = c.id
    WHERE c.family_space_id = (SELECT space FROM fx)
      AND c.kind = 'only_me'
      AND c.owner_user_id = 'd3011111-1111-1111-1111-111111111111'
      AND cm.user_id = 'd3011111-1111-1111-1111-111111111111'
  ),
  'creator has Only Me'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT friends FROM fx)
      AND user_id = 'd3011111-1111-1111-1111-111111111111'
  ),
  'creator is not in Close Friends'
);

INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT space, 'd3022222-2222-2222-2222-222222222222', 'elder' FROM fx;

INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT space, 'd3033333-3333-3333-3333-333333333333', 'extended_relative' FROM fx;

INSERT INTO public.space_members (family_space_id, user_id, role)
SELECT space, 'd3044444-4444-4444-4444-444444444444', 'caregiver' FROM fx;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT household FROM fx)
      AND user_id = 'd3022222-2222-2222-2222-222222222222'
  )
  AND EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT extended FROM fx)
      AND user_id = 'd3022222-2222-2222-2222-222222222222'
  ),
  'elder lands in Household and Extended Family'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT extended FROM fx)
      AND user_id = 'd3033333-3333-3333-3333-333333333333'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT household FROM fx)
      AND user_id = 'd3033333-3333-3333-3333-333333333333'
  ),
  'extended relative is in Extended Family only among the shared defaults'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id IN (SELECT household FROM fx UNION SELECT extended FROM fx)
      AND user_id = 'd3044444-4444-4444-4444-444444444444'
  ),
  'caregiver is not added to Household or Extended Family'
);

UPDATE public.space_members
SET role = 'elder'
WHERE user_id = 'd3033333-3333-3333-3333-333333333333';

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT household FROM fx)
      AND user_id = 'd3033333-3333-3333-3333-333333333333'
  ),
  'role change into a Household role adds Household'
);

UPDATE public.space_members
SET role = 'extended_relative'
WHERE user_id = 'd3033333-3333-3333-3333-333333333333';

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT household FROM fx)
      AND user_id = 'd3033333-3333-3333-3333-333333333333'
  )
  AND EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT extended FROM fx)
      AND user_id = 'd3033333-3333-3333-3333-333333333333'
  ),
  'role change to extended relative leaves Extended Family and leaves Household'
);

DELETE FROM public.circle_members
WHERE circle_id = (SELECT extended FROM fx)
  AND user_id = 'd3011111-1111-1111-1111-111111111111';

SELECT public.backfill_default_circle_memberships();

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT extended FROM fx)
      AND user_id = 'd3011111-1111-1111-1111-111111111111'
  ),
  'backfill restores missing Extended Family membership'
);

INSERT INTO public.child_profiles (id, family_space_id, display_name, created_by)
SELECT 'd30ccccc-cccc-cccc-cccc-cccccccccccc', space, 'D30 Child',
  'd3011111-1111-1111-1111-111111111111'
FROM fx;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT household FROM fx)
      AND child_profile_id = 'd30ccccc-cccc-cccc-cccc-cccccccccccc'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT extended FROM fx)
      AND child_profile_id = 'd30ccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  'child follows Household, not Extended Family'
);

SELECT tests_jwt('d3011111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
INSERT INTO public.invites (family_space_id, invited_by, email, role, default_circle_id)
SELECT space, 'd3011111-1111-1111-1111-111111111111', 'd30-invite@example.com', 'teen', household
FROM fx;
RESET ROLE;

SELECT tests_jwt('d3055555-5555-5555-5555-555555555555');
SET LOCAL ROLE authenticated;
SELECT public.accept_invite((SELECT token FROM public.invites WHERE email = 'd30-invite@example.com'));
RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT household FROM fx)
      AND user_id = 'd3055555-5555-5555-5555-555555555555'
  )
  AND EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT extended FROM fx)
      AND user_id = 'd3055555-5555-5555-5555-555555555555'
  ),
  'accepted teen invite lands in Household and Extended Family'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = (SELECT friends FROM fx)
      AND user_id = 'd3055555-5555-5555-5555-555555555555'
  ),
  'accepted invite does not add Close Friends'
);

SELECT tests_jwt('d3011111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $sql$INSERT INTO public.memory_items (
         family_space_id, circle_id, uploader_id, caption, taken_at, width, height, status
       ) VALUES (
         (SELECT space FROM fx),
         (SELECT extended FROM fx),
         'd3011111-1111-1111-1111-111111111111',
         'D30-EXT', now(), 10, 10, 'uploading'
       )$sql$,
  'admin can post to Extended Family'
);
UPDATE public.memory_items SET status = 'ready' WHERE caption = 'D30-EXT';
RESET ROLE;

SELECT tests_jwt('d3011111-1111-1111-1111-111111111111');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $sql$INSERT INTO public.memory_items (
         family_space_id, circle_id, uploader_id, caption, taken_at, width, height, status
       ) VALUES (
         (SELECT space FROM fx),
         (SELECT household FROM fx),
         'd3011111-1111-1111-1111-111111111111',
         'D30-HH', now(), 10, 10, 'uploading'
       )$sql$,
  'admin can post to Household'
);
UPDATE public.memory_items SET status = 'ready' WHERE caption = 'D30-HH';
RESET ROLE;

SELECT tests_jwt('d3033333-3333-3333-3333-333333333333');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.memory_items WHERE caption = 'D30-EXT'),
  1,
  'extended relative can see Extended Family items'
);
SELECT is(
  (SELECT count(*)::int FROM public.memory_items WHERE caption = 'D30-HH'),
  0,
  'extended relative cannot see Household items'
);
RESET ROLE;

SELECT tests_jwt('d3022222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.memory_items WHERE caption = 'D30-EXT'),
  1,
  'elder in Household also sees Extended Family items'
);
SELECT is(
  (SELECT count(*)::int FROM public.memory_items WHERE caption = 'D30-HH'),
  1,
  'elder sees Household items'
);
RESET ROLE;

SELECT tests_jwt('d3044444-4444-4444-4444-444444444444');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.memory_items),
  0,
  'caregiver still cannot see memories'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
