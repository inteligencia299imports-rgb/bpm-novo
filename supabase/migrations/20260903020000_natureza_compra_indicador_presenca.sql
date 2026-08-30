-- Indicador de presenca do comprador na natureza (vai p/ indPres da NF-e).
-- 0 = Nao se aplica (operacao de entrada / nota propria de compra).
update public.naturezas_operacao
set indicador_presenca = 0
where descricao = 'Compra de moto seminova'
  and indicador_presenca is null;
