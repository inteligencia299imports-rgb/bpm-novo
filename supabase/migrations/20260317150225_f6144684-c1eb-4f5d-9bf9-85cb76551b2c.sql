-- Update avaliacoes check constraint to include 'dispensada' and 'perdido'
ALTER TABLE public.avaliacoes DROP CONSTRAINT avaliacoes_situacao_check;
ALTER TABLE public.avaliacoes ADD CONSTRAINT avaliacoes_situacao_check 
  CHECK (situacao = ANY (ARRAY['sem_avaliar'::text, 'em_aberto'::text, 'adquirida'::text, 'dispensada'::text, 'perdido'::text]));

-- Update atendimentos check constraint to include 'dispensada'
ALTER TABLE public.atendimentos DROP CONSTRAINT atendimentos_situacao_check;
ALTER TABLE public.atendimentos ADD CONSTRAINT atendimentos_situacao_check 
  CHECK (situacao = ANY (ARRAY['em_aberto'::text, 'pendente'::text, 'sinal'::text, 'perdido'::text, 'vendido'::text, 'dispensada'::text]));