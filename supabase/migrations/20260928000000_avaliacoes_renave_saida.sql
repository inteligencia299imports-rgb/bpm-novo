-- Saída RENAVE de moto SEMINOVA vendida — etapa "SAÍDA RENAVE" do Pós-Venda.
-- Contraparte das colunas de entrada (20260922150000/20260923120000): o
-- estoque RENAVE da seminova vive em avaliacoes (renave_id_estoque), então a
-- saída grava ao lado, com colunas próprias pra não misturar com a entrada
-- (o ATPV-e da entrada e o da venda são documentos diferentes).
--   renave_saida_em              -> saída aceita pela SERPRO (/api/solicitacoes-saida-estoque)
--   renave_saida_atendimento_id  -> atendimento da venda que gerou a saída
--   renave_num_termo_saida       -> protocolo do termo de saída
--   renave_termo_saida_url       -> PDF do termo de saída (consulta separada)
--   renave_saida_atpv_numero/url -> ATPV-e da venda (gerado pelo RENAVE, sem assinaturas)
--   renave_nf_venda_vinculada_em -> NF-e de venda enviada (evento VENDA)
--   renave_saida_ultimo_erro     -> última falha da saída (não mistura com renave_ultimo_erro da entrada)
alter table avaliacoes
  add column if not exists renave_saida_em timestamptz,
  add column if not exists renave_saida_atendimento_id uuid references atendimentos_motos(id) on delete set null,
  add column if not exists renave_num_termo_saida bigint,
  add column if not exists renave_termo_saida_url text,
  add column if not exists renave_saida_atpv_numero text,
  add column if not exists renave_saida_atpv_url text,
  add column if not exists renave_nf_venda_vinculada_em timestamptz,
  add column if not exists renave_saida_ultimo_erro text;
