-- Parametrização fiscal da "Devolução Simbólica de Consignação" (saída, CFOP
-- 5918/6918, referenciando a NF de entrada em consignação via NFref/refNFe) —
-- 1º passo para transformar consignação em compra (moto consignada que recebeu
-- comprador e precisa virar estoque próprio antes da venda).
--
-- Sem XML de referência autorizado ainda: parametrizado com o padrão nacional,
-- espelhando os códigos já validados pela SEFAZ na "Entrada em consignação"
-- (CST 90/isento, PIS/COFINS Outr CST 99, IBS/CBS CST 410/cClassTrib 410999,
-- indPres 1, indFinal 1) — fica travado em PRODUÇÃO até uma emissão de teste
-- autorizada em HOMOLOGAÇÃO confirmar os códigos (mesmo mecanismo genérico do
-- edge function: produção só libera depois de homologação autorizada).
--
-- Aplica às mesmas 4 empresas que já têm "Entrada em consignação" cadastrada.

insert into naturezas_operacao
  (empresa_id, descricao, serie, tipo, indicador_presenca, consumidor_final, operacao_devolucao, faturada, operacao_garantia, ativo)
select e.id, 'Devolução Simbólica de Consignação', '1', 'saida', 1, true, true, true, false, true
from empresas e
where e.id in (
  '30496c3b-721f-4795-98fd-2785d3821f3b', -- FAG (DF)
  'ae6edb42-e3ac-4390-baae-269844701031', -- Florianópolis (SC)
  'd3a6370f-31fa-465c-8ff2-8a0dd1f310b0', -- MMATOS (DF)
  '3530fd65-62f8-4be3-b41d-8b3d4a22b63b'  -- Porto Alegre / Ducati (RS)
)
and not exists (
  select 1 from naturezas_operacao no
  where no.empresa_id = e.id and no.descricao = 'Devolução Simbólica de Consignação'
);

-- ICMS: CFOP 5918 dentro do estado da empresa, 6918 pra fora (curinga, destino_ufs vazio).
insert into naturezas_operacao_regras (natureza_operacao_id, imposto, cfop, situacao_tributaria, tipo_tributacao, aliquota, destino_ufs, ordem)
select no.id, 'icms', '5918', '90', '3', 0, array[e.uf], 0
from naturezas_operacao no
join empresas e on e.id = no.empresa_id
where no.descricao = 'Devolução Simbólica de Consignação'
and not exists (select 1 from naturezas_operacao_regras r where r.natureza_operacao_id = no.id and r.imposto = 'icms' and r.cfop = '5918');

insert into naturezas_operacao_regras (natureza_operacao_id, imposto, cfop, situacao_tributaria, tipo_tributacao, aliquota, destino_ufs, ordem)
select no.id, 'icms', '6918', '90', '3', 0, array[]::text[], 1
from naturezas_operacao no
where no.descricao = 'Devolução Simbólica de Consignação'
and not exists (select 1 from naturezas_operacao_regras r where r.natureza_operacao_id = no.id and r.imposto = 'icms' and r.cfop = '6918');

insert into naturezas_operacao_regras (natureza_operacao_id, imposto, situacao_tributaria, aliquota, destino_ufs, ordem)
select no.id, 'pis', '99', 0, array[]::text[], 0
from naturezas_operacao no
where no.descricao = 'Devolução Simbólica de Consignação'
and not exists (select 1 from naturezas_operacao_regras r where r.natureza_operacao_id = no.id and r.imposto = 'pis');

insert into naturezas_operacao_regras (natureza_operacao_id, imposto, situacao_tributaria, aliquota, destino_ufs, ordem)
select no.id, 'cofins', '99', 0, array[]::text[], 0
from naturezas_operacao no
where no.descricao = 'Devolução Simbólica de Consignação'
and not exists (select 1 from naturezas_operacao_regras r where r.natureza_operacao_id = no.id and r.imposto = 'cofins');

insert into naturezas_operacao_regras (natureza_operacao_id, imposto, situacao_tributaria, classificacao_tributaria, destino_ufs, ordem)
select no.id, 'ibscbs', '410', '410999', array[]::text[], 0
from naturezas_operacao no
where no.descricao = 'Devolução Simbólica de Consignação'
and not exists (select 1 from naturezas_operacao_regras r where r.natureza_operacao_id = no.id and r.imposto = 'ibscbs');
