import { supabase } from '@/lib/supabase';

/**
 * Libera do estoque (seminova e 0km) as motos que ainda estão presas a um
 * atendimento como Sinal/Vendido (estoque.atendimento_venda_id), exceto as
 * informadas em `manterIds`. Volta a moto para "disponível" e limpa os dados
 * da venda.
 *
 * Usado quando a moto de interesse do atendimento é trocada (a moto antiga
 * ficava vendida pra ele) e quando o atendimento vira Perdido (antes só a moto
 * de interesse ATUAL era liberada). Achado: SGU1D55 ficou "vendida" para o
 * atendimento perdido do Rafael Antonio de Souza Moraes (2026-10-06), travando
 * Sinal/Vendido dela para qualquer outro cliente.
 */
export async function liberarEstoquePresoAoAtendimento(atendimentoId: string, manterIds: (string | null | undefined)[] = []) {
  const manter = manterIds.filter((id): id is string => !!id);
  const liberar = {
    status: 'disponivel',
    atendimento_venda_id: null,
    data_venda: null,
    valor_venda: null,
    valor_sinal: null,
  };
  await Promise.all((['estoque_motos', 'estoque_motos_novas'] as const).map(async (tabela) => {
    let q = (supabase as any).from(tabela).update(liberar).eq('atendimento_venda_id', atendimentoId);
    if (manter.length > 0) q = q.not('id', 'in', `(${manter.join(',')})`);
    const { error } = await q;
    if (error) console.error(`[liberarEstoquePresoAoAtendimento] ${tabela}`, error.message);
  }));
}
