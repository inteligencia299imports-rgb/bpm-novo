
-- consignacao_processos
DROP POLICY IF EXISTS "Authenticated users can view consignacao_processos" ON public.consignacao_processos;
CREATE POLICY "Scoped select consignacao_processos" ON public.consignacao_processos
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = consignacao_processos.avaliacao_id
      AND (a.vendedor_id = auth.uid()
           OR has_role(auth.uid(), 'gestor'::app_role)
           OR has_role(auth.uid(), 'avaliador'::app_role)
           OR has_role(auth.uid(), 'secretaria'::app_role))
  )
);

-- custos_oficina
DROP POLICY IF EXISTS "Authenticated users can view custos_oficina" ON public.custos_oficina;
CREATE POLICY "Scoped select custos_oficina" ON public.custos_oficina
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = custos_oficina.avaliacao_id
      AND (a.vendedor_id = auth.uid()
           OR has_role(auth.uid(), 'gestor'::app_role)
           OR has_role(auth.uid(), 'avaliador'::app_role)
           OR has_role(auth.uid(), 'secretaria'::app_role))
  )
);

-- custos_operacionais
DROP POLICY IF EXISTS "Authenticated users can view custos_operacionais" ON public.custos_operacionais;
CREATE POLICY "Scoped select custos_operacionais" ON public.custos_operacionais
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM contratos_consignante cc
    JOIN atendimentos a ON a.id = cc.atendimento_id
    WHERE cc.id = custos_operacionais.contrato_consignante_id
      AND (a.vendedor_id = auth.uid()
           OR has_role(auth.uid(), 'gestor'::app_role)
           OR has_role(auth.uid(), 'secretaria'::app_role))
  )
);

-- pos_compra_processos
DROP POLICY IF EXISTS "Authenticated users can view pos_compra_processos" ON public.pos_compra_processos;
CREATE POLICY "Scoped select pos_compra_processos" ON public.pos_compra_processos
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = pos_compra_processos.avaliacao_id
      AND (a.vendedor_id = auth.uid()
           OR has_role(auth.uid(), 'gestor'::app_role)
           OR has_role(auth.uid(), 'avaliador'::app_role)
           OR has_role(auth.uid(), 'secretaria'::app_role))
  )
);

-- pos_venda_processos
DROP POLICY IF EXISTS "Authenticated users can view pos_venda_processos" ON public.pos_venda_processos;
CREATE POLICY "Scoped select pos_venda_processos" ON public.pos_venda_processos
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = pos_venda_processos.atendimento_id
      AND (a.vendedor_id = auth.uid()
           OR has_role(auth.uid(), 'gestor'::app_role)
           OR has_role(auth.uid(), 'secretaria'::app_role))
  )
);

-- observacoes_processo: own author OR managers/secretaria
DROP POLICY IF EXISTS "Authenticated users can view observations" ON public.observacoes_processo;
CREATE POLICY "Scoped select observations" ON public.observacoes_processo
FOR SELECT TO authenticated USING (
  usuario_id = (auth.uid())::text
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'avaliador'::app_role)
  OR (
    entity_type IN ('atendimento','pos_venda','intermediacao')
    AND EXISTS (SELECT 1 FROM atendimentos a WHERE a.id::text = observacoes_processo.entity_id AND a.vendedor_id = auth.uid())
  )
  OR (
    entity_type IN ('avaliacao','pos_compra','consignacao','preparacao')
    AND EXISTS (
      SELECT 1 FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.id::text = observacoes_processo.entity_id AND a.vendedor_id = auth.uid()
    )
  )
);

-- status_history: managers/secretaria/avaliador see all; vendedor sees own entity history
DROP POLICY IF EXISTS "Authenticated users can view status history" ON public.status_history;
CREATE POLICY "Scoped select status history" ON public.status_history
FOR SELECT TO authenticated USING (
  changed_by = auth.uid()
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'avaliador'::app_role)
  OR (
    entity_type IN ('atendimento','pos_venda','intermediacao','consulta')
    AND EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = status_history.entity_id AND a.vendedor_id = auth.uid())
  )
  OR (
    entity_type IN ('avaliacao','pos_compra','consignacao','preparacao','showroom')
    AND EXISTS (
      SELECT 1 FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.id = status_history.entity_id AND a.vendedor_id = auth.uid()
    )
  )
);
