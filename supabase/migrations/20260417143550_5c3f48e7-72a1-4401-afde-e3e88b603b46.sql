-- Função SECURITY DEFINER para checar se o usuário pode mexer no contrato de consignação
-- Bypassa RLS de avaliacoes/atendimentos para evitar bloqueio em cascata
CREATE OR REPLACE FUNCTION public.can_manage_contrato_consignacao(_avaliacao_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'gestor'::public.app_role)
    OR public.has_role(_user_id, 'avaliador'::public.app_role)
    OR public.has_role(_user_id, 'secretaria'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.avaliacoes av
      JOIN public.atendimentos a ON a.id = av.atendimento_id
      WHERE av.id = _avaliacao_id
        AND a.vendedor_id = _user_id
    );
$$;

DROP POLICY IF EXISTS "Insert contratos_consignacao" ON public.contratos_consignacao;
DROP POLICY IF EXISTS "Update contratos_consignacao" ON public.contratos_consignacao;
DROP POLICY IF EXISTS "Scoped select contratos_consignacao" ON public.contratos_consignacao;

CREATE POLICY "Scoped select contratos_consignacao"
ON public.contratos_consignacao
FOR SELECT
TO authenticated
USING (public.can_manage_contrato_consignacao(avaliacao_id, auth.uid()));

CREATE POLICY "Insert contratos_consignacao"
ON public.contratos_consignacao
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_contrato_consignacao(avaliacao_id, auth.uid()));

CREATE POLICY "Update contratos_consignacao"
ON public.contratos_consignacao
FOR UPDATE
TO authenticated
USING (public.can_manage_contrato_consignacao(avaliacao_id, auth.uid()));