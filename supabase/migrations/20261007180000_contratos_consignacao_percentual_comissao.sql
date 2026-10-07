-- Percentual de comissão do contrato de consignação: passa a ser gravado (antes
-- só saía no PDF e no texto do histórico "CONTRATO GERADO (6%)"). Quando > 0,
-- a comissão (percentual × valor real da venda, ou "quanto vende" enquanto não
-- vendida) entra como abatimento fixo do cliente — ver abatimentos-cliente.ts.
alter table public.contratos_consignacao
  add column if not exists percentual_comissao numeric(5,2);

-- Backfill: último "CONTRATO GERADO (x%)" de cada avaliação.
with ult as (
  select distinct on (h.entity_id) h.entity_id,
         replace(substring(h.status from '\(([0-9]+(?:[.,][0-9]+)?)%\)'), ',', '.')::numeric pct
  from public.status_history h
  where h.status like 'CONTRATO GERADO (%'
  order by h.entity_id, h.created_at desc
)
update public.contratos_consignacao cc
   set percentual_comissao = ult.pct
  from ult
 where cc.avaliacao_id = ult.entity_id and cc.percentual_comissao is null and ult.pct > 0;
