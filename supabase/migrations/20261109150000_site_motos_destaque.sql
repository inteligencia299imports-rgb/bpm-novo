-- Moto destaque do site (banner "Destaques" do topo de /seminovas, já existente no site-299, que mostra
-- as motos com destaque = true). Liga/desliga no detalhe da publicação no BPM.
-- A coluna saiu na normalização (20261106170000) e a view passou a devolver false fixo; volta como
-- marcação do anúncio (não é dado da moto).
alter table public.site_motos add column if not exists destaque boolean not null default false;

comment on column public.site_motos.destaque is
  'Moto em destaque no banner do topo de /seminovas no site (botão Destaque no detalhe da publicação do BPM).';

-- Mesma view de 20261106210000_site_motos_faixa_mercado.sql; só o destaque deixa de ser false fixo.
create or replace view public.site_motos_publicas as
 SELECT b.site_id AS id,
    b.slug,
    b.marca,
    b.modelo,
    b.ano_fab,
    b.ano_modelo,
    b.km,
    b.cc,
    b.cor,
    b.preco,
    b.preco_de,
        CASE
            WHEN b.preco_de IS NOT NULL THEN ARRAY['OFERTA'::text]
            ELSE '{}'::text[]
        END AS selos,
    b.estilo,
    b.loja,
    b.fotos[1] AS imagem,
    '{}'::text[] AS caracteristicas,
    COALESCE(sm.destaque, false) AS destaque,
    b.fotos,
    NULL::numeric AS potencia_cv,
    NULL::numeric AS torque_kgfm,
    NULL::numeric AS peso_kg,
    NULL::text AS cambio,
    b.descricao,
    b.diferenciais,
    '{}'::text[] AS acessorios,
    b.fipe,
        CASE
            WHEN a.menor_valor > 0::numeric AND a.maior_valor > 0::numeric THEN LEAST(a.menor_valor, a.maior_valor)
            ELSE NULL::numeric
        END AS mercado_min,
        CASE
            WHEN a.menor_valor > 0::numeric AND a.maior_valor > 0::numeric THEN GREATEST(a.menor_valor, a.maior_valor)
            ELSE NULL::numeric
        END AS mercado_max,
    true AS publicado,
    0 AS ordem,
    COALESCE(b.publicado_em, b.criado_em) AS criado_em,
    b.atualizado_em
   FROM site_motos_base b
     JOIN avaliacoes a ON a.id = b.avaliacao_id
     LEFT JOIN site_motos sm ON sm.id = b.site_id
  WHERE b.etapa = 'publicada'::text AND b.slug IS NOT NULL AND cardinality(b.pendencias) = 0 AND (b.estoque_status IS NULL OR (b.estoque_status = ANY (ARRAY['disponivel'::text, 'servico'::text])));
