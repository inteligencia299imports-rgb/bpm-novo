-- Pedido do usuário, 2026-09-29: nova opção "Acessórios" nas informações da
-- moto do cliente (trocar/vender), no mesmo padrão de tem_manual/
-- tem_chave_reserva (Sim/Não) — com um campo de texto livre quando Sim,
-- descrevendo os acessórios.
ALTER TABLE avaliacoes
  ADD COLUMN IF NOT EXISTS tem_acessorios boolean,
  ADD COLUMN IF NOT EXISTS acessorios_descricao text;
