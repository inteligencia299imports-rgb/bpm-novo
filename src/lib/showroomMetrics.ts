/**
 * Cálculos client-side do Relatório de Showroom.
 * Espelha o que era feito nas RPCs `relatorio_showroom_*`.
 */
import { firstLastName } from '@/lib/utils';

export type LojaFilterValue = string; // 'todos' | '299' | 'Ducati' | sub-loja
export type TipoFilterValue = string; // 'todos' | 'propria' | 'consignada' | 'repasse' | 'ducati' | 'convertida'

const isDucati = (loja: string | null | undefined) => (loja || '').toUpperCase().includes('DUCATI');

export const matchesLoja = (loja: string | null | undefined, filter: LojaFilterValue) => {
  if (!filter || filter === 'todos') return true;
  if (filter === '299' || filter === 'Ducati') return (isDucati(loja) ? 'Ducati' : '299') === filter;
  return (loja || '') === filter;
};

export const tipoDefault = (loja: string | null | undefined) => (isDucati(loja) ? 'ducati' : 'propria');

export const matchesTipo = (tipo: string, filter: TipoFilterValue) => {
  if (!filter || filter === 'todos') return true;
  return tipo === filter;
};

interface CostRow { avaliacao_id: string; responsavel: string | null; valor_previsto: number | null; valor_executado: number | null; }
interface OpCostRow { contrato_consignante_id: string | null; responsavel: string | null; valor: number | null; }
interface ConsignanteRow { id: string; atendimento_id: string | null; valor_fechamento: number | null; }
interface ContratoRow { atendimento_id: string | null; valor_fechamento: number | null; }
interface InteresseRow { atendimento_id: string | null; marca: string | null; modelo: string | null; estoque_moto_id: string | null; created_at: string; }
interface EstoqueRow {
  id: string; atendimento_venda_id: string | null; avaliacao_id: string | null;
  tipo: string | null; marca: string | null; modelo: string | null; placa: string | null;
  preco: number | null; preco_acao: number | null; valor_venda: number | null; data_venda: string | null;
  valor_custo?: number | null;
  updated_at: string | null; created_at: string | null;
}
interface AvaliacaoRow {
  id: string;
  quanto_vende: number | null; valor_fechamento: number | null;
  avaliacao_compra: number | null; avaliacao_consignacao: number | null;
  updated_at: string | null; created_at: string | null;
}
export interface AtendimentoRow {
  id: string; loja: string | null; nome_cliente: string | null; vendedor_id: string | null;
  situacao: string | null; created_at: string;
}

export interface CostAggregate {
  custo_oficina_loja_exec: number;
  custo_oficina_loja_prev: number;
  custo_processo_loja: number;
  custo_prev_cliente: number;
  custo_real_cliente: number;
}

export const emptyCosts = (): CostAggregate => ({
  custo_oficina_loja_exec: 0,
  custo_oficina_loja_prev: 0,
  custo_processo_loja: 0,
  custo_prev_cliente: 0,
  custo_real_cliente: 0,
});

export interface ShowroomIndexes {
  estoqueByAtendVenda: Map<string, EstoqueRow>;
  estoqueById: Map<string, EstoqueRow>;
  avaliacoesById: Map<string, AvaliacaoRow>;
  costsByAvaliacao: Map<string, CostAggregate>;
  opLojaByAtend: Map<string, number>;
  contratoByAtend: Map<string, number>;
  consignanteByAtend: Map<string, number>;
  interesseByAtend: Map<string, InteresseRow>;
  nomeByUser: Map<string, string>;
  /** destino da transferência por avaliação — 'loja' | 'novo_proprietario' | null */
  destinoTransferenciaByAvaliacao: Map<string, string | null>;
}

export function buildIndexes(params: {
  estoque: EstoqueRow[]; avaliacoes: AvaliacaoRow[];
  custosOficina: CostRow[]; custosOperacionais: OpCostRow[];
  contratos: ContratoRow[]; consignantes: ConsignanteRow[];
  interesses: InteresseRow[]; userRoles: { user_id: string; nome: string | null }[];
  posCompraProcessos?: { avaliacao_id: string | null; etapa: string | null; concluida: boolean | null; destino_transferencia: string | null }[];
}): ShowroomIndexes {
  const estoqueByAtendVenda = new Map<string, EstoqueRow>();
  const estoqueById = new Map<string, EstoqueRow>();
  const pickLatest = (a: EstoqueRow, b: EstoqueRow) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb > ta ? b : a;
  };
  for (const e of params.estoque) {
    estoqueById.set(e.id, e);
    if (e.atendimento_venda_id) {
      const cur = estoqueByAtendVenda.get(e.atendimento_venda_id);
      estoqueByAtendVenda.set(e.atendimento_venda_id, cur ? pickLatest(cur, e) : e);
    }
  }

  const avaliacoesById = new Map<string, AvaliacaoRow>();
  for (const av of params.avaliacoes) {
    avaliacoesById.set(av.id, av);
  }

  const costsByAvaliacao = new Map<string, CostAggregate>();
  for (const c of params.custosOficina) {
    if (!c.avaliacao_id) continue;
    const agg = costsByAvaliacao.get(c.avaliacao_id) || emptyCosts();
    const resp = (c.responsavel || '').toLowerCase();
    const prev = Number(c.valor_previsto || 0);
    const exec = c.valor_executado;
    if (resp === 'loja') {
      if (exec != null) {
        agg.custo_oficina_loja_exec += Number(exec);
        agg.custo_oficina_loja_prev += prev;
      } else {
        agg.custo_processo_loja += prev;
      }
    } else if (resp === 'cliente') {
      agg.custo_prev_cliente += prev;
      if (exec != null) agg.custo_real_cliente += Number(exec);
    }
    costsByAvaliacao.set(c.avaliacao_id, agg);
  }

  const consignanteById = new Map<string, ConsignanteRow>();
  const consignanteByAtend = new Map<string, number>();
  for (const cc of params.consignantes) {
    consignanteById.set(cc.id, cc);
    if (cc.atendimento_id && cc.valor_fechamento != null) {
      consignanteByAtend.set(cc.atendimento_id, Number(cc.valor_fechamento));
    }
  }

  const opLojaByAtend = new Map<string, number>();
  for (const op of params.custosOperacionais) {
    if ((op.responsavel || '').toLowerCase() !== 'loja') continue;
    if (!op.contrato_consignante_id) continue;
    const cc = consignanteById.get(op.contrato_consignante_id);
    if (!cc?.atendimento_id) continue;
    opLojaByAtend.set(cc.atendimento_id, (opLojaByAtend.get(cc.atendimento_id) || 0) + Number(op.valor || 0));
  }

  const contratoByAtend = new Map<string, number>();
  for (const c of params.contratos) {
    if (c.atendimento_id && c.valor_fechamento != null) contratoByAtend.set(c.atendimento_id, Number(c.valor_fechamento));
  }

  const interesseByAtend = new Map<string, InteresseRow>();
  for (const mi of params.interesses) {
    if (!mi.atendimento_id) continue;
    const cur = interesseByAtend.get(mi.atendimento_id);
    // preferir com estoque_moto_id, depois mais antigo
    if (!cur) { interesseByAtend.set(mi.atendimento_id, mi); continue; }
    const curHas = !!cur.estoque_moto_id, newHas = !!mi.estoque_moto_id;
    if (newHas && !curHas) interesseByAtend.set(mi.atendimento_id, mi);
    else if (newHas === curHas && new Date(mi.created_at) < new Date(cur.created_at)) interesseByAtend.set(mi.atendimento_id, mi);
  }

  const nomeByUser = new Map<string, string>();
  for (const u of params.userRoles) nomeByUser.set(u.user_id, firstLastName(u.nome) || 'Desconhecido');

  const destinoTransferenciaByAvaliacao = new Map<string, string | null>();
  for (const p of (params.posCompraProcessos || [])) {
    if (!p.avaliacao_id) continue;
    if ((p.etapa || '').toUpperCase() !== 'TRANSFERÊNCIA CONCLUÍDA') continue;
    if (!p.concluida) continue;
    destinoTransferenciaByAvaliacao.set(p.avaliacao_id, p.destino_transferencia || null);
  }

  return { estoqueByAtendVenda, estoqueById, avaliacoesById, costsByAvaliacao, opLojaByAtend, contratoByAtend, consignanteByAtend, interesseByAtend, nomeByUser, destinoTransferenciaByAvaliacao };
}

const nz = (v: number | null | undefined) => (v == null || Number(v) === 0 ? null : Number(v));

/** Junta estoque + avaliacao para um atendimento */
export function resolveJoin(atend: AtendimentoRow, idx: ShowroomIndexes, mode: 'venda' | 'sinal') {
  let estoque: EstoqueRow | undefined = idx.estoqueByAtendVenda.get(atend.id);
  const interesse = idx.interesseByAtend.get(atend.id);
  if (!estoque && mode === 'sinal' && interesse?.estoque_moto_id) {
    estoque = idx.estoqueById.get(interesse.estoque_moto_id);
  }
  const avaliacao: AvaliacaoRow | undefined = estoque?.avaliacao_id ? idx.avaliacoesById.get(estoque.avaliacao_id) : undefined;
  return { estoque, avaliacao, interesse };
}

export interface RowMetrics {
  tipo: string; modelo: string; placa: string;
  quantoVende: number; valorFechamento: number; valorVenda: number;
  margemPrevista: number; pctMargemPrevista: number;
  margemOficina: number; abatimentos: number;
  margemRealizada: number; pctMargemRealizada: number;
  fatReal: number;
}

/** Métricas para linha da listagem (vendidas ou sinais). Segue a lógica da RPC correspondente. */
export function computeRowMetrics(atend: AtendimentoRow, idx: ShowroomIndexes, mode: 'venda' | 'sinal'): RowMetrics {
  const { estoque, avaliacao, interesse } = resolveJoin(atend, idx, mode);
  const tipo = estoque?.tipo || tipoDefault(atend.loja);
  const modelo = [estoque?.marca, estoque?.modelo].filter(Boolean).join(' ')
    || [interesse?.marca, interesse?.modelo].filter(Boolean).join(' ') || '-';
  const placa = estoque?.placa || '-';

  const costs = avaliacao ? (idx.costsByAvaliacao.get(avaliacao.id) || emptyCosts()) : emptyCosts();
  const opLoja = idx.opLojaByAtend.get(atend.id) || 0;
  const contratoV = idx.contratoByAtend.get(atend.id);
  const consignanteV = idx.consignanteByAtend.get(atend.id);

  let quantoVende: number;
  let valorFechamento: number;
  let valorVendaReal: number;

  if (mode === 'venda') {
    quantoVende = Number(avaliacao?.quanto_vende || 0) || Number(estoque?.preco || 0);
    valorFechamento = Number(avaliacao?.valor_fechamento || 0) || Number(estoque?.valor_custo || 0);
    valorVendaReal = Number(estoque?.valor_venda ?? estoque?.preco ?? 0);
  } else {
    quantoVende = nz(avaliacao?.quanto_vende) ?? nz(estoque?.preco_acao) ?? nz(estoque?.preco) ?? nz(estoque?.valor_venda) ?? 0;
    valorFechamento = nz(avaliacao?.valor_fechamento) ?? nz(consignanteV) ?? nz(contratoV)
      ?? (tipo === 'consignada' ? nz(avaliacao?.avaliacao_consignacao) : nz(avaliacao?.avaliacao_compra))
      ?? nz(estoque?.valor_custo) ?? 0;
    valorVendaReal = Number(estoque?.valor_venda ?? estoque?.preco_acao ?? estoque?.preco ?? 0);
  }

  const taxaFixa = ['propria', 'convertida'].includes(tipo) ? 445 : 0;
  const fatReal = valorVendaReal + (costs.custo_prev_cliente - costs.custo_real_cliente) + (costs.custo_oficina_loja_prev - costs.custo_oficina_loja_exec);
  const margemPrevista = quantoVende - valorFechamento;
  const margemOficina = (costs.custo_prev_cliente - costs.custo_real_cliente) + (costs.custo_oficina_loja_prev - costs.custo_oficina_loja_exec);

  // Abatimentos só aplicam quando a transferência foi para a Loja (ou tipo sem transferência: consignada/ducati/etc não têm)
  const destino = avaliacao ? idx.destinoTransferenciaByAvaliacao.get(avaliacao.id) : null;
  const aplicaAbatimentos = !['propria', 'convertida'].includes(tipo) || destino === 'loja';
  const abatimentos = aplicaAbatimentos
    ? (taxaFixa + costs.custo_oficina_loja_exec + costs.custo_processo_loja + opLoja)
    : 0;
  const margemRealizada = aplicaAbatimentos
    ? fatReal - (valorFechamento + taxaFixa + costs.custo_oficina_loja_exec + costs.custo_processo_loja + opLoja)
    : fatReal - valorFechamento;

  return {
    tipo, modelo, placa,
    quantoVende: round2(quantoVende), valorFechamento: round2(valorFechamento),
    valorVenda: round2(valorVendaReal),
    margemPrevista: round2(margemPrevista),
    pctMargemPrevista: quantoVende > 0 ? round4(margemPrevista / quantoVende) : 0,
    margemOficina: round2(margemOficina), abatimentos: round2(abatimentos),
    margemRealizada: round2(margemRealizada),
    pctMargemRealizada: fatReal > 0 ? round4(margemRealizada / fatReal) : 0,
    fatReal: round2(fatReal),
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Filtra atendimentos por loja+período (created_at) e tipo dos vendidos. */
export function filterAtendimentosGeneric(
  atends: AtendimentoRow[], idx: ShowroomIndexes,
  loja: LojaFilterValue, dateFrom?: Date, dateTo?: Date,
) {
  return atends.filter((a) => {
    if (!matchesLoja(a.loja, loja)) return false;
    if (dateFrom && new Date(a.created_at) < dateFrom) return false;
    if (dateTo && new Date(a.created_at) > dateTo) return false;
    return true;
  });
}

export function filterVendidas(
  atends: AtendimentoRow[], idx: ShowroomIndexes,
  loja: LojaFilterValue, tipo: TipoFilterValue,
  dateFrom?: Date, dateTo?: Date,
) {
  return atends.filter((a) => {
    if (a.situacao !== 'vendido') return false;
    const est = idx.estoqueByAtendVenda.get(a.id);
    if (!est?.data_venda) return false;
    if (!matchesLoja(a.loja, loja)) return false;
    const t = est?.tipo || tipoDefault(a.loja);
    if (!matchesTipo(t, tipo)) return false;
    const dv = new Date(est.data_venda);
    if (dateFrom && dv < dateFrom) return false;
    if (dateTo && dv > dateTo) return false;
    return true;
  });
}

export function filterSinais(atends: AtendimentoRow[], idx: ShowroomIndexes, loja: LojaFilterValue, tipo: TipoFilterValue) {
  return atends.filter((a) => {
    if (a.situacao !== 'sinal') return false;
    if (!matchesLoja(a.loja, loja)) return false;
    const { estoque } = resolveJoin(a, idx, 'sinal');
    const t = estoque?.tipo || tipoDefault(a.loja);
    return matchesTipo(t, tipo);
  });
}
