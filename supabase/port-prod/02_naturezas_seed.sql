-- ===================================================================
-- PORT BPM -> producao :: parte 2 -- Naturezas de operacao BPM
-- Rodar DEPOIS de 01_schema.sql. Idempotente (todos os inserts sao guardados
-- por NOT EXISTS). Depende de: empresas.bpm=true, empresas.uf, empresas.regime_tributario.
-- Consolidado dos migrations 20260831000000 / 20260903* / 20260904000000 / 20260905010000.
-- ===================================================================
begin;

-- -------------------------------------------------------------------
-- COMPRA DE MOTO SEMINOVA (entrada, tipo_documento 0)
-- -------------------------------------------------------------------
insert into public.naturezas_operacao (descricao, serie, tipo, faturada, consumidor_final, operacao_devolucao, empresa_id)
select 'Compra de moto seminova', '1', 'entrada', true, false, false, e.id
from public.empresas e
where e.bpm = true
  and not exists (select 1 from public.naturezas_operacao n where n.empresa_id = e.id and n.descricao = 'Compra de moto seminova');

-- regra ICMS base (vira "interna" no passo seguinte)
insert into public.naturezas_operacao_regras (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo)
select n.id, 'icms', '1102', '102', 0, 0, 'todos'
from public.naturezas_operacao n
where n.descricao = 'Compra de moto seminova'
  and not exists (select 1 from public.naturezas_operacao_regras r where r.natureza_operacao_id = n.id and r.imposto = 'icms');

-- ICMS interna: destino_ufs = {UF da empresa}, ordem 0
update public.naturezas_operacao_regras r
set destino_ufs = array[e.uf], ordem = 0
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where r.natureza_operacao_id = n.id
  and r.imposto = 'icms'
  and n.descricao = 'Compra de moto seminova'
  and e.uf is not null
  and (r.destino_ufs = '{}'::text[] or r.destino_ufs is null);

-- ICMS interestadual (curinga, CFOP 2xxx)
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select r.natureza_operacao_id, 'icms', '2' || substr(coalesce(r.cfop, '1102'), 2),
       r.situacao_tributaria, r.aliquota, 1, 'todos', '{}'::text[]
from public.naturezas_operacao_regras r
join public.naturezas_operacao n on n.id = r.natureza_operacao_id
where r.imposto = 'icms' and n.descricao = 'Compra de moto seminova' and r.ordem = 0
  and not exists (select 1 from public.naturezas_operacao_regras r2
    where r2.natureza_operacao_id = r.natureza_operacao_id and r2.imposto = 'icms' and r2.ordem = 1);

-- PIS/COFINS CST 70 (aquisicao sem direito a credito)
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, imp.imposto, '70', 0, 0, 'todos', '{}'::text[]
from public.naturezas_operacao n
cross join (values ('pis'), ('cofins')) as imp(imposto)
where n.descricao = 'Compra de moto seminova'
  and not exists (select 1 from public.naturezas_operacao_regras r where r.natureza_operacao_id = n.id and r.imposto = imp.imposto);

update public.naturezas_operacao set indicador_presenca = 0
where descricao = 'Compra de moto seminova' and indicador_presenca is null;

-- -------------------------------------------------------------------
-- ENTRADA EM CONSIGNACAO (entrada, CFOP 1917/2917)
-- -------------------------------------------------------------------
insert into public.naturezas_operacao
  (descricao, serie, tipo, faturada, consumidor_final, operacao_devolucao, indicador_presenca, empresa_id)
select 'Entrada em consignação', '1', 'entrada', true, false, false, 0, e.id
from public.empresas e
where e.bpm = true
  and not exists (select 1 from public.naturezas_operacao n where n.empresa_id = e.id and n.descricao = 'Entrada em consignação');

insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, 'icms', '1917',
       case when upper(coalesce(e.regime_tributario, '')) like 'SIMPLES%' then '400' else '41' end,
       0, 0, 'todos', array[e.uf]
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where n.descricao = 'Entrada em consignação' and e.uf is not null
  and not exists (select 1 from public.naturezas_operacao_regras r where r.natureza_operacao_id = n.id and r.imposto = 'icms' and r.ordem = 0);

insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select r.natureza_operacao_id, 'icms', '2917', r.situacao_tributaria, 0, 1, 'todos', '{}'::text[]
from public.naturezas_operacao_regras r
join public.naturezas_operacao n on n.id = r.natureza_operacao_id
where n.descricao = 'Entrada em consignação' and r.imposto = 'icms' and r.ordem = 0
  and not exists (select 1 from public.naturezas_operacao_regras r2
    where r2.natureza_operacao_id = r.natureza_operacao_id and r2.imposto = 'icms' and r2.ordem = 1);

insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, imp.imposto, '70', 0, 0, 'todos', '{}'::text[]
from public.naturezas_operacao n
cross join (values ('pis'), ('cofins')) as imp(imposto)
where n.descricao = 'Entrada em consignação'
  and not exists (select 1 from public.naturezas_operacao_regras r where r.natureza_operacao_id = n.id and r.imposto = imp.imposto);

-- -------------------------------------------------------------------
-- VENDA DE MOTO SEMINOVA / 0KM (saida, tipo_documento 1)
-- -------------------------------------------------------------------
insert into public.naturezas_operacao
  (descricao, serie, tipo, faturada, consumidor_final, operacao_devolucao, indicador_presenca, empresa_id)
select d.descricao, '1', 'saida', true, true, false, 1, e.id
from public.empresas e
cross join (values ('Venda de moto seminova'), ('Venda de moto 0km')) as d(descricao)
where e.bpm = true
  and not exists (select 1 from public.naturezas_operacao n where n.empresa_id = e.id and n.descricao = d.descricao);

insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, 'icms', '5102',
       case when upper(coalesce(e.regime_tributario, '')) like 'SIMPLES%' then '102' else '00' end,
       0, 0, 'todos', array[e.uf]
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where n.descricao in ('Venda de moto seminova', 'Venda de moto 0km') and e.uf is not null
  and not exists (select 1 from public.naturezas_operacao_regras r where r.natureza_operacao_id = n.id and r.imposto = 'icms' and r.ordem = 0);

insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select r.natureza_operacao_id, 'icms', '6102', r.situacao_tributaria, 0, 1, 'todos', '{}'::text[]
from public.naturezas_operacao_regras r
join public.naturezas_operacao n on n.id = r.natureza_operacao_id
where n.descricao in ('Venda de moto seminova', 'Venda de moto 0km') and r.imposto = 'icms' and r.ordem = 0
  and not exists (select 1 from public.naturezas_operacao_regras r2
    where r2.natureza_operacao_id = r.natureza_operacao_id and r2.imposto = 'icms' and r2.ordem = 1);

insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, imp.imposto,
       case when upper(coalesce(e.regime_tributario, '')) like 'SIMPLES%' then '49' else '01' end,
       0, 0, 'todos', '{}'::text[]
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
cross join (values ('pis'), ('cofins')) as imp(imposto)
where n.descricao in ('Venda de moto seminova', 'Venda de moto 0km')
  and not exists (select 1 from public.naturezas_operacao_regras r where r.natureza_operacao_id = n.id and r.imposto = imp.imposto);

-- NOTE: para 0km com Substituicao Tributaria (CST 10/CSOSN 500, CFOP 5405/6404, CEST),
-- ajuste manualmente as regras da natureza "Venda de moto 0km" apos rodar.

commit;
