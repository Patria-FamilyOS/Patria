-- Extend invite preview with who invited, and invalidate tokens on decline.
-- Expired pending invites are already rejected by accept_invite (expires_at).

DROP FUNCTION IF EXISTS public.get_invite_preview(text);

CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token text)
RETURNS TABLE (
  family_space_name text,
  role public.space_role,
  default_circle_name text,
  expires_at timestamptz,
  visibility_summary text,
  inviter_display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.name,
    i.role,
    c.name,
    i.expires_at,
    public.visibility_summary_for_role(i.role),
    COALESCE(p.display_name, '')
  FROM public.invites AS i
  JOIN public.family_spaces AS fs ON fs.id = i.family_space_id
  JOIN public.circles AS c ON c.id = i.default_circle_id
  JOIN public.profiles AS p ON p.id = i.invited_by
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_invite_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_preview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_preview(text) TO anon;

CREATE OR REPLACE FUNCTION public.decline_invite(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE public.invites
  SET status = 'declined'
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RAISE EXCEPTION 'Invite is no longer valid' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  invite public.invites%ROWTYPE;
  member_email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invite
  FROM public.invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF invite.status = 'accepted' THEN
    RAISE EXCEPTION 'Invite already accepted' USING ERRCODE = 'unique_violation';
  END IF;
  IF invite.status IN ('revoked', 'declined') THEN
    RAISE EXCEPTION 'Invite is no longer valid' USING ERRCODE = 'check_violation';
  END IF;
  IF invite.status <> 'pending' OR invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Invite has expired' USING ERRCODE = 'check_violation';
  END IF;

  SELECT email INTO member_email FROM public.profiles WHERE id = uid;
  IF member_email IS NULL OR lower(member_email) <> lower(invite.email) THEN
    RAISE EXCEPTION 'Invite email does not match this account' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.space_members (family_space_id, user_id, role)
  VALUES (invite.family_space_id, uid, invite.role);

  IF EXISTS (
    SELECT 1 FROM public.circles
    WHERE id = invite.default_circle_id
      AND family_space_id = invite.family_space_id
      AND kind <> 'only_me'
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.circle_members
      WHERE circle_id = invite.default_circle_id AND user_id = uid
    )
  THEN
    INSERT INTO public.circle_members (circle_id, user_id)
    VALUES (invite.default_circle_id, uid);
  END IF;

  PERFORM public.ensure_only_me_circle(invite.family_space_id, uid);

  UPDATE public.invites
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = uid
  WHERE id = invite.id;

  RETURN invite.family_space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.decline_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
