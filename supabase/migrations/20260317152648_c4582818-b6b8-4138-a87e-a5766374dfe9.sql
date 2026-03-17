-- Add nps_status column to atendimentos for tracking NPS survey status
ALTER TABLE public.atendimentos 
ADD COLUMN nps_status text NOT NULL DEFAULT 'em_aberto';

-- Add nps_enviado_at and nps_respondido_at timestamps
ALTER TABLE public.atendimentos 
ADD COLUMN nps_enviado_at timestamp with time zone,
ADD COLUMN nps_respondido_at timestamp with time zone;