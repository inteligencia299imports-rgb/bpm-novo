/**
 * Quem pode abrir cada aba do BPM. Fonte única para o menu (Sidebar/BottomNav)
 * e para o Dashboard — que antes abria qualquer aba vinda pelo link
 * (?tab=pos_venda&atendimento=...) sem conferir o perfil.
 */
// Desde 2026-11-22 (pedido do usuário): gerente restrito às abas abaixo (antes
// via tudo, como o master); avaliador é perfil novo; vendedor vê Publicações só para
// consulta (2026-11-23).
// Consulta, Pós-Venda, Intermediação, Pós-Compra e Consignação: master e
// administrativo (perfil criado em 2026-11-22, sem Relatórios).
// A ordem das chaves define a tela inicial de quem não tem Relatórios.
export const ABA_PAPEIS: Record<string, string[]> = {
  relatorios: ['master', 'gerente', 'avaliador', 'vendedor'],
  showroom: ['master', 'gerente', 'vendedor'],
  avaliacoes: ['master', 'gerente', 'avaliador'],
  novidades: ['master', 'gerente', 'avaliador', 'vendedor'],
  estoque: ['master', 'gerente', 'avaliador', 'vendedor', 'administrativo'],
  consulta: ['master', 'administrativo'],
  pos_venda: ['master', 'administrativo'],
  intermediacao: ['master', 'administrativo'],
  pos_compra: ['master', 'administrativo'],
  consignacao: ['master', 'administrativo'],
  preparacao: ['master', 'gerente', 'avaliador', 'vendedor', 'administrativo'],
  publicacoes: ['master', 'gerente', 'avaliador', 'vendedor'],
  nps: ['master', 'gerente', 'avaliador', 'vendedor'],
};

/**
 * Abas que o perfil abre SEM tê-las no menu (pedido do usuário, 2026-11-25: "não
 * visualizar as abas não significa não ter acesso às etapas"). O gerente não vê
 * Pós-Venda, Intermediação, Pós-Compra e Consignação no menu, mas abre essas telas
 * pelas etapas da venda/compra e pelos atendimentos do NPS. O vendedor abre Pós-Venda e
 * Intermediação só das PRÓPRIAS vendas (as telas filtram por vendedor_id).
 */
export const ABA_ACESSO_SEM_MENU: Record<string, string[]> = {
  pos_venda: ['gerente', 'vendedor'],
  intermediacao: ['gerente', 'vendedor'],
  pos_compra: ['gerente'],
  consignacao: ['gerente'],
};

/** Aba aparece no menu (Sidebar/BottomNav) e serve de tela inicial. */
export const abaNoMenu = (aba: string, role: string | null | undefined): boolean =>
  !!role && (ABA_PAPEIS[aba] || []).includes(role);

/** Pode abrir a aba/tela (menu, link, etapas, NPS). */
export const podeAcessarAba = (aba: string, role: string | null | undefined): boolean =>
  abaNoMenu(aba, role) || (!!role && (ABA_ACESSO_SEM_MENU[aba] || []).includes(role));

/** Tela inicial: Relatórios; sem acesso a ela, a primeira aba liberada para o perfil. */
export const abaInicial = (role: string | null | undefined): string =>
  abaNoMenu('relatorios', role)
    ? 'relatorios'
    : Object.keys(ABA_PAPEIS).find((aba) => abaNoMenu(aba, role)) || 'relatorios';
