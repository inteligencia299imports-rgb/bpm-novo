-- Allow secretária to view all atendimentos
CREATE POLICY "Secretaria vê atendimentos"
ON public.atendimentos FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'secretaria'::app_role));

-- Allow secretária to view all motos_avaliacao
CREATE POLICY "Secretaria vê motos_avaliacao"
ON public.motos_avaliacao FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'secretaria'::app_role));

-- Allow secretária to update motos_avaliacao (for consultation workflow)
CREATE POLICY "Secretaria atualiza motos_avaliacao"
ON public.motos_avaliacao FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'secretaria'::app_role));

-- Allow secretária to view avaliacoes
CREATE POLICY "Secretaria vê avaliacoes"
ON public.avaliacoes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'secretaria'::app_role));

-- Allow secretária to view moto_fotos
CREATE POLICY "Secretaria vê moto_fotos"
ON public.moto_fotos FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'secretaria'::app_role));