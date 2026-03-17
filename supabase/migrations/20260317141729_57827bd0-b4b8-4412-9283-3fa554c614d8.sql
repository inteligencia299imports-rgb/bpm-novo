-- Permitir que vendedor atualize avaliações vinculadas aos seus próprios atendimentos
-- (mantendo avaliador e gestor com acesso total de atualização)
DROP POLICY IF EXISTS "Update avaliacoes" ON public.avaliacoes;

CREATE POLICY "Update avaliacoes"
ON public.avaliacoes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'avaliador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.atendimentos a
    WHERE a.id = avaliacoes.atendimento_id
      AND a.vendedor_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'avaliador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.atendimentos a
    WHERE a.id = avaliacoes.atendimento_id
      AND a.vendedor_id = auth.uid()
  )
);