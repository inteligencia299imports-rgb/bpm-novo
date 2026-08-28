-- Reverte 20260828020000: a observacao da avaliacao (nota do avaliador
-- sobre a avaliacao comercial) passa a ser registrada em public.observacoes
-- (id_operacao = avaliacoes.id), no mesmo padrao ja usado para notas do
-- atendimento -- nao como coluna fixa e sobrescrevivel.
alter table public.avaliacoes drop column if exists observacao_avaliador;
