-- Add NPS tracking fields to avaliacoes for acquisition NPS
ALTER TABLE public.avaliacoes 
ADD COLUMN nps_status text NOT NULL DEFAULT 'em_aberto',
ADD COLUMN nps_enviado_at timestamp with time zone,
ADD COLUMN nps_respondido_at timestamp with time zone;