
-- Fix motos_avaliacao policy that may cause recursion via avaliacoes
-- Create security definer function for checking moto in preparacao
CREATE OR REPLACE FUNCTION public.moto_has_avaliacao_preparacao(_moto_avaliacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.avaliacoes av
    WHERE av.moto_avaliacao_id = _moto_avaliacao_id
      AND av.situacao IN ('adquirida', 'estoque')
  )
$$;

-- Drop and recreate the motos_avaliacao policy
DROP POLICY IF EXISTS "Vendedor vê motos preparacao" ON public.motos_avaliacao;

CREATE POLICY "Vendedor vê motos preparacao"
ON public.motos_avaliacao FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND moto_has_avaliacao_preparacao(id)
);
