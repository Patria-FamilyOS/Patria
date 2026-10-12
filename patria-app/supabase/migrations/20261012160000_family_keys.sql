-- CIR05 family keys: ciphertext and public keys only. Never plaintext keys
-- or anything derived from the printed recovery code.

CREATE TABLE public.patria_key_settings (
  singleton smallint PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  recovery_wait interval NOT NULL DEFAULT interval '48 hours'
);

COMMENT ON TABLE public.patria_key_settings IS
  'Server-side recovery wait. Default is 48 hours. Authenticated clients cannot change this. Lower recovery_wait only as a database superuser in local/pgTAP tests.';

COMMENT ON COLUMN public.patria_key_settings.recovery_wait IS
  'Must remain 48 hours in production. Superuser-only override for this project''s tests.';

INSERT INTO public.patria_key_settings (singleton, recovery_wait)
VALUES (1, interval '48 hours');

CREATE TABLE public.device_keys (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  public_key bytea NOT NULL CHECK (octet_length(public_key) = 32),
  alg text NOT NULL DEFAULT 'x25519' CHECK (alg = 'x25519'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE public.family_key_meta (
  family_space_id uuid PRIMARY KEY REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  key_epoch integer NOT NULL DEFAULT 1 CHECK (key_epoch >= 1),
  recovery_key_epoch integer NOT NULL DEFAULT 1 CHECK (recovery_key_epoch >= 1),
  alg text NOT NULL DEFAULT 'fk-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.family_key_wraps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  wrapped_key bytea NOT NULL CHECK (octet_length(wrapped_key) >= 64),
  alg text NOT NULL DEFAULT 'fk-wrap-v1',
  key_epoch integer NOT NULL CHECK (key_epoch >= 1),
  approved_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, user_id, device_id, key_epoch),
  FOREIGN KEY (user_id, device_id) REFERENCES public.device_keys (user_id, device_id)
);

CREATE TABLE public.recovery_key_wraps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  wrapped_key bytea NOT NULL CHECK (octet_length(wrapped_key) >= 64),
  alg text NOT NULL DEFAULT 'rk-wrap-v1',
  recovery_key_epoch integer NOT NULL CHECK (recovery_key_epoch >= 1),
  approved_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, user_id, device_id, recovery_key_epoch),
  FOREIGN KEY (user_id, device_id) REFERENCES public.device_keys (user_id, device_id)
);

CREATE TABLE public.family_key_under_recovery (
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  key_epoch integer NOT NULL CHECK (key_epoch >= 1),
  wrapped_family_key bytea NOT NULL CHECK (octet_length(wrapped_family_key) >= 64),
  alg text NOT NULL DEFAULT 'rk-aead-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_space_id, key_epoch)
);

CREATE TABLE public.device_approval_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, user_id, device_id),
  FOREIGN KEY (user_id, device_id) REFERENCES public.device_keys (user_id, device_id)
);

CREATE TYPE public.recovery_contact_slot AS ENUM ('a', 'b');

CREATE TABLE public.recovery_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  slot public.recovery_contact_slot NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, slot),
  UNIQUE (family_space_id, user_id)
);

CREATE TABLE public.recovery_contact_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  wrapped_secret bytea NOT NULL CHECK (octet_length(wrapped_secret) >= 64),
  recovery_key_epoch integer NOT NULL CHECK (recovery_key_epoch >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, user_id, device_id, recovery_key_epoch),
  FOREIGN KEY (user_id, device_id) REFERENCES public.device_keys (user_id, device_id)
);

CREATE TYPE public.recovery_pair_id AS ENUM ('ab', 'ap', 'bp');

CREATE TABLE public.recovery_pair_wraps (
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  recovery_key_epoch integer NOT NULL CHECK (recovery_key_epoch >= 1),
  pair_id public.recovery_pair_id NOT NULL,
  wrapped_recovery_key bytea NOT NULL CHECK (octet_length(wrapped_recovery_key) >= 64),
  alg text NOT NULL DEFAULT 'rk-pair-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_space_id, recovery_key_epoch, pair_id)
);

CREATE TABLE public.recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  new_device_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles (id),
  completed_at timestamptz,
  FOREIGN KEY (user_id, new_device_id) REFERENCES public.device_keys (user_id, device_id)
);

COMMENT ON TABLE public.device_keys IS
  'X25519 public keys only. Private keys never leave the device.';
COMMENT ON TABLE public.family_key_wraps IS
  'AEAD ciphertext of the family key. The server never stores a plaintext family key.';
COMMENT ON TABLE public.recovery_key_wraps IS
  'AEAD ciphertext of the recovery key for admin devices only.';
COMMENT ON TABLE public.family_key_under_recovery IS
  'Family key sealed under recovery_key per epoch. Not a printed-code verifier.';
COMMENT ON TABLE public.recovery_pair_wraps IS
  'Pairwise boxes of recovery_key (ab/ap/bp). Nothing about the printed code is stored.';
COMMENT ON TABLE public.recovery_contact_secrets IS
  'Holder-secret ciphertext for a recovery contact device. Plaintext secrets are not stored.';
COMMENT ON TABLE public.recovery_requests IS
  'Recovery timing and cancel state. not_before is stamped by the server.';

CREATE INDEX family_key_wraps_user_idx ON public.family_key_wraps (user_id, family_space_id);
CREATE INDEX recovery_key_wraps_user_idx ON public.recovery_key_wraps (user_id, family_space_id);
CREATE INDEX recovery_requests_space_user_idx ON public.recovery_requests (family_space_id, user_id);

CREATE OR REPLACE FUNCTION public.recovery_wait_interval()
RETURNS interval
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT recovery_wait FROM public.patria_key_settings WHERE singleton = 1;
$$;

CREATE OR REPLACE FUNCTION public.is_key_eligible_member(_space_id uuid, _user_id uuid)
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
      AND m.role IN ('family_admin', 'co_admin', 'teen', 'elder')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_key_admin_member(_space_id uuid, _user_id uuid)
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
      AND m.role IN ('family_admin', 'co_admin')
  );
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
  );
$$;

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
    WHERE d.user_id = p_user_id AND d.device_id = p_device_id
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
    WHERE d.user_id = p_user_id AND d.device_id = p_device_id
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
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.not_before IS DISTINCT FROM OLD.not_before
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.family_space_id IS DISTINCT FROM OLD.family_space_id
     OR NEW.new_device_id IS DISTINCT FROM OLD.new_device_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recovery_requests_stamp
  BEFORE INSERT OR UPDATE ON public.recovery_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_recovery_request();

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
    DELETE FROM public.recovery_key_wraps
    WHERE family_space_id = OLD.family_space_id AND user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  IF OLD.role IN ('family_admin', 'co_admin', 'teen', 'elder')
     AND NEW.role NOT IN ('family_admin', 'co_admin', 'teen', 'elder') THEN
    DELETE FROM public.family_key_wraps
    WHERE family_space_id = NEW.family_space_id AND user_id = NEW.user_id;
    DELETE FROM public.recovery_key_wraps
    WHERE family_space_id = NEW.family_space_id AND user_id = NEW.user_id;
  ELSIF OLD.role IN ('family_admin', 'co_admin')
     AND NEW.role NOT IN ('family_admin', 'co_admin') THEN
    DELETE FROM public.recovery_key_wraps
    WHERE family_space_id = NEW.family_space_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER space_members_purge_key_material
  AFTER DELETE OR UPDATE OF role ON public.space_members
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_member_key_material();

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
  DELETE FROM public.recovery_key_wraps
  WHERE family_space_id = p_space_id
    AND user_id = p_user_id
    AND device_id = p_device_id;
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
  IF req.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.recovery_requests
  SET cancelled_at = now(), cancelled_by = auth.uid()
  WHERE id = p_request_id AND cancelled_at IS NULL;
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req FROM public.recovery_requests WHERE id = p_request_id;
  IF req.id IS NULL OR req.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF req.cancelled_at IS NOT NULL OR req.completed_at IS NOT NULL OR now() < req.not_before THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.recovery_requests
  SET completed_at = now()
  WHERE id = p_request_id;
END;
$$;

ALTER TABLE public.patria_key_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patria_key_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_meta FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_wraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_wraps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_key_wraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_key_wraps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_under_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_key_under_recovery FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_approval_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_approval_notices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_contact_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_contact_secrets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_pair_wraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_pair_wraps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY device_keys_select ON public.device_keys
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.space_members AS sm
      WHERE sm.user_id = device_keys.user_id
        AND public.is_space_admin(sm.family_space_id)
        AND public.is_key_eligible_member(sm.family_space_id, device_keys.user_id)
    )
  );

CREATE POLICY device_keys_insert ON public.device_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY family_key_meta_select ON public.family_key_meta
  FOR SELECT TO authenticated
  USING (
    public.space_role(family_space_id) IN ('family_admin', 'co_admin', 'teen', 'elder')
  );

CREATE POLICY family_key_meta_insert ON public.family_key_meta
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id));

CREATE POLICY family_key_meta_update ON public.family_key_meta
  FOR UPDATE TO authenticated
  USING (public.is_space_admin(family_space_id))
  WITH CHECK (public.is_space_admin(family_space_id));

CREATE POLICY family_key_wraps_select ON public.family_key_wraps
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_key_eligible_member(family_space_id, auth.uid())
  );

CREATE POLICY family_key_wraps_insert ON public.family_key_wraps
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_insert_family_key_wrap(
      family_space_id, user_id, device_id, key_epoch, approved_by
    )
  );

CREATE POLICY recovery_key_wraps_select ON public.recovery_key_wraps
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_key_admin_member(family_space_id, auth.uid())
  );

CREATE POLICY recovery_key_wraps_insert ON public.recovery_key_wraps
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_insert_recovery_key_wrap(
      family_space_id, user_id, device_id, recovery_key_epoch, approved_by
    )
  );

CREATE POLICY family_key_under_recovery_select ON public.family_key_under_recovery
  FOR SELECT TO authenticated
  USING (public.recovery_request_is_usable(family_space_id, auth.uid()));

CREATE POLICY family_key_under_recovery_insert ON public.family_key_under_recovery
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id));

CREATE POLICY device_approval_notices_select ON public.device_approval_notices
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_space_admin(family_space_id)
      AND public.is_key_eligible_member(family_space_id, user_id)
    )
  );

CREATE POLICY device_approval_notices_insert ON public.device_approval_notices
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_key_eligible_member(family_space_id, auth.uid())
  );

CREATE POLICY recovery_contacts_select ON public.recovery_contacts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_space_admin(family_space_id)
  );

CREATE POLICY recovery_contacts_insert ON public.recovery_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_space_admin(family_space_id)
    AND created_by = auth.uid()
  );

CREATE POLICY recovery_contacts_delete ON public.recovery_contacts
  FOR DELETE TO authenticated
  USING (public.is_space_admin(family_space_id));

CREATE POLICY recovery_contact_secrets_select ON public.recovery_contact_secrets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY recovery_contact_secrets_insert ON public.recovery_contact_secrets
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.recovery_contacts AS c
      WHERE c.family_space_id = recovery_contact_secrets.family_space_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY recovery_pair_wraps_select ON public.recovery_pair_wraps
  FOR SELECT TO authenticated
  USING (public.recovery_request_is_usable(family_space_id, auth.uid()));

CREATE POLICY recovery_pair_wraps_insert ON public.recovery_pair_wraps
  FOR INSERT TO authenticated
  WITH CHECK (public.is_space_admin(family_space_id));

CREATE POLICY recovery_requests_select ON public.recovery_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_space_admin(family_space_id)
    OR EXISTS (
      SELECT 1 FROM public.recovery_contacts AS c
      WHERE c.family_space_id = recovery_requests.family_space_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY recovery_requests_insert ON public.recovery_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_key_eligible_member(family_space_id, auth.uid())
  );

REVOKE ALL ON TABLE public.device_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.family_key_meta FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.family_key_wraps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_key_wraps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.family_key_under_recovery FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.device_approval_notices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_contact_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_pair_wraps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recovery_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.patria_key_settings FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.device_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.family_key_meta TO authenticated;
GRANT SELECT, INSERT ON TABLE public.family_key_wraps TO authenticated;
GRANT SELECT, INSERT ON TABLE public.recovery_key_wraps TO authenticated;
GRANT SELECT, INSERT ON TABLE public.family_key_under_recovery TO authenticated;
GRANT SELECT, INSERT ON TABLE public.device_approval_notices TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.recovery_contacts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.recovery_contact_secrets TO authenticated;
GRANT SELECT, INSERT ON TABLE public.recovery_pair_wraps TO authenticated;
GRANT SELECT, INSERT ON TABLE public.recovery_requests TO authenticated;

REVOKE ALL ON public.patria_key_settings FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.recovery_wait_interval() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_key_eligible_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_key_admin_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recovery_request_is_usable(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_insert_family_key_wrap(uuid, uuid, uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_insert_recovery_key_wrap(uuid, uuid, uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_device_keys(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_recovery_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_recovery_request(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.recovery_wait_interval() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_key_eligible_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_key_admin_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recovery_request_is_usable(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_family_key_wrap(uuid, uuid, uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_recovery_key_wrap(uuid, uuid, uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_device_keys(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_recovery_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_recovery_request(uuid) TO authenticated;
