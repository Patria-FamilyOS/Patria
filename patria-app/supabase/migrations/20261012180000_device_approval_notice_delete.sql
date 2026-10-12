-- Admins close a first-device notice on Let in or Decline.
-- Members may close their own notice. No wrap is created by a delete.

CREATE POLICY device_approval_notices_delete ON public.device_approval_notices
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_space_admin(family_space_id)
  );

GRANT DELETE ON TABLE public.device_approval_notices TO authenticated;
