DROP POLICY IF EXISTS "Scoped select status history" ON public.status_history;

CREATE POLICY "Scoped select status history"
ON public.status_history
FOR SELECT
USING (
  changed_by = auth.uid()
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'avaliador'::app_role)
  OR (
    entity_type = ANY (ARRAY['atendimento','pos_venda','intermediacao','consulta'])
    AND EXISTS (
      SELECT 1 FROM atendimentos a
      WHERE a.id = status_history.entity_id AND a.vendedor_id = auth.uid()
    )
  )
  OR (
    entity_type = ANY (ARRAY['avaliacao','pos_compra','consignacao','preparacao','showroom'])
    AND EXISTS (
      SELECT 1
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE (av.id = status_history.entity_id OR av.moto_avaliacao_id = status_history.entity_id)
        AND a.vendedor_id = auth.uid()
    )
  )
);