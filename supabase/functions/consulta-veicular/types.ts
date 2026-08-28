// DTOs internos do sistema. Nao representam necessariamente o payload
// oficial do SERPRO/SENATRAN/RENAVE -- essa e a fronteira que a camada
// Adapter (providers/*) isola.

export interface ConsultaEntrada {
  placa: string;
  uf: string | null;
  renavam: string | null;
  tipo_crv: string | null;
  numero_crv: string | null;
}

/**
 * NADA_CONSTA  - fonte consultada com sucesso, confirma que nao ha pendencia.
 * PENDENCIA    - fonte consultada com sucesso, ha pendencia/debito/restricao.
 * REGULAR      - situacao positiva verificada (ex: licenciamento em dia).
 * NAO_DISPONIVEL - fonte nao disponibiliza esse dado (nao e erro).
 * NAO_CONSULTADO - fonte nao foi chamada (servico nao contratado/habilitado).
 * INDETERMINADO  - fonte tentou consultar mas nao conseguiu concluir
 *                   (ex: falha de comunicacao com o Detran).
 * ERRO_FONTE     - erro tecnico na chamada (timeout, 5xx, etc).
 *
 * Nunca usar NADA_CONSTA como resultado padrao de erro/timeout/servico
 * nao contratado -- ver indicatorResolver.ts.
 */
export type IndicadorStatus =
  | 'NADA_CONSTA'
  | 'PENDENCIA'
  | 'REGULAR'
  | 'NAO_DISPONIVEL'
  | 'NAO_CONSULTADO'
  | 'INDETERMINADO'
  | 'ERRO_FONTE';

export type OrgaoAutuador = 'DETRAN' | 'DER_DF' | 'DNIT' | 'PRF' | 'OUTROS';

export interface IndicadorSimples {
  status: IndicadorStatus;
  descricao?: string;
}

export interface IndicadorIpva extends IndicadorSimples {
  exercicio?: number | null;
  valor?: number | null;
}

export interface IndicadorLicenciamento extends IndicadorSimples {
  exercicio?: number | null;
  data_emissao_crlv?: string | null;
}

export interface IndicadorOrgao extends IndicadorSimples {
  quantidade?: number;
  valor?: number | null;
}

export interface IndicadorGravame extends IndicadorSimples {
  tipo?: string;
  codigo?: string;
  restricoes?: Array<{ codigo: string; descricao: string }>;
}

export interface IndicadorRestricoes {
  status: IndicadorStatus;
  renajud: boolean;
  rff: boolean;
  roubo_furto: boolean;
  leilao: boolean;
  circulacao: boolean;
  alarme: boolean;
  comunicacao_venda: boolean;
}

export interface Infracao {
  codigo_renainf?: string;
  numero_ait?: string;
  codigo_infracao?: string;
  infracao_descricao?: string;
  data_infracao?: string;
  orgao_autuador_codigo?: string;
  orgao_autuador_descricao?: string;
  uf_orgao_autuador?: string;
  indicador_exigibilidade?: string;
  descricao_indicador_exigibilidade?: string;
  valor_integral_infracao?: number;
  valor_pago?: number | null;
  data_pagamento?: string | null;
  data_vencimento_notificacao_penalidade?: string | null;
}

export interface ConsultaVeiculoResultado {
  consulta_id: string;
  consultado_em: string;
  veiculo: {
    placa: string;
    uf: string | null;
    renavam: string | null;
    chassi: string | null;
    marca_modelo: string | null;
    ano_fabricacao: number | null;
    ano_modelo: number | null;
  };
  renave: {
    consultado: boolean;
    apto_estoque: boolean | null;
    motivos_nao_aptidao: string[];
    debitos_detran: Array<{
      tipo: 'IPVA' | 'LICENCIAMENTO' | 'MULTA' | 'OUTRO';
      valor: number | null;
      descricao?: string;
    }>;
    falha_comunicacao_detran: boolean;
    erro: string | null;
  };
  indicadores: {
    ipva: IndicadorIpva;
    licenciamento: IndicadorLicenciamento;
    detran: IndicadorOrgao;
    der_df: IndicadorOrgao;
    dnit: IndicadorOrgao;
    prf: IndicadorOrgao;
    autocorp: IndicadorSimples;
    gravame: IndicadorGravame;
    restricoes: IndicadorRestricoes;
    cpf: IndicadorSimples;
  };
  infracoes: Infracao[];
  fontes: Record<string, 'OK' | 'ERRO' | 'NAO_CONFIGURADO'>;
}

// ---- Resultados brutos dos providers (antes do Normalizer) ----

/**
 * Toda fonte externa reporta, quando `consultado` e false, POR QUE nao
 * consultou -- essa distincao e o que garante a regra do §7 (nunca virar
 * NADA_CONSTA): 'NAO_CONFIGURADO' vira indicador NAO_CONSULTADO,
 * 'ERRO' vira ERRO_FONTE. Nunca os dois se confundem.
 */
export type MotivoNaoConsultado = 'NAO_CONFIGURADO' | 'ERRO';

export interface FonteErro {
  motivo: MotivoNaoConsultado;
  codigo_http: number;
  mensagem: string;
}

export interface RenaveAptidaoRaw {
  consultado: boolean;
  apto_estoque: boolean | null;
  motivos_nao_aptidao: string[];
  falha_comunicacao_detran: boolean;
  debitos: Array<{ tipo: string | null; valor: number | null; descricao?: string }>;
  boletos?: Array<{ valor: number | null; vencimento?: string | null; descricao?: string }>;
  veiculo?: {
    renavam?: string | null;
    chassi?: string | null;
    marca_modelo?: string | null;
    ano_fabricacao?: number | null;
    ano_modelo?: number | null;
  };
  erro?: FonteErro;
}

export interface SenatranVeiculoRaw {
  consultado: boolean;
  disponivel: boolean;
  placa?: string;
  renavam?: string;
  chassi?: string;
  uf_jurisdicao?: string;
  marca_modelo?: string;
  ano_fabricacao?: number;
  ano_modelo?: number;
  crlv_ano_exercicio?: number;
  crlv_data_emissao?: string;
  indicador_multa_renainf?: boolean;
  indicador_restricao_renajud?: boolean;
  indicador_restricao_rfb?: boolean;
  indicador_roubo_furto?: boolean;
  indicador_leilao?: boolean;
  indicador_comunicacao_venda?: boolean;
  indicador_circulacao?: boolean;
  indicador_pendencia_emissao?: boolean;
  indicador_alarme?: boolean;
  restricoes?: Array<{ codigo: string; descricao: string }>;
  erro?: FonteErro;
}

export interface SenatranInfracoesRaw {
  consultado: boolean;
  disponivel: boolean;
  infracoes: Infracao[];
  erro?: FonteErro;
}
