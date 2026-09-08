-- Limpeza única: remove as NF-e de entrada geradas em HOMOLOGAÇÃO pelo fluxo de
-- emissão do BPM (compra/consignação/venda). Só NF-e de PRODUÇÃO deve ser
-- exibida/contabilizada no SISFIN.
--
-- Discriminador: `ref_externa is not null` só é setado pela emissão via Focus
-- (edge function emitir-nfe-compra). As NF-e de ENTRADA importadas de
-- fornecedores (Ducati etc., via SISFIN) têm `ref_externa` nulo e NÃO são
-- tocadas aqui.
--
-- Também remove:
--  - os itens (nfe_itens) — CASCADE automático;
--  - os compromissos financeiros que essas NF-e de homologação criaram por
--    engano (registrarPosAutorizacao rodava para homologação antes da §2.14) e
--    suas parcelas (CASCADE);
--  - as entradas de status_history "NF emitida" órfãs;
--  - reabre a etapa de NF nos processos que ficaram concluídos por essas NF-e.

begin;

-- 1. Compromissos (e parcelas via CASCADE) presos às NF-e de homologação do BPM.
delete from compromissos c
using nfe_entradas n
where n.id = c.nfe_entrada_id
  and n.ref_externa is not null
  and n.ambiente = 'homologacao';

-- 2. As NF-e de homologação do BPM (nfe_itens via CASCADE;
--    estoque_motos_novas.nfe_item_id vira NULL via SET NULL).
delete from nfe_entradas
where ref_externa is not null
  and ambiente = 'homologacao';

-- 3. Histórico "NF emitida" órfão (mantém o "..._cancelada" da NF de produção).
delete from status_history
where entity_type = 'pos_venda'
  and status = 'nfe_venda_emitida'
  and entity_id = '1ba55d01-e308-4400-9688-f646a9a960f1';

delete from status_history
where entity_type = 'pos_compra'
  and status = 'nfe_compra_emitida'
  and entity_id = '0fbf23f2-5f0b-4ada-864a-a1a01472e5a7';

-- 4. Reabre a etapa de NF nos processos concluídos por NF-e de homologação.
update pos_venda_processos
set concluida = false, data_conclusao = null
where atendimento_id = '1ba55d01-e308-4400-9688-f646a9a960f1'
  and etapa = 'NF-E DE VENDA';

update pos_compra_processos
set concluida = false, data_conclusao = null
where avaliacao_id = '0fbf23f2-5f0b-4ada-864a-a1a01472e5a7'
  and etapa = 'NF EMITIDA';

-- 5. Backfill: compromissos de NF-e que JÁ estão canceladas mas cujo compromisso
--    ficou em aberto (a edge function passou a fazer isso automaticamente daqui
--    pra frente; aqui acerta o histórico).
update compromissos c
set status_compromisso = 'cancelada'
from nfe_entradas n
where n.id = c.nfe_entrada_id
  and n.status = 'cancelada'
  and c.deleted_at is null
  and c.status_compromisso <> 'cancelada';

update compromissos_parcelas p
set status_pagamento = 'cancelado', data_pagamento = null,
    forma_pagamento_id = null, valor_juros = 0, valor_desconto = 0
from compromissos c
join nfe_entradas n on n.id = c.nfe_entrada_id
where p.compromisso_id = c.id
  and n.status = 'cancelada'
  and c.deleted_at is null
  and p.status_pagamento <> 'pago';

commit;
