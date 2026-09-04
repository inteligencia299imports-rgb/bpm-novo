-- Tipo de atendimento (presencial/online/ambos) como mais um critério de match do
-- CFOP/regra de ICMS — junto com destino_ufs e produto_tipo. Reflete a decisão de
-- que "qual CFOP usar" pode depender de a venda ter sido presencial ou online (nem
-- toda regra se aplica aos dois); indPres deixa de vir de um cálculo à parte no
-- consumidor e volta a sair da própria regra escolhida (naturezas_operacao_regras
-- .indicador_presenca), igual CST/CFOP/natOp já funcionam.
--
-- Default 'ambos' = mesmo comportamento de hoje pra toda regra existente (nenhuma
-- é descartada pelo novo filtro até alguém restringir explicitamente pra
-- 'presencial' ou 'online').
alter table public.naturezas_operacao_regras
  add column if not exists tipo_atendimento text not null default 'ambos';

alter table public.naturezas_operacao_regras
  drop constraint if exists naturezas_operacao_regras_tipo_atendimento_check;
alter table public.naturezas_operacao_regras
  add constraint naturezas_operacao_regras_tipo_atendimento_check
  check (tipo_atendimento in ('presencial', 'online', 'ambos'));
