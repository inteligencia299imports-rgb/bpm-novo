CREATE POLICY "Insert notifications via authenticated"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);