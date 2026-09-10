-- Data do pagamento por forma de pagamento do contrato de venda.
-- Informada pelo vendedor no ContratoDialog; vira `data_vencimento` da parcela do
-- compromisso a RECEBER gerado em emitir-nfe-compra (ramo `receber`). Vazio =
-- mantém o fallback atual (data de emissão da NF + 7 dias).
alter table public.formas_pagamento_contrato
  add column if not exists data_pagamento date;
