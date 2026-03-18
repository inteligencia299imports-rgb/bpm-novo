
CREATE TABLE public.status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  status_from text NOT NULL,
  status_to text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view status history"
ON public.status_history FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert status history"
ON public.status_history FOR INSERT TO authenticated
WITH CHECK (true);

CREATE INDEX idx_status_history_entity ON public.status_history(entity_type, entity_id);
