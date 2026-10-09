-- Access helpers and Row Level Security for D7 / D8.
-- Family admin and Co admin are the same permission level (is_space_admin).

CREATE OR REPLACE FUNCTION public.space_role(_space_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS public.space_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role
  FROM public.space_members AS m
  WHERE m.family_space_id = _space_id
    AND m.user_id = _user_id
    AND (
      m.role <> 'caregiver'
      OR m.caregiver_access_ends_at > now()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_space_admin(_space_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members AS m
    WHERE m.family_space_id = _space_id
      AND m.user_id = _user_id
      AND m.role IN ('family_admin', 'co_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_space(_space_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.space_role(_space_id, _user_id) IS NOT NULL
    AND public.space_role(_space_id, _user_id) <> 'successor', false);
$$;

CREATE OR REPLACE FUNCTION public.shares_circle(_space_id uuid, _viewer uuid, _other_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.circle_members AS viewer_cm
    JOIN public.circles AS c ON c.id = viewer_cm.circle_id
    JOIN public.circle_members AS other_cm ON other_cm.circle_id = c.id
    WHERE c.family_space_id = _space_id
      AND c.kind <> 'only_me'
      AND viewer_cm.user_id = _viewer
      AND other_cm.user_id = _other_user
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_circle_with_child(_space_id uuid, _viewer uuid, _child uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.circle_members AS viewer_cm
    JOIN public.circles AS c ON c.id = viewer_cm.circle_id
    JOIN public.circle_members AS child_cm ON child_cm.circle_id = c.id
    WHERE c.family_space_id = _space_id
      AND c.kind <> 'only_me'
      AND viewer_cm.user_id = _viewer
      AND child_cm.child_profile_id = _child
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_member(_space_id uuid, _viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_role public.space_role;
BEGIN
  IF _viewer IS NULL THEN
    RETURN false;
  END IF;
  IF _viewer = _target THEN
    RETURN true;
  END IF;

  viewer_role := public.space_role(_space_id, _viewer);
  IF viewer_role IS NULL OR viewer_role IN ('caregiver', 'successor') THEN
    RETURN false;
  END IF;
  IF viewer_role IN ('family_admin', 'co_admin', 'teen', 'elder') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.space_members
      WHERE family_space_id = _space_id AND user_id = _target
    );
  END IF;
  IF viewer_role = 'extended_relative' THEN
    RETURN public.shares_circle(_space_id, _viewer, _target);
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_child(_space_id uuid, _viewer uuid, _child uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_role public.space_role;
BEGIN
  viewer_role := public.space_role(_space_id, _viewer);
  IF viewer_role IS NULL OR viewer_role IN ('caregiver', 'successor') THEN
    RETURN false;
  END IF;
  IF viewer_role IN ('family_admin', 'co_admin', 'teen', 'elder') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.child_profiles
      WHERE family_space_id = _space_id AND id = _child
    );
  END IF;
  IF viewer_role = 'extended_relative' THEN
    RETURN public.shares_circle_with_child(_space_id, _viewer, _child);
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_only_me_circle(_space_id uuid, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  circle uuid;
BEGIN
  SELECT id INTO circle
  FROM public.circles
  WHERE family_space_id = _space_id
    AND kind = 'only_me'
    AND owner_user_id = _user_id;

  IF circle IS NULL THEN
    INSERT INTO public.circles (family_space_id, name, kind, owner_user_id)
    VALUES (_space_id, 'Only Me', 'only_me', _user_id)
    RETURNING id INTO circle;

    INSERT INTO public.circle_members (circle_id, user_id)
    VALUES (circle, _user_id);
  END IF;

  RETURN circle;
END;
$$;

CREATE OR REPLACE FUNCTION public.visibility_summary_for_role(_role public.space_role)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _role
    WHEN 'family_admin' THEN 'Family admins can see the family space and everyone in it. They can invite, change roles, and manage circles.'
    WHEN 'co_admin' THEN 'Co admins have the same access as family admins. They can see everyone and help run the space.'
    WHEN 'teen' THEN 'People in the family can see that you are a member. You can see the family space and the member list. You cannot invite people, change roles, or delete the space.'
    WHEN 'elder' THEN 'People in the family can see that you are a member. You can see the family space and the member list. You cannot invite people or change settings.'
    WHEN 'extended_relative' THEN 'You can see the family space and people who share a circle with you. Daily household details stay in the household circle.'
    WHEN 'caregiver' THEN 'Your access is time limited. You can see the family space name while access is active. You cannot see the member list or invite anyone.'
    WHEN 'successor' THEN 'You are named for a future handover. You cannot see family data until that handover is complete.'
  END;
$$;

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

  INSERT INTO public.space_members (family_space_id, user_id, role, relationship_label)
  VALUES (space_id, uid, 'family_admin', p_relationship_label);

  INSERT INTO public.circles (family_space_id, name, kind)
  VALUES (space_id, 'Household', 'household')
  RETURNING id INTO household_id;

  INSERT INTO public.circles (family_space_id, name, kind)
  VALUES
    (space_id, 'Extended Family', 'extended_family'),
    (space_id, 'Close Friends', 'close_friends');

  INSERT INTO public.circle_members (circle_id, user_id)
  VALUES (household_id, uid);

  PERFORM public.ensure_only_me_circle(space_id, uid);

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

CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token text)
RETURNS TABLE (
  family_space_name text,
  role public.space_role,
  default_circle_name text,
  expires_at timestamptz,
  visibility_summary text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.name,
    i.role,
    c.name,
    i.expires_at,
    public.visibility_summary_for_role(i.role)
  FROM public.invites AS i
  JOIN public.family_spaces AS fs ON fs.id = i.family_space_id
  JOIN public.circles AS c ON c.id = i.default_circle_id
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
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
  IF invite.status = 'revoked' THEN
    RAISE EXCEPTION 'Invite has been revoked' USING ERRCODE = 'check_violation';
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

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_item_type_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_spaces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.space_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.child_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.circles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.circle_item_type_defaults FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invites FORCE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.space_members AS mine
      JOIN public.space_members AS theirs
        ON theirs.family_space_id = mine.family_space_id
      WHERE mine.user_id = auth.uid()
        AND theirs.user_id = profiles.id
        AND public.can_view_member(mine.family_space_id, auth.uid(), profiles.id)
    )
  );

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY family_spaces_select ON public.family_spaces
  FOR SELECT TO authenticated
  USING (public.can_view_space(id, auth.uid()));

CREATE POLICY family_spaces_update ON public.family_spaces
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(id, auth.uid()))
  WITH CHECK (public.is_space_admin(id, auth.uid()));

CREATE POLICY family_spaces_delete ON public.family_spaces
  FOR DELETE TO authenticated
  USING (public.is_space_admin(id, auth.uid()));

CREATE POLICY space_members_select ON public.space_members
  FOR SELECT TO authenticated
  USING (public.can_view_member(family_space_id, auth.uid(), user_id));

CREATE POLICY space_members_update ON public.space_members
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()))
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()));

CREATE POLICY space_members_delete ON public.space_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_space_admin(family_space_id, auth.uid())
  );

CREATE POLICY child_profiles_select ON public.child_profiles
  FOR SELECT TO authenticated
  USING (public.can_view_child(family_space_id, auth.uid(), id));

CREATE POLICY child_profiles_insert ON public.child_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY child_profiles_update ON public.child_profiles
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()))
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()));

CREATE POLICY child_profiles_delete ON public.child_profiles
  FOR DELETE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()));

CREATE POLICY circles_select ON public.circles
  FOR SELECT TO authenticated
  USING (public.can_view_space(family_space_id, auth.uid()));

CREATE POLICY circles_insert ON public.circles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()) AND kind = 'custom');

CREATE POLICY circles_update ON public.circles
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()) AND kind = 'custom')
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()) AND kind = 'custom');

CREATE POLICY circles_delete ON public.circles
  FOR DELETE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()) AND kind = 'custom');

CREATE POLICY circle_members_select ON public.circle_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circles AS c
      WHERE c.id = circle_members.circle_id
        AND (
          (circle_members.user_id IS NOT NULL AND public.can_view_member(c.family_space_id, auth.uid(), circle_members.user_id))
          OR (circle_members.child_profile_id IS NOT NULL AND public.can_view_child(c.family_space_id, auth.uid(), circle_members.child_profile_id))
        )
    )
  );

CREATE POLICY circle_members_insert ON public.circle_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.circles AS c
      WHERE c.id = circle_id AND public.is_space_admin(c.family_space_id, auth.uid())
    )
  );

CREATE POLICY circle_members_delete ON public.circle_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circles AS c
      WHERE c.id = circle_members.circle_id AND public.is_space_admin(c.family_space_id, auth.uid())
    )
  );

CREATE POLICY circle_defaults_select ON public.circle_item_type_defaults
  FOR SELECT TO authenticated
  USING (public.can_view_space(family_space_id, auth.uid()));

CREATE POLICY circle_defaults_insert ON public.circle_item_type_defaults
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()));

CREATE POLICY circle_defaults_update ON public.circle_item_type_defaults
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()))
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()));

CREATE POLICY circle_defaults_delete ON public.circle_item_type_defaults
  FOR DELETE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()));

CREATE POLICY invites_select ON public.invites
  FOR SELECT TO authenticated
  USING (
    public.is_space_admin(family_space_id, auth.uid())
    OR (
      status = 'pending'
      AND expires_at > now()
      AND lower(email) = lower((SELECT p.email FROM public.profiles AS p WHERE p.id = auth.uid()))
    )
  );

CREATE POLICY invites_insert ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY invites_update ON public.invites
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()) AND status = 'pending')
  WITH CHECK (public.is_space_admin(family_space_id, auth.uid()) AND status IN ('pending', 'revoked'));

CREATE POLICY invites_delete ON public.invites
  FOR DELETE TO authenticated
  USING (public.is_space_admin(family_space_id, auth.uid()));

REVOKE ALL ON FUNCTION public.space_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_space_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_space(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_circle(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_circle_with_child(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_member(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_child(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_only_me_circle(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visibility_summary_for_role(public.space_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_family_space(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invite_preview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.space_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_space(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_circle(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_circle_with_child(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_child(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visibility_summary_for_role(public.space_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visibility_summary_for_role(public.space_role) TO anon;
GRANT EXECUTE ON FUNCTION public.create_family_space(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_preview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_preview(text) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.family_spaces TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.space_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.circles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.circle_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.circle_item_type_defaults TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
