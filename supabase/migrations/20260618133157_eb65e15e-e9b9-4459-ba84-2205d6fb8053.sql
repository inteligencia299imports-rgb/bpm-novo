-- 1) Replace the overly broad vendedor SELECT policy with an ownership-scoped one
DROP POLICY IF EXISTS "Vendedor vê avaliacoes em preparacao" ON public.avaliacoes;

-- (The existing "Vendedor vê próprias avaliacoes" policy already covers owned rows;
--  no additional policy needed — non-owning vendedores must use the safe view below.)

-- 2) Safe view exposing only non-sensitive columns of in-stock / acquired appraisals
CREATE OR REPLACE VIEW public.avaliacoes_estoque_publico
WITH (security_invoker = off) AS
SELECT
  id,
  atendimento_id,
  moto_avaliacao_id,
  avaliador_id,
  situacao,
  tipo_aquisicao,
  classificacao,
  preparacao_status,
  consignacao_status,
  pos_compra_status,
  nps_status,
  nps_enviado_at,
  nps_respondido_at,
  created_at,
  updated_at
FROM public.avaliacoes
WHERE situacao = ANY (ARRAY['adquirida'::text, 'estoque'::text]);

GRANT SELECT ON public.avaliacoes_estoque_publico TO authenticated;