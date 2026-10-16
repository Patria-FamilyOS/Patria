-- INSERT ... RETURNING must use the new row's columns. Nested SELECT from
-- memory_items inside can_view_memory(id) cannot see that row yet.

CREATE OR REPLACE FUNCTION public.can_view_memory_fields(
  _family_space_id uuid,
  _circle_id uuid,
  _uploader_id uuid,
  _status public.memory_item_status
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  circle_kind public.circle_kind;
  circle_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.space_members AS m
    WHERE m.family_space_id = _family_space_id
      AND m.user_id = auth.uid()
      AND m.role IN ('family_admin', 'co_admin', 'teen', 'elder', 'extended_relative')
      AND (m.role <> 'caregiver' OR m.caregiver_access_ends_at > now())
  ) THEN
    RETURN false;
  END IF;

  IF _status = 'uploading' THEN
    RETURN _uploader_id = auth.uid();
  END IF;

  IF _status <> 'ready' THEN
    RETURN false;
  END IF;

  SELECT c.kind, c.owner_user_id INTO circle_kind, circle_owner
  FROM public.circles AS c
  WHERE c.id = _circle_id
    AND c.family_space_id = _family_space_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF circle_kind = 'only_me' THEN
    RETURN _uploader_id = auth.uid() AND circle_owner = auth.uid();
  END IF;

  RETURN public.in_memory_circle(_circle_id, auth.uid());
END;
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
BEGIN
  SELECT * INTO item
  FROM public.memory_items
  WHERE id = _item_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN public.can_view_memory_fields(
    item.family_space_id,
    item.circle_id,
    item.uploader_id,
    item.status
  );
END;
$$;

DROP POLICY IF EXISTS memory_items_select ON public.memory_items;
CREATE POLICY memory_items_select ON public.memory_items
  FOR SELECT TO authenticated
  USING (
    public.can_view_memory_fields(family_space_id, circle_id, uploader_id, status)
  );

REVOKE ALL ON FUNCTION public.can_view_memory_fields(uuid, uuid, uuid, public.memory_item_status)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_memory_fields(uuid, uuid, uuid, public.memory_item_status)
  TO authenticated;
