CREATE OR REPLACE FUNCTION public.can_manage_contrato_compra(_atendimento_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'gestor'::public.app_role)
    OR public.has_role(_user_id, 'secretaria'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.atendimentos a
      WHERE a.id = _atendimento_id
        AND a.vendedor_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.avaliacoes av
      WHERE av.atendimento_id = _atendimento_id
        AND av.avaliador_id = _user_id
    );
$$;

CREATE POLICY "Avaliador vê contrato compra"
ON public.contratos
FOR SELECT
TO authenticated
USING (
  ipva_tipo = 'COMPRA'
  AND public.can_manage_contrato_compra(atendimento_id, auth.uid())
);

CREATE POLICY "Avaliador cria contrato compra"
ON public.contratos
FOR INSERT
TO authenticated
WITH CHECK (
  ipva_tipo = 'COMPRA'
  AND public.can_manage_contrato_compra(atendimento_id, auth.uid())
);

CREATE POLICY "Avaliador edita contrato compra"
ON public.contratos
FOR UPDATE
TO authenticated
USING (
  ipva_tipo = 'COMPRA'
  AND public.can_manage_contrato_compra(atendimento_id, auth.uid())
)
WITH CHECK (
  ipva_tipo = 'COMPRA'
  AND public.can_manage_contrato_compra(atendimento_id, auth.uid())
);