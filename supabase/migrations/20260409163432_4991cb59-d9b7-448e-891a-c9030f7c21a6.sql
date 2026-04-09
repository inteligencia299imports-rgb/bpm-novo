CREATE POLICY "Vendedor vê motos no estoque"
ON public.motos_avaliacao
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.estoque e
    WHERE e.moto_avaliacao_id = motos_avaliacao.id
  )
);