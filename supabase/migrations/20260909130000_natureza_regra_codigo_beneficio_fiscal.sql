-- Código de Benefício Fiscal (NF-e prod/cBenef) na regra tributária.
-- Necessário para CST 20 (redução de base de cálculo) com benefício de UF —
-- ex.: venda de veículo usado no DF usa cBenef "DF816006"; sem ele a SEFAZ
-- rejeita a NF-e (594/598).
--
-- O dono do schema `naturezas_operacao*` é o SisFin; a coluna é adicionada aqui
-- pela necessidade do consumidor bpm-novo (emissão de NF-e de venda de moto
-- seminova). Registrado em docs-fiscal-299/regras-tributarias.md §2.1 e
-- pendencias.md para o SisFin expor no cadastro.
alter table public.naturezas_operacao_regras
  add column if not exists codigo_beneficio_fiscal text;

comment on column public.naturezas_operacao_regras.codigo_beneficio_fiscal is
  'cBenef da NF-e (código de benefício fiscal da UF). Usado na regra de ICMS '
  'quando o CST tem redução/benefício que a SEFAZ exige identificar. '
  'Ex.: "DF816006" (venda de veículo usado no DF).';
