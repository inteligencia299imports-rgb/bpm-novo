
-- contratos: add secretaria to INSERT and UPDATE
DROP POLICY IF EXISTS "Insert contratos" ON public.contratos;
CREATE POLICY "Insert contratos" ON public.contratos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = contratos.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Update contratos" ON public.contratos;
CREATE POLICY "Update contratos" ON public.contratos
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = contratos.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- contratos_consignacao: add secretaria to INSERT and UPDATE
DROP POLICY IF EXISTS "Insert contratos_consignacao" ON public.contratos_consignacao;
CREATE POLICY "Insert contratos_consignacao" ON public.contratos_consignacao
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = contratos_consignacao.avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Update contratos_consignacao" ON public.contratos_consignacao;
CREATE POLICY "Update contratos_consignacao" ON public.contratos_consignacao
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = contratos_consignacao.avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- contratos_consignante: add secretaria to INSERT and UPDATE
DROP POLICY IF EXISTS "Insert contratos_consignante" ON public.contratos_consignante;
CREATE POLICY "Insert contratos_consignante" ON public.contratos_consignante
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = contratos_consignante.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Update contratos_consignante" ON public.contratos_consignante;
CREATE POLICY "Update contratos_consignante" ON public.contratos_consignante
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = contratos_consignante.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- custos_operacionais: add secretaria to INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Insert custos_operacionais" ON public.custos_operacionais;
CREATE POLICY "Insert custos_operacionais" ON public.custos_operacionais
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM contratos_consignante cc JOIN atendimentos a ON a.id = cc.atendimento_id
    WHERE cc.id = custos_operacionais.contrato_consignante_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Update custos_operacionais" ON public.custos_operacionais;
CREATE POLICY "Update custos_operacionais" ON public.custos_operacionais
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM contratos_consignante cc JOIN atendimentos a ON a.id = cc.atendimento_id
    WHERE cc.id = custos_operacionais.contrato_consignante_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Delete custos_operacionais" ON public.custos_operacionais;
CREATE POLICY "Delete custos_operacionais" ON public.custos_operacionais
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM contratos_consignante cc JOIN atendimentos a ON a.id = cc.atendimento_id
    WHERE cc.id = custos_operacionais.contrato_consignante_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- motos_interesse: add secretaria to INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Insert motos interesse" ON public.motos_interesse;
CREATE POLICY "Insert motos interesse" ON public.motos_interesse
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Update motos interesse" ON public.motos_interesse;
CREATE POLICY "Update motos interesse" ON public.motos_interesse
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Delete motos interesse" ON public.motos_interesse;
CREATE POLICY "Delete motos interesse" ON public.motos_interesse
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Acesso motos interesse" ON public.motos_interesse;
CREATE POLICY "Acesso motos interesse" ON public.motos_interesse
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- formas_pagamento: add secretaria to INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Insert formas_pagamento" ON public.formas_pagamento;
CREATE POLICY "Insert formas_pagamento" ON public.formas_pagamento
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM contratos c JOIN atendimentos a ON a.id = c.atendimento_id
    WHERE c.id = formas_pagamento.contrato_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Update formas_pagamento" ON public.formas_pagamento;
CREATE POLICY "Update formas_pagamento" ON public.formas_pagamento
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM contratos c JOIN atendimentos a ON a.id = c.atendimento_id
    WHERE c.id = formas_pagamento.contrato_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Delete formas_pagamento" ON public.formas_pagamento;
CREATE POLICY "Delete formas_pagamento" ON public.formas_pagamento
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM contratos c JOIN atendimentos a ON a.id = c.atendimento_id
    WHERE c.id = formas_pagamento.contrato_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- motos_avaliacao: add secretaria to INSERT
DROP POLICY IF EXISTS "Insert motos avaliacao" ON public.motos_avaliacao;
CREATE POLICY "Insert motos avaliacao" ON public.motos_avaliacao
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_avaliacao.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- moto_fotos: add secretaria to INSERT and DELETE
DROP POLICY IF EXISTS "Insert fotos" ON public.moto_fotos;
CREATE POLICY "Insert fotos" ON public.moto_fotos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM motos_avaliacao ma JOIN atendimentos a ON a.id = ma.atendimento_id
    WHERE ma.id = moto_fotos.moto_avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

DROP POLICY IF EXISTS "Delete fotos" ON public.moto_fotos;
CREATE POLICY "Delete fotos" ON public.moto_fotos
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM motos_avaliacao ma JOIN atendimentos a ON a.id = ma.atendimento_id
    WHERE ma.id = moto_fotos.moto_avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria')))
);

-- avaliacoes: add secretaria to INSERT
DROP POLICY IF EXISTS "Insert avaliacoes" ON public.avaliacoes;
CREATE POLICY "Insert avaliacoes" ON public.avaliacoes
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid())
  OR has_role(auth.uid(), 'avaliador')
  OR has_role(auth.uid(), 'gestor')
  OR has_role(auth.uid(), 'secretaria')
);

-- estoque: add secretaria to INSERT and UPDATE
DROP POLICY IF EXISTS "Avaliador insere estoque" ON public.estoque;
CREATE POLICY "Avaliador insere estoque" ON public.estoque
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'));

DROP POLICY IF EXISTS "Avaliador atualiza estoque" ON public.estoque;
CREATE POLICY "Avaliador atualiza estoque" ON public.estoque
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'));
