-- Valor de aquisição da moto conforme a NF-e de ENTRADA (compra de usado).
-- É o custo de aquisição fiscal usado na base da MARGEM de PIS/COFINS na revenda
-- (Lei 9.716/98 art. 5º) — distinto de `valor_fechamento`, que é o número interno
-- de negociação e alimenta o cálculo de repasse financeiro.
--
-- Preenchido pela emissão da NF-e de compra (`emitir-nfe-compra`, tipo 'compra')
-- e, para motos cuja NF de entrada foi emitida fora do sistema, por UPDATE.
alter table public.avaliacoes
  add column if not exists valor_nf_entrada numeric;

comment on column public.avaliacoes.valor_nf_entrada is
  'Valor do veículo na NF-e de entrada (compra de usado). Custo de aquisição '
  'fiscal para a margem de PIS/COFINS na revenda (Lei 9.716/98). Fallback: '
  'valor_fechamento.';
