-- Valor de quitação da moto do cliente (financiamento a quitar).
-- Opcional na avaliação; obrigatório no momento da aquisição (pode ser 0).
alter table public.avaliacoes add column if not exists valor_quitacao numeric;
