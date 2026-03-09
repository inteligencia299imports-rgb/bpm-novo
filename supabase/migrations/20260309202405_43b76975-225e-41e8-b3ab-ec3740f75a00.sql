
-- Allow vendedor to delete own atendimentos, gestor can delete any
CREATE POLICY "Vendedor deleta próprio" ON public.atendimentos
FOR DELETE TO authenticated
USING (auth.uid() = vendedor_id OR has_role(auth.uid(), 'gestor'::app_role));

-- Allow cascading deletes on related tables
CREATE POLICY "Delete motos interesse" ON public.motos_interesse
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))));

CREATE POLICY "Delete motos avaliacao" ON public.motos_avaliacao
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))));

CREATE POLICY "Delete avaliacoes" ON public.avaliacoes
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = avaliacoes.atendimento_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))));

CREATE POLICY "Delete fotos" ON public.moto_fotos
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM motos_avaliacao ma JOIN atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_fotos.moto_avaliacao_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))));
