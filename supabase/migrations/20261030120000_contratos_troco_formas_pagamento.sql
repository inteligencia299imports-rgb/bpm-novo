-- Troco ao cliente vindo das formas de pagamento: o que as formas passam do Valor Total da
-- proposta de venda. Gravado pela tela do contrato (ContratoDialog) e somado aos agregados de
-- troco no compromisso a pagar TRC-D (edge gerar-compromissos-proposta). Pedido do usuário,
-- 2026-10-30.
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS troco_formas_pagamento numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.contratos.troco_formas_pagamento IS
  'Sobra das formas de pagamento sobre o Valor Total (troco ao cliente); soma no compromisso TRC-D.';
