-- Atomic founding-key write: meta, device public key, self-wraps, and
-- family-key-under-recovery. Nothing is stored if any insert fails.

ALTER TABLE public.family_key_meta
  ADD CONSTRAINT family_key_meta_space_epoch_key UNIQUE (family_space_id, key_epoch);

CREATE OR REPLACE FUNCTION public.commit_family_key_ceremony(
  p_space_id uuid,
  p_device_id uuid,
  p_public_key bytea,
  p_wrapped_family_key bytea,
  p_wrapped_recovery_key bytea,
  p_family_key_under_recovery bytea,
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
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_space_admin(p_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_key_epoch IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF octet_length(p_public_key) <> 32
     OR octet_length(p_wrapped_family_key) < 64
     OR octet_length(p_wrapped_recovery_key) < 64
     OR octet_length(p_family_key_under_recovery) < 64 THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.family_key_meta (family_space_id, key_epoch, recovery_key_epoch)
  VALUES (p_space_id, p_key_epoch, 1);

  INSERT INTO public.device_keys (user_id, device_id, public_key)
  VALUES (me, p_device_id, p_public_key)
  ON CONFLICT (user_id, device_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.device_keys
    WHERE user_id = me AND device_id = p_device_id
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.family_key_wraps (
    family_space_id, user_id, device_id, wrapped_key, key_epoch, approved_by
  ) VALUES (
    p_space_id, me, p_device_id, p_wrapped_family_key, p_key_epoch, me
  );

  INSERT INTO public.recovery_key_wraps (
    family_space_id, user_id, device_id, wrapped_key, recovery_key_epoch, approved_by
  ) VALUES (
    p_space_id, me, p_device_id, p_wrapped_recovery_key, 1, me
  );

  INSERT INTO public.family_key_under_recovery (
    family_space_id, key_epoch, wrapped_family_key
  ) VALUES (
    p_space_id, p_key_epoch, p_family_key_under_recovery
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_family_key_ceremony(
  uuid, uuid, bytea, bytea, bytea, bytea, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_family_key_ceremony(
  uuid, uuid, bytea, bytea, bytea, bytea, integer
) TO authenticated;
