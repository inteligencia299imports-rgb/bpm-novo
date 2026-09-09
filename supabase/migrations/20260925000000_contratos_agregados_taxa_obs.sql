-- Campos extras por agregado do contrato de venda:
--  observacoes:       texto livre, disponível para todo agregado.
--  taxa_retorno_pct:  taxa de retorno em % — usada no agregado "Financiamento TIF".
alter table contratos_agregados
  add column if not exists observacoes text,
  add column if not exists taxa_retorno_pct numeric;
