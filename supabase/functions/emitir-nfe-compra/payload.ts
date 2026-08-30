// Montagem do JSON da NF-e de entrada (compra de moto seminova) para a API Focus-NFe.
// Todos os codigos/regras fiscais vem de naturezas_operacao + naturezas_operacao_regras;
// aqui nao ha default de CFOP/CST/aliquota.

export interface DadosEmpresa {
  cnpj: string;
  regime_tributario: string | null;
  uf: string | null;
}

export interface DadosFornecedor {
  nome: string;
  cpf_cnpj: string;
  tipo_pessoa: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface DadosMoto {
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cilindrada: string | number | null;
  cor: string | null;
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
}

/** Espelha naturezas_operacao. */
export interface DadosNatureza {
  descricao: string;
  serie: string | null;
  tipo: string; // 'entrada' | 'saida'
  indicador_presenca: number | null;
  consumidor_final: boolean;
  operacao_devolucao: boolean;
  informacoes_complementares: string | null;
  informacoes_adicionais_fisco: string | null;
}

/** Espelha naturezas_operacao_regras (campos usados na montagem). */
export interface RegraFiscal {
  imposto: string;
  cfop: string | null;
  situacao_tributaria: string | null;
  aliquota: number | null;
  reducao_base_calculo: number | null;
  aliquota_fcp: number | null;
  tipo_tributacao: string | null;
  informacoes_complementares: string | null;
  informacoes_adicionais_fisco: string | null;
}

export interface MontarPayloadArgs {
  natureza: DadosNatureza;
  empresa: DadosEmpresa;
  fornecedor: DadosFornecedor;
  moto: DadosMoto;
  valor: number;
  regraIcms: RegraFiscal;
  regraPis: RegraFiscal;
  regraCofins: RegraFiscal;
  regraIpi: RegraFiscal | null;
  observacoes?: string | null;
}

const onlyDigits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const juntarInfos = (...partes: Array<string | null | undefined>) =>
  partes.map((p) => (p ?? '').trim()).filter(Boolean).join(' | ') || undefined;

/** NCM da motocicleta pela cilindrada (posicao 8711). */
export function ncmPorCilindrada(cc: string | number | null | undefined): string {
  const n = typeof cc === 'number' ? cc : parseInt(String(cc ?? '').replace(/\D/g, ''), 10);
  if (!n || Number.isNaN(n)) return '87119000';
  if (n <= 50) return '87111000';
  if (n <= 250) return '87112000';
  if (n <= 500) return '87113000';
  if (n <= 800) return '87114000';
  return '87115000';
}

export function descricaoItemMoto(m: DadosMoto): string {
  const partes = [
    'MOTOCICLETA',
    m.marca?.toUpperCase(),
    m.modelo?.toUpperCase(),
    m.ano_modelo ? `ANO ${m.ano_fabricacao ?? m.ano_modelo}/${m.ano_modelo}` : null,
    m.cor ? `COR ${m.cor.toUpperCase()}` : null,
    m.placa ? `PLACA ${m.placa.toUpperCase()}` : null,
    m.chassi ? `CHASSI ${m.chassi.toUpperCase()}` : null,
    m.renavam ? `RENAVAM ${onlyDigits(m.renavam)}` : null,
  ].filter(Boolean);
  return partes.join(' ');
}

export function montarPayloadNfeCompra(args: MontarPayloadArgs): Record<string, unknown> {
  const { natureza, empresa, fornecedor, moto, valor, regraIcms, regraPis, regraCofins, regraIpi, observacoes } = args;

  const pf = (fornecedor.tipo_pessoa ?? 'fisica') === 'fisica';
  const docForn = onlyDigits(fornecedor.cpf_cnpj);
  const valorFmt = Number(valor.toFixed(2));

  const cstIcms = String(regraIcms.situacao_tributaria);
  // Spec SEFAZ: CSOSN (Simples) tem 3 digitos; CST (regime normal) tem 2.
  const isCsosn = cstIcms.length === 3;
  const modalidadeBc = /^[0-3]$/.test(String(regraIcms.tipo_tributacao ?? '')) ? Number(regraIcms.tipo_tributacao) : 3;

  const item: Record<string, unknown> = {
    numero_item: 1,
    codigo_produto: (moto.placa || moto.chassi || 'MOTO').toUpperCase().replace(/\s/g, ''),
    descricao: descricaoItemMoto(moto),
    cfop: regraIcms.cfop,
    codigo_ncm: ncmPorCilindrada(moto.cilindrada),
    unidade_comercial: 'UN',
    quantidade_comercial: 1,
    valor_unitario_comercial: valorFmt,
    unidade_tributavel: 'UN',
    quantidade_tributavel: 1,
    valor_unitario_tributavel: valorFmt,
    valor_bruto: valorFmt,
    icms_origem: 0,
    inclui_no_total: 1,
    pis_situacao_tributaria: regraPis.situacao_tributaria,
    cofins_situacao_tributaria: regraCofins.situacao_tributaria,
  };
  if (regraPis.aliquota != null) { item.pis_aliquota_porcentual = Number(regraPis.aliquota); item.pis_base_calculo = 0; item.pis_valor = 0; }
  if (regraCofins.aliquota != null) { item.cofins_aliquota_porcentual = Number(regraCofins.aliquota); item.cofins_base_calculo = 0; item.cofins_valor = 0; }
  if (regraIpi) {
    item.ipi_situacao_tributaria = regraIpi.situacao_tributaria;
    if (regraIpi.aliquota != null) { item.ipi_aliquota_porcentual = Number(regraIpi.aliquota); item.ipi_valor = 0; }
  }

  item.icms_situacao_tributaria = cstIcms;
  if (!isCsosn) {
    item.icms_modalidade_base_calculo = modalidadeBc;
    item.icms_aliquota = Number(regraIcms.aliquota ?? 0);
    if (regraIcms.reducao_base_calculo != null) item.icms_reducao_base_calculo = Number(regraIcms.reducao_base_calculo);
    if (regraIcms.aliquota_fcp != null) item.fcp_aliquota = Number(regraIcms.aliquota_fcp);
    item.icms_base_calculo = 0;
    item.icms_valor = 0;
  }

  const entrada = natureza.tipo === 'entrada';

  return {
    natureza_operacao: natureza.descricao,
    serie: natureza.serie ?? undefined,
    data_emissao: new Date().toISOString(),
    data_entrada_saida: new Date().toISOString(),
    tipo_documento: entrada ? 0 : 1,
    finalidade_emissao: natureza.operacao_devolucao ? 4 : 1,
    consumidor_final: natureza.consumidor_final ? 1 : 0,
    presenca_comprador: natureza.indicador_presenca ?? undefined,
    modalidade_frete: 9,
    informacoes_adicionais_contribuinte: juntarInfos(
      natureza.informacoes_complementares,
      regraIcms.informacoes_complementares,
      observacoes ? observacoes.toUpperCase() : null,
    ),
    informacoes_adicionais_fisco: juntarInfos(
      natureza.informacoes_adicionais_fisco,
      regraIcms.informacoes_adicionais_fisco,
    ),

    cnpj_emitente: onlyDigits(empresa.cnpj),

    nome_destinatario: fornecedor.nome,
    [pf ? 'cpf_destinatario' : 'cnpj_destinatario']: docForn,
    indicador_inscricao_estadual_destinatario: 9,
    telefone_destinatario: onlyDigits(fornecedor.telefone) || undefined,
    logradouro_destinatario: fornecedor.logradouro || undefined,
    numero_destinatario: fornecedor.numero || 'S/N',
    complemento_destinatario: fornecedor.complemento || undefined,
    bairro_destinatario: fornecedor.bairro || undefined,
    municipio_destinatario: fornecedor.cidade || undefined,
    uf_destinatario: (fornecedor.uf || '').toUpperCase() || undefined,
    cep_destinatario: onlyDigits(fornecedor.cep) || undefined,
    pais_destinatario: 'Brasil',

    valor_frete: 0,
    valor_seguro: 0,
    valor_desconto: 0,
    valor_outras_despesas: 0,
    valor_produtos: valorFmt,
    valor_total: valorFmt,

    items: [item],
  };
}
