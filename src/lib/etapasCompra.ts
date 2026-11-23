import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isTipoConsignada } from '@/lib/tipoAquisicao';
import { exigeAprovacao } from '@/lib/aprovacao';
import type { EtapaProcesso } from '@/components/vendas/EtapasVendaBar';

/**
 * Etapas da compra de moto (avaliação adquirida), na mesma barra de setas da
 * venda (pedido do usuário, 2026-11-22). Calcula, por etapa, se vale para a
 * compra, se está concluída, o que a trava e os dias desde a aquisição —
 * espelhando os checklists do Pós-Compra e da Consignação.
 *
 * Própria/troca: Avaliação > Aprovação > Contrato > Consulta > Documentação >
 *   Vistoria > NF Compra > Renave > Transferência > Preparação > NPS
 *   (repasse: sem NF Compra e Renave; troca/convertida: sem Aprovação).
 * Consignada: Avaliação > Contrato > Consulta > NF Consignação > Preparação > NPS.
 */
export type EtapaCompraKey =
  | 'avaliacao'
  | 'aprovacao'
  | 'contrato'
  | 'consulta'
  | 'documentacao'
  | 'vistoria'
  | 'nf_compra'
  | 'renave'
  | 'transferencia'
  | 'preparacao'
  | 'nps';

export interface EtapaCompra extends EtapaProcesso {
  key: EtapaCompraKey;
}

export interface ContextoCompra {
  consignada: boolean;
  troca: boolean;
}

const ORDEM: EtapaCompraKey[] = [
  'avaliacao', 'aprovacao', 'contrato', 'consulta', 'documentacao', 'vistoria',
  'nf_compra', 'renave', 'transferencia', 'preparacao', 'nps',
];

/** Dependências (valem para qualquer nível de usuário); dependência que não se aplica é ignorada. */
const DEPENDE_DE: Partial<Record<EtapaCompraKey, EtapaCompraKey[]>> = {
  aprovacao: ['avaliacao'],
  contrato: ['aprovacao', 'avaliacao'],
  consulta: ['aprovacao', 'avaliacao'],
  documentacao: ['contrato'],
  vistoria: ['contrato'],
  // NF-e de entrada exige contrato e consulta (mesma trava do Processo da Consignação).
  nf_compra: ['contrato', 'consulta'],
  renave: ['nf_compra'],
  transferencia: ['nf_compra', 'renave', 'contrato'],
  preparacao: ['aprovacao', 'avaliacao'],
  // NPS de aquisição: própria após a transferência; consignada após a NF de consignação.
  nps: ['transferencia', 'nf_compra'],
};

const paraData = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function carregarEtapasCompra(avaliacaoId: string): Promise<{ etapas: EtapaCompra[]; contexto: ContextoCompra }> {
  const [{ data: av }, { data: hist }, { data: nfs }, { data: contratosConsig }, { data: respostas }] = await Promise.all([
    (supabase.from('avaliacoes') as any)
      .select('id, situacao, tipo_aquisicao, aprovacao_status, consulta_realizada, renave_id_estoque, renave_atualizado_em, nps_status, nps_respondido_at, atendimento_id, updated_at, atendimento:atendimentos_motos!avaliacoes_atendimento_id_fkey(interesse)')
      .eq('id', avaliacaoId).maybeSingle(),
    supabase.from('status_history').select('entity_type, status, created_at')
      .eq('entity_id', avaliacaoId)
      .in('status', ['adquirida', 'aprovada', 'contrato_compra_gerado', 'consulta_realizada', 'estoque'])
      .order('created_at', { ascending: true }),
    (supabase.from('nfe_entradas' as any) as any).select('operacao, status, ambiente, data_emissao, created_at')
      .eq('avaliacao_id', avaliacaoId).in('operacao', ['compra', 'consignacao'])
      .order('created_at', { ascending: false }),
    supabase.from('contratos_consignacao').select('created_at').eq('avaliacao_id', avaliacaoId)
      .order('created_at', { ascending: true }).limit(1),
    // Resposta do NPS de aquisição chega por aqui (Tally ?id=<avaliacao_id>).
    (supabase.from('respostas_nps' as any) as any).select('data_resposta')
      .eq('atendimento_id', avaliacaoId).order('data_resposta', { ascending: true }).limit(1),
  ]);

  const a: any = av || {};
  const consignada = isTipoConsignada(a.tipo_aquisicao);
  const troca = a.atendimento?.interesse === 'trocar';
  const repasse = a.tipo_aquisicao === 'repasse';
  const h = (hist as any[]) || [];
  const histData = (tipo: string | null, status: string, ultimo = false) => {
    const linhas = h.filter((x) => x.status === status && (!tipo || x.entity_type === tipo));
    return paraData((ultimo ? linhas[linhas.length - 1] : linhas[0])?.created_at);
  };

  // Etapas do checklist do Processo (Pós-Compra ou Consignação).
  const { data: processos } = await (supabase.from((consignada ? 'consignacao_processos' : 'pos_compra_processos') as any) as any)
    .select('etapa, concluida, data_conclusao').eq('avaliacao_id', avaliacaoId);
  const proc = (processos as any[]) || [];
  const etapaFeita = (nome: string) => proc.some((p) => p.etapa === nome && p.concluida);
  const dataEtapa = (nome: string) => paraData(proc.find((p) => p.etapa === nome && p.concluida)?.data_conclusao);

  // Troca: o contrato da moto que entra é a proposta de VENDA do atendimento.
  let contratoTroca: Date | null = null;
  if (troca && !consignada && a.atendimento_id) {
    const { data } = await supabase.from('status_history').select('created_at')
      .eq('entity_type', 'showroom').eq('entity_id', a.atendimento_id).eq('status', 'contrato_de_venda')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    contratoTroca = paraData((data as any)?.created_at);
  }
  // Proposta salva (contratos): data de reserva para quem não tem o registro da
  // geração no histórico (gravado só desde out/2026). Compra = ipva_tipo COMPRA;
  // na troca vale a proposta de venda do atendimento.
  let contratoSalvo: Date | null = null;
  if (!consignada && a.atendimento_id) {
    const { data } = await supabase.from('contratos').select('ipva_tipo, created_at')
      .eq('atendimento_id', a.atendimento_id).order('created_at', { ascending: true });
    const linha = ((data as any[]) || []).find((c) => (troca ? (c.ipva_tipo ?? '') !== 'COMPRA' : c.ipva_tipo === 'COMPRA'));
    contratoSalvo = paraData(linha?.created_at);
  }

  const nfOp = consignada ? 'consignacao' : 'compra';
  const nf = ((nfs as any[]) || []).find((n) => n.operacao === nfOp);
  const nfProducao = nf?.status === 'processada' && nf?.ambiente === 'producao';
  const contratoConsig = paraData(((contratosConsig as any[]) || [])[0]?.created_at);
  const contratoCompra = histData('pos_compra', 'contrato_compra_gerado') ?? contratoTroca;
  const nfData = paraData(nfProducao ? (nf.data_emissao || nf.created_at) : null);
  const resposta = paraData(((respostas as any[]) || [])[0]?.data_resposta);
  const adquirida = ['adquirida', 'oficina', 'estoque'].includes(a.situacao);

  const aplica: Record<EtapaCompraKey, boolean> = {
    avaliacao: true,
    aprovacao: exigeAprovacao(a) && !troca,
    contrato: true,
    consulta: true,
    documentacao: !consignada,
    vistoria: !consignada,
    nf_compra: !repasse,
    renave: !consignada && !repasse,
    transferencia: !consignada,
    preparacao: true,
    nps: true,
  };

  const concluida: Record<EtapaCompraKey, boolean> = {
    avaliacao: adquirida,
    aprovacao: a.aprovacao_status === 'aprovada',
    // NF-e de entrada em produção também prova o contrato: a emissão exige a proposta.
    contrato: (consignada ? !!contratoConsig || etapaFeita('CONTRATO ASSINADO') : !!contratoCompra) || nfProducao,
    consulta: a.consulta_realizada === true,
    documentacao: etapaFeita('DOCUMENTAÇÃO RECEBIDA'),
    vistoria: etapaFeita('VISTORIA/CADEIA DOMINIAL'),
    nf_compra: nfProducao || etapaFeita('NF EMITIDA'),
    renave: !!a.renave_id_estoque || etapaFeita('ENTRADA RENAVE'),
    transferencia: etapaFeita('TRANSFERÊNCIA CONCLUÍDA'),
    preparacao: a.situacao === 'estoque',
    nps: a.nps_status === 'respondido' || !!resposta,
  };

  // Dias desde a aquisição (histórico "adquirida"; sem ele, a última alteração).
  const dataAquisicao = histData(null, 'adquirida') ?? paraData(a.updated_at);
  const conclusao: Record<EtapaCompraKey, Date | null> = {
    avaliacao: dataAquisicao,
    aprovacao: histData('pos_compra', 'aprovada', true),
    contrato: (consignada ? (contratoConsig ?? dataEtapa('CONTRATO ASSINADO')) : (contratoCompra ?? contratoSalvo)) ?? nfData,
    consulta: histData('consulta', 'consulta_realizada', true) ?? dataEtapa('CONSULTA REALIZADA'),
    documentacao: dataEtapa('DOCUMENTAÇÃO RECEBIDA'),
    vistoria: dataEtapa('VISTORIA/CADEIA DOMINIAL'),
    nf_compra: nfData ?? dataEtapa('NF EMITIDA'),
    renave: paraData(a.renave_atualizado_em) ?? dataEtapa('ENTRADA RENAVE'),
    transferencia: dataEtapa('TRANSFERÊNCIA CONCLUÍDA'),
    preparacao: histData('preparacao', 'estoque', true),
    nps: paraData(a.nps_respondido_at) ?? resposta,
  };
  const diasDe = (k: EtapaCompraKey): number | null => {
    const fim = concluida[k] ? conclusao[k] : null;
    return fim && dataAquisicao ? Math.max(0, differenceInCalendarDays(fim, dataAquisicao)) : null;
  };

  const pendenteAntes = (k: EtapaCompraKey, visitadas = new Set<EtapaCompraKey>()): EtapaCompraKey | null => {
    const pendentes: EtapaCompraKey[] = [];
    for (const d of DEPENDE_DE[k] || []) {
      if (visitadas.has(d)) continue;
      visitadas.add(d);
      if (aplica[d] && !concluida[d]) pendentes.push(d);
      const indireta = pendenteAntes(d, visitadas);
      if (indireta) pendentes.push(indireta);
    }
    return pendentes.sort((x, y) => ORDEM.indexOf(x) - ORDEM.indexOf(y))[0] ?? null;
  };

  const labels: Record<EtapaCompraKey, string> = {
    avaliacao: 'Avaliação',
    aprovacao: 'Aprovação',
    contrato: 'Contrato',
    consulta: 'Consulta',
    documentacao: 'Documentação',
    vistoria: 'Vistoria',
    nf_compra: consignada ? 'NF Consignação' : 'NF Compra',
    renave: 'Renave',
    transferencia: 'Transferência',
    preparacao: 'Preparação',
    nps: 'NPS',
  };

  return {
    etapas: ORDEM.filter((k) => aplica[k]).map((k) => {
      const trava = concluida[k] ? null : pendenteAntes(k);
      return { key: k, label: labels[k], concluida: concluida[k], aguardando: trava ? labels[trava] : null, dias: diasDe(k) };
    }),
    contexto: { consignada, troca },
  };
}
