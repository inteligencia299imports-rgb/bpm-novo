-- Remove atendimentos_motos.pos_venda_observacoes: as observacoes ja ficam
-- amarradas via public.observacoes.id_operacao = atendimentos_motos.id.
alter table public.atendimentos_motos drop column if exists pos_venda_observacoes;
