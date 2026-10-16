-- D26: Elders need to know who they may pick as a recovery contact, without
-- listing other members' wraps or device keys. Restore approved_devices_for_member
-- to self-or-admin. Eligible contacts are adult key holders with a let-in device.

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

CREATE OR REPLACE FUNCTION public.eligible_recovery_contacts(p_space_id uuid)
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_key_eligible_member(p_space_id, auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.user_id, COALESCE(p.display_name, '')
  FROM public.space_members AS m
  JOIN public.profiles AS p ON p.id = m.user_id
  WHERE m.family_space_id = p_space_id
    AND m.user_id IS DISTINCT FROM auth.uid()
    AND public.is_recovery_contact_eligible(p_space_id, m.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.eligible_recovery_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eligible_recovery_contacts(uuid) TO authenticated;
