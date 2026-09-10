-- Taxa de retorno (%) passa a ser informada na FORMA DE PAGAMENTO "Financiamento"
-- (antes ficava no agregado "Financiamento TIF" — contratos_agregados.taxa_retorno_pct,
-- que continua existindo mas deixa de ser usado).
alter table formas_pagamento_contrato
  add column if not exists taxa_retorno_pct numeric;
