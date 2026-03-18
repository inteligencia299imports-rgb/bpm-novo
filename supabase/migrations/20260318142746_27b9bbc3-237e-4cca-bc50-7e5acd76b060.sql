
DROP POLICY "Authenticated users can insert status history" ON public.status_history;

CREATE POLICY "Users can insert own status history"
ON public.status_history FOR INSERT TO authenticated
WITH CHECK (changed_by = auth.uid());
