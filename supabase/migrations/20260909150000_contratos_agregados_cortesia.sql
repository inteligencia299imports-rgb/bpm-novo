-- Agregado "Cortesia": item dado como cortesia ao cliente, nunca cobrado.
-- Não entra no total de agregados nem em nenhum cálculo do contrato — só
-- aparece listado (com o valor de referência) e no PDF marcado como cortesia.
alter table contratos_agregados
  add column if not exists cortesia boolean not null default false;
