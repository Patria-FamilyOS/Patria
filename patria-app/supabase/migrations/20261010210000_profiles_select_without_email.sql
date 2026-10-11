-- Foreign keys onto profiles need REFERENCES. Email stays unreadable (D17).
-- Invite RLS compares emails through a definer helper, not a client subquery.

REVOKE SELECT ON TABLE public.profiles FROM authenticated;
GRANT SELECT (id, display_name, created_at, updated_at) ON TABLE public.profiles TO authenticated;
GRANT REFERENCES (id) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name, email, updated_at) ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_email_is_mine(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND lower(p_email) = lower((
      SELECT p.email FROM public.profiles AS p WHERE p.id = auth.uid()
    ));
$$;

REVOKE ALL ON FUNCTION public.invite_email_is_mine(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_email_is_mine(text) TO authenticated;

DROP POLICY IF EXISTS invites_select ON public.invites;
CREATE POLICY invites_select ON public.invites
  FOR SELECT TO authenticated
  USING (
    public.is_space_admin(family_space_id, auth.uid())
    OR (
      status = 'pending'
      AND expires_at > now()
      AND public.invite_email_is_mine(email)
    )
  );
