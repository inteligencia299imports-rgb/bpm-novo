-- Número da NF de entrada (a nota do fornecedor/fábrica que trouxe a moto 0km
-- pro estoque) — vai na descrição do item da NF-e de venda ("NF ENTRADA: ...",
-- infAdProd), pedido explícito do usuário em 2026-09-04.
alter table estoque_motos_novas
  add column if not exists numero_nf_entrada text;
