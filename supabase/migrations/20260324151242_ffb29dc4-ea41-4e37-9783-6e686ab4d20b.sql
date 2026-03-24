
-- Create pos_compra_processos table
CREATE TABLE public.pos_compra_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id uuid NOT NULL REFERENCES public.avaliacoes(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  data_conclusao timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(avaliacao_id, etapa)
);

-- Enable RLS
ALTER TABLE public.pos_compra_processos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view pos_compra_processos"
  ON public.pos_compra_processos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Insert pos_compra_processos"
  ON public.pos_compra_processos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = pos_compra_processos.avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador'))
  ));

CREATE POLICY "Update pos_compra_processos"
  ON public.pos_compra_processos FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = pos_compra_processos.avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador'))
  ));

-- Add observacoes field to avaliacoes
ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS pos_compra_observacoes text;
