DROP POLICY "Insert notifications via authenticated" ON public.notifications;
CREATE POLICY "Insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);