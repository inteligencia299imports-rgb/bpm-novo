-- Pedido do usuário, 2026-09-30: motos 0km que saem em NF de demonstração
-- (CFOP 2912/6912, cadastro fiscal já feito no SisFin — ver docs-fiscal-299
-- §2.71) continuam no estoque da empresa de origem e podem ser vendidas por
-- ela normalmente ("estoque negativo" até a NF de retorno da demonstração
-- ser emitida). A NF de demonstração em si não é emitida pelo bpm-novo —
-- só precisa de um aviso visual/manual no Estoque, sem mexer em status,
-- loja_id ou bloquear a venda.
ALTER TABLE estoque_motos_novas
  ADD COLUMN IF NOT EXISTS em_demonstracao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demonstracao_observacao text;
