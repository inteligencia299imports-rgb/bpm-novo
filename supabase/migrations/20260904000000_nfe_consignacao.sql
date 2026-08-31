-- NF-e de entrada em consignação (espelho da NF-e de compra).
-- A loja emite nota propria de entrada; CFOP 1917 (interna) / 2917 (interestadual).
-- Sem compromisso financeiro (pagamento ao consignante so na venda).

-- 1) Valor da consignacao que vai na nota (editavel antes de emitir; default = avaliacao_consignacao).
alter table public.avaliacoes add column if not exists valor_consignacao_nota numeric;

-- 2) Discriminador da operacao em nfe_entradas.
alter table public.nfe_entradas add column if not exists operacao text not null default 'compra';

-- 3) Natureza "Entrada em consignação" por empresa BPM.
insert into public.naturezas_operacao
  (descricao, serie, tipo, faturada, consumidor_final, operacao_devolucao, indicador_presenca, empresa_id)
select 'Entrada em consignação', '1', 'entrada', true, false, false, 0, e.id
from public.empresas e
where e.bpm = true
  and not exists (
    select 1 from public.naturezas_operacao n
    where n.empresa_id = e.id and n.descricao = 'Entrada em consignação'
  );

-- 3a) Regra ICMS interna (CFOP 1917). CST/CSOSN "nao tributada": Simples -> 400, demais -> 41.
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, 'icms', '1917',
       case when upper(coalesce(e.regime_tributario, '')) like 'SIMPLES%' then '400' else '41' end,
       0, 0, 'todos', array[e.uf]
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where n.descricao = 'Entrada em consignação'
  and e.uf is not null
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = 'icms' and r.ordem = 0
  );

-- 3b) Regra ICMS interestadual (CFOP 2917), curinga.
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select r.natureza_operacao_id, 'icms', '2917', r.situacao_tributaria, 0, 1, 'todos', '{}'::text[]
from public.naturezas_operacao_regras r
join public.naturezas_operacao n on n.id = r.natureza_operacao_id
where n.descricao = 'Entrada em consignação'
  and r.imposto = 'icms' and r.ordem = 0
  and not exists (
    select 1 from public.naturezas_operacao_regras r2
    where r2.natureza_operacao_id = r.natureza_operacao_id and r2.imposto = 'icms' and r2.ordem = 1
  );

-- 3c) PIS / COFINS (CST 70 - sem direito a credito).
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, imp.imposto, '70', 0, 0, 'todos', '{}'::text[]
from public.naturezas_operacao n
cross join (values ('pis'), ('cofins')) as imp(imposto)
where n.descricao = 'Entrada em consignação'
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = imp.imposto
  );
