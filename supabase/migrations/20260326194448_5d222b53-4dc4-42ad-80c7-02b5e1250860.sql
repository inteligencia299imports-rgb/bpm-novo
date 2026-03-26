
-- Create a security definer function to check if an atendimento has avaliacoes in preparacao
-- This avoids the infinite recursion between atendimentos and avaliacoes RLS policies
CREATE OR REPLACE FUNCTION public.atendimento_has_avaliacao_preparacao(_atendimento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.avaliacoes av
    WHERE av.atendimento_id = _atendimento_id
      AND av.situacao IN ('adquirida', 'estoque')
  )
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Vendedor vê atendimentos preparacao" ON public.atendimentos;

-- Recreate using the security definer function
CREATE POLICY "Vendedor vê atendimentos preparacao"
ON public.atendimentos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND atendimento_has_avaliacao_preparacao(id)
);
