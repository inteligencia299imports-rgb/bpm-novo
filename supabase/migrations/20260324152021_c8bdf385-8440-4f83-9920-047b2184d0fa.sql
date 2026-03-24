
-- Create consignacao_processos table
CREATE TABLE public.consignacao_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id uuid NOT NULL REFERENCES public.avaliacoes(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  data_conclusao timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(avaliacao_id, etapa)
);

ALTER TABLE public.consignacao_processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view consignacao_processos"
  ON public.consignacao_processos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Insert consignacao_processos"
  ON public.consignacao_processos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = consignacao_processos.avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador'))
  ));

CREATE POLICY "Update consignacao_processos"
  ON public.consignacao_processos FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = consignacao_processos.avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador'))
  ));

ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS consignacao_observacoes text;
