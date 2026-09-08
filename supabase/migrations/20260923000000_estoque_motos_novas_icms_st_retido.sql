-- Valores do ICMS-ST retido anteriormente (grupo <ICMS60> da NF-e de venda de
-- moto 0km, CST 60). São transcritos da NF-e de ENTRADA da moto (nota da
-- fábrica/importador que reteve a ST) — não se calculam a partir do preço de
-- venda. Preenchidos por unidade no estoque 0km (manual ou, futuramente, pelo
-- parser da NF de entrada no SISFIN). Sem eles, o payload cai no cálculo
-- aproximado sobre o valor da venda. Ver docs-fiscal-299/pendencias.md.
alter table estoque_motos_novas
  add column if not exists icms_st_bc_retido numeric,        -- vBCSTRet
  add column if not exists icms_st_valor_substituto numeric, -- vICMSSubstituto
  add column if not exists icms_st_valor_retido numeric;     -- vICMSSTRet

comment on column estoque_motos_novas.icms_st_bc_retido is 'veicProd/NF venda <ICMS60> vBCSTRet — base de cálculo da ST retida anteriormente (vem da NF de entrada).';
comment on column estoque_motos_novas.icms_st_valor_substituto is 'NF venda <ICMS60> vICMSSubstituto — ICMS próprio do substituto cobrado em operação anterior (vem da NF de entrada).';
comment on column estoque_motos_novas.icms_st_valor_retido is 'NF venda <ICMS60> vICMSSTRet — valor do ICMS-ST retido anteriormente (vem da NF de entrada).';
