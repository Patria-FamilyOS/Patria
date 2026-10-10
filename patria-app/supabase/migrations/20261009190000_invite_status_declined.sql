-- Invitee decline is a distinct status from admin revoke.
-- Must be its own migration: a new enum value cannot be used in the same transaction.
ALTER TYPE public.invite_status ADD VALUE 'declined';
