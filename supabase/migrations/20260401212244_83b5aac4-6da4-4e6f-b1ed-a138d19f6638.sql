
CREATE TABLE public.observacoes_processo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  texto TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  usuario_nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.observacoes_processo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view observations"
ON public.observacoes_processo FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert observations"
ON public.observacoes_processo FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete observations"
ON public.observacoes_processo FOR DELETE TO authenticated
USING (true);

CREATE INDEX idx_observacoes_processo_entity ON public.observacoes_processo (entity_type, entity_id);
