-- Anúncio do site normalizado (06/11/2026).
-- Marca, modelo, km, anos, cilindrada, categoria, cor, manual, chave reserva, revisão em dia, preço de tabela
-- (quanto_vende), FIPE e preço ação (estoque_motos.preco_acao) passam a vir da própria moto no BPM.
-- site_motos guarda só o que é do anúncio: etapa, endereço (slug), descrição e fotos (a 1ª é a capa, até 20).

begin;

-- 1) Capa vira a 1ª foto e cada anúncio fica com no máximo 20 fotos (as extras continuam no storage de origem).
update public.site_motos
   set fotos = (array_prepend(imagem, array_remove(fotos, imagem)))[1:20]
 where coalesce(imagem, '') <> '';
update public.site_motos set fotos = fotos[1:20] where cardinality(fotos) > 20;

-- 2) Sai tudo que duplica a moto do BPM.
drop view if exists public.site_motos_publicas;
alter table public.site_motos
  drop column marca, drop column modelo, drop column ano_fab, drop column ano_modelo, drop column km,
  drop column cc, drop column cor, drop column estilo, drop column loja, drop column preco,
  drop column preco_de, drop column fipe, drop column mercado_min, drop column mercado_max,
  drop column selos, drop column caracteristicas, drop column destaque, drop column imagem,
  drop column potencia_cv, drop column torque_kgfm, drop column peso_kg, drop column cambio,
  drop column diferenciais, drop column acessorios, drop column ordem;
alter table public.site_motos
  add constraint site_motos_fotos_max check (cardinality(fotos) <= 20);

-- 3) Tradução dos valores do BPM para os do site (o site filtra por esses textos exatos).
create or replace function public.site_titulo(t text)
returns text language sql immutable as $$
  -- "SCRAMBLER ICON 800CC" -> "Scrambler Icon"; siglas, palavras com número ou hífen ficam como estão (GS, V4, MT-09, GSX-S).
  select string_agg(case when w ~ '[0-9-]' or length(w) <= 3 then w else initcap(w) end, ' ' order by n)
    from regexp_split_to_table(regexp_replace(upper(trim(t)), '\s+\d+\s*CC$', ''), '\s+') with ordinality as x(w, n)
$$;

create or replace function public.site_marca(nome text)
returns text language sql immutable as $$
  select case
    when upper(nome) like 'HARLEY%' then 'harley'
    when upper(nome) like 'ROYAL%' then 'royal'
    when lower(nome) in ('ducati', 'bmw', 'kawasaki', 'yamaha', 'honda', 'suzuki', 'triumph', 'ktm') then lower(nome)
  end
$$;

create or replace function public.site_cor(cor text)
returns text language sql immutable as $$
  select case upper(trim(cor))
    when 'VERMELHA' then 'Vermelho' when 'PRETA' then 'Preto' when 'BRANCA' then 'Branco'
    when 'AMARELA' then 'Amarelo' when '' then null
    else initcap(trim(cor))
  end
$$;

create or replace function public.site_estilo(categoria text)
returns text language sql immutable as $$
  select case upper(trim(categoria))
    when 'BIG TRAIL' then 'Big Trail' when 'TRAIL' then 'Big Trail' when 'OFF-ROAD' then 'Big Trail'
    when 'NAKED' then 'Naked' when 'STREET' then 'Naked'
    when 'ESPORTIVA' then 'Esportiva' when 'CUSTOM' then 'Custom' when 'CAFÉ RACER' then 'Café Racer'
    when 'SCOOTER' then 'Scooter'
    when 'SPORT - TOURING' then 'Sport Touring' when 'TOURING' then 'Sport Touring' when 'CROSSOVER' then 'Sport Touring'
  end
$$;

create or replace function public.site_loja(loja text)
returns text language sql immutable as $$
  select case loja
    when '299i' then 'Cidade do Automóvel' when '299s' then 'Sudoeste'
    when 'Aventura' then 'SIA Trecho 3' when 'Ducati BSB' then 'SIA Trecho 3'
    when '299f' then 'Ducati Florianópolis' when 'Ducati FLN' then 'Ducati Florianópolis'
    when '299p' then 'Ducati Porto Alegre' when 'Ducati POA' then 'Ducati Porto Alegre'
  end
$$;

create or replace function public.site_inteiro(t text)
returns int language sql immutable as $$
  select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '')::int
$$;

-- 4) Base: toda seminova adquirida/em estoque com o anúncio (se houver) e os dados vindos do BPM.
--    Sem grant: só é lida pelas duas views abaixo.
create or replace view public.site_motos_base as
with b as (
  select a.id as avaliacao_id, s.id as site_id, coalesce(s.etapa, 'em_aberto') as etapa, s.slug, s.descricao,
         coalesce(s.fotos, '{}') as fotos, s.fotos_em, s.publicado_em, s.criado_em, s.atualizado_em,
         a.placa, a.situacao, a.tipo_aquisicao, e.status as estoque_status,
         public.site_marca(ma.nome) as marca,
         public.site_titulo(mo.nome) as modelo,
         public.site_inteiro(a.ano_fabricacao) as ano_fab,
         public.site_inteiro(a.ano_modelo) as ano_modelo,
         public.site_inteiro(a.km) as km,
         public.site_inteiro(a.cilindrada) as cc,
         public.site_cor(a.cor) as cor,
         public.site_estilo(a.categoria) as estilo,
         public.site_loja(coalesce(le_est.loja, le_at.loja)) as loja,
         -- Preço: ação quando houver, senão o de tabela (quanto_vende); com ação abaixo da tabela, a tabela vira o "De".
         coalesce(nullif(e.preco_acao, 0), nullif(a.quanto_vende, 0)) as preco,
         case when e.preco_acao > 0 and a.quanto_vende > e.preco_acao then a.quanto_vende end as preco_de,
         nullif(a.valor_fipe, 0) as fipe,
         array_remove(array[
           case when a.tem_manual then 'Manual do proprietário' end,
           case when a.tem_chave_reserva then 'Chave reserva' end,
           case when a.manutencao_vencida = false then 'Revisões em dia' end
         ], null) as diferenciais
    from public.avaliacoes a
    left join public.site_motos s on s.avaliacao_id = a.id
    left join public.marcas_motos ma on ma.id = a.marca_id
    left join public.modelos_motos mo on mo.id = a.modelo_id
    left join lateral (
      select em.status, em.preco_acao, em.loja_id from public.estoque_motos em
       where em.avaliacao_id = a.id order by em.created_at desc limit 1
    ) e on true
    left join public.loja_empresas le_est on le_est.id::text = e.loja_id
    left join public.atendimentos_motos atm on atm.id = a.atendimento_id
    left join public.loja_empresas le_at on le_at.id = atm.loja_id
   where a.situacao in ('adquirida', 'estoque', 'oficina')
     and coalesce(a.tipo_aquisicao, '') not in ('test-ride', 'test_ride')
)
select b.*,
       array_remove(array[
         case when b.marca is null then 'Marca (fora das marcas do site)' end,
         case when b.modelo is null then 'Modelo' end,
         case when b.ano_fab is null or b.ano_modelo is null then 'Anos' end,
         case when b.km is null then 'Quilometragem' end,
         case when b.cc is null then 'Cilindrada' end,
         case when b.cor is null then 'Cor' end,
         case when b.estilo is null then 'Categoria' end,
         case when b.loja is null then 'Loja' end,
         case when b.preco is null then 'Preço (tabela ou ação)' end,
         case when cardinality(b.fotos) = 0 then 'Fotos' end
       ], null) as pendencias
  from b;
revoke all on public.site_motos_base from anon, authenticated;

-- 5) Equipe do BPM: dados do anúncio já traduzidos (pop-up da aba Publicações).
create or replace view public.site_motos_dados as
select * from public.site_motos_base where public.usuario_bpm(auth.uid());
revoke all on public.site_motos_dados from anon;
grant select on public.site_motos_dados to authenticated;

-- 6) Site: só publicada, sem pendência e ainda à venda (sinal, venda ou retirada saem). Mesmas colunas de antes.
create or replace view public.site_motos_publicas as
select b.site_id as id, b.slug, b.marca, b.modelo, b.ano_fab, b.ano_modelo, b.km, b.cc, b.cor, b.preco, b.preco_de,
       case when b.preco_de is not null then array['OFERTA'] else '{}'::text[] end as selos,
       b.estilo, b.loja, b.fotos[1] as imagem, '{}'::text[] as caracteristicas, false as destaque, b.fotos,
       null::numeric as potencia_cv, null::numeric as torque_kgfm, null::numeric as peso_kg, null::text as cambio,
       b.descricao, b.diferenciais, '{}'::text[] as acessorios, b.fipe,
       null::numeric as mercado_min, null::numeric as mercado_max, true as publicado, 0 as ordem,
       coalesce(b.publicado_em, b.criado_em) as criado_em, b.atualizado_em
  from public.site_motos_base b
 where b.etapa = 'publicada'
   and b.slug is not null
   and cardinality(b.pendencias) = 0
   and (b.estoque_status is null or b.estoque_status in ('disponivel', 'servico'));
grant select on public.site_motos_publicas to anon, authenticated;

-- 7) Fotos: até 3 MB cada, só imagem.
update storage.buckets
   set file_size_limit = 3145728,
       allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
 where id = 'site-motos';

commit;
