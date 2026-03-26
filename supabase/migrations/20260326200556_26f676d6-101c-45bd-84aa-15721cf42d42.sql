-- Allow vendedor to update estoque when marking as sold (only their own sales)
CREATE POLICY "Vendedor atualiza estoque venda"
ON public.estoque FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND EXISTS (
    SELECT 1 FROM motos_interesse mi
    JOIN atendimentos a ON a.id = mi.atendimento_id
    WHERE mi.estoque_moto_id = estoque.id::text
    AND a.vendedor_id = auth.uid()
  )
);