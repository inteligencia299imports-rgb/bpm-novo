
-- Allow vendors to see motos_avaliacao linked to avaliacoes in preparação
CREATE POLICY "Vendedor vê motos preparacao"
ON public.motos_avaliacao FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.avaliacoes av 
    WHERE av.moto_avaliacao_id = motos_avaliacao.id 
    AND av.situacao IN ('adquirida', 'estoque')
  )
);
