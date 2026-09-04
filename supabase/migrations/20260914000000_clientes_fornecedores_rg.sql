-- RG do cliente (pessoa física) — usado nas Informações Complementares da NF-e de venda.
-- Texto livre (número + órgão emissor, ex.: "12.345.678-9 SSP/SP"), sem máscara/validação.
alter table public.clientes_fornecedores
  add column if not exists rg text;
