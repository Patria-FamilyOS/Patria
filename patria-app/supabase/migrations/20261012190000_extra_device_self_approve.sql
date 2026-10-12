-- Extra device (KEYS.md 4c): same-user wrap only, reject forever,
-- owner-only removal of that device's wraps and public key.

ALTER TABLE public.device_keys
  ADD COLUMN rejected_at timestamptz;

COMMENT ON COLUMN public.device_keys.rejected_at IS
  'Set when the member taps This was not me. That device can never receive a wrap.';

ALTER TABLE public.device_approval_notices
  ADD COLUMN kind text NOT NULL DEFAULT 'first_device'
  CHECK (kind IN ('first_device', 'extra_device', 'rejected_device'));

COMMENT ON COLUMN public.device_approval_notices.kind IS
  'first_device: admin Let in. extra_device: owner Yes only. rejected_device: information for admins.';

CREATE OR REPLACE FUNCTION public.stamp_device_approval_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_wrap boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind = 'rejected_device' THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.family_key_wraps AS w
      WHERE w.family_space_id = NEW.family_space_id
        AND w.user_id = NEW.user_id
    ) INTO has_wrap;
    IF has_wrap THEN
      NEW.kind := 'extra_device';
    ELSE
      NEW.kind := 'first_device';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER device_approval_notices_stamp
  BEFORE INSERT ON public.device_approval_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_device_approval_notice();

CREATE OR REPLACE FUNCTION public.can_insert_family_key_wrap(
  p_space_id uuid,
  p_user_id uuid,
  p_device_id uuid,
  p_key_epoch integer,
  p_approved_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  has_any_wrap boolean;
  has_this_device boolean;
BEGIN
  IF me IS NULL OR p_approved_by IS DISTINCT FROM me THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.device_keys AS d
    WHERE d.user_id = p_user_id AND d.device_id = p_device_id AND d.rejected_at IS NULL
  ) THEN
    RETURN false;
  END IF;
  IF NOT public.is_key_eligible_member(p_space_id, p_user_id) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.family_key_wraps AS w
    WHERE w.family_space_id = p_space_id AND w.user_id = p_user_id
  ) INTO has_any_wrap;

  SELECT EXISTS (
    SELECT 1 FROM public.family_key_wraps AS w
    WHERE w.family_space_id = p_space_id
      AND w.user_id = p_user_id
      AND w.device_id = p_device_id
  ) INTO has_this_device;

  IF p_user_id = me THEN
    IF NOT has_any_wrap THEN
      RETURN public.is_space_admin(p_space_id)
        OR public.recovery_request_is_usable(p_space_id, me);
    END IF;
    RETURN true;
  END IF;

  IF NOT public.is_space_admin(p_space_id) THEN
    RETURN false;
  END IF;
  RETURN (NOT has_any_wrap) OR has_this_device;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_insert_recovery_key_wrap(
  p_space_id uuid,
  p_user_id uuid,
  p_device_id uuid,
  p_recovery_key_epoch integer,
  p_approved_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  has_any_wrap boolean;
  has_this_device boolean;
BEGIN
  IF me IS NULL OR p_approved_by IS DISTINCT FROM me THEN
    RETURN false;
  END IF;
  IF NOT public.is_key_admin_member(p_space_id, p_user_id) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.device_keys AS d
    WHERE d.user_id = p_user_id AND d.device_id = p_device_id AND d.rejected_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.recovery_key_wraps AS w
    WHERE w.family_space_id = p_space_id AND w.user_id = p_user_id
  ) INTO has_any_wrap;

  SELECT EXISTS (
    SELECT 1 FROM public.recovery_key_wraps AS w
    WHERE w.family_space_id = p_space_id
      AND w.user_id = p_user_id
      AND w.device_id = p_device_id
  ) INTO has_this_device;

  IF p_user_id = me THEN
    IF NOT has_any_wrap THEN
      RETURN public.is_space_admin(p_space_id)
        OR public.recovery_request_is_usable(p_space_id, me);
    END IF;
    RETURN public.is_space_admin(p_space_id);
  END IF;

  IF NOT public.is_space_admin(p_space_id) THEN
    RETURN false;
  END IF;
  RETURN (NOT has_any_wrap) OR has_this_device;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_own_pending_device(
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
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.device_keys AS d
    WHERE d.user_id = me AND d.device_id = p_device_id AND d.rejected_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.family_key_wraps AS w
    WHERE w.family_space_id = p_space_id
      AND w.user_id = me
      AND w.device_id = p_device_id
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_key_eligible_member(p_space_id, me) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.device_keys
  SET rejected_at = now()
  WHERE user_id = me AND device_id = p_device_id AND rejected_at IS NULL;

  UPDATE public.device_approval_notices
  SET kind = 'rejected_device'
  WHERE family_space_id = p_space_id
    AND user_id = me
    AND device_id = p_device_id;
END;
$$;

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

  DELETE FROM public.family_key_wraps
  WHERE family_space_id = p_space_id
    AND user_id = me
    AND device_id = p_device_id;
  DELETE FROM public.recovery_key_wraps
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
    SELECT 1 FROM public.recovery_key_wraps
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

REVOKE ALL ON FUNCTION public.stamp_device_approval_notice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_own_pending_device(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_own_device(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reject_own_pending_device(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_own_device(uuid, uuid) TO authenticated;
