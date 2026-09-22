-- Entrada RENAVE de seminova (veículo próprio) — passos 1/2/5 da sequência real
-- da SERPRO (confirmado no OpenAPI oficial, grupo Estabelecimento):
--   1. Download ATPV-e (pdf-atpv)          -> renave_atpv_numero/renave_atpv_url
--   2. Enviar ATPV-e assinado pelo vendedor -> renave_atpv_assinatura_enviada_em
--   3. Termo de entrada do estoque (já existia: renave_id_estoque/renave_estado)
--   4. Enviar chave NF-e (já automático após o passo 3)
--   5. Download CRLV-e (crlve)              -> renave_crlve_url
-- Achado 2026-09-23: a SERPRO rejeita a entrada (passo 3) enquanto o
-- proprietário do veículo no RENAVAM ainda for o CPF do vendedor -- é a
-- assinatura do passo 2 que efetiva a transferência pro CNPJ do
-- estabelecimento. Por isso a ordem 1->2->3 importa.
alter table avaliacoes
  add column if not exists renave_atpv_numero text,
  add column if not exists renave_atpv_url text,
  add column if not exists renave_atpv_assinatura_enviada_em timestamptz,
  add column if not exists renave_crlve_url text;
