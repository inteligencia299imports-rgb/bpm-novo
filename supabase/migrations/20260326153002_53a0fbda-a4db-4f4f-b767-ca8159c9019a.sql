
-- Remove old delete policy and create new one restricted to gestor only
DROP POLICY IF EXISTS "Vendedor deleta próprio" ON public.atendimentos;
CREATE POLICY "Gestor deleta atendimentos"
ON public.atendimentos
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role));
