-- A Taxa de Retorno passou para a forma de pagamento Financiamento
-- (formas_pagamento_contrato.taxa_retorno_pct, migration 20260910120000).
-- A coluna no agregado não é mais usada por nenhum consumidor e está vazia.
alter table contratos_agregados
  drop column if exists taxa_retorno_pct;
