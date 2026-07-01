DROP POLICY IF EXISTS "Update avaliacoes" ON public.avaliacoes;

CREATE POLICY "Update avaliacoes"
ON public.avaliacoes
FOR UPDATE
USING (
  has_role(auth.uid(), 'avaliador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = avaliacoes.atendimento_id
      AND a.vendedor_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'avaliador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = avaliacoes.atendimento_id
      AND a.vendedor_id = auth.uid()
  )
);