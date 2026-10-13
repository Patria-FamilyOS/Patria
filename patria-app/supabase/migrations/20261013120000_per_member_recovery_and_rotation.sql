-- D27: per-member recovery key pairs. Purge Step 6 test data (pre-launch).
-- Rotate the family key when a key holder leaves.

ALTER TABLE public.family_spaces
  ADD COLUMN IF NOT EXISTS rotation_needed boolean NOT NULL DEFAULT false;

DROP TABLE IF EXISTS public.recovery_key_wraps CASCADE;

CREATE OR REPLACE FUNCTION public.purge_member_key_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.family_key_wraps
    WHERE family_space_id = OLD.family_space_id AND user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  IF OLD.role IN ('family_admin', 'co_admin', 'teen', 'elder')
     AND NEW.role NOT IN ('family_admin', 'co_admin', 'teen', 'elder') THEN
    DELETE FROM public.family_key_wraps
    WHERE family_space_id = NEW.family_space_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_device_keys(
  p_space_id uuid,
  p_user_id uuid,
  p_device_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_space_admin(p_space_id)
     AND NOT public.is_key_eligible_member(p_space_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.family_key_wraps
  WHERE family_space_id = p_space_id
    AND user_id = p_user_id
    AND device_id = p_device_id;
END;
$$;

DROP TABLE IF EXISTS public.family_key_under_recovery;
CREATE TABLE public.family_key_under_recovery (
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  key_epoch integer NOT NULL CHECK (key_epoch >= 1),
  wrapped_family_key bytea NOT NULL CHECK (octet_length(wrapped_family_key) >= 64),
  alg text NOT NULL DEFAULT 'rk-wrap-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_space_id, user_id, key_epoch)
);

CREATE TABLE public.recovery_public_keys (
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  public_key bytea NOT NULL CHECK (octet_length(public_key) = 32),
  recovery_key_epoch integer NOT NULL CHECK (recovery_key_epoch >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_space_id, user_id)
);

DROP TABLE IF EXISTS public.recovery_pair_wraps;
CREATE TABLE public.recovery_pair_wraps (
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recovery_key_epoch integer NOT NULL CHECK (recovery_key_epoch >= 1),
  pair_id public.recovery_pair_id NOT NULL,
  wrapped_recovery_key bytea NOT NULL CHECK (octet_length(wrapped_recovery_key) >= 64),
  alg text NOT NULL DEFAULT 'rk-pair-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_space_id, user_id, recovery_key_epoch, pair_id)
);

DROP TABLE IF EXISTS public.recovery_contact_secrets;
CREATE TABLE public.recovery_contact_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  wrapped_secret bytea NOT NULL CHECK (octet_length(wrapped_secret) >= 64),
  recovery_key_epoch integer NOT NULL CHECK (recovery_key_epoch >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, member_id, user_id, device_id, recovery_key_epoch),
  FOREIGN KEY (user_id, device_id) REFERENCES public.device_keys (user_id, device_id)
);

DROP TABLE IF EXISTS public.recovery_contacts CASCADE;
CREATE TABLE public.recovery_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  slot public.recovery_contact_slot NOT NULL,
  status public.recovery_contact_status NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, member_id, slot),
  UNIQUE (family_space_id, member_id, user_id)
);

ALTER TABLE public.recovery_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_contact_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_contact_secrets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_pair_wraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_pair_wraps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_under_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_under_recovery FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_public_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_public_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY recovery_contacts_select ON public.recovery_contacts
  FOR SELECT TO authenticated
  USING (
    member_id = auth.uid()
    OR user_id = auth.uid()
    OR public.is_space_admin(family_space_id)
  );

CREATE POLICY recovery_contacts_insert ON public.recovery_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid()
    AND created_by = auth.uid()
    AND public.is_key_eligible_member(family_space_id, member_id)
    AND public.is_recovery_contact_eligible(family_space_id, user_id)
  );

CREATE POLICY recovery_contacts_update ON public.recovery_contacts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('accepted', 'declined'));

CREATE POLICY recovery_contacts_delete ON public.recovery_contacts
  FOR DELETE TO authenticated
  USING (member_id = auth.uid() OR public.is_space_admin(family_space_id));

CREATE POLICY recovery_contact_secrets_select ON public.recovery_contact_secrets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY recovery_contact_secrets_insert ON public.recovery_contact_secrets
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid()
    AND public.is_key_eligible_member(family_space_id, member_id)
    AND EXISTS (
      SELECT 1 FROM public.recovery_contacts AS c
      WHERE c.family_space_id = recovery_contact_secrets.family_space_id
        AND c.member_id = recovery_contact_secrets.member_id
        AND c.user_id = recovery_contact_secrets.user_id
        AND c.status = 'accepted'
    )
  );

CREATE POLICY recovery_pair_wraps_select ON public.recovery_pair_wraps
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      public.is_key_eligible_member(family_space_id, auth.uid())
      OR public.recovery_request_is_usable(family_space_id, auth.uid())
    )
  );

CREATE POLICY recovery_pair_wraps_insert ON public.recovery_pair_wraps
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_key_eligible_member(family_space_id, auth.uid()));

CREATE POLICY recovery_public_keys_select ON public.recovery_public_keys
  FOR SELECT TO authenticated
  USING (public.is_key_eligible_member(family_space_id, auth.uid()));

CREATE POLICY recovery_public_keys_insert ON public.recovery_public_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_key_eligible_member(family_space_id, auth.uid()));

CREATE POLICY recovery_public_keys_delete ON public.recovery_public_keys
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_space_admin(family_space_id));

CREATE POLICY family_key_under_recovery_select ON public.family_key_under_recovery
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.recovery_request_is_usable(family_space_id, auth.uid())
  );

CREATE POLICY family_key_under_recovery_insert ON public.family_key_under_recovery
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_key_eligible_member(family_space_id, auth.uid())
  );

REVOKE ALL ON TABLE public.recovery_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_contact_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_pair_wraps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_public_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.family_key_under_recovery FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recovery_contacts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.recovery_contact_secrets TO authenticated;
GRANT SELECT, INSERT ON TABLE public.recovery_pair_wraps TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.recovery_public_keys TO authenticated;
GRANT SELECT, INSERT ON TABLE public.family_key_under_recovery TO authenticated;
GRANT SELECT ON TABLE public.family_spaces TO authenticated;

DROP FUNCTION IF EXISTS public.commit_family_key_ceremony(uuid, uuid, bytea, bytea, bytea, bytea, integer);

CREATE OR REPLACE FUNCTION public.commit_family_key_ceremony(
  p_space_id uuid,
  p_device_id uuid,
  p_public_key bytea,
  p_wrapped_family_key bytea,
  p_key_epoch integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_key_epoch IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF octet_length(p_public_key) <> 32 OR octet_length(p_wrapped_family_key) < 64 THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.family_key_meta (family_space_id, key_epoch, recovery_key_epoch)
  VALUES (p_space_id, p_key_epoch, 1);

  INSERT INTO public.device_keys (user_id, device_id, public_key)
  VALUES (me, p_device_id, p_public_key)
  ON CONFLICT (user_id, device_id) DO NOTHING;

  INSERT INTO public.family_key_wraps (
    family_space_id, user_id, device_id, wrapped_key, key_epoch, approved_by
  ) VALUES (
    p_space_id, me, p_device_id, p_wrapped_family_key, p_key_epoch, me
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_family_key_ceremony(uuid, uuid, bytea, bytea, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_family_key_ceremony(uuid, uuid, bytea, bytea, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_member_recovery(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.is_key_eligible_member(p_space_id, me) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.recovery_pair_wraps
  WHERE family_space_id = p_space_id AND user_id = me;
  DELETE FROM public.recovery_contact_secrets
  WHERE family_space_id = p_space_id AND member_id = me;
  DELETE FROM public.family_key_under_recovery
  WHERE family_space_id = p_space_id AND user_id = me;
  DELETE FROM public.recovery_public_keys
  WHERE family_space_id = p_space_id AND user_id = me;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_recovery_ciphertext(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_member_recovery(p_space_id);
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_family_key_under_recovery(uuid, integer, bytea);

CREATE OR REPLACE FUNCTION public.upsert_family_key_under_recovery(
  p_space_id uuid,
  p_user_id uuid,
  p_key_epoch integer,
  p_wrapped_family_key bytea
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_key_eligible_member(p_space_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.family_key_under_recovery (
    family_space_id, user_id, key_epoch, wrapped_family_key
  ) VALUES (
    p_space_id, p_user_id, p_key_epoch, p_wrapped_family_key
  )
  ON CONFLICT (family_space_id, user_id, key_epoch)
  DO UPDATE SET wrapped_family_key = EXCLUDED.wrapped_family_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_key_holder_role(p_role public.space_role)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role IN ('family_admin', 'co_admin', 'teen', 'elder');
$$;

CREATE OR REPLACE FUNCTION public.on_key_holder_departure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space uuid;
  departed uuid;
  was_holder boolean;
  still_holder boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    space := OLD.family_space_id;
    departed := OLD.user_id;
    was_holder := public.is_key_holder_role(OLD.role);
    still_holder := false;
  ELSE
    space := NEW.family_space_id;
    departed := NEW.user_id;
    was_holder := public.is_key_holder_role(OLD.role);
    still_holder := public.is_key_holder_role(NEW.role);
  END IF;

  IF NOT was_holder OR still_holder THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.device_removed_notices (family_space_id, user_id, device_id)
  SELECT space, departed, d.device_id
  FROM public.device_keys AS d
  WHERE d.user_id = departed;

  DELETE FROM public.family_key_wraps
  WHERE family_space_id = space AND user_id = departed;
  DELETE FROM public.family_key_under_recovery
  WHERE family_space_id = space AND user_id = departed;
  DELETE FROM public.recovery_public_keys
  WHERE family_space_id = space AND user_id = departed;
  DELETE FROM public.recovery_pair_wraps
  WHERE family_space_id = space AND user_id = departed;
  DELETE FROM public.recovery_contact_secrets
  WHERE family_space_id = space AND member_id = departed;
  DELETE FROM public.recovery_contacts
  WHERE family_space_id = space AND (member_id = departed OR user_id = departed);
  DELETE FROM public.device_approval_notices
  WHERE family_space_id = space AND user_id = departed;
  UPDATE public.recovery_requests
  SET cancelled_at = now(), cancelled_by = COALESCE(auth.uid(), departed)
  WHERE family_space_id = space
    AND user_id = departed
    AND completed_at IS NULL
    AND cancelled_at IS NULL;

  UPDATE public.family_spaces
  SET rotation_needed = true
  WHERE id = space;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS space_members_key_holder_departure ON public.space_members;
CREATE TRIGGER space_members_key_holder_departure
  AFTER DELETE OR UPDATE OF role ON public.space_members
  FOR EACH ROW
  EXECUTE FUNCTION public.on_key_holder_departure();

CREATE OR REPLACE FUNCTION public.rotate_family_key(
  p_space_id uuid,
  p_expected_epoch integer,
  p_user_ids uuid[],
  p_device_ids uuid[],
  p_wrapped_keys bytea[],
  p_seal_user_ids uuid[],
  p_sealed_keys bytea[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  current_epoch integer;
  next_epoch integer;
  expected_devices integer;
  expected_seals integer;
  i integer;
BEGIN
  IF me IS NULL OR NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF cardinality(p_user_ids) IS DISTINCT FROM cardinality(p_device_ids)
     OR cardinality(p_user_ids) IS DISTINCT FROM cardinality(p_wrapped_keys)
     OR cardinality(p_seal_user_ids) IS DISTINCT FROM cardinality(p_sealed_keys) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT key_epoch INTO current_epoch
  FROM public.family_key_meta
  WHERE family_space_id = p_space_id
  FOR UPDATE;
  IF current_epoch IS NULL OR current_epoch IS DISTINCT FROM p_expected_epoch THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO expected_devices
  FROM public.family_key_wraps AS w
  JOIN public.device_keys AS d
    ON d.user_id = w.user_id AND d.device_id = w.device_id AND d.rejected_at IS NULL
  JOIN public.space_members AS m
    ON m.family_space_id = w.family_space_id AND m.user_id = w.user_id
  WHERE w.family_space_id = p_space_id
    AND w.key_epoch = current_epoch
    AND public.is_key_holder_role(m.role);

  IF expected_devices IS DISTINCT FROM cardinality(p_device_ids) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT user_id, device_id
    FROM unnest(p_user_ids, p_device_ids) AS offered(user_id, device_id)
    EXCEPT
    SELECT w.user_id, w.device_id
    FROM public.family_key_wraps AS w
    JOIN public.device_keys AS d
      ON d.user_id = w.user_id AND d.device_id = w.device_id AND d.rejected_at IS NULL
    JOIN public.space_members AS m
      ON m.family_space_id = w.family_space_id AND m.user_id = w.user_id
    WHERE w.family_space_id = p_space_id
      AND w.key_epoch = current_epoch
      AND public.is_key_holder_role(m.role)
  ) OR EXISTS (
    SELECT w.user_id, w.device_id
    FROM public.family_key_wraps AS w
    JOIN public.device_keys AS d
      ON d.user_id = w.user_id AND d.device_id = w.device_id AND d.rejected_at IS NULL
    JOIN public.space_members AS m
      ON m.family_space_id = w.family_space_id AND m.user_id = w.user_id
    WHERE w.family_space_id = p_space_id
      AND w.key_epoch = current_epoch
      AND public.is_key_holder_role(m.role)
    EXCEPT
    SELECT user_id, device_id FROM unnest(p_user_ids, p_device_ids) AS offered(user_id, device_id)
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO expected_seals
  FROM public.recovery_public_keys AS r
  JOIN public.space_members AS m
    ON m.family_space_id = r.family_space_id AND m.user_id = r.user_id
  WHERE r.family_space_id = p_space_id
    AND public.is_key_holder_role(m.role);
  IF expected_seals IS DISTINCT FROM cardinality(p_seal_user_ids) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT user_id FROM unnest(p_seal_user_ids) AS offered(user_id)
    EXCEPT
    SELECT r.user_id
    FROM public.recovery_public_keys AS r
    JOIN public.space_members AS m
      ON m.family_space_id = r.family_space_id AND m.user_id = r.user_id
    WHERE r.family_space_id = p_space_id
      AND public.is_key_holder_role(m.role)
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  next_epoch := current_epoch + 1;
  UPDATE public.family_key_meta
  SET key_epoch = next_epoch, updated_at = now()
  WHERE family_space_id = p_space_id;

  FOR i IN 1..COALESCE(cardinality(p_device_ids), 0) LOOP
    INSERT INTO public.family_key_wraps (
      family_space_id, user_id, device_id, wrapped_key, key_epoch, approved_by
    ) VALUES (
      p_space_id, p_user_ids[i], p_device_ids[i], p_wrapped_keys[i], next_epoch, me
    );
  END LOOP;

  FOR i IN 1..COALESCE(cardinality(p_seal_user_ids), 0) LOOP
    INSERT INTO public.family_key_under_recovery (
      family_space_id, user_id, key_epoch, wrapped_family_key
    ) VALUES (
      p_space_id, p_seal_user_ids[i], next_epoch, p_sealed_keys[i]
    );
  END LOOP;

  UPDATE public.family_spaces SET rotation_needed = false WHERE id = p_space_id;
  RETURN next_epoch;
END;
$$;

REVOKE ALL ON FUNCTION public.on_key_holder_departure() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_key_holder_role(public.space_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_member_recovery(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rotate_family_key(uuid, integer, uuid[], uuid[], bytea[], uuid[], bytea[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_family_key_under_recovery(uuid, uuid, integer, bytea) FROM PUBLIC, anon;
DROP FUNCTION IF EXISTS public.insert_recovery_key_wrap_setup(uuid, uuid, uuid, bytea, integer);

GRANT EXECUTE ON FUNCTION public.purge_member_recovery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_recovery_ciphertext(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_family_key(uuid, integer, uuid[], uuid[], bytea[], uuid[], bytea[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_family_key_under_recovery(uuid, uuid, integer, bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_recovery_key_epoch(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.can_insert_recovery_key_wrap(uuid, uuid, uuid, integer, uuid);

CREATE OR REPLACE FUNCTION public.remove_own_device(
  p_space_id uuid,
  p_device_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  leftover integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.device_keys AS d
    WHERE d.user_id = me AND d.device_id = p_device_id
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_key_eligible_member(p_space_id, me) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.device_removed_notices (family_space_id, user_id, device_id)
  VALUES (p_space_id, me, p_device_id);

  DELETE FROM public.family_key_wraps
  WHERE family_space_id = p_space_id
    AND user_id = me
    AND device_id = p_device_id;
  DELETE FROM public.device_approval_notices
  WHERE family_space_id = p_space_id
    AND user_id = me
    AND device_id = p_device_id;
  DELETE FROM public.recovery_contact_secrets
  WHERE family_space_id = p_space_id
    AND user_id = me
    AND device_id = p_device_id;
  DELETE FROM public.recovery_requests
  WHERE family_space_id = p_space_id
    AND user_id = me
    AND new_device_id = p_device_id
    AND completed_at IS NULL;

  SELECT count(*)::integer INTO leftover
  FROM (
    SELECT 1 FROM public.family_key_wraps
    WHERE user_id = me AND device_id = p_device_id
    UNION ALL
    SELECT 1 FROM public.device_approval_notices
    WHERE user_id = me AND device_id = p_device_id
    UNION ALL
    SELECT 1 FROM public.recovery_contact_secrets
    WHERE user_id = me AND device_id = p_device_id
    UNION ALL
    SELECT 1 FROM public.recovery_requests
    WHERE user_id = me AND new_device_id = p_device_id
  ) AS leftover_rows;

  IF leftover = 0 THEN
    DELETE FROM public.device_keys
    WHERE user_id = me AND device_id = p_device_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_recovery_helper(
  p_request_id uuid,
  p_slot public.recovery_contact_slot,
  p_wrapped_secret bytea
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.recovery_requests;
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req FROM public.recovery_requests WHERE id = p_request_id;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF req.user_id = me THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF req.cancelled_at IS NOT NULL OR req.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF now() < req.not_before OR now() >= req.expires_at THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.recovery_contacts AS c
    WHERE c.family_space_id = req.family_space_id
      AND c.member_id = req.user_id
      AND c.user_id = me
      AND c.slot = p_slot
      AND c.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.recovery_request_helpers (request_id, slot, wrapped_secret, approved_by)
  VALUES (p_request_id, p_slot, p_wrapped_secret, me);
END;
$$;

CREATE OR REPLACE FUNCTION public.rotation_wrap_targets(p_space_id uuid)
RETURNS TABLE (user_id uuid, device_id uuid, public_key bytea)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_epoch integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT key_epoch INTO current_epoch
  FROM public.family_key_meta
  WHERE family_space_id = p_space_id;
  IF current_epoch IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT w.user_id, w.device_id, d.public_key
  FROM public.family_key_wraps AS w
  JOIN public.device_keys AS d
    ON d.user_id = w.user_id AND d.device_id = w.device_id AND d.rejected_at IS NULL
  JOIN public.space_members AS m
    ON m.family_space_id = w.family_space_id AND m.user_id = w.user_id
  WHERE w.family_space_id = p_space_id
    AND w.key_epoch = current_epoch
    AND public.is_key_holder_role(m.role);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_rotation_needed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rotation_needed IS DISTINCT FROM OLD.rotation_needed
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_spaces_guard_rotation_needed ON public.family_spaces;
CREATE TRIGGER family_spaces_guard_rotation_needed
  BEFORE UPDATE OF rotation_needed ON public.family_spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_rotation_needed();

REVOKE ALL ON FUNCTION public.rotation_wrap_targets(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_rotation_needed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotation_wrap_targets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_own_device(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_recovery_helper(uuid, public.recovery_contact_slot, bytea) TO authenticated;

DROP POLICY IF EXISTS recovery_requests_select ON public.recovery_requests;
CREATE POLICY recovery_requests_select ON public.recovery_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_space_admin(family_space_id)
    OR EXISTS (
      SELECT 1 FROM public.recovery_contacts AS c
      WHERE c.family_space_id = recovery_requests.family_space_id
        AND c.member_id = recovery_requests.user_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS device_keys_select_recovery ON public.device_keys;
CREATE POLICY device_keys_select_recovery ON public.device_keys
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recovery_requests AS r
      JOIN public.recovery_contacts AS c
        ON c.family_space_id = r.family_space_id
       AND c.member_id = r.user_id
       AND c.user_id = auth.uid()
       AND c.status = 'accepted'
      WHERE r.user_id = device_keys.user_id
        AND r.new_device_id = device_keys.device_id
        AND r.cancelled_at IS NULL
        AND r.completed_at IS NULL
    )
  );
