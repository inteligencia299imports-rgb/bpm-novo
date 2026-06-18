DROP VIEW IF EXISTS public.avaliacoes_estoque_publico;

CREATE POLICY "Vendedor vê avaliacoes em preparacao"
ON public.avaliacoes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role)
  AND situacao = ANY (ARRAY['adquirida'::text, 'estoque'::text])
);