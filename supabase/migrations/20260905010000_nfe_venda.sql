-- NF-e de venda (saida, tipo_documento=1). Duas naturezas: seminova e 0km.
-- Keyed por atendimento_id + estoque_moto_id (nao por avaliacao_id).

alter table public.nfe_entradas add column if not exists atendimento_id uuid references public.atendimentos_motos(id) on delete set null;
alter table public.nfe_entradas add column if not exists estoque_moto_id uuid references public.estoque_motos(id) on delete set null;
create index if not exists idx_nfe_entradas_atendimento on public.nfe_entradas (atendimento_id);

-- avaliacao_id agora pode ser nulo p/ NF de venda de 0km (nao ha avaliacao).
alter table public.nfe_entradas alter column avaliacao_id drop not null;

-- =====================================================================
-- Seed: naturezas de venda por empresa BPM
-- =====================================================================
insert into public.naturezas_operacao
  (descricao, serie, tipo, faturada, consumidor_final, operacao_devolucao, indicador_presenca, empresa_id)
select d.descricao, '1', 'saida', true, true, false, 1, e.id
from public.empresas e
cross join (values ('Venda de moto seminova'), ('Venda de moto 0km')) as d(descricao)
where e.bpm = true
  and not exists (
    select 1 from public.naturezas_operacao n
    where n.empresa_id = e.id and n.descricao = d.descricao
  );

-- Regra ICMS interna (CFOP 5102). CST/CSOSN por regime.
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, 'icms', '5102',
       case when upper(coalesce(e.regime_tributario, '')) like 'SIMPLES%' then '102' else '00' end,
       0, 0, 'todos', array[e.uf]
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where n.descricao in ('Venda de moto seminova', 'Venda de moto 0km')
  and e.uf is not null
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = 'icms' and r.ordem = 0
  );

-- Regra ICMS interestadual (CFOP 6102), curinga.
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select r.natureza_operacao_id, 'icms', '6102', r.situacao_tributaria, 0, 1, 'todos', '{}'::text[]
from public.naturezas_operacao_regras r
join public.naturezas_operacao n on n.id = r.natureza_operacao_id
where n.descricao in ('Venda de moto seminova', 'Venda de moto 0km')
  and r.imposto = 'icms' and r.ordem = 0
  and not exists (
    select 1 from public.naturezas_operacao_regras r2
    where r2.natureza_operacao_id = r.natureza_operacao_id and r2.imposto = 'icms' and r2.ordem = 1
  );

-- PIS / COFINS: Simples CST 49; demais CST 01.
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, imp.imposto,
       case when upper(coalesce(e.regime_tributario, '')) like 'SIMPLES%' then '49' else '01' end,
       0, 0, 'todos', '{}'::text[]
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
cross join (values ('pis'), ('cofins')) as imp(imposto)
where n.descricao in ('Venda de moto seminova', 'Venda de moto 0km')
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = imp.imposto
  );
