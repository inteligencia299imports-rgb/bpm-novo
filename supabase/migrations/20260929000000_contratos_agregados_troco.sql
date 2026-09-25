-- Agregado marcado como "troco": não cobrado do cliente (igual cortesia),
-- mas ao contrário da cortesia, gera compromisso financeiro de conta a pagar
-- (o troco é dinheiro devido ao cliente, não um serviço de graça).
alter table contratos_agregados
  add column if not exists troco boolean not null default false;
