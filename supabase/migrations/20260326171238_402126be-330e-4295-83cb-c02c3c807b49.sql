-- Fix overly permissive INSERT policy - only the notify_role function inserts via SECURITY DEFINER
DROP POLICY "Insert notifications" ON public.notifications;

-- No direct INSERT allowed - all inserts go through notify_role() SECURITY DEFINER function
-- The function bypasses RLS, so no INSERT policy is needed