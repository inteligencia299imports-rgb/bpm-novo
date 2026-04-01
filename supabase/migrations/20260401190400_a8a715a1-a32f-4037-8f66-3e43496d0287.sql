
-- pos_venda_processos: add secretaria to INSERT and UPDATE
DROP POLICY IF EXISTS "Insert pos_venda_processos" ON public.pos_venda_processos;
CREATE POLICY "Insert pos_venda_processos" ON public.pos_venda_processos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = pos_venda_processos.atendimento_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria'))
  )
);

DROP POLICY IF EXISTS "Update pos_venda_processos" ON public.pos_venda_processos;
CREATE POLICY "Update pos_venda_processos" ON public.pos_venda_processos
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = pos_venda_processos.atendimento_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'secretaria'))
  )
);

-- pos_compra_processos: add secretaria to INSERT and UPDATE
DROP POLICY IF EXISTS "Insert pos_compra_processos" ON public.pos_compra_processos;
CREATE POLICY "Insert pos_compra_processos" ON public.pos_compra_processos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = pos_compra_processos.avaliacao_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);

DROP POLICY IF EXISTS "Update pos_compra_processos" ON public.pos_compra_processos;
CREATE POLICY "Update pos_compra_processos" ON public.pos_compra_processos
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = pos_compra_processos.avaliacao_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);

-- consignacao_processos: add secretaria to INSERT and UPDATE
DROP POLICY IF EXISTS "Insert consignacao_processos" ON public.consignacao_processos;
CREATE POLICY "Insert consignacao_processos" ON public.consignacao_processos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = consignacao_processos.avaliacao_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);

DROP POLICY IF EXISTS "Update consignacao_processos" ON public.consignacao_processos;
CREATE POLICY "Update consignacao_processos" ON public.consignacao_processos
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = consignacao_processos.avaliacao_id
      AND (a.vendedor_id = auth.uid() OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'secretaria'))
  )
);

-- atendimentos: add secretaria to UPDATE
DROP POLICY IF EXISTS "Vendedor edita próprio" ON public.atendimentos;
CREATE POLICY "Vendedor edita próprio" ON public.atendimentos
FOR UPDATE TO authenticated
USING (
  auth.uid() = vendedor_id
  OR has_role(auth.uid(), 'gestor')
  OR has_role(auth.uid(), 'secretaria')
);

-- avaliacoes: add secretaria to UPDATE
DROP POLICY IF EXISTS "Update avaliacoes" ON public.avaliacoes;
CREATE POLICY "Update avaliacoes" ON public.avaliacoes
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'avaliador')
  OR has_role(auth.uid(), 'gestor')
  OR has_role(auth.uid(), 'secretaria')
  OR EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'avaliador')
  OR has_role(auth.uid(), 'gestor')
  OR has_role(auth.uid(), 'secretaria')
  OR EXISTS (SELECT 1 FROM atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid())
);
