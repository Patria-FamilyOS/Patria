-- Slice 1 schema for CIR05, CIR01 and CIR02.
-- Family encryption keys and recovery contacts are intentionally absent.
-- TODO(CIR05): add family key metadata here later. The server must never
-- receive an unencrypted family key or plaintext vault content.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TYPE public.space_role AS ENUM (
  'family_admin',
  'co_admin',
  'teen',
  'elder',
  'extended_relative',
  'caregiver',
  'successor'
);

CREATE TYPE public.circle_kind AS ENUM (
  'household',
  'extended_family',
  'close_friends',
  'only_me',
  'custom'
);

CREATE TYPE public.invite_status AS ENUM (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

CREATE TYPE public.item_type AS ENUM (
  'photo',
  'story',
  'note',
  'task',
  'document'
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.family_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.family_spaces IS
  'TODO(CIR05): family encryption key metadata and recovery contacts. Never store unencrypted family keys.';

CREATE TABLE public.space_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role public.space_role NOT NULL,
  relationship_label text,
  caregiver_access_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, user_id),
  CONSTRAINT caregiver_end_date_matches_role CHECK (
    (role = 'caregiver' AND caregiver_access_ends_at IS NOT NULL)
    OR (role <> 'caregiver' AND caregiver_access_ends_at IS NULL)
  )
);

CREATE INDEX space_members_user_id_idx ON public.space_members (user_id);
CREATE INDEX space_members_space_idx ON public.space_members (family_space_id);

CREATE TABLE public.child_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) > 0),
  date_of_birth date,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX child_profiles_space_idx ON public.child_profiles (family_space_id);

CREATE TABLE public.circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  kind public.circle_kind NOT NULL,
  owner_user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT only_me_has_owner CHECK (
    (kind = 'only_me' AND owner_user_id IS NOT NULL)
    OR (kind <> 'only_me' AND owner_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX circles_one_system_kind_per_space
  ON public.circles (family_space_id, kind)
  WHERE kind IN ('household', 'extended_family', 'close_friends');

CREATE UNIQUE INDEX circles_one_only_me_per_member
  ON public.circles (family_space_id, owner_user_id)
  WHERE kind = 'only_me';

CREATE TABLE public.circle_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.circles (id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  child_profile_id uuid REFERENCES public.child_profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circle_member_is_user_or_child CHECK (
    (user_id IS NOT NULL AND child_profile_id IS NULL)
    OR (user_id IS NULL AND child_profile_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX circle_members_user_unique
  ON public.circle_members (circle_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX circle_members_child_unique
  ON public.circle_members (circle_id, child_profile_id)
  WHERE child_profile_id IS NOT NULL;

CREATE TABLE public.circle_item_type_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  item_type public.item_type NOT NULL,
  circle_id uuid NOT NULL REFERENCES public.circles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_space_id, item_type)
);

CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_space_id uuid NOT NULL REFERENCES public.family_spaces (id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles (id),
  email text NOT NULL CHECK (char_length(btrim(email)) > 0),
  -- TODO(CIR03): SMS / phone invites. Do not send SMS in slice 1.
  phone text,
  role public.space_role NOT NULL,
  default_circle_id uuid NOT NULL REFERENCES public.circles (id),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  status public.invite_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invites_space_idx ON public.invites (family_space_id);
CREATE INDEX invites_email_idx ON public.invites (lower(email));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER family_spaces_set_updated_at
  BEFORE UPDATE ON public.family_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER space_members_set_updated_at
  BEFORE UPDATE ON public.space_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER child_profiles_set_updated_at
  BEFORE UPDATE ON public.child_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER circles_set_updated_at
  BEFORE UPDATE ON public.circles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER circle_item_type_defaults_set_updated_at
  BEFORE UPDATE ON public.circle_item_type_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER invites_set_updated_at
  BEFORE UPDATE ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1), ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.enforce_caregiver_access_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'caregiver' THEN
    IF NEW.caregiver_access_ends_at IS NULL THEN
      NEW.caregiver_access_ends_at := now() + interval '24 hours';
    END IF;
    IF NEW.caregiver_access_ends_at > now() + interval '30 days' THEN
      RAISE EXCEPTION 'Caregiver access cannot exceed 30 days'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.caregiver_access_ends_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER space_members_caregiver_window
  BEFORE INSERT OR UPDATE OF role, caregiver_access_ends_at ON public.space_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_caregiver_access_window();

CREATE OR REPLACE FUNCTION public.enforce_at_least_one_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  remaining integer;
  space uuid;
  old_is_admin boolean;
  new_is_admin boolean;
BEGIN
  space := COALESCE(OLD.family_space_id, NEW.family_space_id);

  IF NOT EXISTS (SELECT 1 FROM public.family_spaces WHERE id = space) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  old_is_admin := OLD.role IN ('family_admin', 'co_admin');

  IF TG_OP = 'DELETE' THEN
    IF old_is_admin THEN
      SELECT count(*) INTO remaining
      FROM public.space_members
      WHERE family_space_id = space
        AND id <> OLD.id
        AND role IN ('family_admin', 'co_admin');
      IF remaining = 0 THEN
        RAISE EXCEPTION 'A family space must keep at least one Family admin or Co admin'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  new_is_admin := NEW.role IN ('family_admin', 'co_admin');
  IF old_is_admin AND NOT new_is_admin THEN
    SELECT count(*) INTO remaining
    FROM public.space_members
    WHERE family_space_id = space
      AND id <> NEW.id
      AND role IN ('family_admin', 'co_admin');
    IF remaining = 0 THEN
      RAISE EXCEPTION 'A family space must keep at least one Family admin or Co admin'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER space_members_at_least_one_admin
  BEFORE UPDATE OF role OR DELETE ON public.space_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_at_least_one_admin();

CREATE OR REPLACE FUNCTION public.protect_system_circles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.kind <> 'custom' THEN
    IF TG_OP = 'DELETE' THEN
      IF NOT EXISTS (SELECT 1 FROM public.family_spaces WHERE id = OLD.family_space_id) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'System circles cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.family_space_id IS DISTINCT FROM OLD.family_space_id
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
      RAISE EXCEPTION 'System circles cannot be retyped or moved'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER circles_protect_system
  BEFORE UPDATE OR DELETE ON public.circles
  FOR EACH ROW EXECUTE FUNCTION public.protect_system_circles();
