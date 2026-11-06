-- Fotos do anúncio do site em tabela própria (06/11/2026): uma linha por foto, ligada à avaliação.
-- O arquivo fica no Storage do DB 299 (bucket site-motos, pasta = avaliacao_id); a tabela guarda o caminho e a ordem
-- (1 = capa, até 20). Substitui a coluna site_motos.fotos (text[]), que sai na migration seguinte, depois do deploy do BPM.
-- As 1.388 fotos dos anúncios migrados do site antigo foram copiadas para site-motos/<avaliacao_id>/NN.webp antes desta migration.

begin;

create table if not exists public.site_motos_fotos (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  ordem smallint not null check (ordem between 1 and 20),
  caminho text not null check (caminho <> ''),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  unique (avaliacao_id, ordem)
);
create index if not exists site_motos_fotos_avaliacao_idx on public.site_motos_fotos (avaliacao_id, ordem);

alter table public.site_motos_fotos enable row level security;
drop policy if exists site_motos_fotos_bpm_select on public.site_motos_fotos;
create policy site_motos_fotos_bpm_select on public.site_motos_fotos for select to authenticated using (public.usuario_bpm(auth.uid()));
drop policy if exists site_motos_fotos_bpm_insert on public.site_motos_fotos;
create policy site_motos_fotos_bpm_insert on public.site_motos_fotos for insert to authenticated with check (public.usuario_bpm(auth.uid()));
drop policy if exists site_motos_fotos_bpm_delete on public.site_motos_fotos;
create policy site_motos_fotos_bpm_delete on public.site_motos_fotos for delete to authenticated using (public.usuario_bpm(auth.uid()));

-- URL pública da foto (o site exibe direto do Storage).
create or replace function public.site_foto_url(caminho text)
returns text language sql immutable as $$
  select 'https://gnpkkgygjfxlipqbtybg.supabase.co/storage/v1/object/public/site-motos/' || caminho
$$;

-- Grava a galeria inteira de uma vez (ordem = posição na lista), numa transação só.
create or replace function public.salvar_fotos_site_moto(_avaliacao_id uuid, _caminhos text[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if coalesce(cardinality(_caminhos), 0) > 20 then
    raise exception 'O anúncio aceita no máximo 20 fotos';
  end if;
  delete from public.site_motos_fotos where avaliacao_id = _avaliacao_id;
  insert into public.site_motos_fotos (avaliacao_id, ordem, caminho)
  select _avaliacao_id, x.ordem, x.caminho
    from unnest(_caminhos) with ordinality as x(caminho, ordem);
end $$;
grant execute on function public.salvar_fotos_site_moto(uuid, text[]) to authenticated;

-- Dados: cada URL do array vira uma linha. Do site antigo -> caminho copiado (avaliacao_id/NN.webp);
-- já no bucket site-motos -> o próprio caminho.
insert into public.site_motos_fotos (avaliacao_id, ordem, caminho)
select s.avaliacao_id, x.ordem,
       case when x.url like '%jdmceorkoispbktkuhpx%' then s.avaliacao_id || '/' || lpad(x.ordem::text, 2, '0') || '.webp'
            else split_part(x.url, '/site-motos/', 2) end
  from public.site_motos s, unnest(s.fotos) with ordinality as x(url, ordem)
 where x.ordem <= 20
on conflict (avaliacao_id, ordem) do nothing;

-- View base passa a montar a galeria pela tabela (mesmas colunas; site e BPM não mudam).
create or replace view public.site_motos_base as
with b as (
  select a.id as avaliacao_id, s.id as site_id, coalesce(s.etapa, 'em_aberto') as etapa, s.slug, s.descricao,
         coalesce((select array_agg(public.site_foto_url(f.caminho) order by f.ordem)
                     from public.site_motos_fotos f where f.avaliacao_id = a.id), '{}') as fotos, s.fotos_em, s.publicado_em, s.criado_em, s.atualizado_em,
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
         -- Preço: ação quando houver, senão o de tabela (quanto_pede); com ação abaixo da tabela, a tabela vira o "De".
         coalesce(nullif(e.preco_acao, 0), nullif(a.quanto_pede, 0)) as preco,
         case when e.preco_acao > 0 and a.quanto_pede > e.preco_acao then a.quanto_pede end as preco_de,
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

commit;
