-- natOp (ide/natOp da NF-e) por CFOP, não mais fixo por natureza de operação.
-- Uma natureza pode ter vários CFOPs (ex.: "Venda de moto 0km" tem 5102 e 5405,
-- dependendo de UF/substituição tributária) e cada CFOP tem seu próprio texto
-- padrão de natureza da operação — não faz sentido usar o mesmo texto genérico
-- pra CFOPs com semântica fiscal diferente.
--
-- Nullable: quando vazio, o consumidor cai no texto fixo da natureza
-- (naturezas_operacao.descricao), igual ao comportamento anterior.
alter table public.naturezas_operacao_regras
  add column if not exists natureza_operacao_descricao text;
