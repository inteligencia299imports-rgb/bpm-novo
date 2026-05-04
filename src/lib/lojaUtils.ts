/**
 * Helpers para identificar e agrupar as lojas.
 * As lojas Ducati Bsb, Ducati Fln e Ducati Poa compartilham o mesmo padrão
 * de negociação (motos 0km, sem controle de estoque/avaliação).
 * As lojas 299i, 299s e Aventura compartilham o padrão "299".
 */

export const LOJAS_DUCATI = ['Ducati Bsb', 'Ducati Fln', 'Ducati Poa'] as const;
export const LOJAS_299 = ['299i', '299s', 'Aventura'] as const;

/** True quando a loja é qualquer unidade Ducati */
export const isLojaDucati = (loja: string | null | undefined): boolean =>
  !!loja && loja.toLowerCase().startsWith('ducati');

/** True quando a loja faz parte do grupo 299 */
export const isLoja299 = (loja: string | null | undefined): boolean =>
  !!loja && (LOJAS_299 as readonly string[]).includes(loja);
