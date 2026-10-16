-- Least access: an Elder wrapping holder secrets, or helping with recovery,
-- needs only a contact's or new-phone X25519 public key. Not wraps.

CREATE OR REPLACE FUNCTION public.recovery_contact_public_keys(
  p_space_id uuid,
  p_contact_user_id uuid
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.recovery_contacts AS c
    WHERE c.family_space_id = p_space_id
      AND c.member_id = auth.uid()
      AND c.user_id = p_contact_user_id
      AND c.status = 'accepted'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.device_id, d.public_key
  FROM public.device_keys AS d
  JOIN public.family_key_wraps AS w
    ON w.user_id = d.user_id AND w.device_id = d.device_id
  WHERE w.family_space_id = p_space_id
    AND d.user_id = p_contact_user_id
    AND d.rejected_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recovery_request_device_public_key(p_request_id uuid)
RETURNS TABLE (device_id uuid, public_key bytea)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.recovery_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req FROM public.recovery_requests WHERE id = p_request_id;
  IF req.id IS NULL
     OR req.cancelled_at IS NOT NULL
     OR req.completed_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.recovery_contacts AS c
    WHERE c.family_space_id = req.family_space_id
      AND c.member_id = req.user_id
      AND c.user_id = auth.uid()
      AND c.status = 'accepted'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.device_id, d.public_key
  FROM public.device_keys AS d
  WHERE d.user_id = req.user_id
    AND d.device_id = req.new_device_id
    AND d.rejected_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.recovery_contact_public_keys(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recovery_request_device_public_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recovery_contact_public_keys(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recovery_request_device_public_key(uuid) TO authenticated;
