-- Corrige a parametrização fiscal de "Entrada em consignação" (naturezas_operacao +
-- naturezas_operacao_regras), cadastrada com valores placeholder que nunca haviam
-- sido validados pela SEFAZ. Base: NF-e nº 7040 série 1 (chave
-- 43260905564902000255550010000070401246715612), emitida pela Ducati POA
-- (Intercontinental Motorsport, CNPJ 05.564.902/0002-55) para a moto placa JBY3F72,
-- AUTORIZADA em produção (cStat 100) — natOp "Entrada mercadoria em consignacao",
-- CFOP 1917, ICMS90 (CST 90/modBC 3), PIS/COFINS Outr (CST 99), IBSCBS CST 410/
-- cClassTrib 410999, indPres 1, indFinal 1.
--
-- Os valores antigos (ICMS CST 41/isento, PIS/COFINS CST 70, IBSCBS CST 000,
-- indicador_presenca 0, consumidor_final false) nunca tinham sido testados em
-- homologação/produção — corrige as 4 empresas que já têm a natureza cadastrada
-- (FAG, Florianópolis, MMATOS, Porto Alegre) para o padrão comprovado.

update naturezas_operacao
set consumidor_final = true,
    indicador_presenca = 1
where descricao = 'Entrada em consignação';

update naturezas_operacao_regras
set situacao_tributaria = '90',
    tipo_tributacao = '3'
where imposto = 'icms'
  and natureza_operacao_id in (
    select id from naturezas_operacao where descricao = 'Entrada em consignação'
  );

update naturezas_operacao_regras
set situacao_tributaria = '99'
where imposto in ('pis', 'cofins')
  and natureza_operacao_id in (
    select id from naturezas_operacao where descricao = 'Entrada em consignação'
  );

update naturezas_operacao_regras
set situacao_tributaria = '410',
    classificacao_tributaria = '410999',
    cbs_aliquota = null,
    ibs_uf_aliquota = null,
    ibs_mun_aliquota = null,
    percentual_reducao = null
where imposto = 'ibscbs'
  and natureza_operacao_id in (
    select id from naturezas_operacao where descricao = 'Entrada em consignação'
  );
