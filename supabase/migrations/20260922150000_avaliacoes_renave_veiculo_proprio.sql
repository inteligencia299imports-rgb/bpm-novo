-- Entrada RENAVE (SERPRO) de moto seminova como etapa do Pós-Compra.
-- codigo_seguranca_crv e tipo_crv sao campos do CRLV que a extracao por OCR
-- (extrair-dados-crlv) ainda nao captura -- ver README/plano da feature.
alter table avaliacoes
  add column if not exists codigo_seguranca_crv text,
  add column if not exists tipo_crv text,
  add column if not exists renave_id_estoque bigint,
  add column if not exists renave_estado text,
  add column if not exists renave_num_termo_entrada bigint,
  add column if not exists renave_ultimo_erro text,
  add column if not exists renave_atualizado_em timestamptz;

create index if not exists idx_avaliacoes_renave_id_estoque on avaliacoes(renave_id_estoque);

alter table renave_chamadas
  add column if not exists avaliacao_id uuid references avaliacoes(id) on delete set null;

create index if not exists idx_renave_chamadas_avaliacao_id on renave_chamadas(avaliacao_id);
