import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { TIPOS_PROPRIA, isTipoConsignada } from '@/lib/tipoAquisicao';

/**
 * Etapas da venda de moto mostradas na barra de setas do atendimento vendido
 * (pedido do usuário, 2026-11-22). As telas continuam as mesmas (atendimento,
 * pós-venda, intermediação, NPS); aqui só se calcula, por etapa, se ela vale
 * para a venda e se já está concluída — espelhando as regras do checklist do
 * Processo (ProcessoDialog).
 */
export type EtapaVendaKey =
  | 'negociacao'
  | 'aprovacao'
  | 'contrato'
  | 'vistoria'
  | 'nf_compra'
  | 'nf_venda'
  | 'entrega'
  | 'renave'
  | 'transferencia'
  | 'nps';

export interface EtapaVenda {
  key: EtapaVendaKey;
  label: string;
  concluida: boolean;
  /** Etapa ainda travada: rótulo da etapa pendente que precisa ser concluída antes. */
  aguardando: string | null;
  /** Dias da marcação da venda até a conclusão; null = pendente ou sem data. */
  dias: number | null;
}

export interface ContextoVenda {
  /** Moto vendida: seminova, 0km ou null (moto externa, sem estoque). */
  fonte: 'seminova' | '0km' | null;
  /** Moto consignada vendida (Intermediação). */
  consignada: boolean;
}

const LABELS: Record<EtapaVendaKey, string> = {
  negociacao: 'Negociação',
  aprovacao: 'Aprovação',
  contrato: 'Contrato',
  vistoria: 'Vistoria',
  nf_compra: 'NF Compra',
  nf_venda: 'NF Venda',
  entrega: 'Entrega',
  renave: 'Renave',
  transferencia: 'Transferência',
  nps: 'NPS',
};

// Comunicado de venda saiu da barra em 2026-11-22 (continua no checklist do Processo).
const ORDEM: EtapaVendaKey[] = [
  'negociacao', 'aprovacao', 'contrato', 'vistoria', 'nf_compra', 'nf_venda',
  'entrega', 'renave', 'transferencia', 'nps',
];
// Moto 0km: a entrega vem depois do RENAVE (ATPV-e).
const ORDEM_0KM: EtapaVendaKey[] = [
  'negociacao', 'aprovacao', 'contrato', 'vistoria', 'nf_compra', 'nf_venda',
  'renave', 'entrega', 'transferencia', 'nps',
];

/**
 * Dependências entre etapas (vale para qualquer nível de usuário). Uma etapa só
 * libera quando as que ela depende — e as dependências delas — estão
 * concluídas. Dependência que não se aplica à venda é ignorada. Espelha as
 * travas que já existem nas telas: processo só após a aprovação, NF-e de venda
 * exige a proposta de venda, RENAVE/transferência exigem a NF-e de venda, a
 * 0km só emplaca com o ATPV-e e o NPS só é enviado após a entrega.
 */
const DEPENDE_DE: Partial<Record<EtapaVendaKey, EtapaVendaKey[]>> = {
  aprovacao: ['negociacao'],
  contrato: ['aprovacao'],
  vistoria: ['aprovacao'],
  nf_compra: ['aprovacao'],
  nf_venda: ['contrato', 'nf_compra'],
  entrega: ['nf_venda', 'contrato'],
  renave: ['nf_venda'],
  transferencia: ['nf_venda', 'renave', 'contrato'],
  nps: ['entrega'],
};

const NF_PRODUCAO = (n: any) => n?.status === 'processada' && n?.ambiente === 'producao';

/** Data de coluna date/timestamp. Data pura ("2026-11-20") vira meio-dia local, sem pular de dia por fuso. */
const paraData = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const maisRecente = (datas: (string | null | undefined)[]) =>
  datas.map(paraData).filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;

export async function carregarEtapasVenda(atendimentoId: string): Promise<{ etapas: EtapaVenda[]; contexto: ContextoVenda }> {
  const [{ data: at }, { data: mi }, { data: processos }, { data: nfVenda }, { data: trocas }, { data: contratoVenda }, { data: historico }, { data: contratosSalvos }] = await Promise.all([
    supabase.from('atendimentos_motos')
      .select('situacao, interesse, venda_aprovacao_status, nps_status, nps_respondido_at, updated_at')
      .eq('id', atendimentoId).maybeSingle(),
    supabase.from('motos_interesse').select('estoque_moto_id, estoque_tipo')
      .eq('atendimento_id', atendimentoId).not('estoque_moto_id', 'is', null).limit(1).maybeSingle(),
    supabase.from('pos_venda_processos').select('etapa, concluida, data_conclusao').eq('atendimento_id', atendimentoId),
    // Última NF-e de venda do atendimento (mesmo critério do checklist).
    (supabase.from('nfe_entradas' as any) as any).select('status, ambiente, data_emissao, created_at')
      .eq('atendimento_id', atendimentoId).like('operacao', 'venda%')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // Motos de troca que entram como próprias (as de repasse não têm NF de entrada).
    supabase.from('avaliacoes').select('id, tipo_aquisicao')
      .eq('atendimento_id', atendimentoId)
      .in('tipo_aquisicao', TIPOS_PROPRIA)
      .in('situacao', ['adquirida', 'estoque', 'oficina']),
    // Contrato de venda gerado: o ContratoDialog registra cada geração no histórico.
    supabase.from('status_history').select('created_at')
      .eq('entity_type', 'showroom').eq('entity_id', atendimentoId).eq('status', 'contrato_de_venda')
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    // Marcação da venda e aprovação do master (datas para a contagem de dias).
    supabase.from('status_history').select('entity_type, status, created_at')
      .eq('entity_id', atendimentoId)
      .in('status', ['vendido', 'venda_aprovada'])
      .order('created_at', { ascending: true }),
    // Proposta salva: data de reserva para vendas sem o registro da geração no
    // histórico (gravado só desde out/2026).
    supabase.from('contratos').select('ipva_tipo, created_at')
      .eq('atendimento_id', atendimentoId).order('created_at', { ascending: true }),
  ]);

  const a: any = at || {};
  const m: any = mi || null;
  const eh0km = m?.estoque_tipo === '0km';

  // Moto vendida no estoque.
  let estoque: any = null;
  if (m?.estoque_moto_id) {
    const { data } = eh0km
      ? await (supabase as any).from('estoque_motos_novas').select('id, data_venda, renave_atpv_numero, renave_atualizado_em').eq('id', m.estoque_moto_id).maybeSingle()
      : await (supabase as any).from('estoque_motos')
          .select('id, data_venda, avaliacao:avaliacao_id(id, tipo_aquisicao, renave_saida_em)')
          .eq('id', m.estoque_moto_id).maybeSingle();
    estoque = data || null;
  }
  const fonte: ContextoVenda['fonte'] = estoque ? (eh0km ? '0km' : 'seminova') : null;
  const avEstoque = fonte === 'seminova' ? estoque?.avaliacao : null;
  const consignada = !!avEstoque && isTipoConsignada(avEstoque.tipo_aquisicao);
  const vendaRepasse = avEstoque?.tipo_aquisicao === 'repasse';
  const temSaidaRenave = !!avEstoque && TIPOS_PROPRIA.includes(avEstoque.tipo_aquisicao) && !vendaRepasse;

  // NF de compra: motos da troca (não repasse) + a própria consignada (compra
  // após a devolução simbólica, Intermediação Parte 1).
  const trocaIds = a.interesse === 'trocar'
    ? ((trocas as any[]) || []).filter((t) => t.tipo_aquisicao !== 'repasse').map((t) => t.id)
    : [];
  const compraIds = [...trocaIds, ...(consignada ? [avEstoque.id] : [])];
  let compraFeitas = new Set<string>();
  let nfsCompra: any[] = [];
  if (compraIds.length) {
    const { data: nfs } = await (supabase.from('nfe_entradas' as any) as any)
      .select('avaliacao_id, data_emissao, created_at')
      .in('avaliacao_id', compraIds)
      .eq('operacao', 'compra').eq('status', 'processada').eq('ambiente', 'producao');
    nfsCompra = (nfs as any[]) || [];
    compraFeitas = new Set(nfsCompra.map((n) => n.avaliacao_id));
  }

  const etapaFeita = (nome: string) => ((processos as any[]) || []).some((p) => p.etapa === nome && p.concluida);
  const dataEtapa = (nome: string) =>
    paraData(((processos as any[]) || []).find((p) => p.etapa === nome && p.concluida)?.data_conclusao);

  const aplica: Record<EtapaVendaKey, boolean> = {
    negociacao: true,
    aprovacao: true,
    contrato: true,
    // Moto 0km tem checklist próprio (NF, BIN, ATPV-e, emplacamento).
    vistoria: fonte !== '0km',
    nf_compra: compraIds.length > 0,
    nf_venda: consignada || (!!estoque && !vendaRepasse),
    entrega: true,
    renave: fonte === '0km' || temSaidaRenave,
    transferencia: true,
    nps: true,
  };

  const concluida: Record<EtapaVendaKey, boolean> = {
    negociacao: a.situacao === 'vendido',
    aprovacao: a.venda_aprovacao_status === 'aprovada',
    // NF-e de venda em produção também prova o contrato: a emissão exige a proposta salva.
    contrato: !!contratoVenda || NF_PRODUCAO(nfVenda),
    vistoria: etapaFeita('VISTORIA'),
    nf_compra: compraIds.length > 0 && compraIds.every((id) => compraFeitas.has(id)),
    nf_venda: NF_PRODUCAO(nfVenda),
    entrega: etapaFeita('ENTREGA DA MOTO'),
    renave: fonte === '0km' ? !!estoque?.renave_atpv_numero : !!avEstoque?.renave_saida_em,
    transferencia: etapaFeita(fonte === '0km' ? 'EMPLACAMENTO/TRANSFERÊNCIA' : 'TRANSFERÊNCIA FINALIZADA'),
    nps: a.nps_status === 'respondido',
  };

  // Dias desde a marcação da venda: data_venda do estoque; sem estoque, o
  // histórico "vendido" do Showroom; por último, a última alteração do atendimento.
  const hist = (historico as any[]) || [];
  const dataVenda = paraData(estoque?.data_venda)
    ?? paraData(hist.filter((h) => h.entity_type === 'showroom' && h.status === 'vendido').pop()?.created_at)
    ?? paraData(a.updated_at);
  const nfVendaData = NF_PRODUCAO(nfVenda) ? (nfVenda.data_emissao || nfVenda.created_at) : null;
  const conclusao: Record<EtapaVendaKey, Date | null> = {
    negociacao: dataVenda,
    aprovacao: paraData(hist.filter((h) => h.status === 'venda_aprovada').pop()?.created_at),
    contrato: paraData((contratoVenda as any)?.created_at)
      ?? paraData(((contratosSalvos as any[]) || []).find((c) => (c.ipva_tipo ?? '') !== 'COMPRA')?.created_at)
      ?? paraData(nfVendaData),
    vistoria: dataEtapa('VISTORIA'),
    nf_compra: maisRecente(nfsCompra.map((n) => n.data_emissao || n.created_at)),
    nf_venda: paraData(nfVendaData),
    entrega: dataEtapa('ENTREGA DA MOTO'),
    renave: fonte === '0km'
      ? (dataEtapa('ATPV-E') ?? paraData(estoque?.renave_atualizado_em))
      : paraData(avEstoque?.renave_saida_em),
    transferencia: dataEtapa(fonte === '0km' ? 'EMPLACAMENTO/TRANSFERÊNCIA' : 'TRANSFERÊNCIA FINALIZADA'),
    nps: paraData(a.nps_respondido_at),
  };
  const diasDe = (k: EtapaVendaKey): number | null => {
    const fim = concluida[k] ? conclusao[k] : null;
    return fim && dataVenda ? Math.max(0, differenceInCalendarDays(fim, dataVenda)) : null;
  };

  // Primeira etapa pendente (na ordem da barra) entre as dependências diretas e
  // indiretas que se aplicam a esta venda.
  const ordem = fonte === '0km' ? ORDEM_0KM : ORDEM;
  const dependencias = (k: EtapaVendaKey): EtapaVendaKey[] =>
    k === 'entrega' && fonte === '0km' ? [...(DEPENDE_DE.entrega || []), 'renave'] : (DEPENDE_DE[k] || []);
  const pendenteAntes = (k: EtapaVendaKey, visitadas = new Set<EtapaVendaKey>()): EtapaVendaKey | null => {
    const pendentes: EtapaVendaKey[] = [];
    for (const d of dependencias(k)) {
      if (visitadas.has(d)) continue;
      visitadas.add(d);
      if (aplica[d] && !concluida[d]) pendentes.push(d);
      const indireta = pendenteAntes(d, visitadas);
      if (indireta) pendentes.push(indireta);
    }
    return pendentes.sort((x, y) => ordem.indexOf(x) - ordem.indexOf(y))[0] ?? null;
  };

  return {
    etapas: ordem.filter((k) => aplica[k]).map((k) => {
      const trava = concluida[k] ? null : pendenteAntes(k);
      return { key: k, label: LABELS[k], concluida: concluida[k], aguardando: trava ? LABELS[trava] : null, dias: diasDe(k) };
    }),
    contexto: { fonte, consignada },
  };
}
