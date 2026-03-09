
DROP POLICY IF EXISTS "Avaliador vê vinculados" ON public.atendimentos;

CREATE POLICY "Avaliador vê vinculados"
ON public.atendimentos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'avaliador'::app_role) 
  AND EXISTS (
    SELECT 1 FROM avaliacoes av
    WHERE av.atendimento_id = atendimentos.id
  )
);
