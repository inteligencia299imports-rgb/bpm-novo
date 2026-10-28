import { supabase } from '@/integrations/supabase/client';

// Quitação da moto em estoque = data de pagamento do compromisso financeiro de
// despesa ligado a ela (compra/troca/transferência). O compromisso chega na moto
// por avaliacao_id (seminova) ou pela NF-e de entrada (nfe_entrada_id), que por
// sua vez aponta para a avaliação / estoque_motos / estoque_motos_novas.
export type Quitacao = { status: 'quitado'; data: string } | { status: 'em_aberto' };

// `.in()` com centenas de ids estoura a URL do PostgREST e volta vazio — vai em lotes.
const LOTE = 150;
const emLotes = <T,>(ids: T[]) => Array.from({ length: Math.ceil(ids.length / LOTE) }, (_, i) => ids.slice(i * LOTE, (i + 1) * LOTE));

async function buscarPorIds(tabela: string, select: string, coluna: string, ids: string[], extra?: (q: any) => any) {
  const out: any[] = [];
  for (const lote of emLotes(ids)) {
    let q = (supabase as any).from(tabela).select(select).in(coluna, lote);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/** Mapa id da moto (estoque_motos.id / estoque_motos_novas.id) → quitação. Moto sem compromisso fica fora do mapa. */
export async function fetchQuitacaoEstoque(motos: { id: string; tipo?: string | null; avaliacao_id?: string | null }[]): Promise<Map<string, Quitacao>> {
  const result = new Map<string, Quitacao>();
  const semi = motos.filter((m) => m.tipo !== '0km');
  const novas = motos.filter((m) => m.tipo === '0km').map((m) => m.id);
  const avaliacaoIds = [...new Set(semi.map((m) => m.avaliacao_id).filter(Boolean) as string[])];
  const semiIds = semi.map((m) => m.id);
  if (!motos.length) return result;

  const [nfAval, nfSemi, nfNovas] = await Promise.all([
    buscarPorIds('nfe_entradas', 'id, avaliacao_id', 'avaliacao_id', avaliacaoIds),
    buscarPorIds('nfe_entradas', 'id, estoque_moto_id', 'estoque_moto_id', semiIds),
    buscarPorIds('nfe_entradas', 'id, estoque_moto_nova_id', 'estoque_moto_nova_id', novas),
  ]);

  // NF → moto
  const motoPorAvaliacao = new Map(semi.filter((m) => m.avaliacao_id).map((m) => [m.avaliacao_id as string, m.id]));
  const motoPorNf = new Map<string, string>();
  nfAval.forEach((n) => { const m = motoPorAvaliacao.get(n.avaliacao_id); if (m) motoPorNf.set(n.id, m); });
  nfSemi.forEach((n) => motoPorNf.set(n.id, n.estoque_moto_id));
  nfNovas.forEach((n) => motoPorNf.set(n.id, n.estoque_moto_nova_id));

  const SELECT = 'id, avaliacao_id, nfe_entrada_id, compromissos_parcelas(data_pagamento, status_pagamento)';
  const soDespesa = (q: any) => q.eq('natureza', 'despesa').is('deleted_at', null);
  const [porAvaliacao, porNf] = await Promise.all([
    buscarPorIds('compromissos', SELECT, 'avaliacao_id', avaliacaoIds, soDespesa),
    buscarPorIds('compromissos', SELECT, 'nfe_entrada_id', [...motoPorNf.keys()], soDespesa),
  ]);

  // Parcelas (sem canceladas) de todos os compromissos da moto, sem repetir compromisso.
  const parcelasPorMoto = new Map<string, Map<string, any[]>>();
  for (const c of [...porAvaliacao, ...porNf]) {
    const motoId = (c.avaliacao_id && motoPorAvaliacao.get(c.avaliacao_id)) || (c.nfe_entrada_id && motoPorNf.get(c.nfe_entrada_id));
    if (!motoId) continue;
    const parcelas = (c.compromissos_parcelas || []).filter((p: any) => p.status_pagamento !== 'cancelado');
    if (!parcelas.length) continue;
    if (!parcelasPorMoto.has(motoId)) parcelasPorMoto.set(motoId, new Map());
    parcelasPorMoto.get(motoId)!.set(c.id, parcelas);
  }

  parcelasPorMoto.forEach((porCompromisso, motoId) => {
    const parcelas = [...porCompromisso.values()].flat();
    if (parcelas.some((p) => !p.data_pagamento)) {
      result.set(motoId, { status: 'em_aberto' });
    } else {
      const data = parcelas.map((p) => String(p.data_pagamento)).sort().reverse()[0];
      result.set(motoId, { status: 'quitado', data });
    }
  });
  return result;
}

/** dd/mm/aaaa a partir de 'aaaa-mm-dd' (sem passar por Date, para não deslocar o fuso). */
export const formatarQuitacao = (q: Quitacao | undefined) =>
  !q ? '' : q.status === 'em_aberto' ? 'Em aberto' : q.data.slice(0, 10).split('-').reverse().join('/');
