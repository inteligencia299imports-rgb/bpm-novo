-- Pedido do usuário, 2026-09-30: reverte o campo manual "em_demonstracao"
-- (migration 20260930120000) — não precisava de conceito/tela separados
-- pra demonstração, o processo reaproveita a Transferência de Estoque
-- (mesma saída, cancelável do mesmo jeito; ver emitir-nfe-compra
-- acao='vincular_transferencia_saida').
ALTER TABLE estoque_motos_novas
  DROP COLUMN IF EXISTS em_demonstracao,
  DROP COLUMN IF EXISTS demonstracao_observacao;
