-- D30: default circle membership when a family is created, someone
-- joins, a role changes, or a child profile is added. Backfills existing families.

CREATE OR REPLACE FUNCTION public.apply_default_circle_membership(
  _space_id uuid,
  _user_id uuid,
  _role public.space_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  household_id uuid;
  extended_id uuid;
  only_me_id uuid;
  in_household boolean;
  in_extended boolean;
BEGIN
  in_household := _role IN ('family_admin', 'co_admin', 'teen', 'elder');
  in_extended := _role IN (
    'family_admin',
    'co_admin',
    'teen',
    'elder',
    'extended_relative'
  );

  SELECT id INTO household_id
  FROM public.circles
  WHERE family_space_id = _space_id AND kind = 'household';

  SELECT id INTO extended_id
  FROM public.circles
  WHERE family_space_id = _space_id AND kind = 'extended_family';

  IF household_id IS NOT NULL THEN
    IF in_household THEN
      INSERT INTO public.circle_members (circle_id, user_id)
      VALUES (household_id, _user_id)
      ON CONFLICT (circle_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;
    ELSE
      DELETE FROM public.circle_members
      WHERE circle_id = household_id AND user_id = _user_id;
    END IF;
  END IF;

  IF extended_id IS NOT NULL THEN
    IF in_extended THEN
      INSERT INTO public.circle_members (circle_id, user_id)
      VALUES (extended_id, _user_id)
      ON CONFLICT (circle_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;
    ELSE
      DELETE FROM public.circle_members
      WHERE circle_id = extended_id AND user_id = _user_id;
    END IF;
  END IF;

  SELECT id INTO only_me_id
  FROM public.circles
  WHERE family_space_id = _space_id
    AND kind = 'only_me'
    AND owner_user_id = _user_id;

  IF only_me_id IS NULL THEN
    INSERT INTO public.circles (family_space_id, name, kind, owner_user_id)
    VALUES (_space_id, 'Only Me', 'only_me', _user_id)
    RETURNING id INTO only_me_id;
  END IF;

  INSERT INTO public.circle_members (circle_id, user_id)
  VALUES (only_me_id, _user_id)
  ON CONFLICT (circle_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_default_child_circle_membership(
  _space_id uuid,
  _child_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  household_id uuid;
BEGIN
  SELECT id INTO household_id
  FROM public.circles
  WHERE family_space_id = _space_id AND kind = 'household';

  IF household_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.circle_members (circle_id, child_profile_id)
  VALUES (household_id, _child_id)
  ON CONFLICT (circle_id, child_profile_id) WHERE child_profile_id IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_default_circle_memberships()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member record;
  child record;
BEGIN
  FOR member IN
    SELECT family_space_id, user_id, role
    FROM public.space_members
  LOOP
    PERFORM public.apply_default_circle_membership(
      member.family_space_id,
      member.user_id,
      member.role
    );
  END LOOP;

  FOR child IN
    SELECT family_space_id, id
    FROM public.child_profiles
  LOOP
    PERFORM public.apply_default_child_circle_membership(
      child.family_space_id,
      child.id
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_space_members_default_circles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_default_circle_membership(
    NEW.family_space_id,
    NEW.user_id,
    NEW.role
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_child_profiles_default_circles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_default_child_circle_membership(
    NEW.family_space_id,
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS space_members_default_circles ON public.space_members;
CREATE TRIGGER space_members_default_circles
  AFTER INSERT OR UPDATE OF role ON public.space_members
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_space_members_default_circles();

DROP TRIGGER IF EXISTS child_profiles_default_circles ON public.child_profiles;
CREATE TRIGGER child_profiles_default_circles
  AFTER INSERT ON public.child_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_child_profiles_default_circles();

CREATE OR REPLACE FUNCTION public.create_family_space(p_name text, p_relationship_label text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  space_id uuid;
  household_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Family space name is required' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.family_spaces (name, created_by)
  VALUES (btrim(p_name), uid)
  RETURNING id INTO space_id;

  INSERT INTO public.circles (family_space_id, name, kind)
  VALUES (space_id, 'Household', 'household')
  RETURNING id INTO household_id;

  INSERT INTO public.circles (family_space_id, name, kind)
  VALUES
    (space_id, 'Extended Family', 'extended_family'),
    (space_id, 'Close Friends', 'close_friends');

  INSERT INTO public.space_members (family_space_id, user_id, role, relationship_label)
  VALUES (space_id, uid, 'family_admin', p_relationship_label);

  INSERT INTO public.circle_item_type_defaults (family_space_id, item_type, circle_id)
  SELECT space_id, t.item_type, household_id
  FROM (
    VALUES
      ('photo'::public.item_type),
      ('story'::public.item_type),
      ('note'::public.item_type),
      ('task'::public.item_type),
      ('document'::public.item_type)
  ) AS t(item_type);

  RETURN space_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  invite public.invites%ROWTYPE;
  member_email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invite
  FROM public.invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF invite.status = 'accepted' THEN
    RAISE EXCEPTION 'Invite already accepted' USING ERRCODE = 'unique_violation';
  END IF;
  IF invite.status IN ('revoked', 'declined') THEN
    RAISE EXCEPTION 'Invite is no longer valid' USING ERRCODE = 'check_violation';
  END IF;
  IF invite.status <> 'pending' OR invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Invite has expired' USING ERRCODE = 'check_violation';
  END IF;

  SELECT email INTO member_email FROM public.profiles WHERE id = uid;
  IF member_email IS NULL OR lower(member_email) <> lower(invite.email) THEN
    RAISE EXCEPTION 'Invite email does not match this account' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.space_members (family_space_id, user_id, role)
  VALUES (invite.family_space_id, uid, invite.role);

  IF EXISTS (
    SELECT 1 FROM public.circles
    WHERE id = invite.default_circle_id
      AND family_space_id = invite.family_space_id
      AND kind <> 'only_me'
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.circle_members
      WHERE circle_id = invite.default_circle_id AND user_id = uid
    )
  THEN
    INSERT INTO public.circle_members (circle_id, user_id)
    VALUES (invite.default_circle_id, uid);
  END IF;

  PERFORM public.ensure_only_me_circle(invite.family_space_id, uid);

  UPDATE public.invites
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = uid
  WHERE id = invite.id;

  RETURN invite.family_space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_default_circle_membership(uuid, uuid, public.space_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_default_child_circle_membership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_default_circle_memberships() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_space_members_default_circles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_child_profiles_default_circles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_family_space(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_family_space(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;

SELECT public.backfill_default_circle_memberships();
