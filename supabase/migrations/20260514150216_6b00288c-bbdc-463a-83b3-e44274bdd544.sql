DROP VIEW IF EXISTS public.vw_nps_respostas;

CREATE VIEW public.vw_nps_respostas AS
WITH base AS (
  SELECT
    r.id            AS id_resposta,
    a.id            AS id_atendimento,
    a.nome_cliente,
    a.telefone,
    a.loja,
    a.interesse,
    a.vendedor_id,
    a.data_venda,
    r.created_at    AS data_envio,
    r.data_resposta,
    r.atendimento,
    r.outros_setores,
    r.produto,
    r.experiencia,
    r.nps,
    r.melhorias,
    r.espaco_livre,
    r.origem
  FROM public.respostas_nps r
  JOIN public.atendimentos a ON a.id = r.atendimento_id
),
vendas AS (
  SELECT
    b.id_atendimento,
    b.id_resposta,
    b.nome_cliente,
    b.telefone,
    COALESCE(ur.nome, '') AS vendedor,
    CASE WHEN b.loja ILIKE 'ducati%' THEN 'Ducati' ELSE '299' END AS departamento,
    COALESCE(e.modelo, mi.modelo) AS objeto,
    b.data_venda,
    b.data_envio,
    b.data_resposta,
    b.atendimento,
    b.outros_setores,
    b.produto,
    b.experiencia,
    b.nps,
    b.melhorias,
    b.espaco_livre,
    b.origem
  FROM base b
  LEFT JOIN public.estoque e ON e.atendimento_venda_id = b.id_atendimento
  LEFT JOIN public.motos_interesse mi ON mi.atendimento_id = b.id_atendimento
  LEFT JOIN public.user_roles ur ON ur.user_id = b.vendedor_id
  WHERE b.interesse = 'comprar'
),
aquisicoes AS (
  SELECT
    b.id_atendimento,
    b.id_resposta,
    b.nome_cliente,
    b.telefone,
    COALESCE(ur.nome, '') AS vendedor,
    'Compras'::text AS departamento,
    ma.modelo AS objeto,
    av.updated_at AS data_venda,
    b.data_envio,
    b.data_resposta,
    b.atendimento,
    b.outros_setores,
    b.produto,
    b.experiencia,
    b.nps,
    b.melhorias,
    b.espaco_livre,
    b.origem
  FROM base b
  JOIN public.avaliacoes av ON av.atendimento_id = b.id_atendimento
  LEFT JOIN public.motos_avaliacao ma ON ma.id = av.moto_avaliacao_id
  LEFT JOIN public.user_roles ur ON ur.user_id = COALESCE(av.avaliador_id, b.vendedor_id)
  WHERE b.interesse = 'vender'
)
SELECT * FROM vendas
UNION ALL
SELECT * FROM aquisicoes;

REVOKE ALL ON public.vw_nps_respostas FROM PUBLIC, anon;
GRANT SELECT ON public.vw_nps_respostas TO authenticated;