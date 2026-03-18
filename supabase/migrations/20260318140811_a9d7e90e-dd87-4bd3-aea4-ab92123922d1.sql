
ALTER TABLE public.atendimentos ADD COLUMN pos_venda_status text NOT NULL DEFAULT 'em_aberto';
ALTER TABLE public.avaliacoes ADD COLUMN pos_compra_status text NOT NULL DEFAULT 'em_aberto';
ALTER TABLE public.avaliacoes ADD COLUMN consignacao_status text NOT NULL DEFAULT 'em_aberto';
ALTER TABLE public.avaliacoes ADD COLUMN preparacao_status text NOT NULL DEFAULT 'em_aberto';
