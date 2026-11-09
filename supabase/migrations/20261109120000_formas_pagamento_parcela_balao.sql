-- Parcela balão do financiamento na proposta/contrato de venda (ContratoDialog):
-- valor da última parcela maior, informado depois de "Valor Parcelas". Opcional.
alter table public.formas_pagamento_contrato add column if not exists parcela_balao numeric;

comment on column public.formas_pagamento_contrato.parcela_balao is
  'Financiamento: valor da parcela balão (opcional), exibido após Valor Parcelas na proposta/contrato de venda.';
