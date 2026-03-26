
-- Allow vendors to see all avaliacoes in preparação status
CREATE POLICY "Vendedor vê avaliacoes em preparacao"
ON public.avaliacoes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role) 
  AND situacao IN ('adquirida', 'estoque')
);

-- Allow vendors to see atendimentos linked to avaliacoes in preparação
CREATE POLICY "Vendedor vê atendimentos preparacao"
ON public.atendimentos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.avaliacoes av 
    WHERE av.atendimento_id = atendimentos.id 
    AND av.situacao IN ('adquirida', 'estoque')
  )
);
