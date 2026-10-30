-- BIN liberada pela montadora (Ducati) para a moto 0km. Antes só existia na planilha de estoque
-- das lojas (BSB/FLN/POA). Exibido no card do Estoque e no relatório de estoque. Pedido do
-- usuário, 2026-10-30.
ALTER TABLE public.estoque_motos_novas
  ADD COLUMN IF NOT EXISTS bin_liberada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.estoque_motos_novas.bin_liberada IS
  'BIN liberada pela montadora (planilha de estoque 0km).';
