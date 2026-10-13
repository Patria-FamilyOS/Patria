-- Lost-every-device recovery (KEYS.md 4d). Wait is stamped on the server.
-- Complete does not revoke old devices. Paper is never stored.

ALTER TABLE public.recovery_requests
  ADD COLUMN expires_at timestamptz;

UPDATE public.recovery_requests
SET expires_at = not_before + interval '7 days'
WHERE expires_at IS NULL;

ALTER TABLE public.recovery_requests
  ALTER COLUMN expires_at SET NOT NULL;

COMMENT ON COLUMN public.recovery_requests.expires_at IS
  'not_before plus 7 days. Stamped by the server. Expired requests cannot be approved or completed.';

CREATE TABLE public.recovery_request_helpers (
  request_id uuid NOT NULL REFERENCES public.recovery_requests (id) ON DELETE CASCADE,
  slot public.recovery_contact_slot NOT NULL,
  wrapped_secret bytea NOT NULL CHECK (octet_length(wrapped_secret) >= 64),
  approved_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, slot)
);

COMMENT ON TABLE public.recovery_request_helpers IS
  'Holder-secret ciphertext rewrapped to the new device. Never the printed code.';

CREATE TABLE public.device_removed_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.device_removed_notices IS
  'Information for admins when a member removes a phone. No keys.';

CREATE OR REPLACE FUNCTION public.stamp_recovery_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_key_eligible_member(NEW.family_space_id, NEW.user_id) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    NEW.started_at := now();
    NEW.not_before := now() + public.recovery_wait_interval();
    NEW.expires_at := NEW.not_before + interval '7 days';
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;

  -- Superuser tests may backdate not_before / expires_at. JWT claims can linger after RESET ROLE.
  IF current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.not_before IS DISTINCT FROM OLD.not_before
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.family_space_id IS DISTINCT FROM OLD.family_space_id
     OR NEW.new_device_id IS DISTINCT FROM OLD.new_device_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recovery_request_is_usable(_space_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recovery_requests AS r
    WHERE r.family_space_id = _space_id
      AND r.user_id = _user_id
      AND r.user_id = auth.uid()
      AND r.cancelled_at IS NULL
      AND r.completed_at IS NULL
      AND now() >= r.not_before
      AND now() < r.expires_at
  );
$$;

CREATE OR REPLACE FUNCTION public.start_recovery_request(
  p_space_id uuid,
  p_device_id uuid,
  p_public_key bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  request_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_key_eligible_member(p_space_id, me) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.device_keys (user_id, device_id, public_key)
  VALUES (me, p_device_id, p_public_key)
  ON CONFLICT (user_id, device_id) DO NOTHING;

  UPDATE public.recovery_requests
  SET cancelled_at = now(), cancelled_by = me
  WHERE family_space_id = p_space_id
    AND user_id = me
    AND completed_at IS NULL
    AND cancelled_at IS NULL;

  INSERT INTO public.recovery_requests (
    family_space_id, user_id, new_device_id
  ) VALUES (
    p_space_id, me, p_device_id
  )
  RETURNING id INTO request_id;

  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_recovery_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
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
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF req.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_space_admin(req.family_space_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF req.completed_at IS NOT NULL OR req.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.recovery_requests
  SET cancelled_at = now(), cancelled_by = auth.uid()
  WHERE id = p_request_id AND cancelled_at IS NULL;
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
      AND c.user_id = me
      AND c.slot = p_slot
      AND c.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.recovery_request_helpers (
    request_id, slot, wrapped_secret, approved_by
  ) VALUES (
    p_request_id, p_slot, p_wrapped_secret, me
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_recovery_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.recovery_requests;
  helper_count integer;
  wrap_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req FROM public.recovery_requests WHERE id = p_request_id;
  IF req.id IS NULL OR req.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF req.cancelled_at IS NOT NULL OR req.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF now() < req.not_before OR now() >= req.expires_at THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO helper_count
  FROM public.recovery_request_helpers
  WHERE request_id = p_request_id;
  IF helper_count < 1 THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO wrap_count
  FROM public.family_key_wraps
  WHERE family_space_id = req.family_space_id
    AND user_id = req.user_id
    AND device_id = req.new_device_id;
  IF wrap_count < 1 THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.recovery_requests
  SET completed_at = now()
  WHERE id = p_request_id;
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

  INSERT INTO public.device_removed_notices (family_space_id, user_id, device_id)
  VALUES (p_space_id, me, p_device_id);

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

ALTER TABLE public.recovery_request_helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_request_helpers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_removed_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_removed_notices FORCE ROW LEVEL SECURITY;

CREATE POLICY recovery_request_helpers_select ON public.recovery_request_helpers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recovery_requests AS r
      WHERE r.id = recovery_request_helpers.request_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY device_keys_select_recovery ON public.device_keys
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recovery_requests AS r
      JOIN public.recovery_contacts AS c
        ON c.family_space_id = r.family_space_id
       AND c.user_id = auth.uid()
       AND c.status = 'accepted'
      WHERE r.user_id = device_keys.user_id
        AND r.new_device_id = device_keys.device_id
        AND r.cancelled_at IS NULL
        AND r.completed_at IS NULL
    )
  );

CREATE POLICY device_removed_notices_select ON public.device_removed_notices
  FOR SELECT TO authenticated
  USING (public.is_space_admin(family_space_id));

REVOKE ALL ON TABLE public.recovery_request_helpers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.device_removed_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.recovery_request_helpers TO authenticated;
GRANT SELECT ON TABLE public.device_removed_notices TO authenticated;

REVOKE ALL ON FUNCTION public.start_recovery_request(uuid, uuid, bytea) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_recovery_helper(uuid, public.recovery_contact_slot, bytea) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_recovery_request(uuid, uuid, bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_recovery_helper(uuid, public.recovery_contact_slot, bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_recovery_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_recovery_request(uuid) TO authenticated;
