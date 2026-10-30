import { supabase } from '@/integrations/supabase/client';

// Quitação da moto em estoque = data de pagamento do compromisso financeiro de
// despesa ligado a ela (compra/troca/transferência). O compromisso chega na moto
// por avaliacao_id (seminova) ou pela NF-e de entrada (nfe_entrada_id), que por
// sua vez aponta para a avaliação / estoque_motos / estoque_motos_novas.
// vencimento: em aberto = próximo vencimento entre as parcelas não pagas; quitado = o da última parcela.
export type Quitacao = { status: 'quitado'; data: string; vencimento: string | null } | { status: 'em_aberto'; vencimento: string | null };

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
export async function fetchQuitacaoEstoque(motos: { id: string; tipo?: string | null; avaliacao_id?: string | null; numero_nf_entrada?: string | null }[]): Promise<Map<string, Quitacao>> {
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

  const SELECT = 'id, avaliacao_id, nfe_entrada_id, compromissos_parcelas(data_pagamento, data_vencimento, status_pagamento)';
  // Transferência entre empresas do grupo (TRF-D, origem 'transferencia') também é despesa ligada
  // à NF-e da moto, mas não é a compra da montadora — fica fora da quitação e do vencimento.
  const soDespesa = (q: any) => q.eq('natureza', 'despesa').is('deleted_at', null).or('origem.is.null,origem.neq.transferencia');
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

  // 0km sem compromisso ligado pela NF-e (NF da montadora não importada no sistema): procura o
  // compromisso lançado à mão no financeiro (sem nfe_entrada_id) pelo número da NF de entrada
  // da moto (estoque_motos_novas.numero_nf_entrada). numero_documento é gravado em maiúsculas sem
  // pontuação e aparece como '54669', '000054669' ou 'NF-54669'.
  const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const motoPorNumeroNf = new Map<string, string>();
  motos.filter((m) => m.tipo === '0km' && !parcelasPorMoto.has(m.id) && digitos(m.numero_nf_entrada))
    .forEach((m) => motoPorNumeroNf.set(digitos(m.numero_nf_entrada), m.id));
  if (motoPorNumeroNf.size) {
    const variantes = [...motoPorNumeroNf.keys()].flatMap((n) => [n, n.padStart(9, '0'), `NF-${n}`, `NF${n}`]);
    const porNumero = await buscarPorIds('compromissos', 'id, numero_documento, compromissos_parcelas(data_pagamento, data_vencimento, status_pagamento)', 'numero_documento', variantes,
      (q: any) => soDespesa(q).is('nfe_entrada_id', null));
    for (const c of porNumero) {
      const motoId = motoPorNumeroNf.get(digitos(c.numero_documento));
      const parcelas = (c.compromissos_parcelas || []).filter((p: any) => p.status_pagamento !== 'cancelado');
      if (!motoId || !parcelas.length) continue;
      if (!parcelasPorMoto.has(motoId)) parcelasPorMoto.set(motoId, new Map());
      parcelasPorMoto.get(motoId)!.set(c.id, parcelas);
    }
  }

  parcelasPorMoto.forEach((porCompromisso, motoId) => {
    const parcelas = [...porCompromisso.values()].flat();
    const vencimentos = (ps: any[]) => ps.map((p) => p.data_vencimento).filter(Boolean).map(String).sort();
    const abertas = parcelas.filter((p) => !p.data_pagamento);
    if (abertas.length) {
      result.set(motoId, { status: 'em_aberto', vencimento: vencimentos(abertas)[0] ?? null });
    } else {
      const data = parcelas.map((p) => String(p.data_pagamento)).sort().reverse()[0];
      result.set(motoId, { status: 'quitado', data, vencimento: vencimentos(parcelas).reverse()[0] ?? null });
    }
  });
  return result;
}

/** Vencimento do compromisso (dd/mm/aaaa); sem compromisso = vazio. */
export const formatarVencimento = (q: Quitacao | undefined) =>
  q?.vencimento ? q.vencimento.slice(0, 10).split('-').reverse().join('/') : '';

/** dd/mm/aaaa a partir de 'aaaa-mm-dd' (sem passar por Date, para não deslocar o fuso). Não quitada = vazio. */
export const formatarQuitacao = (q: Quitacao | undefined) =>
  q?.status === 'quitado' ? q.data.slice(0, 10).split('-').reverse().join('/') : '';
