-- =====================================================================
-- Remove atendimentos_motos.valor_venda / data_venda / valor_sinal.
-- Esses valores passam a vir de estoque (ja existem la: estoque.valor_venda,
-- estoque.data_venda, e o equivalente de sinal). Preparada mas NAO aplicada
-- ainda -- rodar apenas depois que todo o codigo (frontend + funcoes SQL de
-- relatorio, que hoje leem a.valor_venda como fallback) for atualizado para
-- ler exclusivamente de estoque.
-- =====================================================================

alter table public.atendimentos_motos drop column if exists valor_venda;
alter table public.atendimentos_motos drop column if exists data_venda;
alter table public.atendimentos_motos drop column if exists valor_sinal;
