-- PDF do "Termo de Entrada em Estoque" (documento oficial, separado do
-- número de protocolo já gravado em renave_num_termo_entrada). Achado
-- 2026-09-22: a resposta da entrada em estoque só traz o número, o PDF vem
-- de GET /api/estoques/{idEstoque}/termo-entrada-estoque.
alter table avaliacoes
  add column if not exists renave_termo_entrada_url text;
