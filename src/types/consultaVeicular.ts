// Espelha supabase/functions/consulta-veicular/types.ts (ConsultaVeiculoResultado).
// Mantido em arquivo separado porque a Edge Function (Deno) e o frontend
// (Vite/React) nao compartilham o mesmo bundler/resolver de módulos.

export type IndicadorStatus =
  | 'NADA_CONSTA'
  | 'PENDENCIA'
  | 'REGULAR'
  | 'NAO_DISPONIVEL'
  | 'NAO_CONSULTADO'
  | 'INDETERMINADO'
  | 'ERRO_FONTE';

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
    debitos_detran: Array<{ tipo: 'IPVA' | 'LICENCIAMENTO' | 'MULTA' | 'OUTRO'; valor: number | null; descricao?: string }>;
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
