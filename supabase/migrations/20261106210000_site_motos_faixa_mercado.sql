-- Site: faixa de mercado do anúncio = Menor Valor e Maior Valor da avaliação (avaliacoes.menor_valor / maior_valor).
-- O site já desenha a faixa quando as duas pontas vêm preenchidas; até aqui a view mandava nulo.
-- Mesmas colunas da view (só mercado_min/mercado_max deixam de ser nulos), então o site não muda.
create or replace view public.site_motos_publicas as
select b.site_id as id, b.slug, b.marca, b.modelo, b.ano_fab, b.ano_modelo, b.km, b.cc, b.cor, b.preco, b.preco_de,
       case when b.preco_de is not null then array['OFERTA'] else '{}'::text[] end as selos,
       b.estilo, b.loja, b.fotos[1] as imagem, '{}'::text[] as caracteristicas, false as destaque, b.fotos,
       null::numeric as potencia_cv, null::numeric as torque_kgfm, null::numeric as peso_kg, null::text as cambio,
       b.descricao, b.diferenciais, '{}'::text[] as acessorios, b.fipe,
       -- Só com as duas pontas (> 0); na ordem certa mesmo se digitadas invertidas.
       case when a.menor_valor > 0 and a.maior_valor > 0 then least(a.menor_valor, a.maior_valor) end as mercado_min,
       case when a.menor_valor > 0 and a.maior_valor > 0 then greatest(a.menor_valor, a.maior_valor) end as mercado_max,
       true as publicado, 0 as ordem,
       coalesce(b.publicado_em, b.criado_em) as criado_em, b.atualizado_em
  from public.site_motos_base b
  join public.avaliacoes a on a.id = b.avaliacao_id
 where b.etapa = 'publicada'
   and b.slug is not null
   and cardinality(b.pendencias) = 0
   and (b.estoque_status is null or b.estoque_status in ('disponivel', 'servico'));
grant select on public.site_motos_publicas to anon, authenticated;
