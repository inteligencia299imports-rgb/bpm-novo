-- Cancelamento de NF-e autorizada (via Focus/SEFAZ). A linha continua em
-- nfe_entradas com status = 'cancelada'; guarda a justificativa (15–255 chars,
-- exigência da SEFAZ) e a data.
alter table nfe_entradas
  add column if not exists cancelamento_justificativa text,
  add column if not exists cancelada_em timestamptz;

comment on column nfe_entradas.cancelamento_justificativa is
  'Justificativa do cancelamento da NF-e junto à SEFAZ (15–255 caracteres).';
