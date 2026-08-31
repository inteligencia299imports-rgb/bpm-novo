import { isTipoPropria } from '@/lib/tipoAquisicao';

/**
 * Único usuário autorizado a aprovar/recusar a aquisição de motos próprias.
 * Produção (gnpkkgygjfxlipqbtybg): "Alline Borges" (master, financeiro@299imports.com.br).
 */
export const APROVADOR_USER_ID = 'efab8eff-b62f-4506-83b3-9a66aabb8691';

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
