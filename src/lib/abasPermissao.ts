/**
 * Quem pode abrir cada aba do BPM. Fonte única para o menu (Sidebar/BottomNav)
 * e para o Dashboard — que antes abria qualquer aba vinda pelo link
 * (?tab=pos_venda&atendimento=...) sem conferir o perfil.
 */
// Desde 2026-11-22 (pedido do usuário): gerente restrito às abas abaixo (antes
// via tudo, como o master); avaliador é perfil novo; vendedor sem Publicações.
// Consulta, Pós-Venda, Intermediação, Pós-Compra e Consignação: só master.
export const ABA_PAPEIS: Record<string, string[]> = {
  relatorios: ['master', 'gerente', 'avaliador', 'vendedor'],
  showroom: ['master', 'gerente', 'vendedor'],
  avaliacoes: ['master', 'gerente', 'avaliador'],
  novidades: ['master', 'gerente', 'avaliador', 'vendedor'],
  estoque: ['master', 'gerente', 'avaliador', 'vendedor'],
  consulta: ['master'],
  pos_venda: ['master'],
  intermediacao: ['master'],
  pos_compra: ['master'],
  consignacao: ['master'],
  preparacao: ['master', 'gerente', 'avaliador', 'vendedor'],
  publicacoes: ['master', 'gerente', 'avaliador'],
  nps: ['master', 'gerente', 'avaliador', 'vendedor'],
};

export const podeAcessarAba = (aba: string, role: string | null | undefined): boolean =>
  !!role && (ABA_PAPEIS[aba] || []).includes(role);
