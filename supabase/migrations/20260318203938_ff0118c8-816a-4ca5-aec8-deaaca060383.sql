
-- Table for contract data
CREATE TABLE public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid REFERENCES public.atendimentos(id) ON DELETE CASCADE NOT NULL,
  cpf_cnpj text,
  ipva_tipo text, -- 'ambos', 'cliente', 'loja'
  ipva_cotas integer,
  ipva_valor numeric,
  transferencia_tipo text, -- 'cliente', 'loja', 'outra_uf', 'ambos'
  transferencia_valor numeric,
  valor_quitacao numeric,
  valor_fechamento numeric,
  observacoes_internas text,
  observacoes_contrato text,
  data_sinal date,
  data_vencimento_sinal date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contratos" ON public.contratos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Insert contratos" ON public.contratos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM atendimentos a
      WHERE a.id = contratos.atendimento_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

CREATE POLICY "Update contratos" ON public.contratos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM atendimentos a
      WHERE a.id = contratos.atendimento_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

-- Table for payment methods (formas de pagamento)
CREATE TABLE public.formas_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
  tipo text NOT NULL, -- 'financiamento', 'consorcio', 'ted_doc_pix', 'cartao_credito', 'dinheiro', 'outros'
  valor_total numeric,
  -- Financiamento specific fields
  valor_entrada numeric,
  financeira text,
  numero_parcelas integer,
  valor_parcelas numeric,
  valor_financiado numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view formas_pagamento" ON public.formas_pagamento
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Insert formas_pagamento" ON public.formas_pagamento
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contratos c
      JOIN atendimentos a ON a.id = c.atendimento_id
      WHERE c.id = formas_pagamento.contrato_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

CREATE POLICY "Delete formas_pagamento" ON public.formas_pagamento
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contratos c
      JOIN atendimentos a ON a.id = c.atendimento_id
      WHERE c.id = formas_pagamento.contrato_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

CREATE POLICY "Update formas_pagamento" ON public.formas_pagamento
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contratos c
      JOIN atendimentos a ON a.id = c.atendimento_id
      WHERE c.id = formas_pagamento.contrato_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );
