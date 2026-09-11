// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cancelarNfe, consultarNfe, emitirNfe, focusBaseUrl, mensagemErroFocus, type FocusAmbiente } from './focus.ts';
import { montarPayloadNfeCompra, brl, indicadorIeDestinatario, difalAplicavel, type RegraFiscal } from './payload.ts';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';

// Planos de conta / centros de custo do compromisso financeiro (chaves fixas — validar com a contabilidade).
const PLANO_COMPRA_USADA = 'd16507df-9655-4677-8ed9-01398ce28239'; // Compra de Motos Usadas (custo)
const PLANO_VENDA_USADA = 'c4f76d4e-bfd9-4ade-987e-4a0798603416';  // Venda de Motos Usadas (receita)
const PLANO_VENDA_NOVA = 'c155d12c-4f49-4592-be1c-63f515ff97d3';   // Venda de Motos Novas (receita)
const CC_MOTOS_USADAS = '7fe3888a-fd17-4c31-b78b-82a0af680ff3';    // CC.102 Venda de motos usadas
const CC_MOTOS_NOVAS = '30f457e2-d6b9-48c3-aca7-e45bbf0200df';     // CC.101 Venda de motos novas

// Formas de pagamento fixas (tabela formas_pagamento) — repasse ao cliente / financiamento.
const FORMA_PAGAMENTO_ID = '63e1fff5-14d7-476c-b2da-e1ea173279a1'; // Pix
const FORMA_PAGAMENTO_BOLETO_ID = '7d0f2125-fedf-4a27-8ab0-be21fecaf642'; // Boleto

const DIAS_VENCIMENTO = 7;

/** marca/modelo agora vem do catalogo via embed `marca:marca_id(nome)`.
 * Aceita tambem string crua (janela em que a coluna-ponte ainda existe). */
const nomeCat = (v: any): string | null =>
  (v && typeof v === 'object' ? (v.nome ?? null) : (v ?? null));

/**
 * Extrai os valores de ICMS-ST retido anteriormente da NF-e de ENTRADA da moto
 * 0km (grupo de ICMS do 1º item), para transcrever no `<ICMS60>` da NF de venda.
 * Cobre CST 60 (subgrupo "ST retido" explícito: vBCSTRet / vICMSSubstituto /
 * vICMSSTRet) e CST 10/30/70/90 (a NF de entrada reteve a ST na própria
 * operação: vBCST = base, vICMSST = ST retida, vICMS = ICMS próprio do substituto).
 */
function stRetidoDoXmlEntrada(xml: string): { bc: number; subst: number; ret: number } | null {
  if (!xml) return null;
  // Restringe ao bloco <imposto> do item pra não pegar <vICMS> dos totais.
  const bloco = xml.match(/<imposto>[\s\S]*?<\/imposto>/)?.[0] ?? xml;
  const num = (re: RegExp) => {
    const m = bloco.match(re);
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  let bc = num(/<vBCSTRet>([\d.]+)<\/vBCSTRet>/);
  let subst = num(/<vICMSSubstituto>([\d.]+)<\/vICMSSubstituto>/);
  let ret = num(/<vICMSSTRet>([\d.]+)<\/vICMSSTRet>/);
  if (bc == null) bc = num(/<vBCST>([\d.]+)<\/vBCST>/);
  if (ret == null) ret = num(/<vICMSST>([\d.]+)<\/vICMSST>/);
  if (subst == null) subst = num(/<vICMS>([\d.]+)<\/vICMS>/);
  if (!bc || !ret) return null;
  return { bc, subst: subst ?? 0, ret };
}

type Operacao = 'compra' | 'consignacao' | 'devolucao_consignacao' | 'venda_seminova' | 'venda_0km';

interface OperacaoConfig {
  refPrefix: string;
  naturezaDescricao: string;
  statusEntity: string;
  statusHist: string;
  /** Sem etapaTable/etapa (ex.: devolução simbólica) — pula o upsert de checklist. */
  etapaTable?: string;
  etapa?: string;
  avStatusField: string | null;
  avStatusEmAndamento: string;
  criaCompromisso: boolean;
  /** 'pagar' (compra/troca) ou 'receber' (venda). Só relevante se criaCompromisso. */
  compromissoTipo?: 'pagar' | 'receber';
  planoContaId?: string;
  centroCustoId?: string;
  /** 'avaliacao' (entrada) ou 'atendimento' (venda) */
  keyBy: 'avaliacao' | 'atendimento';
}

const CFG: Record<Operacao, OperacaoConfig> = {
  compra: {
    refPrefix: 'compra',
    naturezaDescricao: 'Compra de moto seminova',
    statusEntity: 'pos_compra',
    statusHist: 'nfe_compra_emitida',
    etapaTable: 'pos_compra_processos',
    etapa: 'NF EMITIDA',
    avStatusField: 'pos_compra_status',
    avStatusEmAndamento: 'em_andamento',
    criaCompromisso: true,
    compromissoTipo: 'pagar',
    planoContaId: PLANO_COMPRA_USADA,
    centroCustoId: CC_MOTOS_USADAS,
    keyBy: 'avaliacao',
  },
  consignacao: {
    refPrefix: 'consignacao',
    naturezaDescricao: 'Entrada em consignação',
    statusEntity: 'consignacao',
    statusHist: 'nfe_consignacao_emitida',
    etapaTable: 'consignacao_processos',
    etapa: 'NF EMITIDA',
    avStatusField: 'consignacao_status',
    avStatusEmAndamento: 'concluido',
    criaCompromisso: false,
    keyBy: 'avaliacao',
  },
  // Devolução simbólica da moto ao consignante (saída, referenciando a NF de
  // entrada em consignação) — 1º passo para transformar consignação em compra,
  // antes de vender a moto como estoque próprio. Sem etapa de checklist própria
  // (não aparece em consignacao_processos) e sem compromisso financeiro (não há
  // movimentação de caixa real).
  devolucao_consignacao: {
    refPrefix: 'devolucao',
    naturezaDescricao: 'Devolução Simbólica de Consignação',
    statusEntity: 'consignacao',
    statusHist: 'nfe_devolucao_consignacao_emitida',
    avStatusField: null,
    avStatusEmAndamento: '',
    criaCompromisso: false,
    keyBy: 'avaliacao',
  },
  venda_seminova: {
    refPrefix: 'venda',
    naturezaDescricao: 'Venda de moto seminova',
    statusEntity: 'pos_venda',
    statusHist: 'nfe_venda_emitida',
    etapaTable: 'pos_venda_processos',
    etapa: 'NF-E DE VENDA',
    avStatusField: null,
    avStatusEmAndamento: '',
    criaCompromisso: true,
    compromissoTipo: 'receber',
    planoContaId: PLANO_VENDA_USADA,
    centroCustoId: CC_MOTOS_USADAS,
    keyBy: 'atendimento',
  },
  venda_0km: {
    refPrefix: 'venda',
    naturezaDescricao: 'Venda de moto 0km',
    statusEntity: 'pos_venda',
    statusHist: 'nfe_venda_emitida',
    etapaTable: 'pos_venda_processos',
    etapa: 'NF-E DE VENDA',
    avStatusField: null,
    avStatusEmAndamento: '',
    criaCompromisso: true,
    compromissoTipo: 'receber',
    planoContaId: PLANO_VENDA_NOVA,
    centroCustoId: CC_MOTOS_NOVAS,
    keyBy: 'atendimento',
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Mapeia o status da Focus para o status_check da tabela nfe_entradas. */
function mapStatus(focusStatus: string | undefined): string {
  switch (focusStatus) {
    case 'autorizado':
      return 'processada';
    case 'cancelado':
      return 'cancelada';
    case 'processando_autorizacao':
    case 'processando_cancelamento':
      return 'processando_itens';
    case 'erro_autorizacao':
    case 'denegado':
      return 'erro';
    default:
      return 'validando';
  }
}

/**
 * Aplica no sistema o cancelamento de uma NF-e (feito pelo nosso botão OU
 * direto na SEFAZ/Focus e detectado numa consulta): grava a linha como
 * `cancelada`, reabre a etapa do processo, cancela os compromissos financeiros
 * gerados por essa NF (status -> `cancelada`; parcelas ainda não pagas ->
 * `cancelado`) e registra no histórico. Parcelas já pagas NÃO são mexidas
 * (houve baixa real) — devolve a contagem para avisar o usuário.
 */
async function aplicarCancelamento(
  admin: any,
  cfg: OperacaoConfig,
  entityId: string,
  nfeRow: any,
  opts: { justificativa?: string | null; xmlCancelamento?: string | null; callerId: string; callerName: string | null },
): Promise<{ updated: any; error: any; parcelasPagas?: number }> {
  const patch: Record<string, unknown> = {
    status: 'cancelada',
    focus_status: 'cancelado',
    cancelada_em: nfeRow.cancelada_em || new Date().toISOString(),
    erro_mensagem: null,
  };
  if (opts.justificativa) patch.cancelamento_justificativa = opts.justificativa;
  if (opts.xmlCancelamento) patch.xml_raw = opts.xmlCancelamento;

  const { data: updated, error } = await admin
    .from('nfe_entradas').update(patch).eq('id', nfeRow.id).select('*').maybeSingle();
  if (error) return { updated: null, error };

  const fkCol = cfg.keyBy === 'avaliacao' ? 'avaliacao_id' : 'atendimento_id';
  if (cfg.etapaTable && cfg.etapa) {
    await admin.from(cfg.etapaTable)
      .update({ concluida: false, data_conclusao: null })
      .eq(fkCol, entityId).eq('etapa', cfg.etapa);
  }

  // Cancela os compromissos financeiros dessa NF. Parcelas já pagas ficam como
  // estão (baixa real — acerto/estorno manual); as demais viram 'cancelado'.
  let parcelasPagas = 0;
  const { data: compsNf } = await admin
    .from('compromissos').select('id').eq('nfe_entrada_id', nfeRow.id).is('deleted_at', null);
  const compIds = ((compsNf as any[]) || []).map((c) => c.id);
  if (compIds.length > 0) {
    await admin.from('compromissos')
      .update({ status_compromisso: 'cancelada' })
      .in('id', compIds);
    await admin.from('compromissos_parcelas')
      .update({ status_pagamento: 'cancelado', data_pagamento: null, valor_juros: 0, valor_desconto: 0 })
      .in('compromisso_id', compIds)
      .neq('status_pagamento', 'pago');
    const { count } = await admin.from('compromissos_parcelas')
      .select('id', { count: 'exact', head: true })
      .in('compromisso_id', compIds)
      .eq('status_pagamento', 'pago');
    parcelasPagas = count ?? 0;
  }

  const { data: jaReg } = await admin
    .from('status_history').select('id')
    .eq('entity_type', cfg.statusEntity).eq('entity_id', entityId)
    .eq('status', `${cfg.statusHist}_cancelada`).limit(1);
  if (!jaReg || jaReg.length === 0) {
    await admin.from('status_history').insert({
      entity_type: cfg.statusEntity,
      entity_id: entityId,
      status: `${cfg.statusHist}_cancelada`,
      changed_by: opts.callerId,
      changed_by_name: opts.callerName,
      observacoes: `NF-e nº ${nfeRow.numero ?? '-'} cancelada${opts.justificativa ? ` — ${opts.justificativa}` : ' (evento registrado na SEFAZ)'}`,
    });
  }
  return { updated, error: null, parcelasPagas };
}

const PENDENTES = new Set(['recebida', 'validando', 'processando_itens']);

/**
 * Chamada quando uma NF-e de PRODUÇÃO é autorizada: apaga as NF-e de
 * HOMOLOGAÇÃO da mesma entidade (e as tentativas de produção que deram erro —
 * sem número, não são documento fiscal) + seus relacionamentos (itens via
 * CASCADE, compromissos/parcelas, e o histórico "NF emitida" de homologação,
 * que o registrarPosAutorizacao logo em seguida recria com o número real).
 * A NF de produção recém-autorizada (`keepNfeId`) fica.
 */
async function limparNfeHomologacao(
  admin: any,
  cfg: OperacaoConfig,
  entityId: string,
  keepNfeId: string,
  operacao: Operacao,
): Promise<number> {
  const fkCol = cfg.keyBy === 'avaliacao' ? 'avaliacao_id' : 'atendimento_id';
  // Escopado por `operacao`: uma mesma avaliação pode acumular várias operações
  // em sequência (consignação -> devolução simbólica -> compra) — cada uma com
  // seu próprio ciclo de homologação/produção, sem interferir nas outras.
  const { data: lixo } = await admin
    .from('nfe_entradas')
    .select('id')
    .eq(fkCol, entityId)
    .eq('operacao', operacao)
    .neq('id', keepNfeId)
    .or('ambiente.eq.homologacao,status.eq.erro');
  const ids = ((lixo as any[]) || []).map((r) => r.id);
  if (ids.length === 0) return 0;

  // Compromissos gerados por essas NF antes da §2.14 (parcelas via CASCADE).
  await admin.from('compromissos').delete().in('nfe_entrada_id', ids);
  // As NF (nfe_itens via CASCADE; estoque_motos_novas.nfe_item_id via SET NULL).
  await admin.from('nfe_entradas').delete().in('id', ids);
  // Histórico "NF emitida" de homologação — o registrarPosAutorizacao a seguir
  // insere de novo, agora com o número da NF de produção.
  await admin.from('status_history').delete()
    .eq('entity_type', cfg.statusEntity)
    .eq('entity_id', entityId)
    .eq('status', cfg.statusHist);
  return ids.length;
}

async function registrarPosAutorizacao(
  admin: any,
  cfg: OperacaoConfig,
  params: {
    entityId: string; // avaliacaoId ou atendimentoId conforme cfg.keyBy
    operacao: Operacao;
    dataEmissao: string;
    numero: string | null;
    serie: string | null;
    callerId: string;
    callerName: string | null;
  },
) {
  const { entityId, operacao, dataEmissao, numero, serie, callerId, callerName } = params;
  const porAvaliacao = cfg.keyBy === 'avaliacao';
  const fkCol = porAvaliacao ? 'avaliacao_id' : 'atendimento_id';

  // Historico de movimentacoes.
  const { data: jaRegistrado } = await admin
    .from('status_history')
    .select('id')
    .eq('entity_type', cfg.statusEntity)
    .eq('entity_id', entityId)
    .eq('status', cfg.statusHist)
    .limit(1);

  if (!jaRegistrado || jaRegistrado.length === 0) {
    await admin.from('status_history').insert({
      entity_type: cfg.statusEntity,
      entity_id: entityId,
      status: cfg.statusHist,
      changed_by: callerId,
      changed_by_name: callerName,
      observacoes: `NF-e nº ${numero ?? '-'} série ${serie ?? '-'}`,
    });
  }

  // Marca a etapa do checklist como concluida (operações sem etapa própria,
  // como a devolução simbólica, pulam este bloco).
  if (cfg.etapaTable && cfg.etapa) {
    await admin.from(cfg.etapaTable).upsert(
      {
        [fkCol]: entityId,
        etapa: cfg.etapa,
        concluida: true,
        data_conclusao: dataEmissao,
      },
      { onConflict: `${fkCol},etapa` },
    );
  }

  // Emitir a NF avanca o status do processo (so p/ entradas keyed por avaliacao).
  if (porAvaliacao && cfg.avStatusField) {
    const { data: avStatus } = await admin
      .from('avaliacoes')
      .select(cfg.avStatusField)
      .eq('id', entityId)
      .maybeSingle();
    if (['aprovada', 'em_aberto', 'contrato_assinado', 'cadastro_nbs', null, undefined].includes(avStatus?.[cfg.avStatusField] ?? null)) {
      await admin.from('avaliacoes').update({ [cfg.avStatusField]: cfg.avStatusEmAndamento }).eq('id', entityId);
    }
  }

  // Compra que sucede uma devolução simbólica (transformação de consignação em
  // compra): a moto deixa de estar "em consignação" — vira estoque próprio
  // (mesmo tratamento de 'propria' em toda a regra de negócio, ver tipoAquisicao.ts).
  if (operacao === 'compra' && porAvaliacao) {
    const { data: avTipo } = await admin.from('avaliacoes').select('tipo_aquisicao').eq('id', entityId).maybeSingle();
    if ((avTipo as any)?.tipo_aquisicao === 'consignada') {
      await admin.from('avaliacoes').update({ tipo_aquisicao: 'convertida' }).eq('id', entityId);
    }
  }

  if (!cfg.criaCompromisso || !cfg.planoContaId || !cfg.centroCustoId) return;

  // Compromisso financeiro (contas a pagar/receber) da NF-e.
  const { data: nfeRow } = await admin
    .from('nfe_entradas')
    .select('*')
    .eq(fkCol, entityId)
    .eq('operacao', operacao)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Guard duro: só gera compromisso DEPOIS da NF-e autorizada. Vale para toda operação.
  if (!nfeRow?.id || nfeRow.status !== 'processada' || !nfeRow.empresa_id) return;

  const venc = new Date(nfeRow.data_emissao || dataEmissao || Date.now());
  venc.setDate(venc.getDate() + DIAS_VENCIMENTO);
  const vencStr = venc.toISOString().slice(0, 10);

  type ParcelaDesejada = { numero_parcela: number; valor: number; tipo: string; forma_pagamento_id: string; pago?: boolean; data_vencimento?: string };
  const compromissoNatureza = cfg.compromissoTipo === 'receber' ? 'receita' : 'despesa';
  let parcelasDesejadas: ParcelaDesejada[] = [];
  let obsCompromisso: string | null = null;
  // Vínculo do compromisso criado na PROPOSTA (gerar-compromissos-proposta), p/ reconciliar.
  let contratoVendaId: string | null = null;
  // Troca sem quitação: o repasse ao cliente já foi liquidado pela própria moto
  // dada em pagamento — a despesa nasce quitada. Com parcela de quitação, fica em aberto.
  let compromissoJaPago = false;
  const dataPagamento = new Date(nfeRow.data_emissao || dataEmissao || Date.now()).toISOString().slice(0, 10);

  const obsMoto = (marca?: string | null, modelo?: string | null, placa?: string | null) => {
    const desc = [marca, modelo].filter(Boolean).join(' ').trim();
    const placaFmt = String(placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return [desc, placaFmt].filter(Boolean).join(' - ').toUpperCase() || null;
  };

  if (cfg.compromissoTipo === 'receber') {
    // ---- Venda: contas a RECEBER, parcelas a partir das formas de pagamento do contrato ----
    // O contrato de venda é o do atendimento que NÃO é o marcador de compra (ipva_tipo != 'COMPRA',
    // incluindo null — lojas Ducati não usam IPVA).
    const { data: contratosAt } = await admin
      .from('contratos')
      .select('id, ipva_tipo')
      .eq('atendimento_id', entityId)
      .order('created_at', { ascending: false });
    const contratoVenda = ((contratosAt || []) as any[]).find((c) => c.ipva_tipo !== 'COMPRA') ?? null;
    contratoVendaId = contratoVenda?.id ?? null;

    const { data: formas } = contratoVenda?.id
      ? await admin
          .from('formas_pagamento_contrato')
          .select('tipo, forma_pagamento_id, valor_total, valor_entrada, valor_financiado, data_pagamento')
          .eq('contrato_id', contratoVenda.id)
          .order('created_at', { ascending: true })
      : { data: [] };

    const ehFinanciamentoContrato = (t?: string | null) =>
      String(t ?? '').toLowerCase().includes('financiamento');

    let n = 0;
    for (const f of (formas || []) as any[]) {
      // Data do pagamento informada na forma → vira o vencimento da(s) parcela(s)
      // dessa forma. Vazio: cai no fallback (data de emissão + DIAS_VENCIMENTO).
      const vencForma = typeof f.data_pagamento === 'string' && f.data_pagamento ? f.data_pagamento : undefined;
      if (ehFinanciamentoContrato(f.tipo)) {
        const entrada = Number(f.valor_entrada ?? 0);
        const financiado = Number(f.valor_financiado ?? 0);
        if (entrada > 0) parcelasDesejadas.push({ numero_parcela: ++n, valor: entrada, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_ID, data_vencimento: vencForma });
        if (financiado > 0) parcelasDesejadas.push({ numero_parcela: ++n, valor: financiado, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_BOLETO_ID, data_vencimento: vencForma });
      } else {
        const total = Number(f.valor_total ?? 0);
        if (total > 0) {
          parcelasDesejadas.push({
            numero_parcela: ++n,
            valor: total,
            tipo: 'unico',
            forma_pagamento_id: f.forma_pagamento_id ?? FORMA_PAGAMENTO_ID,
            data_vencimento: vencForma,
          });
        }
      }
    }
    // Sem formas de pagamento: 1 parcela pelo valor da nota.
    if (parcelasDesejadas.length === 0) {
      parcelasDesejadas = [{ numero_parcela: 1, valor: Number(nfeRow.valor_total ?? 0), tipo: 'unico', forma_pagamento_id: FORMA_PAGAMENTO_ID }];
    }

    const [{ data: emVenda }, { data: emNova }] = await Promise.all([
      admin.from('estoque_motos')
        .select('avaliacao:avaliacao_id(marca:marca_id(nome), modelo:modelo_id(nome), placa)')
        .eq('atendimento_venda_id', entityId).maybeSingle(),
      admin.from('estoque_motos_novas')
        .select('placa, marca:marca_id(nome), modelo:modelo_id(nome)')
        .eq('atendimento_venda_id', entityId).maybeSingle(),
    ]);
    const av = (emVenda as any)?.avaliacao;
    const m = av
      ? { marca: nomeCat(av.marca), modelo: nomeCat(av.modelo), placa: av.placa }
      : ((emNova as any) ? { marca: nomeCat((emNova as any).marca), modelo: nomeCat((emNova as any).modelo), placa: (emNova as any).placa } : {});
    obsCompromisso = obsMoto(m.marca, m.modelo, m.placa);
  } else {
    // ---- Compra / troca: contas a PAGAR. O compromisso registra o REPASSE AO CLIENTE,
    // calculado sobre o FECHAMENTO do contrato:
    // repasse = fechamento - quitação - custo do cliente (previsão da avaliação + custos de oficina do cliente).
    const { data: avFinRaw } = await admin
      .from('avaliacoes')
      .select('previsao_custos_cliente, valor_quitacao, valor_fechamento, atendimento_id, marca:marca_id(nome), modelo:modelo_id(nome), placa')
      .eq('id', entityId)
      .maybeSingle();
    const avFin = avFinRaw
      ? { ...avFinRaw, marca: nomeCat((avFinRaw as any).marca), modelo: nomeCat((avFinRaw as any).modelo) }
      : avFinRaw;
    const { data: contratoFin } = avFin?.atendimento_id
      ? await admin
          .from('contratos')
          .select('valor_quitacao, valor_fechamento')
          .eq('atendimento_id', avFin.atendimento_id)
          .eq('ipva_tipo', 'COMPRA')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    // A moto entra como parte de pagamento (troca) quando o atendimento é de troca.
    const { data: atTroca } = avFin?.atendimento_id
      ? await admin.from('atendimentos_motos').select('interesse').eq('id', avFin.atendimento_id).maybeSingle()
      : { data: null };
    const ehTrocaCompromisso = (atTroca as any)?.interesse === 'trocar';
    const { data: custosCli } = await admin
      .from('custos_oficina')
      .select('responsavel, valor_previsto, valor_executado')
      .eq('avaliacao_id', entityId);

    const custosClienteOficina = (custosCli || [])
      .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
      .reduce((s: number, c: any) => s + Number(c.valor_executado ?? c.valor_previsto ?? 0), 0);
    const fechamento = Number(contratoFin?.valor_fechamento ?? avFin?.valor_fechamento ?? nfeRow.valor_total ?? 0);
    const quitacao = Number(contratoFin?.valor_quitacao ?? avFin?.valor_quitacao ?? 0);
    const custosClientePrev = Number(avFin?.previsao_custos_cliente ?? 0);
    const valorRepasse = Math.max(fechamento - quitacao - custosClientePrev - custosClienteOficina, 0);

    // Com quitação (financiamento a quitar): parcela à parte por BOLETO; o repasse fica no Pix.
    parcelasDesejadas = quitacao > 0
      ? [
          { numero_parcela: 1, valor: quitacao, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_BOLETO_ID },
          { numero_parcela: 2, valor: valorRepasse, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_ID },
        ]
      : [
          { numero_parcela: 1, valor: valorRepasse, tipo: 'unico', forma_pagamento_id: FORMA_PAGAMENTO_ID },
        ];
    // Troca SEM parcela de quitação: a despesa do repasse nasce quitada (a própria
    // moto dada em pagamento liquidou). Com quitação, fica em aberto (há pagamento real).
    if (ehTrocaCompromisso && quitacao <= 0) {
      compromissoJaPago = true;
      parcelasDesejadas = parcelasDesejadas.map((p) => ({ ...p, pago: true }));
    }
    obsCompromisso = obsMoto(avFin?.marca, avFin?.modelo, avFin?.placa);
  }

  // Compromisso: o normal é já existir — criado na GERAÇÃO DA PROPOSTA por
  // `gerar-compromissos-proposta` (origem 'venda' / 'compra' / 'troca'). Aqui a
  // NF-e apenas RECONCILIA: vincula nfe_entrada_id e ajusta as parcelas não pagas
  // aos valores finais da nota. Só cria do zero se não achar nenhum (dados antigos).
  const numeroPrefix = cfg.compromissoTipo === 'receber' ? 'VND-R' : 'CPR-D';

  const buscaPorVinculo = porAvaliacao
    ? admin.from('compromissos').select('id').eq('avaliacao_id', entityId).in('origem', ['compra', 'troca'])
    : (contratoVendaId
        ? admin.from('compromissos').select('id').eq('contrato_id', contratoVendaId).eq('origem', 'venda')
        : null);
  const { data: compViaVinculo } = buscaPorVinculo
    ? await buscaPorVinculo.is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle()
    : { data: null };
  const { data: compViaNfe } = await admin
    .from('compromissos')
    .select('id')
    .eq('nfe_entrada_id', nfeRow.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let compId: string | null = (compViaVinculo as any)?.id ?? (compViaNfe as any)?.id ?? null;

  if (compId) {
    // Reconcilia o cabeçalho com os dados finais da NF-e (não mexe se cancelado).
    await admin.from('compromissos')
      .update({
        nfe_entrada_id: nfeRow.id,
        empresa_id: nfeRow.empresa_id,
        fornecedor_id: nfeRow.fornecedor_id,
        numero_documento: nfeRow.numero ? `NF-${nfeRow.numero}` : null,
        observacoes: obsCompromisso,
        updated_by: callerId,
        ...(compromissoJaPago ? { status_compromisso: 'pago' } : {}),
      })
      .eq('id', compId)
      .neq('status_compromisso', 'cancelada');
  } else {
    const { data: numeroCompromisso, error: numeroErr } = await admin.rpc('gerar_numero_compromisso', {
      _prefix: numeroPrefix,
    });
    if (numeroErr) console.error('erro ao gerar numero_compromisso', numeroErr);

    const { data: comp, error: compErr } = await admin
      .from('compromissos')
      .insert({
        empresa_id: nfeRow.empresa_id,
        fornecedor_id: nfeRow.fornecedor_id,
        natureza: compromissoNatureza,
        despesa_fixa: false,
        plano_conta_id: cfg.planoContaId,
        centro_custo_id: cfg.centroCustoId,
        observacoes: obsCompromisso,
        status_compromisso: compromissoJaPago ? 'pago' : 'em_aberto',
        nfe_entrada_id: nfeRow.id,
        origem: porAvaliacao ? 'compra' : 'venda',
        ...(porAvaliacao ? { avaliacao_id: entityId } : (contratoVendaId ? { contrato_id: contratoVendaId } : {})),
        numero_compromisso: (numeroCompromisso as string | null) ?? null,
        numero_documento: nfeRow.numero ? `NF-${nfeRow.numero}` : null,
        created_by: callerId,
      })
      .select('id')
      .maybeSingle();
    if (compErr || !comp?.id) {
      console.error('erro ao criar compromisso', compErr);
      return;
    }
    compId = comp.id;
  }

  // Parcelas: mantém as PAGAS; apaga e recria as demais com os valores finais.
  const { data: parcelasExistentes } = await admin
    .from('compromissos_parcelas')
    .select('numero_parcela, status_pagamento')
    .eq('compromisso_id', compId);
  const parcelasPagas = new Set(
    (parcelasExistentes || []).filter((p: any) => p.status_pagamento === 'pago').map((p: any) => p.numero_parcela),
  );
  await admin.from('compromissos_parcelas')
    .delete()
    .eq('compromisso_id', compId)
    .neq('status_pagamento', 'pago');

  const parcelasAInserir = parcelasDesejadas
    .filter((p) => !parcelasPagas.has(p.numero_parcela))
    .map((p) => ({
      compromisso_id: compId,
      numero_parcela: p.numero_parcela,
      valor: p.valor,
      data_vencimento: p.data_vencimento || vencStr,
      tipo: p.tipo,
      forma_pagamento_id: p.forma_pagamento_id,
      status_pagamento: p.pago ? 'pago' : 'em_aberto',
      ...(p.pago ? { data_pagamento: dataPagamento } : {}),
    }));

  if (parcelasAInserir.length > 0) {
    await admin.from('compromissos_parcelas').insert(parcelasAInserir);
  }

  // Troca sem quitação: garante o compromisso quitado mesmo em reprocessamento
  // (não mexe se já foi cancelado).
  if (compromissoJaPago) {
    await admin.from('compromissos')
      .update({ status_compromisso: 'pago' })
      .eq('id', compId)
      .neq('status_compromisso', 'cancelada');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401);

  const admin: any = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user: caller }, error: authError } = await asUser.auth.getUser();
  if (authError || !caller) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: roleData } = await admin
    .from('user_roles')
    .select('app_role, nome')
    .eq('user_id', caller.id)
    .eq('projeto_id', BPM_PROJETO_ID)
    .eq('ativo', true)
    .maybeSingle();
  if (!roleData) return jsonResponse({ error: 'Forbidden: usuário sem acesso a este sistema' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido (JSON esperado)' }, 400);
  }

  const acao: 'consultar' | 'cancelar' | 'emitir' =
    body.acao === 'consultar' ? 'consultar' : body.acao === 'cancelar' ? 'cancelar' : 'emitir';
  const tipo: Operacao = (['compra', 'consignacao', 'devolucao_consignacao', 'venda_seminova', 'venda_0km'] as const).includes(body.tipo as any)
    ? (body.tipo as Operacao)
    : 'compra';
  const cfg = CFG[tipo];
  const ehVenda = cfg.keyBy === 'atendimento';
  // Compra/consignação/devolução simbólica de moto seminova entram no departamento "motos_seminovas".
  const departamento = (tipo === 'compra' || tipo === 'consignacao' || tipo === 'devolucao_consignacao') ? 'motos_seminovas' : 'motos';

  const avaliacaoId = typeof body.avaliacao_id === 'string' ? body.avaliacao_id : '';
  const atendimentoIdBody = typeof body.atendimento_id === 'string' ? body.atendimento_id : '';
  const empresaIdBody = typeof body.empresa_id === 'string' ? body.empresa_id : '';
  if (ehVenda && !atendimentoIdBody) return jsonResponse({ error: 'atendimento_id é obrigatório' }, 400);
  if (!ehVenda && !avaliacaoId) return jsonResponse({ error: 'avaliacao_id é obrigatório' }, 400);

  // ---- Carrega contexto (avaliacao p/ entrada, estoque_motos p/ venda) + atendimento + acesso ----
  let av: any = null;
  let estoqueMoto: any = null;
  let atendimentoId = '';

  let ehVenda0km = false;
  if (ehVenda) {
    atendimentoId = atendimentoIdBody;
    const { data: mi } = await admin
      .from('motos_interesse')
      .select('estoque_moto_id, estoque_tipo')
      .eq('atendimento_id', atendimentoId)
      .not('estoque_moto_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (!mi?.estoque_moto_id) return jsonResponse({ error: 'Moto do estoque não vinculada ao atendimento.' }, 409);
    ehVenda0km = mi.estoque_tipo === '0km';
    if (ehVenda0km) {
      const { data: en } = await admin
        .from('estoque_motos_novas')
        .select('*, marca:marca_id(nome), modelo:modelo_id(nome)')
        .eq('id', mi.estoque_moto_id)
        .maybeSingle();
      if (!en) return jsonResponse({ error: 'Moto 0km do estoque não encontrada.' }, 404);
      // Normaliza para o mesmo shape que estoque_motos (avaliacao/moto_nova).
      estoqueMoto = {
        ...en,
        status: en.status,
        moto_nova_id: en.id,
        moto_nova: {
          marca: nomeCat(en.marca), modelo: nomeCat(en.modelo),
          ano_fabricacao: en.ano_fabricacao, ano_modelo: en.ano_modelo,
          cilindrada: en.cilindrada, cor: en.cor, placa: en.placa,
          chassi: en.chassi, renavam: en.renavam, ncm: en.ncm, valor: en.valor,
          numero_nf_entrada: en.numero_nf_entrada ?? null,
          // Specs do grupo estruturado veicProd (veículo novo).
          potencia_motor: en.potencia_motor ?? null,
          peso_liquido: en.peso_liquido ?? null,
          peso_bruto: en.peso_bruto ?? null,
          numero_motor: en.numero_motor ?? null,
          codigo_cor_fabricante: en.codigo_cor_fabricante ?? null,
          codigo_cor_denatran: en.codigo_cor_denatran ?? null,
          codigo_marca_modelo_denatran: en.codigo_marca_modelo_denatran ?? null,
          // ICMS-ST retido anteriormente (grupo <ICMS60> — transcrito da NF de entrada).
          icms_st_bc_retido: en.icms_st_bc_retido ?? null,
          icms_st_valor_substituto: en.icms_st_valor_substituto ?? null,
          icms_st_valor_retido: en.icms_st_valor_retido ?? null,
        },
      };

      // Fallback: sem os valores de ICMS-ST retido cadastrados na moto (não passou
      // pelo "Liberar Estoque" do SisFin), extrai direto do XML da NF-e de entrada
      // vinculada e cacheia na moto pra próximas emissões e pro card do contrato.
      const mnRef = estoqueMoto.moto_nova;
      if (!(Number(mnRef.icms_st_bc_retido) > 0) || !(Number(mnRef.icms_st_valor_retido) > 0)) {
        const { data: nfEnt } = await admin
          .from('nfe_entradas')
          .select('xml_raw')
          .eq('estoque_moto_nova_id', en.id)
          .eq('operacao', 'compra')
          .not('xml_raw', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const st = nfEnt?.xml_raw ? stRetidoDoXmlEntrada(String(nfEnt.xml_raw)) : null;
        if (st) {
          mnRef.icms_st_bc_retido = st.bc;
          mnRef.icms_st_valor_substituto = st.subst;
          mnRef.icms_st_valor_retido = st.ret;
          await admin.from('estoque_motos_novas')
            .update({ icms_st_bc_retido: st.bc, icms_st_valor_substituto: st.subst, icms_st_valor_retido: st.ret })
            .eq('id', en.id)
            .is('icms_st_bc_retido', null);
        }
      }
    } else {
      const { data: em } = await admin
        .from('estoque_motos')
        .select(
          '*, avaliacao:avaliacao_id(marca:marca_id(nome), modelo:modelo_id(nome), ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam, km, valor_fechamento, valor_nf_entrada, tipo_aquisicao)',
        )
        .eq('id', mi.estoque_moto_id)
        .maybeSingle();
      if (!em) return jsonResponse({ error: 'Moto do estoque não encontrada.' }, 404);
      if ((em as any).avaliacao) {
        (em as any).avaliacao.marca = nomeCat((em as any).avaliacao.marca);
        (em as any).avaliacao.modelo = nomeCat((em as any).avaliacao.modelo);
      }
      estoqueMoto = em;
    }
  } else {
    const { data: avRow } = await admin
      .from('avaliacoes')
      .select(
        'id, atendimento_id, aprovacao_status, consulta_realizada, valor_fechamento, ' +
          'avaliacao_consignacao, valor_consignacao_nota, consignacao_status, ' +
          'marca:marca_id(nome), modelo:modelo_id(nome), ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam, km',
      )
      .eq('id', avaliacaoId)
      .maybeSingle();
    if (!avRow) return jsonResponse({ error: 'Avaliação não encontrada' }, 404);
    av = { ...avRow, marca: nomeCat((avRow as any).marca), modelo: nomeCat((avRow as any).modelo) };
    atendimentoId = avRow.atendimento_id;
  }

  const { data: atendimento } = await admin
    .from('atendimentos_motos')
    .select('id, cliente_id, loja_id, vendedor_id, interesse')
    .eq('id', atendimentoId)
    .maybeSingle();
  if (!atendimento) return jsonResponse({ error: 'Atendimento não encontrado' }, 404);

  const isVendedor = atendimento.vendedor_id === caller.id;
  let temAcesso = isVendedor || roleData.app_role === 'master';
  if (!temAcesso && atendimento.loja_id) {
    const { data: ok } = await admin.rpc('has_master_or_gerente_empresa', {
      _user_id: caller.id,
      _loja_id: atendimento.loja_id,
    });
    temAcesso = !!ok;
  }
  if (!temAcesso) return jsonResponse({ error: 'Forbidden: sem acesso a este atendimento' }, 403);

  const entityId = ehVenda ? atendimentoId : avaliacaoId;

  // Nome exibido no historico segue o padrao do sistema: user_roles.nome.
  const callerName =
    (roleData.nome as string | undefined) ||
    (caller.user_metadata?.full_name as string | undefined) ||
    (caller.user_metadata?.name as string | undefined) ||
    null;

  // Ambiente da EMISSÃO: escolha explícita do front (botão NF-e Homologação/Produção)
  // tem prioridade; sem escolha, cai na env var do servidor (fallback histórico).
  // "consultar" ignora isto — usa o ambiente já gravado na própria linha (nfeRow),
  // porque uma mesma entidade pode ter linhas de homologação E de produção.
  const ambienteDefault = (Deno.env.get('FOCUS_NFE_AMBIENTE') as FocusAmbiente) || 'homologacao';
  const ambiente: FocusAmbiente = body.ambiente === 'producao' ? 'producao' : body.ambiente === 'homologacao' ? 'homologacao' : ambienteDefault;
  const base = focusBaseUrl(ambiente);
  // Ref fixo por entidade — normalmente 1 NF-e por atendimento/avaliação. Cada emissão
  // sobre uma linha já autorizada (reemissão em homologação, ou a 1ª emissão em
  // produção depois de homologação) gera um ref novo pra não colidir na Focus — ver
  // "acao: emitir" mais abaixo. "consultar" usa o ref_externa gravado na própria linha.
  const ref = `${cfg.refPrefix}-${entityId}`;

  // ---- Empresa + token Focus ----
  const { data: lojaEmpresa } = await admin
    .from('loja_empresas')
    .select('empresa_id')
    .eq('id', atendimento.loja_id)
    .maybeSingle();
  const empresaVinculada = lojaEmpresa?.empresa_id;
  if (!empresaVinculada) return jsonResponse({ error: 'Loja sem empresa vinculada' }, 400);

  // Empresa emitente: se o front enviou uma escolha, ela precisa ser a empresa
  // vinculada à loja do atendimento (loja_empresas.id = atendimento.loja_id).
  let empresaId = empresaVinculada;
  if (empresaIdBody) {
    if (empresaIdBody !== empresaVinculada) {
      return jsonResponse(
        { error: 'Empresa selecionada não está vinculada à loja do atendimento.' },
        400,
      );
    }
    empresaId = empresaIdBody;
  }

  const { data: empresa } = await admin
    .from('empresas')
    .select('id, cnpj, regime_tributario, uf')
    .eq('id', empresaId)
    .maybeSingle();

  const { data: focusCfg } = await admin
    .from('empresas_focus_config')
    .select('token_homologacao, token_producao, habilitado')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  const token = ambiente === 'producao' ? focusCfg?.token_producao : focusCfg?.token_homologacao;

  const nfeKey = ehVenda ? 'atendimento_id' : 'avaliacao_id';
  // Escopado por `tipo`: uma mesma avaliação pode ter várias operações em
  // sequência (consignação -> devolução simbólica -> compra), cada uma com seu
  // próprio ciclo de NF-e — nunca pegar a "última linha" de outra operação.
  const buscarNfe = () =>
    admin.from('nfe_entradas').select('*').eq(nfeKey, entityId).eq('operacao', tipo)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

  // =====================================================================
  // acao: consultar
  // =====================================================================
  if (acao === 'consultar') {
    const { data: nfeRow } = await buscarNfe();
    if (!nfeRow) return jsonResponse({ nfe: null }, 200);
    // Usa o ambiente gravado na própria linha, não o "ambiente" da emissão que
    // acabou de chegar na request — a entidade pode ter linhas de homologação
    // e de produção, e cada uma só existe no Focus do ambiente em que foi emitida.
    const rowAmbiente = ((nfeRow.ambiente as FocusAmbiente) || ambienteDefault);
    const rowBase = focusBaseUrl(rowAmbiente);
    const rowToken = rowAmbiente === 'producao' ? focusCfg?.token_producao : focusCfg?.token_homologacao;
    if (!rowToken) return jsonResponse({ nfe: nfeRow }, 200);

    const r = await consultarNfe(rowBase, rowToken, (nfeRow.ref_externa as string) || ref);
    const fStatus = r.body.status as string | undefined;

    // NF-e cancelada (pelo nosso botão OU direto na SEFAZ/Focus) — sincroniza a
    // linha e reabre a etapa, mesmo que a linha estivesse 'processada'.
    if (fStatus === 'cancelado' && nfeRow.status !== 'cancelada') {
      const xmlCanc = r.body.caminho_xml_cancelamento
        ? `${rowBase}${r.body.caminho_xml_cancelamento}`
        : (r.body.caminho_xml_nota_fiscal ? `${rowBase}${r.body.caminho_xml_nota_fiscal}` : null);
      const { updated, error, parcelasPagas } = await aplicarCancelamento(admin, cfg, entityId, nfeRow, {
        justificativa: (r.body.justificativa as string) || null,
        xmlCancelamento: xmlCanc,
        callerId: caller.id,
        callerName,
      });
      if (error) return jsonResponse({ error: `Falha ao sincronizar o cancelamento: ${error.message}` }, 500);
      return jsonResponse({
        nfe: updated ?? nfeRow,
        ...(parcelasPagas ? { aviso: `${parcelasPagas} parcela(s) já paga(s) do compromisso não foram estornadas — acerto manual.` } : {}),
      }, 200);
    }

    const novoStatus = mapStatus(fStatus);
    const patch: Record<string, unknown> = { focus_status: fStatus ?? null, status: novoStatus };

    if (fStatus === 'autorizado') {
      patch.numero = (r.body.numero as string) ?? nfeRow.numero;
      patch.serie = (r.body.serie as string) ?? nfeRow.serie;
      patch.chave_nfe = (r.body.chave_nfe as string) ?? nfeRow.chave_nfe;
      patch.caminho_danfe = r.body.caminho_danfe ? `${rowBase}${r.body.caminho_danfe}` : nfeRow.caminho_danfe;
      patch.xml_raw = r.body.caminho_xml_nota_fiscal ? `${rowBase}${r.body.caminho_xml_nota_fiscal}` : nfeRow.xml_raw;
      if (!nfeRow.data_emissao) patch.data_emissao = new Date().toISOString();
    } else if (novoStatus === 'erro') {
      patch.erro_mensagem = mensagemErroFocus(r.body);
    }

    const { data: updated } = await admin
      .from('nfe_entradas')
      .update(patch)
      .eq('id', nfeRow.id)
      .select('*')
      .maybeSingle();

    // Só a NF-e de PRODUÇÃO autorizada gera efeito no sistema (compromissos,
    // avanço de status/etapa, histórico, NPS). Homologação é só teste: persiste
    // a linha (pra baixar a DANFE e liberar o botão de produção) e para por aí.
    if (fStatus === 'autorizado' && rowAmbiente === 'producao') {
      await limparNfeHomologacao(admin, cfg, entityId, (updated?.id as string) || nfeRow.id, tipo);
      await registrarPosAutorizacao(admin, cfg, {
        entityId,
        operacao: tipo,
        dataEmissao: (updated?.data_emissao as string) || nfeRow.data_emissao || new Date().toISOString(),
        numero: (updated?.numero as string) ?? null,
        serie: (updated?.serie as string) ?? null,
        callerId: caller.id,
        callerName,
      });
    }
    return jsonResponse({ nfe: updated ?? nfeRow }, 200);
  }

  // =====================================================================
  // acao: cancelar
  // =====================================================================
  if (acao === 'cancelar') {
    const justificativa = String(body.justificativa ?? '').trim();
    // Regra da SEFAZ: 15 a 255 caracteres.
    if (justificativa.length < 15 || justificativa.length > 255) {
      return jsonResponse({ error: 'A justificativa do cancelamento deve ter de 15 a 255 caracteres.' }, 400);
    }

    const { data: nfeRow } = await buscarNfe();
    if (!nfeRow) return jsonResponse({ error: 'Nenhuma NF-e encontrada para esta operação.' }, 404);
    if (nfeRow.status === 'cancelada') return jsonResponse({ nfe: nfeRow }, 200);
    if (nfeRow.status !== 'processada') {
      return jsonResponse({ error: 'Só é possível cancelar uma NF-e autorizada.' }, 409);
    }

    const rowAmbiente = ((nfeRow.ambiente as FocusAmbiente) || ambienteDefault);
    const rowBase = focusBaseUrl(rowAmbiente);
    const rowToken = rowAmbiente === 'producao' ? focusCfg?.token_producao : focusCfg?.token_homologacao;
    if (!rowToken) return jsonResponse({ error: 'Empresa sem token da Focus para este ambiente.' }, 409);

    const refCancel = (nfeRow.ref_externa as string) || ref;
    let c = await cancelarNfe(rowBase, rowToken, refCancel, justificativa);
    console.log('cancelar: DELETE', rowAmbiente, refCancel, '->', c.httpStatus, JSON.stringify(c.body).slice(0, 800));
    let cStatus = c.body.status as string | undefined;

    // Cancelamento pode ser assíncrono na Focus ('processando_cancelamento') —
    // consulta até virar 'cancelado' (ou dar erro).
    for (let i = 0; i < 6 && cStatus === 'processando_cancelamento'; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      c = await consultarNfe(rowBase, rowToken, refCancel);
      cStatus = c.body.status as string | undefined;
      console.log('cancelar: consulta', i, '->', cStatus);
    }

    // Já cancelada na SEFAZ antes (pelo painel da Focus, por outra tentativa, etc.)
    // — a Focus recusa o 2º DELETE, mas a consulta mostra 'cancelado'. Trata como ok.
    if (!['cancelado'].includes(cStatus ?? '') && /cancelad/i.test(mensagemErroFocus(c.body))) {
      const q = await consultarNfe(rowBase, rowToken, refCancel);
      if (q.body.status === 'cancelado') { c = q; cStatus = 'cancelado'; }
    }

    const okHttp = c.httpStatus === 200 || c.httpStatus === 201 || c.httpStatus === 204;
    const cancelado = cStatus === 'cancelado' || (okHttp && !cStatus && !c.body.erros && !c.body.mensagem && !c.body.mensagem_sefaz);
    if (!cancelado) {
      const msg = mensagemErroFocus(c.body) || `A Focus respondeu status "${cStatus ?? '(vazio)'}" (HTTP ${c.httpStatus}).`;
      console.error('cancelar: falhou —', msg);
      return jsonResponse({ error: msg }, 422);
    }

    const xmlCanc = c.body.caminho_xml_cancelamento
      ? `${rowBase}${c.body.caminho_xml_cancelamento}`
      : nfeRow.xml_raw;
    const { updated, error: updErr, parcelasPagas } = await aplicarCancelamento(admin, cfg, entityId, nfeRow, {
      justificativa,
      xmlCancelamento: xmlCanc,
      callerId: caller.id,
      callerName,
    });
    if (updErr) return jsonResponse({ error: `NF-e cancelada na SEFAZ, mas falhou ao gravar: ${updErr.message}` }, 500);
    console.log('cancelar: gravado', nfeRow.id, '->', updated?.status, 'parcelasPagas:', parcelasPagas);

    return jsonResponse({
      nfe: updated ?? nfeRow,
      ...(parcelasPagas
        ? { aviso: `Compromisso cancelado. ${parcelasPagas} parcela(s) já paga(s) não foram estornadas — acerto manual.` }
        : {}),
    }, 200);
  }

  // =====================================================================
  // acao: emitir
  // =====================================================================

  // Guards
  let contratoVendaId: string | null = null;
  // Ambiente da NF de consignação referenciada (só setado quando tipo ===
  // 'devolucao_consignacao', abaixo) — usado no guard de produção mais
  // adiante pra dispensar a exigência de homologação prévia quando a
  // consignação já é produção (nesse caso a devolução NUNCA passa em
  // homologação — Rejeição 321, ver docs-fiscal-299 §2.26).
  let consignacaoRefAmbiente: string | null = null;
  // Compra que sucede uma devolução simbólica (transformação de consignação em
  // compra): dispensa a aprovação de aquisição e o contrato de compra separados
  // — a moto já tem contrato de consignação + NF de consignação + NF de
  // devolução simbólica autorizadas, prova documental suficiente da conversão.
  const { data: devolucaoAutorizada } = tipo === 'compra'
    ? await admin.from('nfe_entradas').select('id').eq('avaliacao_id', avaliacaoId)
        .eq('operacao', 'devolucao_consignacao').eq('status', 'processada').limit(1).maybeSingle()
    : { data: null };
  const viaConversaoConsignacao = !!devolucaoAutorizada;
  if (tipo === 'compra') {
    if (av.consulta_realizada !== true) return jsonResponse({ error: 'A consulta veicular ainda não foi realizada.' }, 409);
    // Troca (moto entrando como parte de pagamento): não exige aprovação da
    // aquisição, e o contrato de VENDA já engloba a compra da moto que entra —
    // não é preciso um contrato de compra separado. Compra pura exige os dois.
    const ehTroca = atendimento.interesse === 'trocar';
    if (!ehTroca && !viaConversaoConsignacao && av.aprovacao_status !== 'aprovada') {
      return jsonResponse({ error: 'A compra ainda não foi aprovada.' }, 409);
    }
    if (!viaConversaoConsignacao) {
      const { data: contratoHist } = await admin
        .from('status_history').select('id')
        .eq('entity_type', 'pos_compra').eq('entity_id', avaliacaoId).eq('status', 'contrato_compra_gerado').limit(1);
      let contratoOk = !!contratoHist && contratoHist.length > 0;
      if (!contratoOk && ehTroca) {
        const { data: vendaHist } = await admin
          .from('status_history').select('id')
          .eq('entity_type', 'showroom').eq('entity_id', atendimentoId)
          .in('status', ['contrato_de_venda', 'contrato_de_sinal']).limit(1);
        contratoOk = !!vendaHist && vendaHist.length > 0;
      }
      if (!contratoOk) {
        return jsonResponse({ error: ehTroca ? 'O contrato de venda ainda não foi gerado.' : 'O contrato de compra ainda não foi gerado.' }, 409);
      }
    }
  } else if (tipo === 'consignacao') {
    if (av.consulta_realizada !== true) return jsonResponse({ error: 'A consulta veicular ainda não foi realizada.' }, 409);
    const { data: contratoConsig } = await admin
      .from('contratos_consignacao').select('id').eq('avaliacao_id', avaliacaoId).limit(1);
    if (!contratoConsig || contratoConsig.length === 0) {
      return jsonResponse({ error: 'O contrato do consignante ainda não foi gerado.' }, 409);
    }
  } else if (tipo === 'devolucao_consignacao') {
    const { data: consignacaoOk } = await admin
      .from('nfe_entradas').select('id, ambiente').eq('avaliacao_id', avaliacaoId)
      .eq('operacao', 'consignacao').eq('status', 'processada').limit(1).maybeSingle();
    if (!consignacaoOk) {
      return jsonResponse({ error: 'A NF-e de entrada em consignação ainda não foi emitida.' }, 409);
    }
    consignacaoRefAmbiente = (consignacaoOk as any).ambiente ?? null;
    const { data: devolucaoJaOk } = await admin
      .from('nfe_entradas').select('id').eq('avaliacao_id', avaliacaoId)
      .eq('operacao', 'devolucao_consignacao').eq('status', 'processada').limit(1).maybeSingle();
    if (devolucaoJaOk) {
      return jsonResponse({ error: 'A devolução simbólica desta consignação já foi emitida.' }, 409);
    }
  } else {
    // venda
    // Moto ainda "em consignação" (não convertida em compra): a venda como
    // estoque próprio só é permitida depois da devolução simbólica + compra.
    if (!ehVenda0km && (estoqueMoto?.avaliacao as any)?.tipo_aquisicao === 'consignada') {
      return jsonResponse({ error: 'Moto ainda em consignação — emita a devolução simbólica e a compra antes de vender.' }, 409);
    }
    if (!['vendido', 'sinal'].includes(estoqueMoto?.status)) {
      return jsonResponse({ error: 'A moto ainda não foi marcada como vendida.' }, 409);
    }
    // ipva_tipo != 'COMPRA' tem que incluir NULL (lojas Ducati não usam IPVA) —
    // .neq() do PostgREST exclui NULL silenciosamente, por isso filtra em JS
    // (mesmo padrão já usado pra achar o contrato de venda em registrarPosAutorizacao acima).
    const { data: contratosVenda } = await admin
      .from('contratos').select('id, ipva_tipo')
      .eq('atendimento_id', atendimentoId);
    const contratoVenda = ((contratosVenda || []) as any[]).find((c) => c.ipva_tipo !== 'COMPRA') ?? null;
    if (!contratoVenda) {
      return jsonResponse({ error: 'O contrato de venda ainda não foi gerado.' }, 409);
    }
    contratoVendaId = contratoVenda.id;
  }
  if (!empresa?.cnpj) {
    return jsonResponse({ error: 'A empresa da loja está sem CNPJ cadastrado.' }, 409);
  }
  if (!focusCfg?.habilitado || !token) {
    return jsonResponse({ error: 'Emissão de NF-e não habilitada para esta empresa.' }, 409);
  }

  const { data: nfeExistente } = await buscarNfe();
  if (nfeExistente && PENDENTES.has(nfeExistente.status)) {
    return jsonResponse({ error: 'Já existe uma NF-e em processamento para esta moto.' }, 409);
  }

  if (ambiente === 'producao') {
    // Produção nunca reemite (é definitiva; corrigir exige carta de correção ou
    // cancelamento) e só libera depois de pelo menos uma homologação autorizada
    // pra essa mesma operação — nunca emite direto em produção sem testar antes.
    const { data: producaoAutorizada } = await admin
      .from('nfe_entradas').select('id').eq(nfeKey, entityId).eq('operacao', tipo)
      .eq('ambiente', 'producao').eq('status', 'processada').limit(1).maybeSingle();
    if (producaoAutorizada) {
      return jsonResponse({ error: 'Já existe uma NF-e emitida em produção para esta moto.' }, 409);
    }
    const { data: homologAutorizada } = await admin
      .from('nfe_entradas').select('id').eq(nfeKey, entityId).eq('operacao', tipo)
      .eq('ambiente', 'homologacao').eq('status', 'processada').limit(1).maybeSingle();
    // Devolução simbólica referenciando uma NF de consignação em PRODUÇÃO:
    // testar em homologação é impossível por definição (a chave de produção
    // não existe na base da SEFAZ homologação — Rejeição 321, ver
    // docs-fiscal-299 §2.26/§2.27). Dispensa a exigência de homolog prévia
    // só nesse caso.
    const dispensaHomologPrevia = tipo === 'devolucao_consignacao' && consignacaoRefAmbiente === 'producao';
    if (!homologAutorizada && !dispensaHomologPrevia) {
      return jsonResponse({ error: 'Emita em homologação antes de emitir em produção.' }, 409);
    }
    // Troca: a NF-e de venda em produção só sai depois da NF-e de COMPRA da moto
    // que está entrando como pagamento ter sido emitida em produção.
    if (ehVenda && atendimento.interesse === 'trocar') {
      const { data: avsTroca } = await admin
        .from('avaliacoes').select('id').eq('atendimento_id', atendimentoId);
      const trocaIds = ((avsTroca as any[]) || []).map((a) => a.id);
      const { data: compraProd } = trocaIds.length
        ? await admin.from('nfe_entradas').select('id')
            .in('avaliacao_id', trocaIds).eq('operacao', 'compra')
            .eq('ambiente', 'producao').eq('status', 'processada').limit(1).maybeSingle()
        : { data: null };
      if (!compraProd) {
        return jsonResponse({ error: 'Emita a NF-e de compra da moto da troca em produção antes de emitir a venda.' }, 409);
      }
    }
  } else if (nfeExistente && nfeExistente.status === 'processada' && nfeExistente.ambiente === 'producao') {
    // Depois de produção autorizada, não reemite mais nem em homologação.
    return jsonResponse({ error: 'Já existe uma NF-e emitida em produção para esta moto — contrato bloqueado.' }, 409);
  }

  // Emitir sobre uma linha já autorizada (reemissão em homologação, ou a 1ª emissão
  // em produção depois de homologação) gera uma linha nova — nunca sobrescreve a
  // autorizada anterior, que fica registrada no histórico. Também gera linha nova
  // se a última linha é de um AMBIENTE DIFERENTE do desta emissão (ex.: última foi
  // erro em produção, esta é homologação, ou vice-versa) — nunca reusar/sobrescrever
  // uma linha de erro de outro ambiente, senão perde o histórico daquele erro e mistura
  // ambiente errado na mesma linha.
  const precisaLinhaNova = !!nfeExistente && (nfeExistente.status === 'processada' || nfeExistente.status === 'cancelada' || nfeExistente.ambiente !== ambiente);
  // Reenvio sobre uma linha em 'erro' (ex.: "Tentar novamente") tem que reusar o
  // MESMO ref que essa linha já tinha — nao recair no `ref` base. O `ref` base so
  // e livre na 1a emissao (sem nfeExistente); se ja existe uma linha de erro, o
  // `ref` base pode ja ter sido consumido por uma emissao processada mais antiga
  // (ex.: a 1a reemissao em homologacao usa o `ref` base, reemissoes seguintes
  // geram sufixo) — cair nele de novo faz a Focus devolver a NOTA AUTORIZADA
  // ANTIGA daquele ref (idempotencia por ref), cuja `chave_nfe` ja esta gravada
  // noutra linha, e o INSERT/UPDATE falha com "duplicate key ... chave_nfe_key".
  const refEmissao = precisaLinhaNova
    ? `${ref}-${Date.now()}`
    : ((nfeExistente?.ref_externa as string | undefined) || ref);

  // Destinatario da NF: entrada = PF vendedora/consignante; venda = cliente comprador.
  // Nos dois casos e o cliente_id do atendimento.
  const { data: fornecedor } = await admin
    .from('clientes_fornecedores')
    .select('id, nome_razao_social, cpf_cnpj, tipo_pessoa, telefone, telefone_comercial, rg, contribuinte_icms, inscricao_estadual, isento_inscricao_estadual, clientes_fornecedores_enderecos(*)')
    .eq('id', atendimento.cliente_id)
    .maybeSingle();
  if (!fornecedor) return jsonResponse({ error: 'Cliente não encontrado' }, 409);
  // Endereço COMERCIAL (tipo='fiscal') — o cliente pode ter mais de uma linha
  // em clientes_fornecedores_enderecos (ex.: 'residencial', ver ClienteForm);
  // a NF sempre usa o fiscal, nunca "a primeira que vier".
  const enderecosFornecedor = (fornecedor.clientes_fornecedores_enderecos || []) as Array<{ tipo?: string }>;
  const end = enderecosFornecedor.find((e) => e.tipo === 'fiscal') || enderecosFornecedor[0] || {};

  // Venda: nome do vendedor + formas de pagamento do contrato, pra compor as
  // informações complementares (texto) E os grupos pag/cobr da NF-e.
  let vendedorNome: string | null = null;
  let formasPagamentoTexto: string | null = null;
  let trocaInfoCpl: string | null = null;
  const formasPagamentoEstrut: { codigo: string; descricao?: string; valor: number }[] = [];
  if (ehVenda) {
    const fmtBRL = brl; // formato pt-BR determinístico (mesmo do infCpl do payload)
    // Nome da forma de pagamento -> código tPag da SEFAZ (mesmo mapa do crm-novo).
    const CODIGO_TPAG: Record<string, string> = {
      dinheiro: '01', cheque: '02',
      credito: '03', 'crédito': '03', 'cartao de credito': '03', 'cartão de crédito': '03',
      debito: '04', 'débito': '04', 'cartao de debito': '04', 'cartão de débito': '04',
      boleto: '15', 'boleto bancario': '15', 'boleto bancário': '15',
      pix: '17',
      'ted/doc': '18', ted_doc_pix: '18', ted: '18', doc: '18', transferencia: '18', 'transferência': '18',
      financiamento: '99', 'consórcio': '99', consorcio: '99', 'crédito loja': '05',
    };
    const tPagDe = (tipo: string) => CODIGO_TPAG[String(tipo ?? '').toLowerCase().trim()] ?? '99';

    const [{ data: vendedorRole }, { data: formasPagamento }] = await Promise.all([
      atendimento.vendedor_id
        ? admin.from('user_roles').select('nome').eq('user_id', atendimento.vendedor_id).eq('projeto_id', BPM_PROJETO_ID).maybeSingle()
        : Promise.resolve({ data: null }),
      contratoVendaId
        ? admin.from('formas_pagamento_contrato').select('tipo, valor_total, valor_financiado').eq('contrato_id', contratoVendaId).order('created_at', { ascending: true })
        : Promise.resolve({ data: null }),
    ]);
    vendedorNome = (vendedorRole as any)?.nome ?? null;

    const linhasPagto: string[] = [];
    for (const fp of ((formasPagamento as any[]) || [])) {
      const v = Number(fp.valor_total ?? fp.valor_financiado ?? 0);
      linhasPagto.push(v > 0 ? `${fp.tipo} ${fmtBRL(v)}` : String(fp.tipo));
      if (v > 0) {
        const cod = tPagDe(fp.tipo);
        formasPagamentoEstrut.push({ codigo: cod, descricao: cod === '99' ? String(fp.tipo ?? 'OUTROS').toUpperCase() : undefined, valor: v });
      }
    }

    // Troca: a moto que entra como parte do pagamento aparece como no padrão das
    // NF-e de venda da FAG/FLN:
    //  - na "Forma de Pagamento:" do infCpl → linha "Veiculo na Troca R$ <valor>";
    //  - um bloco próprio no infCpl → "NF DE ENTRADA <nº> - PLACA <placa>";
    //  - no grupo pag/dup → forma tPag 99 pelo valor da troca.
    // Valor = valor_total da NF de compra da troca; fallback valor_fechamento.
    if (atendimento.interesse === 'trocar') {
      const { data: avsTroca } = await admin
        .from('avaliacoes')
        .select('id, placa, valor_fechamento')
        .eq('atendimento_id', atendimentoId);
      const trocaIds = ((avsTroca as any[]) || []).map((a) => a.id);
      if (trocaIds.length) {
        const { data: nfsCompra } = await admin
          .from('nfe_entradas')
          .select('avaliacao_id, numero, valor_total, created_at')
          .in('avaliacao_id', trocaIds)
          .eq('operacao', 'compra')
          .eq('status', 'processada')
          .order('created_at', { ascending: false });
        const nfPorAval = new Map<string, any>();
        for (const n of (nfsCompra as any[]) || []) {
          if (!nfPorAval.has(n.avaliacao_id)) nfPorAval.set(n.avaliacao_id, n);
        }
        const blocosTroca: string[] = [];
        for (const a of (avsTroca as any[]) || []) {
          const nf = nfPorAval.get(a.id);
          const valorTroca = Number(nf?.valor_total ?? a.valor_fechamento ?? 0);
          if (valorTroca <= 0) continue;
          const placa = String(a.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          linhasPagto.push(`Veiculo na Troca ${fmtBRL(valorTroca)}`);
          formasPagamentoEstrut.push({ codigo: '99', descricao: 'VEICULO NA TROCA', valor: valorTroca });
          const bloco = [
            nf?.numero ? `NF DE ENTRADA ${nf.numero}` : null,
            placa ? `PLACA ${placa}` : null,
          ].filter(Boolean).join(' - ');
          if (bloco) blocosTroca.push(bloco);
        }
        trocaInfoCpl = blocosTroca.join(' * ') || null;
      }
    }

    formasPagamentoTexto = linhasPagto.join(' * ') || null;
  }

  // Valor da NF. body.valor (editado na tela) tem prioridade.
  const valorBody = typeof body.valor === 'number' && body.valor > 0 ? body.valor : null;
  let valor: number;
  if (tipo === 'compra') {
    const { data: contrato } = await admin
      .from('contratos').select('valor_fechamento')
      .eq('atendimento_id', av.atendimento_id).eq('ipva_tipo', 'COMPRA')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    valor = valorBody ?? Number(contrato?.valor_fechamento ?? av.valor_fechamento ?? 0);
    // Registra o valor da NF-e de compra como custo de aquisição fiscal da moto
    // — base da margem de PIS/COFINS quando ela for revendida (Lei 9.716/98).
    if (valor > 0) {
      await admin.from('avaliacoes').update({ valor_nf_entrada: valor }).eq('id', avaliacaoId);
    }
  } else if (tipo === 'consignacao') {
    valor = valorBody ?? Number(av.valor_consignacao_nota ?? av.avaliacao_consignacao ?? 0);
    if (valorBody != null) {
      await admin.from('avaliacoes').update({ valor_consignacao_nota: valorBody }).eq('id', avaliacaoId);
    }
  } else if (tipo === 'devolucao_consignacao') {
    // A devolução simbólica tem que devolver o MESMO valor da NF de entrada em
    // consignação já autorizada — não é editável na tela (evita divergir do que
    // a SEFAZ já tem registrado como recebido).
    valor = Number(av.valor_consignacao_nota ?? av.avaliacao_consignacao ?? 0);
  } else {
    // venda: preco de venda da moto (estoque_motos.valor_venda); 0km cai p/ tabela.
    valor = valorBody
      ?? Number(estoqueMoto?.valor_venda ?? estoqueMoto?.valor_sinal ?? estoqueMoto?.moto_nova?.valor ?? 0);
  }
  if (!valor || valor <= 0) {
    return jsonResponse({ error: 'Valor da NF-e não informado.' }, 409);
  }

  // Natureza + regras fiscais (tudo vem da tabela; nao ha default no codigo)
  const { data: natureza } = await admin
    .from('naturezas_operacao')
    .select(
      'id, descricao, serie, tipo, indicador_presenca, consumidor_final, operacao_devolucao, ' +
        'informacoes_complementares, informacoes_adicionais_fisco, ' +
        'naturezas_operacao_regras(imposto, cfop, situacao_tributaria, aliquota, reducao_base_calculo, ' +
        'aliquota_fcp, aliquota_interna_destino, tipo_tributacao, informacoes_complementares, informacoes_adicionais_fisco, destino_ufs, ordem, ' +
        'natureza_operacao_descricao, indicador_presenca, tipo_atendimento, codigo_beneficio_fiscal, ' +
        'classificacao_tributaria, cbs_aliquota, ibs_uf_aliquota, ibs_mun_aliquota, percentual_reducao, ' +
        'aliquota_icms_efetiva, reducao_base_calculo_efetiva, aliquota_suportada_consumidor_final)',
    )
    .eq('empresa_id', empresaId)
    .eq('descricao', cfg.naturezaDescricao)
    .eq('ativo', true)
    .maybeSingle();
  if (!natureza) return jsonResponse({ error: `Natureza de operação "${cfg.naturezaDescricao}" não configurada ou inativa.` }, 409);

  const regrasTodas = (natureza.naturezas_operacao_regras || []) as Array<
    RegraFiscal & { destino_ufs: string[] | null; ordem: number | null; tipo_atendimento: string | null }
  >;
  // Venda: toda venda passa a ser tratada como 'presencial' pra fim de CFOP/CST
  // — não referencia mais atendimentos_motos.tipo_atendimento (decisão fiscal
  // 2026-09-11, ver docs-fiscal-299/pendencias.md §2.19b). Regra com
  // tipo_atendimento='ambos' (default) casa igual; regra 'online' simplesmente
  // deixa de ser escolhida. Compra/consignação não filtra (tipoAtendNorm null).
  const tipoAtendNorm = ehVenda ? 'presencial' : null;
  const regras = tipoAtendNorm
    ? regrasTodas.filter((r) => !r.tipo_atendimento || r.tipo_atendimento === 'ambos' || r.tipo_atendimento === tipoAtendNorm)
    : regrasTodas;
  const ufDestino = (end.uf ?? '').trim().toUpperCase();
  // Escolhe a regra do imposto: prioridade p/ a que lista a UF de destino;
  // senao a "curinga" (destino_ufs vazio); senao a de menor ordem.
  const regraDe = (imp: string): RegraFiscal | null => {
    const doImposto = regras
      .filter((r) => r.imposto === imp)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    if (doImposto.length === 0) return null;
    return (
      doImposto.find((r) => (r.destino_ufs ?? []).map((u) => u.toUpperCase()).includes(ufDestino)) ??
      doImposto.find((r) => !(r.destino_ufs ?? []).length) ??
      doImposto[0]
    );
  };

  const regraIcms = regraDe('icms');
  const regraPis = regraDe('pis');
  const regraCofins = regraDe('cofins');
  const regraIpi = regraDe('ipi');
  const regraIbsCbs = regraDe('ibscbs');
  const faltando: string[] = [];
  if (!regraIcms?.cfop || !regraIcms?.situacao_tributaria) faltando.push('ICMS (CFOP/CST)');
  if (!regraPis?.situacao_tributaria) faltando.push('PIS');
  if (!regraCofins?.situacao_tributaria) faltando.push('COFINS');
  // Reforma Tributária: emitente CRT 3 precisa do grupo IBS/CBS (SEFAZ rejeita com cStat 1115).
  if (!regraIbsCbs?.situacao_tributaria || !regraIbsCbs?.classificacao_tributaria) {
    faltando.push('IBS/CBS (CST/cClassTrib — Reforma Tributária)');
  }
  // CST 20 (redução de base de ICMS) exige prod/cBenef — sem ele a SEFAZ
  // rejeita com [930] "CST com beneficio fiscal e nao informado o codigo de
  // beneficio fiscal" (achado numa venda MMATOS DF→GO, 2026-09-11 — a regra
  // de ICMS tinha reducao_base_calculo mas codigo_beneficio_fiscal vazio).
  // Bloqueia aqui com erro claro em vez de deixar a SEFAZ rejeitar.
  if (regraIcms?.situacao_tributaria === '20' && Number(regraIcms?.reducao_base_calculo ?? 0) > 0 && !regraIcms?.codigo_beneficio_fiscal?.trim()) {
    faltando.push(`cBenef (CST 20 com redução de base exige o código de benefício fiscal na regra de ICMS — UF ${ufDestino || '?'})`);
  }
  // DIFAL (EC 87/2015): venda interestadual a consumidor final não contribuinte
  // precisa do grupo ICMSUFDest — sem a alíquota interna da UF de destino
  // cadastrada na regra de ICMS, a SEFAZ rejeita com [694] "Nao informado o
  // grupo de ICMS para a UF de destino". Bloqueia aqui com erro claro em vez
  // de deixar a Focus tentar e a SEFAZ rejeitar. Ver docs-fiscal-299/difal-ec87.md.
  if (ehVenda) {
    const pfFornecedor = (fornecedor.tipo_pessoa ?? 'fisica') === 'fisica';
    const indIeDestPreview = indicadorIeDestinatario(pfFornecedor, fornecedor.contribuinte_icms, fornecedor.inscricao_estadual);
    const difalNecessario = difalAplicavel({
      regimeTributarioEmitente: empresa.regime_tributario,
      ufEmitente: empresa.uf,
      ufDestino: end.uf ?? null,
      indIeDest: indIeDestPreview,
      consumidorFinal: !!natureza.consumidor_final,
      cstIcms: regraIcms?.situacao_tributaria,
    });
    if (difalNecessario && regraIcms?.aliquota_interna_destino == null) {
      faltando.push(`DIFAL (alíquota interna do ICMS não cadastrada pra UF de destino ${ufDestino || '?'} na regra de ICMS)`);
    }
  }
  if (faltando.length) {
    return jsonResponse(
      { error: `Regras fiscais da natureza "${cfg.naturezaDescricao}" incompletas: ${faltando.join(', ')}.` },
      409,
    );
  }

  // Venda 0km com CST 60 em PRODUÇÃO: exige os valores de ICMS-ST retido
  // anteriormente (transcritos da NF de entrada da moto). Sem eles a NF sairia
  // com valor aproximado sobre a venda — não fiel.
  if (ehVenda && ehVenda0km && ambiente === 'producao' && String(regraIcms?.situacao_tributaria) === '60') {
    const mn = estoqueMoto?.moto_nova ?? {};
    const n = (v: unknown) => Number(v ?? 0);
    if (n(mn.icms_st_bc_retido) <= 0 || n(mn.icms_st_valor_substituto) <= 0 || n(mn.icms_st_valor_retido) <= 0) {
      return jsonResponse({
        error: 'Preencha os valores de ICMS-ST retido anteriormente (BC ST retida, ICMS do substituto, ICMS-ST retido), da NF-e de entrada da moto, antes de emitir em produção.',
      }, 409);
    }
  }

  // Specs da moto: entrada vem da avaliacao; venda vem do estoque (avaliacao ou moto_nova).
  let motoData: any;
  if (ehVenda) {
    const mn = estoqueMoto?.moto_nova ?? null;
    const eh0km = !!estoqueMoto?.moto_nova_id && !!mn;
    const mSrc = eh0km ? mn : (estoqueMoto?.avaliacao ?? {});
    motoData = {
      marca: mSrc.marca ?? null,
      modelo: mSrc.modelo ?? null,
      ano_fabricacao: mSrc.ano_fabricacao ?? null,
      ano_modelo: mSrc.ano_modelo ?? null,
      cilindrada: mSrc.cilindrada ?? null,
      cor: mSrc.cor ?? null,
      placa: mSrc.placa ?? null,
      chassi: mSrc.chassi ?? null,
      renavam: mSrc.renavam ?? null,
      km: eh0km ? null : (mSrc.km ?? null),
      // Custo de aquisição da moto seminova — base da margem de PIS/COFINS na
      // revenda de usado (Lei 9.716/98). Prioriza o valor da NF-e de ENTRADA
      // (documento fiscal da compra); cai no valor de fechamento interno quando
      // a NF de entrada foi emitida fora do sistema e não foi registrada.
      custo_aquisicao: eh0km
        ? null
        : (mSrc.valor_nf_entrada != null
            ? Number(mSrc.valor_nf_entrada)
            : (mSrc.valor_fechamento != null ? Number(mSrc.valor_fechamento) : null)),
      ncm: eh0km ? (mn.ncm ?? null) : null,
      // Nº da NF de entrada (fornecedor/fábrica) — só existe pra moto 0km,
      // cadastrado direto no estoque_motos_novas (numero_nf_entrada).
      numero_nf_entrada: eh0km ? (mn.numero_nf_entrada ?? null) : null,
      // Grupo estruturado veicProd (veículo novo) — só 0km. Specs de potência/
      // peso/nº do motor/códigos DENATRAN cadastradas por unidade no estoque 0km
      // (na maioria vindas da NF de entrada da fábrica).
      zero_km: eh0km,
      potencia_motor: eh0km ? ((mn as any).potencia_motor ?? null) : null,
      peso_liquido: eh0km ? ((mn as any).peso_liquido ?? null) : null,
      peso_bruto: eh0km ? ((mn as any).peso_bruto ?? null) : null,
      numero_motor: eh0km ? ((mn as any).numero_motor ?? null) : null,
      codigo_cor_fabricante: eh0km ? ((mn as any).codigo_cor_fabricante ?? null) : null,
      codigo_cor_denatran: eh0km ? ((mn as any).codigo_cor_denatran ?? null) : null,
      codigo_marca_modelo_denatran: eh0km ? ((mn as any).codigo_marca_modelo_denatran ?? null) : null,
      // ICMS-ST retido anteriormente (grupo <ICMS60>) — transcrito da NF de
      // entrada; sem isso o payload calcula um valor aproximado sobre a venda.
      icms_st_bc_retido: eh0km ? ((mn as any).icms_st_bc_retido ?? null) : null,
      icms_st_valor_substituto: eh0km ? ((mn as any).icms_st_valor_substituto ?? null) : null,
      icms_st_valor_retido: eh0km ? ((mn as any).icms_st_valor_retido ?? null) : null,
    };
  } else {
    motoData = {
      marca: av.marca,
      modelo: av.modelo,
      ano_fabricacao: av.ano_fabricacao,
      ano_modelo: av.ano_modelo,
      cilindrada: av.cilindrada,
      cor: av.cor,
      placa: av.placa,
      chassi: av.chassi,
      renavam: av.renavam,
      km: av.km ?? null,
    };
  }

  // Devolução simbólica: referencia a chave de acesso da NF-e de entrada em
  // consignação (grupo NFref/refNFe — SEFAZ rejeita devolução sem isso).
  let notaReferenciada: string | null = null;
  if (tipo === 'devolucao_consignacao') {
    const { data: nfConsignacao } = await admin
      .from('nfe_entradas').select('chave_nfe')
      .eq('avaliacao_id', avaliacaoId).eq('operacao', 'consignacao').eq('status', 'processada')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    notaReferenciada = (nfConsignacao as any)?.chave_nfe ?? null;
  }

  const payload = montarPayloadNfeCompra({
    natureza: {
      descricao: natureza.descricao,
      serie: natureza.serie ?? null,
      tipo: natureza.tipo,
      // Fallback de cabeçalho — a resolução efetiva (regra de ICMS > regra de IPI >
      // este valor) acontece em montarPayloadNfeCompra, usando o tipo_atendimento
      // já aplicado na escolha da própria regra (ver regraDe() acima).
      indicador_presenca: natureza.indicador_presenca ?? null,
      consumidor_final: !!natureza.consumidor_final,
      operacao_devolucao: !!natureza.operacao_devolucao,
      informacoes_complementares: natureza.informacoes_complementares ?? null,
      informacoes_adicionais_fisco: natureza.informacoes_adicionais_fisco ?? null,
    },
    empresa: { cnpj: empresa.cnpj, regime_tributario: empresa.regime_tributario, uf: empresa.uf },
    fornecedor: {
      nome: fornecedor.nome_razao_social,
      cpf_cnpj: fornecedor.cpf_cnpj,
      tipo_pessoa: fornecedor.tipo_pessoa,
      contribuinte_icms: fornecedor.contribuinte_icms ?? null,
      inscricao_estadual: fornecedor.inscricao_estadual ?? null,
      isento_inscricao_estadual: fornecedor.isento_inscricao_estadual ?? null,
      telefone: fornecedor.telefone || fornecedor.telefone_comercial || null,
      cep: end.cep ?? null,
      logradouro: end.logradouro ?? null,
      numero: end.numero ?? null,
      complemento: end.complemento ?? null,
      bairro: end.bairro ?? null,
      cidade: end.cidade ?? null,
      uf: end.uf ?? null,
      rg: fornecedor.rg ?? null,
    },
    moto: motoData,
    valor,
    regraIcms: regraIcms!,
    regraPis: regraPis!,
    regraCofins: regraCofins!,
    regraIpi: regraIpi,
    regraIbsCbs: regraIbsCbs,
    observacoes: typeof body.observacoes === 'string' ? body.observacoes : null,
    vendedorNome,
    formasPagamentoTexto,
    trocaInfoCpl,
    formasPagamento: formasPagamentoEstrut,
    // Venda de moto seminova = bem móvel usado: liga indBemMovelUsado + base de
    // PIS/COFINS pela margem (venda − custo de aquisição).
    bemMovelUsado: tipo === 'venda_seminova',
    notaReferenciada,
    semPagamentoReal: tipo === 'devolucao_consignacao',
  });

  // FKs da nfe_entradas conforme a operacao.
  const nfeFks: Record<string, unknown> = ehVenda
    ? {
        avaliacao_id: null,
        atendimento_id: atendimentoId,
        estoque_moto_id: ehVenda0km ? null : (estoqueMoto?.id ?? null),
        estoque_moto_nova_id: ehVenda0km ? (estoqueMoto?.id ?? null) : null,
      }
    : { avaliacao_id: avaliacaoId };

  const dataEmissao = new Date().toISOString();
  const observacoesNf = typeof body.observacoes === 'string' && body.observacoes.trim()
    ? body.observacoes.trim().toUpperCase()
    : null;
  const r = await emitirNfe(base, token, refEmissao, payload);
  let focusBody = r.body;
  let fStatus = focusBody.status as string | undefined;
  let aceito = r.httpStatus === 200 || r.httpStatus === 201 || r.httpStatus === 202;
  const atualizaExistente = !!nfeExistente && !precisaLinhaNova;

  // A Focus e idempotente por `ref`: reemitir sobre um ref que ja tem nota
  // autorizada nao reprocessa, devolve um erro generico ("A nota fiscal ja foi
  // autorizada") em vez do status da nota. Isso acontece quando uma tentativa
  // anterior demorou/expirou do lado do client mas terminou de autorizar na
  // Focus/SEFAZ — a nota EXISTE de verdade. Tratar como falha aqui prende o
  // usuario num loop de "Tentar novamente" que nunca funciona (o ref sempre vai
  // bater no mesmo "ja autorizada"); em vez disso, consulta o ref pra recuperar
  // os dados reais (numero/serie/chave/DANFE) e segue como se tivesse autorizado.
  if (!aceito && fStatus !== 'processando_autorizacao' && fStatus !== 'autorizado' && !focusBody.mensagem_sefaz) {
    // mensagemErroFocus cobre as 3 formas que a Focus usa pra devolver texto de
    // erro (body.mensagem, body.erros[], body.raw) — testar contra ela, nao só
    // contra body.mensagem, pra nao deixar passar essa mesma mensagem vindo por
    // um formato diferente.
    if (/autorizad/i.test(mensagemErroFocus(focusBody))) {
      const consulta = await consultarNfe(base, token, refEmissao);
      if (consulta.body.status) {
        focusBody = consulta.body;
        fStatus = focusBody.status as string | undefined;
        aceito = true;
      }
    }
  }

  if (!aceito && fStatus !== 'processando_autorizacao' && fStatus !== 'autorizado') {
    // Persiste o erro para a tela mostrar "Tentar novamente".
    const errMsg = mensagemErroFocus(focusBody);
    const linhaErro = {
      empresa_id: empresaId,
      ...nfeFks,
      fornecedor_id: atendimento.cliente_id,
      natureza_operacao_id: natureza.id,
      ref_externa: refEmissao,
      ambiente,
      operacao: tipo,
      valor_total: valor,
      departamento,
      observacoes: observacoesNf,
      status: 'erro',
      focus_status: fStatus ?? `http_${r.httpStatus}`,
      erro_mensagem: errMsg,
    };
    if (atualizaExistente) {
      await admin.from('nfe_entradas').update(linhaErro).eq('id', nfeExistente.id);
    } else {
      await admin.from('nfe_entradas').insert(linhaErro);
    }
    return jsonResponse({ error: errMsg }, 422);
  }

  const autorizado = fStatus === 'autorizado';
  const linha: Record<string, unknown> = {
    empresa_id: empresaId,
    ...nfeFks,
    fornecedor_id: atendimento.cliente_id,
    natureza_operacao_id: natureza.id,
    ref_externa: refEmissao,
    ambiente,
    operacao: tipo,
    valor_total: valor,
    departamento,
    observacoes: observacoesNf,
    data_emissao: dataEmissao,
    data_entrada: dataEmissao,
    focus_status: fStatus ?? 'processando_autorizacao',
    status: autorizado ? 'processada' : 'processando_itens',
    erro_mensagem: null,
    numero: (focusBody.numero as string) ?? null,
    serie: (focusBody.serie as string) ?? null,
    chave_nfe: (focusBody.chave_nfe as string) ?? null,
    caminho_danfe: focusBody.caminho_danfe ? `${base}${focusBody.caminho_danfe}` : null,
    xml_raw: focusBody.caminho_xml_nota_fiscal ? `${base}${focusBody.caminho_xml_nota_fiscal}` : null,
  };

  let nfeRow;
  if (atualizaExistente) {
    const { data, error } = await admin.from('nfe_entradas').update(linha).eq('id', nfeExistente.id).select('*').maybeSingle();
    if (error) return jsonResponse({ error: `Falha ao gravar a NF-e (nota autorizada na Focus mas não persistida): ${error.message}` }, 500);
    nfeRow = data;
  } else {
    const { data, error } = await admin.from('nfe_entradas').insert(linha).select('*').maybeSingle();
    if (error) return jsonResponse({ error: `Falha ao gravar a NF-e (nota autorizada na Focus mas não persistida): ${error.message}` }, 500);
    nfeRow = data;
  }

  if (nfeRow?.id) {
    await admin.from('nfe_itens').insert({
      nfe_id: nfeRow.id,
      descricao_nf: (payload.items as Array<Record<string, unknown>>)[0].descricao as string,
      ncm: (payload.items as Array<Record<string, unknown>>)[0].codigo_ncm as string,
      cfop: (payload.items as Array<Record<string, unknown>>)[0].cfop as string,
      cst: String((payload.items as Array<Record<string, unknown>>)[0].icms_situacao_tributaria ?? ''),
      unidade: 'UN',
      quantidade: 1,
      valor_unitario: valor,
      valor_total_item: valor,
      departamento,
    });
  }

  // Só produção autorizada tem efeito no sistema (compromissos, status/etapa,
  // histórico, NPS). Homologação persiste a linha e não dispara mais nada.
  if (autorizado && ambiente === 'producao') {
    // A NF de produção autorizada apaga as NF de homologação (e tentativas de
    // produção com erro) da mesma entidade + relacionamentos.
    await limparNfeHomologacao(admin, cfg, entityId, nfeRow.id, tipo);
    await registrarPosAutorizacao(admin, cfg, {
      entityId,
      operacao: tipo,
      dataEmissao,
      numero: (focusBody.numero as string) ?? null,
      serie: (focusBody.serie as string) ?? null,
      callerId: caller.id,
      callerName,
    });
  }

  return jsonResponse({ nfe: nfeRow }, 200);
});
