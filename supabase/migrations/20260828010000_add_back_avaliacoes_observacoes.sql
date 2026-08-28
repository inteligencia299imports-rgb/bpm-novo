-- Devolve o campo de observacao da moto em avaliacoes. Diferente de
-- observacao_avaliador/pos_compra_observacoes/consignacao_observacoes
-- (removidos como legado), este e um campo unico pertencente a propria
-- moto, preenchido no cadastro (trocar/vender) e editavel dai em diante.
-- Nao usa a tabela public.observacoes (essa e para notas do atendimento).
alter table public.avaliacoes add column if not exists observacoes text;
