-- =====================================================================
-- avaliacoes.observacao_avaliador: observação escrita no momento de fazer
-- (ou editar) a avaliação comercial. Substitui o uso da tabela genérica
-- public.observacoes para essa nota específica -- agora ela vive na própria
-- linha da avaliação e aparece no pop-up "Avaliação Comercial" como
-- "Observação do Avaliador".
-- =====================================================================

alter table public.avaliacoes
  add column if not exists observacao_avaliador text;
