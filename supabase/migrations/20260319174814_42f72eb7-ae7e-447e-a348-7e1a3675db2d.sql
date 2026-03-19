
CREATE TABLE public.contratos_consignacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  avaliacao_id UUID NOT NULL REFERENCES public.avaliacoes(id) ON DELETE CASCADE,
  cpf_cnpj TEXT,
  email TEXT,
  endereco TEXT,
  cep TEXT,
  valor_quitacao NUMERIC,
  valor_fechamento NUMERIC,
  observacoes_internas TEXT,
  observacoes_contrato TEXT,
  data_contrato DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos_consignacao ENABLE ROW LEVEL SECURITY;

-- Select: authenticated users can view
CREATE POLICY "Authenticated users can view contratos_consignacao"
  ON public.contratos_consignacao
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert: vendedor or gestor
CREATE POLICY "Insert contratos_consignacao"
  ON public.contratos_consignacao
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.id = contratos_consignacao.avaliacao_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

-- Update: vendedor or gestor
CREATE POLICY "Update contratos_consignacao"
  ON public.contratos_consignacao
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.id = contratos_consignacao.avaliacao_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );
