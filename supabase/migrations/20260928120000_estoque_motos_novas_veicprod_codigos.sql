-- Campos do grupo veicProd da NF-e que hoje são hardcoded no payload
-- (emitir-nfe-compra/payload.ts, veiculoProdMoto) e não variam por unidade —
-- mas o DETRAN está rejeitando transferência em algumas motos, então passam
-- a ser cadastráveis por unidade (mesmo padrão de potencia_motor/codigo_cor_*).
-- Default = valor que já estava fixo no código, pra não mudar nada em quem
-- não precisar ajustar.
alter table estoque_motos_novas
  add column if not exists tipo_operacao text not null default '1',        -- tpOp
  add column if not exists condicao_veiculo text not null default '1',      -- condVeic
  add column if not exists tipo_combustivel text not null default '02',     -- tpComb
  add column if not exists especie_veiculo text not null default '1',       -- espVeic
  add column if not exists tipo_veiculo text not null default '04',         -- tpVeic (tabela RENAVAM)
  add column if not exists codigo_vin text not null default 'N',            -- VIN
  add column if not exists restricao_veiculo text not null default '0',     -- tpRest
  add column if not exists tipo_pintura text not null default 'A';          -- tpPint
