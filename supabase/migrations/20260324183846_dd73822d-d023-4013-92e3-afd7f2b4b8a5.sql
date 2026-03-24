ALTER TABLE public.motos_avaliacao
  ADD COLUMN tem_manual boolean DEFAULT false,
  ADD COLUMN tem_chave_reserva boolean DEFAULT false,
  ADD COLUMN manutencao_em_dia boolean DEFAULT false;