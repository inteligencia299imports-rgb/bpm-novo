ALTER TABLE public.atendimentos 
ADD COLUMN intermediacao_parte1_status text NOT NULL DEFAULT 'em_aberto',
ADD COLUMN intermediacao_parte2_status text NOT NULL DEFAULT 'em_aberto';