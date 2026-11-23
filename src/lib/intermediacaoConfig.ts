import { INTERMEDIACAO_PARTE1_COLUMNS, INTERMEDIACAO_PARTE2_COLUMNS, INTERMEDIACAO_PARTE1_ETAPAS, INTERMEDIACAO_PARTE2_ETAPAS } from '@/types/crm';

/** Configuração das duas partes da Intermediação (aba e barra de etapas da venda). */
export const PARTE_CONFIG = {
  parte1: {
    columns: INTERMEDIACAO_PARTE1_COLUMNS,
    statusField: 'intermediacao_parte1_status',
    etapas: INTERMEDIACAO_PARTE1_ETAPAS,
    statusRules: {
      concluded: 'TRANSFERÊNCIA FINALIZADA',
      special: { etapa: 'DOCUMENTAÇÃO COM DESPACHANTE', status: 'doc_despachante' },
      default: 'em_andamento',
    },
  },
  parte2: {
    columns: INTERMEDIACAO_PARTE2_COLUMNS,
    statusField: 'intermediacao_parte2_status',
    etapas: INTERMEDIACAO_PARTE2_ETAPAS,
    statusRules: {
      concluded: 'AUTORIZAÇÃO DE PAGAMENTO',
      default: 'em_andamento',
    },
  },
};
