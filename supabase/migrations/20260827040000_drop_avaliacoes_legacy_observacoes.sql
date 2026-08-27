-- Remove legacy single-field observation columns from avaliacoes.
-- Replaced by the observacoes_processo table (entity_id/entity_type pattern),
-- already wired into AvaliacaoForm/ConsignacaoProcessoDialog/PosCompraProcessoDialog.
ALTER TABLE public.avaliacoes
  DROP COLUMN IF EXISTS observacao_avaliador,
  DROP COLUMN IF EXISTS pos_compra_observacoes,
  DROP COLUMN IF EXISTS consignacao_observacoes,
  DROP COLUMN IF EXISTS observacoes;
