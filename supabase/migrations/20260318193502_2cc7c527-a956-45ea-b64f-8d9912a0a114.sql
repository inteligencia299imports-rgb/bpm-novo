DROP POLICY "Insert avaliacoes" ON public.avaliacoes;

CREATE POLICY "Insert avaliacoes" ON public.avaliacoes
FOR INSERT TO authenticated
WITH CHECK (
  (EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid()
  ))
  OR has_role(auth.uid(), 'avaliador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
);