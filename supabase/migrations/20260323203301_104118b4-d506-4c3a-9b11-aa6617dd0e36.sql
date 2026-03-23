
-- Table for consignante payment contracts
CREATE TABLE public.contratos_consignante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  nome_consignante text,
  telefone_consignante text,
  cpf_cnpj text,
  dados_bancarios text,
  titular_conta text,
  valor_fechamento numeric,
  valor_repasse numeric,
  observacoes_contrato text,
  observacoes_internas text,
  data_contrato date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos_consignante ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contratos_consignante"
  ON public.contratos_consignante FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Insert contratos_consignante"
  ON public.contratos_consignante FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM atendimentos a
      WHERE a.id = contratos_consignante.atendimento_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

CREATE POLICY "Update contratos_consignante"
  ON public.contratos_consignante FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM atendimentos a
      WHERE a.id = contratos_consignante.atendimento_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

-- Table for operational costs linked to consignante contracts
CREATE TABLE public.custos_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_consignante_id uuid NOT NULL REFERENCES public.contratos_consignante(id) ON DELETE CASCADE,
  tipo text NOT NULL, -- Processo, Agregado, Devolução
  responsavel text NOT NULL, -- Cliente, Loja
  descricao text,
  valor numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custos_operacionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view custos_operacionais"
  ON public.custos_operacionais FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Insert custos_operacionais"
  ON public.custos_operacionais FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contratos_consignante cc
      JOIN atendimentos a ON a.id = cc.atendimento_id
      WHERE cc.id = custos_operacionais.contrato_consignante_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

CREATE POLICY "Update custos_operacionais"
  ON public.custos_operacionais FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contratos_consignante cc
      JOIN atendimentos a ON a.id = cc.atendimento_id
      WHERE cc.id = custos_operacionais.contrato_consignante_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

CREATE POLICY "Delete custos_operacionais"
  ON public.custos_operacionais FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contratos_consignante cc
      JOIN atendimentos a ON a.id = cc.atendimento_id
      WHERE cc.id = custos_operacionais.contrato_consignante_id
        AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );
