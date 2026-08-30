// Montagem do JSON da NF-e de entrada (compra de moto seminova) para a API Focus-NFe.
// A loja e a emitente (tipo_documento = 0 / entrada); a pessoa fisica vendedora
// e a destinataria.

export interface DadosEmpresa {
  cnpj: string;
  regime_tributario: string | null;
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

export interface RegraFiscal {
  cfop: string | null;
  situacao_tributaria: string | null;
  aliquota: number | null;
}

export interface MontarPayloadArgs {
  naturezaDescricao: string;
  empresa: DadosEmpresa;
  fornecedor: DadosFornecedor;
  moto: DadosMoto;
  valor: number;
  regraIcms: RegraFiscal | null;
  regraPis: RegraFiscal | null;
  regraCofins: RegraFiscal | null;
}

const onlyDigits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

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
  const { naturezaDescricao, empresa, fornecedor, moto, valor, regraIcms, regraPis, regraCofins } = args;

  const pf = (fornecedor.tipo_pessoa ?? 'fisica') === 'fisica';
  const docForn = onlyDigits(fornecedor.cpf_cnpj);
  const valorFmt = Number(valor.toFixed(2));

  const cfop = regraIcms?.cfop || '1102';
  const cstIcms = regraIcms?.situacao_tributaria || '102';
  const isCsosn = cstIcms.length === 3; // Simples Nacional usa CSOSN de 3 digitos
  const cstPis = regraPis?.situacao_tributaria || '99';
  const cstCofins = regraCofins?.situacao_tributaria || '99';

  const item: Record<string, unknown> = {
    numero_item: 1,
    codigo_produto: (moto.placa || moto.chassi || 'MOTO').toUpperCase().replace(/\s/g, ''),
    descricao: descricaoItemMoto(moto),
    cfop,
    codigo_ncm: ncmPorCilindrada(moto.cilindrada),
    unidade_comercial: 'UN',
    quantidade_comercial: 1,
    valor_unitario_comercial: valorFmt,
    unidade_tributavel: 'UN',
    quantidade_tributavel: 1,
    valor_unitario_tributavel: valorFmt,
    valor_bruto: valorFmt,
    icms_origem: 0,
    pis_situacao_tributaria: cstPis,
    cofins_situacao_tributaria: cstCofins,
  };

  if (isCsosn) {
    item.icms_situacao_tributaria = cstIcms; // CSOSN, ex.: 102
  } else {
    item.icms_modalidade_base_calculo = 3;
    item.icms_situacao_tributaria = cstIcms; // CST, ex.: 90
    item.icms_aliquota = Number(regraIcms?.aliquota ?? 0);
    item.icms_base_calculo = 0;
    item.icms_valor = 0;
  }

  return {
    natureza_operacao: naturezaDescricao,
    data_emissao: new Date().toISOString(),
    data_entrada_saida: new Date().toISOString(),
    tipo_documento: 0,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 9,
    modalidade_frete: 9,

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
    valor_produtos: Number(valor.toFixed(2)),
    valor_total: Number(valor.toFixed(2)),

    items: [item],
  };
}
