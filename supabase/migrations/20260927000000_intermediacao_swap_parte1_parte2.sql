-- Inverte o significado de "Parte 1" e "Parte 2" na Intermediação: o que era
-- Parte 1 (pagamento ao consignante) passa a ser Parte 2, e o que era Parte 2
-- (devolução simbólica/compra + documentação/transferência) passa a ser
-- Parte 1. Rename de coluna preserva os dados existentes (só troca o nome).
alter table public.atendimentos_motos
  rename column intermediacao_parte1_status to intermediacao_parte_swap_tmp_status;
alter table public.atendimentos_motos
  rename column intermediacao_parte2_status to intermediacao_parte1_status;
alter table public.atendimentos_motos
  rename column intermediacao_parte_swap_tmp_status to intermediacao_parte2_status;
