-- Admins (and teens/elders) may see every child in their space (D8).
-- Do not re-select child_profiles from inside that check: INSERT ... RETURNING
-- evaluates the SELECT policy before the new row is visible to a nested SELECT,
-- which made Add a child look like a failure (42501 RLS) after Batch A.

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
    RETURN true;
  END IF;
  IF viewer_role = 'extended_relative' THEN
    RETURN public.shares_circle_with_child(_space_id, auth.uid(), _child);
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_child(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_child(uuid, uuid, uuid) TO authenticated;

-- Policies run as the signed-in user and must be able to call these helpers.
REVOKE ALL ON FUNCTION public.is_space_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.space_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_space(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_circle(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_circle_with_child(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_space(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_circle(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_circle_with_child(uuid, uuid, uuid) TO authenticated;
