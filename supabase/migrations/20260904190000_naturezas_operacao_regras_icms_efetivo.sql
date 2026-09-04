-- Grupo "ICMS Efetivo" (pICMSEfet/vBCEfet/pRedBCEfet/vICMSEfet) — obrigatório pela
-- SEFAZ (rejeição 906) sempre que a regra de ICMS usa CST 60 ou CSOSN 500 e a
-- natureza é para consumidor final. Separado de `aliquota` (que guarda o ICMS
-- realmente cobrado nesta nota, 0 no caso de CST 60) porque é um valor nocional:
-- a alíquota interna cheia do produto/UF, caso não houvesse substituição tributária.
-- Ver docs-fiscal-299/pendencias.md §2.7.
alter table naturezas_operacao_regras
  add column if not exists aliquota_icms_efetiva numeric,
  add column if not exists reducao_base_calculo_efetiva numeric;
