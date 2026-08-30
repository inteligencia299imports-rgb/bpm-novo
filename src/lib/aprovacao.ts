import { isTipoPropria } from '@/lib/tipoAquisicao';

/**
 * Único usuário autorizado a aprovar/recusar a aquisição de motos próprias.
 * Homologação: "Higor Oliveira" (master).
 * Produção: 'ba690fb5-6d47-4c5b-92a5-627c8259924f' — trocar antes do deploy de produção.
 */
export const APROVADOR_USER_ID = 'c121927a-53e2-451c-b2a5-5ad673d484e2';

export const podeAprovar = (userId?: string | null): boolean => userId === APROVADOR_USER_ID;

interface AvaliacaoAprovavel {
  tipo_aquisicao?: string | null;
  aprovacao_status?: string | null;
}

/** Aquisição própria (compra/troca) exige aprovação; consignada não. */
export const exigeAprovacao = (av?: AvaliacaoAprovavel | null): boolean =>
  !!av && isTipoPropria(av.tipo_aquisicao);

export const aguardandoAprovacao = (av?: AvaliacaoAprovavel | null): boolean =>
  av?.aprovacao_status === 'aguardando';

export const aprovada = (av?: AvaliacaoAprovavel | null): boolean =>
  av?.aprovacao_status === 'aprovada';

export const recusada = (av?: AvaliacaoAprovavel | null): boolean =>
  av?.aprovacao_status === 'recusada';

/** Liberado para dar andamento ao processo (contrato, pós-compra, preparação, NPS). */
export const liberadoParaProcesso = (av?: AvaliacaoAprovavel | null): boolean =>
  !exigeAprovacao(av) || aprovada(av);
