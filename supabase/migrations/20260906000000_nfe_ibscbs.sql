-- Reforma Tributária (IBS/CBS/IS) na NF-e — grupo obrigatório em homologação para
-- emitentes CRT 3 (Regime Normal) desde 01/07/2026. Sem este grupo a SEFAZ rejeita
-- com cStat 1115 ("IBS/CBS não informado").
--
-- NT RT 2025.002. Aqui só a ESTRUTURA — os códigos (CST IBS/CBS, cClassTrib) e as
-- alíquotas ficam com valores de teste da fase de transição (CBS 0,9% / IBS 0,1%)
-- e DEVEM ser revisados pela contabilidade por operação.

-- 1) Libera 'ibscbs' (e 'is' para uso futuro do Imposto Seletivo) no CHECK de imposto.
alter table public.naturezas_operacao_regras
  drop constraint if exists naturezas_operacao_regras_imposto_check;
alter table public.naturezas_operacao_regras
  add constraint naturezas_operacao_regras_imposto_check
  check (imposto = any (array[
    'icms', 'ipi', 'pis', 'cofins', 'issqn', 'outros', 'retencoes', 'ibscbs', 'is'
  ]));

-- 2) Colunas IBS/CBS em naturezas_operacao_regras (linha com imposto = 'ibscbs').
--    situacao_tributaria (já existente) guarda o CST IBS/CBS (3 dígitos).
alter table public.naturezas_operacao_regras
  add column if not exists classificacao_tributaria text,   -- cClassTrib
  add column if not exists cbs_aliquota numeric,            -- % CBS
  add column if not exists ibs_uf_aliquota numeric,         -- % IBS - UF
  add column if not exists ibs_mun_aliquota numeric,        -- % IBS - Município
  add column if not exists percentual_reducao numeric;      -- pRedAliq (ex.: bem usado)

comment on column public.naturezas_operacao_regras.classificacao_tributaria is
  'cClassTrib (código de classificação tributária IBS/CBS). Usado quando imposto = ''ibscbs''.';

-- 3) Seed: uma regra 'ibscbs' por natureza BPM em cada empresa.
--    VALORES DE PLACEHOLDER — validar com a contabilidade:
--      situacao_tributaria      = '000'    (tributação integral)
--      classificacao_tributaria = '000001' (tributação integral)
--      cbs_aliquota             = 0.9      (alíquota de teste 2026)
--      ibs_uf_aliquota          = 0.1      (alíquota de teste 2026)
--      ibs_mun_aliquota         = 0
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, situacao_tributaria, classificacao_tributaria,
   cbs_aliquota, ibs_uf_aliquota, ibs_mun_aliquota, percentual_reducao,
   aliquota, ordem, produto_tipo, destino_ufs)
select n.id, 'ibscbs', '000', '000001',
       0.9, 0.1, 0, 0,
       0, 0, 'todos', '{}'::text[]
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where e.bpm = true
  and n.descricao in (
    'Compra de moto seminova',
    'Entrada em consignação',
    'Venda de moto seminova',
    'Venda de moto 0km'
  )
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = 'ibscbs'
  );
