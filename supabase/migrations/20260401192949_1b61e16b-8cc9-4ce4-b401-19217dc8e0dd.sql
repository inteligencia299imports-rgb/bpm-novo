
DROP POLICY IF EXISTS "Insert custos_oficina" ON public.custos_oficina;
CREATE POLICY "Insert custos_oficina" ON public.custos_oficina
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = custos_oficina.avaliacao_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);

DROP POLICY IF EXISTS "Update custos_oficina" ON public.custos_oficina;
CREATE POLICY "Update custos_oficina" ON public.custos_oficina
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = custos_oficina.avaliacao_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);

DROP POLICY IF EXISTS "Delete custos_oficina" ON public.custos_oficina;
CREATE POLICY "Delete custos_oficina" ON public.custos_oficina
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = custos_oficina.avaliacao_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);
