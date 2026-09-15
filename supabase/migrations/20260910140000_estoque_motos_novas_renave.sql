-- RENAVE (Registro Nacional de Veículos em Estoque - SERPRO): rastreio do
-- veículo 0km no estoque RENAVE, da entrada em estoque (TEV) à saída/ATPV-e.
alter table estoque_motos_novas
  add column if not exists renave_id_estoque   bigint,      -- id do estoque no RENAVE (EstoqueJson.id)
  add column if not exists renave_estado       text,        -- SOLICITADO | TRANSFERIDO | CONFIRMADO | FINALIZADO
  add column if not exists renave_renavam      text,        -- renavam gerado/retornado pelo RENAVE
  add column if not exists renave_placa        text,
  add column if not exists renave_numero_crv   text,
  add column if not exists renave_tipo_crv     text,        -- AZUL | VERDE | BRANCO | DIGITAL
  add column if not exists renave_num_termo_entrada bigint, -- numeroTermoEntradaEstoque
  add column if not exists renave_num_termo_saida   bigint, -- numeroTermoSaidaEstoque
  add column if not exists renave_atpv_numero  text,        -- numeroAtpv
  add column if not exists renave_atpv_url     text,        -- storage do PDF do ATPV-e
  add column if not exists renave_ultimo_erro  text,
  add column if not exists renave_atualizado_em timestamptz;

create index if not exists idx_estoque_motos_novas_renave_id on estoque_motos_novas(renave_id_estoque);
