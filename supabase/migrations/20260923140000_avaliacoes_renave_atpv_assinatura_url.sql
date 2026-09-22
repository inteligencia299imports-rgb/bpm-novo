-- Guarda o arquivo anexado da assinatura do vendedor (foto/P7S) pra poder
-- reabrir/baixar depois, no mesmo padrão de crlv_url. Separado de
-- renave_atpv_assinatura_enviada_em: a URL fica gravada assim que o upload
-- pro storage termina, o timestamp só quando a SERPRO confirma o envio.
alter table avaliacoes
  add column if not exists renave_atpv_assinatura_url text;
