-- avaliacoes.numero_crv: "Número do CRV" (12 dígitos) extraído do CRLV.
-- Usado na consulta de aptidão RENAVE (parâmetro numeroCrv).

alter table public.avaliacoes
  add column if not exists numero_crv text;
