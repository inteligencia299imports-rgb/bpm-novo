-- Vinculo entre a NF-e de saida e a NF-e de entrada de uma transferencia de
-- estoque entre empresas (duas notas espelhadas, uma por lado).
alter table nfe_entradas
  add column if not exists transferencia_par_id uuid references nfe_entradas(id) on delete set null;

create index if not exists idx_nfe_entradas_transferencia_par on nfe_entradas(transferencia_par_id);
