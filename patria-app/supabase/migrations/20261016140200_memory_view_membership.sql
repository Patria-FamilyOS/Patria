-- Membership checks in memory RLS must re-read space_members after a leave.
CREATE OR REPLACE FUNCTION public.is_memory_role(_space_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.space_role(_space_id, _user_id) IN (
    'family_admin',
    'co_admin',
    'teen',
    'elder',
    'extended_relative'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_memory(_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.memory_items%ROWTYPE;
  circle_kind public.circle_kind;
  circle_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO item
  FROM public.memory_items
  WHERE id = _item_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.space_members AS m
    WHERE m.family_space_id = item.family_space_id
      AND m.user_id = auth.uid()
      AND m.role IN ('family_admin', 'co_admin', 'teen', 'elder', 'extended_relative')
      AND (m.role <> 'caregiver' OR m.caregiver_access_ends_at > now())
  ) THEN
    RETURN false;
  END IF;

  IF item.status = 'uploading' THEN
    RETURN item.uploader_id = auth.uid();
  END IF;

  IF item.status <> 'ready' THEN
    RETURN false;
  END IF;

  SELECT c.kind, c.owner_user_id INTO circle_kind, circle_owner
  FROM public.circles AS c
  WHERE c.id = item.circle_id
    AND c.family_space_id = item.family_space_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF circle_kind = 'only_me' THEN
    RETURN item.uploader_id = auth.uid() AND circle_owner = auth.uid();
  END IF;

  RETURN public.in_memory_circle(item.circle_id, auth.uid());
END;
$$;
