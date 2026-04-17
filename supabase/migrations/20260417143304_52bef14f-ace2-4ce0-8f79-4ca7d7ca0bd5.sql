-- Alinhar policies de INSERT e UPDATE de contratos_consignacao com a de SELECT
-- Adicionando o papel 'avaliador', que já tem permissão de leitura mas estava bloqueado para escrita

DROP POLICY IF EXISTS "Insert contratos_consignacao" ON public.contratos_consignacao;
DROP POLICY IF EXISTS "Update contratos_consignacao" ON public.contratos_consignacao;

CREATE POLICY "Insert contratos_consignacao"
ON public.contratos_consignacao
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.avaliacoes av
    JOIN public.atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = contratos_consignacao.avaliacao_id
      AND (
        a.vendedor_id = auth.uid()
        OR public.has_role(auth.uid(), 'gestor'::public.app_role)
        OR public.has_role(auth.uid(), 'avaliador'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
);

CREATE POLICY "Update contratos_consignacao"
ON public.contratos_consignacao
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.avaliacoes av
    JOIN public.atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = contratos_consignacao.avaliacao_id
      AND (
        a.vendedor_id = auth.uid()
        OR public.has_role(auth.uid(), 'gestor'::public.app_role)
        OR public.has_role(auth.uid(), 'avaliador'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
);