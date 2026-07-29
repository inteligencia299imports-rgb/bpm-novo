ALTER TABLE public.pos_compra_processos
ADD COLUMN IF NOT EXISTS destino_transferencia text;

ALTER TABLE public.pos_compra_processos
DROP CONSTRAINT IF EXISTS pos_compra_processos_destino_transferencia_check;

ALTER TABLE public.pos_compra_processos
ADD CONSTRAINT pos_compra_processos_destino_transferencia_check
CHECK (destino_transferencia IS NULL OR destino_transferencia IN ('loja','novo_proprietario'));

-- Backfill: todos os registros existentes de TRANSFERÊNCIA CONCLUÍDA passam a ter destino = 'loja'
UPDATE public.pos_compra_processos
SET destino_transferencia = 'loja'
WHERE etapa = 'TRANSFERÊNCIA CONCLUÍDA'
  AND destino_transferencia IS NULL;