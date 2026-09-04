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
  /** RG (pessoa física), texto livre — só entra nas informações complementares em venda. */
  rg?: string | null;
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
  /** NCM explicito (moto 0km cadastrada). Sem isto, deriva pela cilindrada. */
  ncm?: string | null;
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
  /** Texto de ide/natOp específico deste CFOP (regra de ICMS). Vazio -> cai no
   * texto fixo da natureza (natureza.descricao) — ver montarPayloadNfeCompra. */
  natureza_operacao_descricao?: string | null;
  /** ide/indPres desta regra (ICMS ou IPI). Vazio -> cai na regra seguinte na
   * cadeia de fallback, e por fim em natureza.indicador_presenca. */
  indicador_presenca?: number | null;
  // Grupo "ICMS Efetivo" (pICMSEfet/vBCEfet/pRedBCEfet/vICMSEfet) — obrigatório pela
  // SEFAZ (rejeição 906) quando CST 60 ou CSOSN 500 + consumidor final. Preenchidos
  // só na regra de ICMS quando aplicável.
  aliquota_icms_efetiva?: number | null;
  reducao_base_calculo_efetiva?: number | null;
  // Reforma Tributária — preenchidos apenas na linha imposto === 'ibscbs'.
  classificacao_tributaria?: string | null; // cClassTrib
  cbs_aliquota?: number | null;
  ibs_uf_aliquota?: number | null;
  ibs_mun_aliquota?: number | null;
  percentual_reducao?: number | null;
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
  /** Grupo IBS/CBS (Reforma Tributária). Obrigatório p/ emitente CRT 3 em homologação. */
  regraIbsCbs: RegraFiscal | null;
  observacoes?: string | null;
  /** Nome do vendedor do atendimento (venda) — entra nas informações complementares. */
  vendedorNome?: string | null;
  /** Formas de pagamento do contrato, já formatadas ("PIX R$ 100,00 * CONSÓRCIO R$ 200,00"). */
  formasPagamentoTexto?: string | null;
}

const onlyDigits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const juntarInfos = (...partes: Array<string | null | undefined>) =>
  partes.map((p) => (p ?? '').trim()).filter(Boolean).join(' | ') || undefined;

/**
 * Data/hora atual no fuso de Brasília (UTC-3, sem horário de verão desde 2019),
 * no formato ISO com offset explícito: 2026-08-31T23:43:50-03:00.
 *
 * IMPORTANTE: não usar `new Date().toISOString()` (UTC) para a data de emissão —
 * perto da meia-noite (BRT) o UTC já virou o dia/mês, e o AAMM da chave de acesso
 * fica divergente do mês da dhEmi, causando rejeição SEFAZ cStat 253
 * ("Dígito Verificador da chave de acesso composta inválida").
 */
export function nowBrasiliaIso(d: Date = new Date()): string {
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().replace(/\.\d{3}Z$/, '').replace(/Z$/, '') + '-03:00';
}

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

// xProd da NF-e tem limite de 120 caracteres. Monta a descrição por prioridade
// (identificadores do veículo primeiro) e para de adicionar quando não couber.
const XPROD_MAX = 120;
export function descricaoItemMoto(m: DadosMoto): string {
  const base = ['MOTOCICLETA', m.marca?.toUpperCase(), m.modelo?.toUpperCase()]
    .filter(Boolean).join(' ').slice(0, XPROD_MAX);
  // ordem de prioridade para o que sobra do limite:
  const extras = [
    m.chassi ? `CHASSI ${m.chassi.toUpperCase()}` : null,
    m.placa ? `PLACA ${m.placa.toUpperCase()}` : null,
    m.renavam ? `RENAVAM ${onlyDigits(m.renavam)}` : null,
    m.ano_modelo ? `ANO ${m.ano_fabricacao ?? m.ano_modelo}/${m.ano_modelo}` : null,
    m.cor ? `COR ${m.cor.toUpperCase()}` : null,
  ].filter(Boolean) as string[];

  let out = base;
  for (const parte of extras) {
    if (out.length + 1 + parte.length <= XPROD_MAX) out = `${out} ${parte}`;
  }
  return out;
}

export function montarPayloadNfeCompra(args: MontarPayloadArgs): Record<string, unknown> {
  const { natureza, empresa, fornecedor, moto, valor, regraIcms, regraPis, regraCofins, regraIpi, regraIbsCbs, observacoes, vendedorNome, formasPagamentoTexto } = args;

  const pf = (fornecedor.tipo_pessoa ?? 'fisica') === 'fisica';
  const docForn = onlyDigits(fornecedor.cpf_cnpj);
  const valorFmt = Number(valor.toFixed(2));
  const r2 = (n: number) => Number(n.toFixed(2));

  const cstIcms = String(regraIcms.situacao_tributaria);
  // Spec SEFAZ: CSOSN (Simples) tem 3 digitos; CST (regime normal) tem 2.
  const isCsosn = cstIcms.length === 3;
  const modalidadeBc = /^[0-3]$/.test(String(regraIcms.tipo_tributacao ?? '')) ? Number(regraIcms.tipo_tributacao) : 3;

  const item: Record<string, unknown> = {
    numero_item: 1,
    codigo_produto: (moto.placa || moto.chassi || 'MOTO').toUpperCase().replace(/\s/g, ''),
    descricao: descricaoItemMoto(moto),
    cfop: regraIcms.cfop,
    codigo_ncm: (moto.ncm && onlyDigits(moto.ncm).length === 8 ? onlyDigits(moto.ncm) : ncmPorCilindrada(moto.cilindrada)),
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
  // CST 60 (ICMS ja retido antes por substituicao tributaria) NAO tem grupo de
  // calculo normal no XSD da NF-e (o tipo TICMS60 nao declara modBC/pICMS/vBC/
  // vICMS — só orig/CST + o grupo ICMS-ST-retido opcional + o grupo "ICMS
  // Efetivo" abaixo). Mandar esses campos aqui insere elementos que o XSD nao
  // espera dentro de <ICMS60>, o que quebra a validacao da sequencia mais
  // adiante — foi a causa real do erro "vBCEfet not expected, expected
  // vBCSTRet/vBCFCPSTRet/pRedBCEfet" (nao era o pRedBCEfet em si).
  const semCalculoIcmsNormal = cstIcms === '60';
  if (!isCsosn && !semCalculoIcmsNormal) {
    item.icms_modalidade_base_calculo = modalidadeBc;
    item.icms_aliquota = Number(regraIcms.aliquota ?? 0);
    if (regraIcms.reducao_base_calculo != null) item.icms_reducao_base_calculo = Number(regraIcms.reducao_base_calculo);
    if (regraIcms.aliquota_fcp != null) item.fcp_aliquota = Number(regraIcms.aliquota_fcp);
    item.icms_base_calculo = 0;
    item.icms_valor = 0;
  }

  // --- Grupo "ICMS Efetivo" (CST 60 / CSOSN 500) --------------------------
  // Obrigatório pela SEFAZ (rejeição 906) quando a operação é para consumidor
  // final (natureza.consumidor_final) e o ICMS já foi retido antes por
  // substituição tributária — é a alíquota interna "cheia" do produto/UF,
  // nocional, caso não houvesse ST (não é o `icms_aliquota` do bloco de cima,
  // que sequer é enviado nesse CST). Vem da regra de ICMS
  // (aliquota_icms_efetiva) — sem valor cadastrado, não envia o grupo (evita
  // mandar zero por engano). `icms_reducao_base_calculo_efetiva` vai sempre
  // (0 quando não há redução) — é opcional pra SEFAZ mas mantém a mesma forma
  // do XML de referência que autorizou de verdade em produção.
  if ((cstIcms === '60' || cstIcms === '500') && natureza.consumidor_final && regraIcms.aliquota_icms_efetiva != null) {
    const redEfet = Number(regraIcms.reducao_base_calculo_efetiva ?? 0);
    const baseEfet = redEfet > 0 ? r2(valorFmt * (1 - redEfet / 100)) : valorFmt;
    const aliqEfet = Number(regraIcms.aliquota_icms_efetiva);
    item.icms_reducao_base_calculo_efetiva = redEfet;
    item.icms_base_calculo_efetiva = baseEfet;
    item.icms_aliquota_efetiva = aliqEfet;
    item.icms_valor_efetivo = r2(baseEfet * (aliqEfet / 100));
  }

  // --- Grupo IBS/CBS (Reforma Tributária) ---------------------------------
  // Obrigatório para emitente CRT 3 em homologação desde 01/07/2026 (cStat 1115).
  // CST/cClassTrib e alíquotas vêm da regra 'ibscbs' da natureza (a validar com a contabilidade).
  if (regraIbsCbs?.situacao_tributaria) {
    const baseRtc = valorFmt;
    const red = Number(regraIbsCbs.percentual_reducao ?? 0);
    const fatorRed = red > 0 ? 1 - red / 100 : 1;
    const cbsAliq = Number(regraIbsCbs.cbs_aliquota ?? 0);
    const ibsUfAliq = Number(regraIbsCbs.ibs_uf_aliquota ?? 0);
    const ibsMunAliq = Number(regraIbsCbs.ibs_mun_aliquota ?? 0);

    item.ibs_cbs_situacao_tributaria = regraIbsCbs.situacao_tributaria;
    if (regraIbsCbs.classificacao_tributaria) {
      item.ibs_cbs_classificacao_tributaria = regraIbsCbs.classificacao_tributaria;
    }
    item.ibs_cbs_base_calculo = baseRtc;
    if (red > 0) {
      item.cbs_percentual_reducao_aliquota = red;
      item.ibs_uf_percentual_reducao_aliquota = red;
      item.ibs_mun_percentual_reducao_aliquota = red;
    }
    item.cbs_aliquota = cbsAliq;
    item.cbs_valor = r2(baseRtc * (cbsAliq / 100) * fatorRed);
    item.ibs_uf_aliquota = ibsUfAliq;
    item.ibs_uf_valor = r2(baseRtc * (ibsUfAliq / 100) * fatorRed);
    item.ibs_mun_aliquota = ibsMunAliq;
    item.ibs_mun_valor = r2(baseRtc * (ibsMunAliq / 100) * fatorRed);
  }

  const entrada = natureza.tipo === 'entrada';

  const agora = nowBrasiliaIso();

  const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Venda: valor do IBS/CBS, vendedor, RG e formas de pagamento também entram nas
  // informações complementares — não são default de código, são dados da própria
  // venda (calculados acima ou vindos do atendimento/contrato).
  const valorIbsCbs = regraIbsCbs?.situacao_tributaria
    ? `VALOR DO IBS ${fmtBRL(Number(item.ibs_uf_valor ?? 0) + Number(item.ibs_mun_valor ?? 0))} * VALOR DA CBS ${fmtBRL(Number(item.cbs_valor ?? 0))}`
    : null;

  return {
    // ide/natOp: prioriza o texto específico do CFOP escolhido (regra de ICMS) —
    // uma mesma natureza pode ter CFOPs com semântica fiscal diferente (ex.: venda
    // comum x sujeita a ST). Cai no texto fixo da natureza se a regra não tiver.
    natureza_operacao: regraIcms.natureza_operacao_descricao?.trim() || natureza.descricao,
    serie: natureza.serie ?? undefined,
    data_emissao: agora,
    data_entrada_saida: agora,
    tipo_documento: entrada ? 0 : 1,
    finalidade_emissao: natureza.operacao_devolucao ? 4 : 1,
    consumidor_final: natureza.consumidor_final ? 1 : 0,
    // ide/indPres: mesma cadeia de fallback do CST/natOp — regra de ICMS escolhida,
    // senão a de IPI escolhida, senão o cabeçalho da natureza (ver ORIENTACAO_CONFIG_NATUREZAS.md
    // do SisFin §4.2). O CFOP/regra em si já é filtrado por tipo de atendimento
    // (presencial/online/ambos) antes de chegar aqui — ver index.ts regraDe().
    presenca_comprador: regraIcms.indicador_presenca ?? regraIpi?.indicador_presenca ?? natureza.indicador_presenca ?? undefined,
    modalidade_frete: 9,
    informacoes_adicionais_contribuinte: juntarInfos(
      natureza.informacoes_complementares,
      regraIcms.informacoes_complementares,
      observacoes ? observacoes.toUpperCase() : null,
      valorIbsCbs,
      formasPagamentoTexto ? `FORMA DE PAGAMENTO: ${formasPagamentoTexto.toUpperCase()}` : null,
      vendedorNome ? `VENDEDOR: ${vendedorNome.toUpperCase()}` : null,
      fornecedor.rg ? `RG.: ${fornecedor.rg.toUpperCase()}` : null,
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
