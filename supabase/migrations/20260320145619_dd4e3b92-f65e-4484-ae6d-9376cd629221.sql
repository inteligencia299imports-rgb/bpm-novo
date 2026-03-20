
CREATE TABLE public.pos_venda_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  data_conclusao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atendimento_id, etapa)
);

ALTER TABLE public.pos_venda_processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pos_venda_processos"
ON public.pos_venda_processos FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Insert pos_venda_processos"
ON public.pos_venda_processos FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = pos_venda_processos.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
  )
);

CREATE POLICY "Update pos_venda_processos"
ON public.pos_venda_processos FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = pos_venda_processos.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
  )
);

CREATE TRIGGER update_pos_venda_processos_updated_at
  BEFORE UPDATE ON public.pos_venda_processos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
