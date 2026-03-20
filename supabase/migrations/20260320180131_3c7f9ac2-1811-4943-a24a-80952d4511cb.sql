
CREATE TABLE public.custos_oficina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id uuid NOT NULL REFERENCES public.avaliacoes(id) ON DELETE CASCADE,
  responsavel text NOT NULL,
  tipo text NOT NULL,
  valor_previsto numeric DEFAULT NULL,
  valor_executado numeric DEFAULT NULL,
  numero_os text DEFAULT NULL,
  detalhes text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.custos_oficina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view custos_oficina"
  ON public.custos_oficina FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Insert custos_oficina"
  ON public.custos_oficina FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.id = custos_oficina.avaliacao_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador'))
    )
  );

CREATE POLICY "Update custos_oficina"
  ON public.custos_oficina FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.id = custos_oficina.avaliacao_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador'))
    )
  );

CREATE POLICY "Delete custos_oficina"
  ON public.custos_oficina FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.id = custos_oficina.avaliacao_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador'))
    )
  );
