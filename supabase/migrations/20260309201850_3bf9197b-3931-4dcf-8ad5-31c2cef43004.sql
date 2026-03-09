
-- Create security definer function to check if atendimento has avaliacoes
CREATE OR REPLACE FUNCTION public.atendimento_has_avaliacao(_atendimento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.avaliacoes
    WHERE atendimento_id = _atendimento_id
  )
$$;

-- Fix the recursive policy
DROP POLICY IF EXISTS "Avaliador vê vinculados" ON public.atendimentos;

CREATE POLICY "Avaliador vê vinculados" ON public.atendimentos
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'avaliador'::app_role)
  AND atendimento_has_avaliacao(id)
);
