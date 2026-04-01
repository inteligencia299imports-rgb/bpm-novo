
-- 1. Fix contratos_consignante SELECT policy (uses atendimento_id)
DROP POLICY IF EXISTS "Authenticated users can view contratos_consignante" ON public.contratos_consignante;
CREATE POLICY "Scoped select contratos_consignante" ON public.contratos_consignante
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = contratos_consignante.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria'))
  )
);

-- 2. Fix contratos SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view contratos" ON public.contratos;
CREATE POLICY "Scoped select contratos" ON public.contratos
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = contratos.atendimento_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria'))
  )
);

-- 3. Fix contratos_consignacao SELECT policy (uses avaliacao_id)
DROP POLICY IF EXISTS "Authenticated users can view contratos_consignacao" ON public.contratos_consignacao;
CREATE POLICY "Scoped select contratos_consignacao" ON public.contratos_consignacao
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = contratos_consignacao.avaliacao_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);

-- 4. Fix formas_pagamento SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view formas_pagamento" ON public.formas_pagamento;
CREATE POLICY "Scoped select formas_pagamento" ON public.formas_pagamento
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM contratos c
    JOIN atendimentos a ON a.id = c.atendimento_id
    WHERE c.id = formas_pagamento.contrato_id
    AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria'))
  )
);

-- 5. Fix notifications INSERT policy
DROP POLICY IF EXISTS "Insert own notifications" ON public.notifications;
CREATE POLICY "Insert own notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 6. Fix observacoes_processo INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert observations" ON public.observacoes_processo;
CREATE POLICY "Insert own observations" ON public.observacoes_processo
FOR INSERT TO authenticated
WITH CHECK (usuario_id = (auth.uid())::text);

-- 7. Fix observacoes_processo DELETE policy
DROP POLICY IF EXISTS "Authenticated users can delete observations" ON public.observacoes_processo;
CREATE POLICY "Gestor deletes observations" ON public.observacoes_processo
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'gestor'));
