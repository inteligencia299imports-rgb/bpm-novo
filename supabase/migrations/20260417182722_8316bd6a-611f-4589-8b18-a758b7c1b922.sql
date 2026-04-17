DROP POLICY IF EXISTS "Vendedor edita próprio" ON public.atendimentos;
CREATE POLICY "Vendedor edita próprio" ON public.atendimentos
FOR UPDATE TO authenticated
USING (
  (auth.uid() = vendedor_id)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'secretaria'::app_role)
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
);