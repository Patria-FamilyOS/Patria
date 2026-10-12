-- Recovery contact setup (KEYS.md 4d ceremony, not the 48-hour recover flow).
-- Contacts are adult members with a wrap. Admins write ciphertext; contacts
-- read only their own holder-secret wraps. Nothing about the printed code.

CREATE TYPE public.recovery_contact_status AS ENUM ('pending', 'accepted', 'declined');

ALTER TABLE public.recovery_contacts
  ADD COLUMN status public.recovery_contact_status NOT NULL DEFAULT 'pending';

COMMENT ON COLUMN public.recovery_contacts.status IS
  'pending until the member Accepts or Declines. Secrets are written only after accepted.';

CREATE OR REPLACE FUNCTION public.is_recovery_contact_eligible(_space_id uuid, _user_id uuid)
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
      AND m.role IN ('family_admin', 'co_admin', 'elder')
  )
  AND EXISTS (
    SELECT 1
    FROM public.family_key_wraps AS w
    JOIN public.device_keys AS d
      ON d.user_id = w.user_id AND d.device_id = w.device_id
    WHERE w.family_space_id = _space_id
      AND w.user_id = _user_id
      AND d.rejected_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.approved_devices_for_member(
  p_space_id uuid,
  p_user_id uuid
)
RETURNS TABLE (device_id uuid, public_key bytea)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_user_id
     AND NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.device_id, d.public_key
  FROM public.device_keys AS d
  JOIN public.family_key_wraps AS w
    ON w.user_id = d.user_id AND w.device_id = d.device_id
  WHERE w.family_space_id = p_space_id
    AND d.user_id = p_user_id
    AND d.rejected_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_recovery_ciphertext(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.recovery_contact_secrets WHERE family_space_id = p_space_id;
  DELETE FROM public.recovery_pair_wraps WHERE family_space_id = p_space_id;
  DELETE FROM public.recovery_key_wraps WHERE family_space_id = p_space_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_recovery_key_wrap_setup(
  p_space_id uuid,
  p_user_id uuid,
  p_device_id uuid,
  p_wrapped_key bytea,
  p_recovery_key_epoch integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_key_admin_member(p_space_id, p_user_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.family_key_wraps AS w
    JOIN public.device_keys AS d
      ON d.user_id = w.user_id AND d.device_id = w.device_id
    WHERE w.family_space_id = p_space_id
      AND w.user_id = p_user_id
      AND w.device_id = p_device_id
      AND d.rejected_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.recovery_key_wraps (
    family_space_id, user_id, device_id, wrapped_key, recovery_key_epoch, approved_by
  ) VALUES (
    p_space_id, p_user_id, p_device_id, p_wrapped_key, p_recovery_key_epoch, auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_family_key_under_recovery(
  p_space_id uuid,
  p_key_epoch integer,
  p_wrapped_family_key bytea
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.family_key_under_recovery (
    family_space_id, key_epoch, wrapped_family_key
  ) VALUES (
    p_space_id, p_key_epoch, p_wrapped_family_key
  )
  ON CONFLICT (family_space_id, key_epoch)
  DO UPDATE SET wrapped_family_key = EXCLUDED.wrapped_family_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_recovery_key_epoch(p_space_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_epoch integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.family_key_meta
  SET recovery_key_epoch = recovery_key_epoch + 1, updated_at = now()
  WHERE family_space_id = p_space_id
  RETURNING recovery_key_epoch INTO next_epoch;
  IF next_epoch IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN next_epoch;
END;
$$;

DROP POLICY IF EXISTS recovery_contacts_insert ON public.recovery_contacts;
CREATE POLICY recovery_contacts_insert ON public.recovery_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_space_admin(family_space_id)
    AND created_by = auth.uid()
    AND public.is_recovery_contact_eligible(family_space_id, user_id)
  );

CREATE POLICY recovery_contacts_update ON public.recovery_contacts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('accepted', 'declined')
  );

DROP POLICY IF EXISTS recovery_contact_secrets_insert ON public.recovery_contact_secrets;
CREATE POLICY recovery_contact_secrets_insert ON public.recovery_contact_secrets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_space_admin(family_space_id)
    AND EXISTS (
      SELECT 1 FROM public.recovery_contacts AS c
      WHERE c.family_space_id = recovery_contact_secrets.family_space_id
        AND c.user_id = recovery_contact_secrets.user_id
        AND c.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS recovery_pair_wraps_select ON public.recovery_pair_wraps;
CREATE POLICY recovery_pair_wraps_select ON public.recovery_pair_wraps
  FOR SELECT TO authenticated
  USING (
    public.is_space_admin(family_space_id)
    OR public.recovery_request_is_usable(family_space_id, auth.uid())
  );

DROP POLICY IF EXISTS family_key_under_recovery_insert ON public.family_key_under_recovery;
CREATE POLICY family_key_under_recovery_insert ON public.family_key_under_recovery
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id));

CREATE POLICY family_key_under_recovery_update ON public.family_key_under_recovery
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(family_space_id))
  WITH CHECK (public.is_space_admin(family_space_id));

GRANT UPDATE ON TABLE public.recovery_contacts TO authenticated;
GRANT UPDATE ON TABLE public.family_key_under_recovery TO authenticated;

REVOKE ALL ON FUNCTION public.is_recovery_contact_eligible(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approved_devices_for_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_recovery_ciphertext(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insert_recovery_key_wrap_setup(uuid, uuid, uuid, bytea, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_family_key_under_recovery(uuid, integer, bytea) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bump_recovery_key_epoch(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_recovery_contact_eligible(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approved_devices_for_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_recovery_ciphertext(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_recovery_key_wrap_setup(uuid, uuid, uuid, bytea, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_family_key_under_recovery(uuid, integer, bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_recovery_key_epoch(uuid) TO authenticated;
