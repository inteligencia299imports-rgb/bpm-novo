-- Change defaults from false to NULL
ALTER TABLE public.motos_avaliacao ALTER COLUMN tem_manual SET DEFAULT NULL;
ALTER TABLE public.motos_avaliacao ALTER COLUMN tem_chave_reserva SET DEFAULT NULL;
ALTER TABLE public.motos_avaliacao ALTER COLUMN manutencao_vencida SET DEFAULT NULL;

-- Convert existing false values to NULL (treat as "not filled")
UPDATE public.motos_avaliacao SET tem_manual = NULL WHERE tem_manual = false;
UPDATE public.motos_avaliacao SET tem_chave_reserva = NULL WHERE tem_chave_reserva = false;
UPDATE public.motos_avaliacao SET manutencao_vencida = NULL WHERE manutencao_vencida = false;