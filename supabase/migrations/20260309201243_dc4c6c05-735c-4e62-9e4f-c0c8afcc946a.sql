
-- Fix atendimentos policies: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Vendedor cria" ON public.atendimentos;
DROP POLICY IF EXISTS "Vendedor vê próprios" ON public.atendimentos;
DROP POLICY IF EXISTS "Vendedor edita próprio" ON public.atendimentos;
DROP POLICY IF EXISTS "Avaliador vê vinculados" ON public.atendimentos;

CREATE POLICY "Vendedor cria" ON public.atendimentos
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = vendedor_id);

CREATE POLICY "Vendedor vê próprios" ON public.atendimentos
FOR SELECT TO authenticated
USING (auth.uid() = vendedor_id OR has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Vendedor edita próprio" ON public.atendimentos
FOR UPDATE TO authenticated
USING (auth.uid() = vendedor_id OR has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Avaliador vê vinculados" ON public.atendimentos
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'avaliador'::app_role)
  AND EXISTS (SELECT 1 FROM avaliacoes av WHERE av.atendimento_id = atendimentos.id)
);

-- Fix motos_interesse policies
DROP POLICY IF EXISTS "Acesso motos interesse" ON public.motos_interesse;
DROP POLICY IF EXISTS "Insert motos interesse" ON public.motos_interesse;
DROP POLICY IF EXISTS "Update motos interesse" ON public.motos_interesse;

CREATE POLICY "Acesso motos interesse" ON public.motos_interesse
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))));

CREATE POLICY "Insert motos interesse" ON public.motos_interesse
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id AND a.vendedor_id = auth.uid()));

CREATE POLICY "Update motos interesse" ON public.motos_interesse
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_interesse.atendimento_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))));

-- Fix motos_avaliacao policies
DROP POLICY IF EXISTS "Acesso motos avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Insert motos avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Update motos avaliacao" ON public.motos_avaliacao;

CREATE POLICY "Acesso motos avaliacao" ON public.motos_avaliacao
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))) OR has_role(auth.uid(), 'avaliador'::app_role));

CREATE POLICY "Insert motos avaliacao" ON public.motos_avaliacao
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND a.vendedor_id = auth.uid()));

CREATE POLICY "Update motos avaliacao" ON public.motos_avaliacao
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role))) OR has_role(auth.uid(), 'avaliador'::app_role));

-- Fix avaliacoes policies
DROP POLICY IF EXISTS "Avaliador gestor veem" ON public.avaliacoes;
DROP POLICY IF EXISTS "Insert avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "Update avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "Vendedor vê próprias avaliacoes" ON public.avaliacoes;

CREATE POLICY "Avaliador gestor veem" ON public.avaliacoes
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'avaliador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Insert avaliacoes" ON public.avaliacoes
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid()) OR has_role(auth.uid(), 'avaliador'::app_role));

CREATE POLICY "Update avaliacoes" ON public.avaliacoes
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'avaliador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Vendedor vê próprias avaliacoes" ON public.avaliacoes
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid()));

-- Fix moto_fotos policies
DROP POLICY IF EXISTS "Acesso fotos" ON public.moto_fotos;
DROP POLICY IF EXISTS "Insert fotos" ON public.moto_fotos;

CREATE POLICY "Acesso fotos" ON public.moto_fotos
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM motos_avaliacao ma JOIN atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_fotos.moto_avaliacao_id AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'avaliador'::app_role))));

CREATE POLICY "Insert fotos" ON public.moto_fotos
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM motos_avaliacao ma JOIN atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_fotos.moto_avaliacao_id AND a.vendedor_id = auth.uid()));

-- Fix user_roles policies
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can view all roles" ON public.user_roles;

CREATE POLICY "Users can view own role" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Gestores can view all roles" ON public.user_roles
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role));
