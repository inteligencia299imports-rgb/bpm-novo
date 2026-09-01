-- Formas de pagamento do contrato passam a referenciar a tabela formas_pagamento
-- (as opções exibidas são as com bpm = true). A escolha vira FK; `tipo` guarda o
-- nome da forma (denormalizado, p/ PDF e detecção de "Financiamento").

alter table public.formas_pagamento_contrato
  add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id);

alter table public.formas_pagamento_contrato alter column tipo drop not null;
