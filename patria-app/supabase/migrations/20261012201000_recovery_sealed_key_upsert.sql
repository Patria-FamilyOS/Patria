-- Keep family_key_under_recovery hidden until recovery is usable.
-- Admins write the sealed box through a definer function.

DROP POLICY IF EXISTS family_key_under_recovery_select ON public.family_key_under_recovery;
CREATE POLICY family_key_under_recovery_select ON public.family_key_under_recovery
  FOR SELECT TO authenticated
  USING (public.recovery_request_is_usable(family_space_id, auth.uid()));

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

REVOKE ALL ON FUNCTION public.upsert_family_key_under_recovery(uuid, integer, bytea) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_family_key_under_recovery(uuid, integer, bytea) TO authenticated;
