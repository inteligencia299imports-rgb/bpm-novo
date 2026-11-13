-- O texto livre "Observações para NF" do cadastro da financeira (SisFin) saiu em 13/11/2026.
-- A NF-e de venda do BPM agora monta sozinha "ALIENAÇÃO FIDUCIÁRIA <RAZÃO SOCIAL>" a partir de
-- formas_pagamento_contrato.cliente_fornecedor_id → clientes_fornecedores.nome_razao_social.
-- Aplicar SÓ depois do deploy do BPM e do SisFin (os fronts antigos ainda selecionam a coluna).
alter table public.formas_pagamento_instituicoes drop column if exists observacoes_contrato;
