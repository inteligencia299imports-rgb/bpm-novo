-- Devolve o campo de observacao do avaliador em avaliacoes (comentario do
-- avaliador sobre a avaliacao comercial), removido como "legado" na
-- migration 20260827040000. Diferente de avaliacoes.observacoes (nota
-- sobre a moto em si, ja restaurada em 20260828010000).
alter table public.avaliacoes add column if not exists observacao_avaliador text;
