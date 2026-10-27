-- Data em que o vendedor assinou o ATPV-e da moto comprada (lida pela IA no
-- anexo do ATPV, editável na Entrada RENAVE). Vai como data da compra na
-- entrada do RENAVE — exigência do despachante (2026-10-27).
alter table public.avaliacoes add column if not exists atpv_data_assinatura date;

comment on column public.avaliacoes.atpv_data_assinatura is
  'Data da assinatura do vendedor no ATPV-e (IA ao anexar o ATPV / Entrada RENAVE); usada como dataCompra na entrada do RENAVE.';
