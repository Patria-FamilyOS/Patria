-- Lock SECURITY DEFINER helpers to auth.uid(), search_path on triggers,
-- admin-only profile emails, and no GraphQL-facing grants on helpers.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_caregiver_access_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'caregiver' THEN
    IF NEW.caregiver_access_ends_at IS NULL THEN
      NEW.caregiver_access_ends_at := now() + interval '24 hours';
    END IF;
    IF NEW.caregiver_access_ends_at > now() + interval '30 days' THEN
      RAISE EXCEPTION 'Caregiver access cannot exceed 30 days'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.caregiver_access_ends_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_at_least_one_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  remaining integer;
  space uuid;
  old_is_admin boolean;
  new_is_admin boolean;
BEGIN
  space := COALESCE(OLD.family_space_id, NEW.family_space_id);

  IF NOT EXISTS (SELECT 1 FROM public.family_spaces WHERE id = space) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  old_is_admin := OLD.role IN ('family_admin', 'co_admin');

  IF TG_OP = 'DELETE' THEN
    IF old_is_admin THEN
      SELECT count(*) INTO remaining
      FROM public.space_members
      WHERE family_space_id = space
        AND id <> OLD.id
        AND role IN ('family_admin', 'co_admin');
      IF remaining = 0 THEN
        RAISE EXCEPTION 'A family space must keep at least one Family admin or Co admin'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  new_is_admin := NEW.role IN ('family_admin', 'co_admin');
  IF old_is_admin AND NOT new_is_admin THEN
    SELECT count(*) INTO remaining
    FROM public.space_members
    WHERE family_space_id = space
      AND id <> NEW.id
      AND role IN ('family_admin', 'co_admin');
    IF remaining = 0 THEN
      RAISE EXCEPTION 'A family space must keep at least one Family admin or Co admin'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_system_circles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.kind <> 'custom' THEN
    IF TG_OP = 'DELETE' THEN
      IF NOT EXISTS (SELECT 1 FROM public.family_spaces WHERE id = OLD.family_space_id) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'System circles cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.family_space_id IS DISTINCT FROM OLD.family_space_id
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
      RAISE EXCEPTION 'System circles cannot be retyped or moved'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.visibility_summary_for_role(_role public.space_role)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
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

-- Viewer is always auth.uid(). Extra user-id arguments are ignored.

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
    AND m.user_id = auth.uid()
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
      AND m.user_id = auth.uid()
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
  SELECT COALESCE(public.space_role(_space_id) IS NOT NULL
    AND public.space_role(_space_id) <> 'successor', false);
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
      AND viewer_cm.user_id = auth.uid()
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
      AND viewer_cm.user_id = auth.uid()
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
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF auth.uid() = _target THEN
    RETURN true;
  END IF;

  viewer_role := public.space_role(_space_id);
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
    RETURN public.shares_circle(_space_id, auth.uid(), _target);
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
  viewer_role := public.space_role(_space_id);
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
    RETURN public.shares_circle_with_child(_space_id, auth.uid(), _child);
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
  uid uuid := auth.uid();
  circle uuid;
BEGIN
  IF uid IS NULL OR uid IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.space_members
    WHERE family_space_id = _space_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO circle
  FROM public.circles
  WHERE family_space_id = _space_id
    AND kind = 'only_me'
    AND owner_user_id = uid;

  IF circle IS NULL THEN
    INSERT INTO public.circles (family_space_id, name, kind, owner_user_id)
    VALUES (_space_id, 'Only Me', 'only_me', uid)
    RETURNING id INTO circle;

    INSERT INTO public.circle_members (circle_id, user_id)
    VALUES (circle, uid);
  END IF;

  RETURN circle;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_member_email(p_space_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_view_member(p_space_id, auth.uid(), p_user_id) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT p.email FROM public.profiles AS p WHERE p.id = p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.space_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_space_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_space(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_circle(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_circle_with_child(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_child(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_only_me_circle(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_member_email(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.space_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_space(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_circle(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_circle_with_child(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_child(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_member_email(uuid, uuid) TO authenticated;

REVOKE SELECT ON TABLE public.profiles FROM authenticated;
GRANT SELECT (id, display_name, created_at, updated_at) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name, email, updated_at) ON TABLE public.profiles TO authenticated;
