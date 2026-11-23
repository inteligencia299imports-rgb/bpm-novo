/**
 * Quem pode abrir cada aba do BPM. Fonte única para o menu (Sidebar/BottomNav)
 * e para o Dashboard — que antes abria qualquer aba vinda pelo link
 * (?tab=pos_venda&atendimento=...) sem conferir o perfil.
 */
// Desde 2026-11-22 (pedido do usuário): gerente restrito às abas abaixo (antes
// via tudo, como o master); avaliador é perfil novo; vendedor sem Publicações.
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
  publicacoes: ['master', 'gerente', 'avaliador'],
  nps: ['master', 'gerente', 'avaliador', 'vendedor'],
};

export const podeAcessarAba = (aba: string, role: string | null | undefined): boolean =>
  !!role && (ABA_PAPEIS[aba] || []).includes(role);

/** Tela inicial: Relatórios; sem acesso a ela, a primeira aba liberada para o perfil. */
export const abaInicial = (role: string | null | undefined): string =>
  podeAcessarAba('relatorios', role)
    ? 'relatorios'
    : Object.keys(ABA_PAPEIS).find((aba) => podeAcessarAba(aba, role)) || 'relatorios';
