-- MEM01 slice 1: Standard-tier family photo library.
-- Circle rules for the row and the file share can_view_memory so they cannot drift.

CREATE TYPE public.memory_item_status AS ENUM ('uploading', 'ready');

CREATE TABLE public.memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  circle_id uuid NOT NULL REFERENCES public.circles (id) ON DELETE RESTRICT,
  uploader_id uuid NOT NULL REFERENCES public.profiles (id),
  caption text,
  taken_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  full_path text NOT NULL,
  thumb_path text NOT NULL,
  status public.memory_item_status NOT NULL DEFAULT 'uploading'
);

CREATE INDEX memory_items_space_taken_idx
  ON public.memory_items (family_space_id, taken_at DESC);

CREATE OR REPLACE FUNCTION public.memory_fill_paths()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.full_path := NEW.family_space_id::text || '/' || NEW.id::text || '/full.jpg';
  NEW.thumb_path := NEW.family_space_id::text || '/' || NEW.id::text || '/thumb.jpg';
  RETURN NEW;
END;
$$;

CREATE TRIGGER memory_items_fill_paths
  BEFORE INSERT ON public.memory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.memory_fill_paths();

CREATE OR REPLACE FUNCTION public.memory_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.family_space_id IS DISTINCT FROM OLD.family_space_id
     OR NEW.uploader_id IS DISTINCT FROM OLD.uploader_id
     OR NEW.full_path IS DISTINCT FROM OLD.full_path
     OR NEW.thumb_path IS DISTINCT FROM OLD.thumb_path
  THEN
    RAISE EXCEPTION 'memory_items identity columns cannot change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'ready' AND NEW.status = 'uploading' THEN
    RAISE EXCEPTION 'ready memory_items cannot return to uploading'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER memory_items_guard_immutable
  BEFORE UPDATE ON public.memory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.memory_guard_immutable();

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

CREATE OR REPLACE FUNCTION public.in_memory_circle(_circle_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.circles AS c
    WHERE c.id = _circle_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.circle_members AS cm
          WHERE cm.circle_id = c.id
            AND cm.user_id = _user_id
        )
        OR (c.kind = 'only_me' AND c.owner_user_id = _user_id)
      )
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

CREATE OR REPLACE FUNCTION public.memory_object_parts(object_name text)
RETURNS TABLE (family_space_id uuid, item_id uuid, file_name text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) IS DISTINCT FROM 3 THEN
    RETURN;
  END IF;
  IF parts[3] IS NULL OR parts[3] NOT IN ('full.jpg', 'thumb.jpg') THEN
    RETURN;
  END IF;
  BEGIN
    family_space_id := parts[1]::uuid;
    item_id := parts[2]::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN;
  END;
  file_name := parts[3];
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_upload_memory_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_object_parts(object_name) AS p
    JOIN public.memory_items AS m ON m.id = p.item_id
    WHERE m.family_space_id = p.family_space_id
      AND m.uploader_id = auth.uid()
      AND m.status = 'uploading'
      AND public.is_memory_role(m.family_space_id, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_delete_memory_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_object_parts(object_name) AS p
    JOIN public.memory_items AS m ON m.id = p.item_id
    WHERE m.family_space_id = p.family_space_id
      AND m.uploader_id = auth.uid()
      AND (
        (p.file_name = 'full.jpg' AND m.full_path = object_name)
        OR (p.file_name = 'thumb.jpg' AND m.thumb_path = object_name)
      )
      AND public.is_memory_role(m.family_space_id, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_memory_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_object_parts(object_name) AS p
    JOIN public.memory_items AS m ON m.id = p.item_id
    WHERE m.family_space_id = p.family_space_id
      AND (
        (p.file_name = 'full.jpg' AND m.full_path = object_name)
        OR (p.file_name = 'thumb.jpg' AND m.thumb_path = object_name)
      )
      AND public.can_view_memory(m.id)
  );
$$;

ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_items FORCE ROW LEVEL SECURITY;

CREATE POLICY memory_items_select ON public.memory_items
  FOR SELECT TO authenticated
  USING (public.can_view_memory(id));

CREATE POLICY memory_items_insert ON public.memory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND status = 'uploading'
    AND public.is_memory_role(family_space_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.circles AS c
      WHERE c.id = circle_id
        AND c.family_space_id = memory_items.family_space_id
    )
    AND public.in_memory_circle(circle_id, auth.uid())
  );

CREATE POLICY memory_items_update ON public.memory_items
  FOR UPDATE TO authenticated
  USING (
    uploader_id = auth.uid()
    AND public.is_memory_role(family_space_id, auth.uid())
  )
  WITH CHECK (
    uploader_id = auth.uid()
    AND public.is_memory_role(family_space_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.circles AS c
      WHERE c.id = circle_id
        AND c.family_space_id = memory_items.family_space_id
    )
    AND public.in_memory_circle(circle_id, auth.uid())
  );

CREATE POLICY memory_items_delete ON public.memory_items
  FOR DELETE TO authenticated
  USING (
    uploader_id = auth.uid()
    AND public.is_memory_role(family_space_id, auth.uid())
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memories',
  'memories',
  false,
  8388608,
  ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg']::text[];

CREATE POLICY memories_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'memories'
    AND public.can_view_memory_object(name)
  );

CREATE POLICY memories_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'memories'
    AND public.can_upload_memory_object(name)
  );

CREATE POLICY memories_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'memories'
    AND public.can_delete_memory_object(name)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_items TO authenticated;

REVOKE ALL ON FUNCTION public.memory_fill_paths() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memory_guard_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_memory_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.in_memory_circle(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_memory(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.memory_object_parts(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_upload_memory_object(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_delete_memory_object(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_memory_object(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_memory_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_memory_circle(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_memory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_memory_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_memory_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_memory_object(text) TO authenticated;
