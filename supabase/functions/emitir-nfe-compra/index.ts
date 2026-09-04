// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { consultarNfe, emitirNfe, focusBaseUrl, mensagemErroFocus, type FocusAmbiente } from './focus.ts';
import { montarPayloadNfeCompra, type RegraFiscal } from './payload.ts';

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

/** atendimentos_motos.tipo_atendimento ('Presencial' | 'Online') normalizado pro
 * mesmo vocabulário de naturezas_operacao_regras.tipo_atendimento ('presencial' |
 * 'online' | 'ambos') — usado como critério extra de match do CFOP/regra (ver
 * regraDe() abaixo). indPres não é mais calculado aqui: sai da própria regra
 * escolhida (regraIcms/regraIpi.indicador_presenca), igual CST/CFOP/natOp —
 * ver ORIENTACAO_CONFIG_NATUREZAS.md do SisFin §4.2/4.3. */
const tipoAtendPorAtendimento = (tipo: string | null | undefined): 'presencial' | 'online' | null => {
  if (tipo === 'Presencial') return 'presencial';
  if (tipo === 'Online') return 'online';
  return null;
};

type Operacao = 'compra' | 'consignacao' | 'venda_seminova' | 'venda_0km';

interface OperacaoConfig {
  refPrefix: string;
  naturezaDescricao: string;
  statusEntity: string;
  statusHist: string;
  etapaTable: string;
  etapa: string;
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
    case 'processando_autorizacao':
      return 'processando_itens';
    case 'erro_autorizacao':
    case 'denegado':
      return 'erro';
    default:
      return 'validando';
  }
}

const PENDENTES = new Set(['recebida', 'validando', 'processando_itens']);

async function registrarPosAutorizacao(
  admin: any,
  cfg: OperacaoConfig,
  params: {
    entityId: string; // avaliacaoId ou atendimentoId conforme cfg.keyBy
    dataEmissao: string;
    numero: string | null;
    serie: string | null;
    callerId: string;
    callerName: string | null;
  },
) {
  const { entityId, dataEmissao, numero, serie, callerId, callerName } = params;
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

  // Marca a etapa do checklist como concluida.
  await admin.from(cfg.etapaTable).upsert(
    {
      [fkCol]: entityId,
      etapa: cfg.etapa,
      concluida: true,
      data_conclusao: dataEmissao,
    },
    { onConflict: `${fkCol},etapa` },
  );

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

  if (!cfg.criaCompromisso || !cfg.planoContaId || !cfg.centroCustoId) return;

  // Compromisso financeiro (contas a pagar/receber) da NF-e.
  const { data: nfeRow } = await admin
    .from('nfe_entradas')
    .select('*')
    .eq(fkCol, entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Guard duro: só gera compromisso DEPOIS da NF-e autorizada. Vale para toda operação.
  if (!nfeRow?.id || nfeRow.status !== 'processada' || !nfeRow.empresa_id) return;

  const venc = new Date(nfeRow.data_emissao || dataEmissao || Date.now());
  venc.setDate(venc.getDate() + DIAS_VENCIMENTO);
  const vencStr = venc.toISOString().slice(0, 10);

  type ParcelaDesejada = { numero_parcela: number; valor: number; tipo: string; forma_pagamento_id: string };
  const compromissoNatureza = cfg.compromissoTipo === 'receber' ? 'receita' : 'despesa';
  let parcelasDesejadas: ParcelaDesejada[] = [];
  let obsCompromisso: string | null = null;

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

    const { data: formas } = contratoVenda?.id
      ? await admin
          .from('formas_pagamento_contrato')
          .select('tipo, forma_pagamento_id, valor_total, valor_entrada, valor_financiado')
          .eq('contrato_id', contratoVenda.id)
          .order('created_at', { ascending: true })
      : { data: [] };

    const ehFinanciamentoContrato = (t?: string | null) =>
      String(t ?? '').toLowerCase().includes('financiamento');

    let n = 0;
    for (const f of (formas || []) as any[]) {
      if (ehFinanciamentoContrato(f.tipo)) {
        const entrada = Number(f.valor_entrada ?? 0);
        const financiado = Number(f.valor_financiado ?? 0);
        if (entrada > 0) parcelasDesejadas.push({ numero_parcela: ++n, valor: entrada, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_ID });
        if (financiado > 0) parcelasDesejadas.push({ numero_parcela: ++n, valor: financiado, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_BOLETO_ID });
      } else {
        const total = Number(f.valor_total ?? 0);
        if (total > 0) {
          parcelasDesejadas.push({
            numero_parcela: ++n,
            valor: total,
            tipo: 'unico',
            forma_pagamento_id: f.forma_pagamento_id ?? FORMA_PAGAMENTO_ID,
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
    obsCompromisso = obsMoto(avFin?.marca, avFin?.modelo, avFin?.placa);
  }

  // Compromisso: reaproveita se já existe (idempotente por nfe_entrada_id).
  const { data: compExistente } = await admin
    .from('compromissos')
    .select('id')
    .eq('nfe_entrada_id', nfeRow.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let compId: string | null = compExistente?.id ?? null;
  if (!compId) {
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
        status_compromisso: 'em_aberto',
        nfe_entrada_id: nfeRow.id,
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

  // Parcelas: insere apenas as que ainda não existem (por numero_parcela). Nunca duplica.
  const { data: parcelasExistentes } = await admin
    .from('compromissos_parcelas')
    .select('numero_parcela')
    .eq('compromisso_id', compId);
  const jaTem = new Set((parcelasExistentes || []).map((p: any) => p.numero_parcela));

  const parcelasAInserir = parcelasDesejadas
    .filter((p) => !jaTem.has(p.numero_parcela))
    .map((p) => ({
      compromisso_id: compId,
      numero_parcela: p.numero_parcela,
      valor: p.valor,
      data_vencimento: vencStr,
      tipo: p.tipo,
      forma_pagamento_id: p.forma_pagamento_id,
      status_pagamento: 'em_aberto',
    }));

  if (parcelasAInserir.length > 0) {
    await admin.from('compromissos_parcelas').insert(parcelasAInserir);
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

  const acao = body.acao === 'consultar' ? 'consultar' : 'emitir';
  const tipo: Operacao = (['compra', 'consignacao', 'venda_seminova', 'venda_0km'] as const).includes(body.tipo as any)
    ? (body.tipo as Operacao)
    : 'compra';
  const cfg = CFG[tipo];
  const ehVenda = cfg.keyBy === 'atendimento';
  // Compra/consignação de moto seminova entram no departamento "motos_seminovas".
  const departamento = (tipo === 'compra' || tipo === 'consignacao') ? 'motos_seminovas' : 'motos';

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
        },
      };
    } else {
      const { data: em } = await admin
        .from('estoque_motos')
        .select(
          '*, avaliacao:avaliacao_id(marca:marca_id(nome), modelo:modelo_id(nome), ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam)',
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
          'marca:marca_id(nome), modelo:modelo_id(nome), ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam',
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
  const buscarNfe = () =>
    admin.from('nfe_entradas').select('*').eq(nfeKey, entityId)
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

    if (fStatus === 'autorizado') {
      await registrarPosAutorizacao(admin, cfg, {
        entityId,
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
  // acao: emitir
  // =====================================================================

  // Guards
  let contratoVendaId: string | null = null;
  if (tipo === 'compra') {
    if (av.consulta_realizada !== true) return jsonResponse({ error: 'A consulta veicular ainda não foi realizada.' }, 409);
    if (av.aprovacao_status !== 'aprovada') return jsonResponse({ error: 'A compra ainda não foi aprovada.' }, 409);
    const { data: contratoHist } = await admin
      .from('status_history').select('id')
      .eq('entity_type', 'pos_compra').eq('entity_id', avaliacaoId).eq('status', 'contrato_compra_gerado').limit(1);
    if (!contratoHist || contratoHist.length === 0) {
      return jsonResponse({ error: 'O contrato de compra ainda não foi gerado.' }, 409);
    }
  } else if (tipo === 'consignacao') {
    if (av.consulta_realizada !== true) return jsonResponse({ error: 'A consulta veicular ainda não foi realizada.' }, 409);
    const { data: contratoConsig } = await admin
      .from('contratos_consignacao').select('id').eq('avaliacao_id', avaliacaoId).limit(1);
    if (!contratoConsig || contratoConsig.length === 0) {
      return jsonResponse({ error: 'O contrato do consignante ainda não foi gerado.' }, 409);
    }
  } else {
    // venda
    if (!['vendido', 'sinal'].includes(estoqueMoto?.status)) {
      return jsonResponse({ error: 'A moto ainda não foi marcada como vendida.' }, 409);
    }
    const { data: contratoVenda } = await admin
      .from('contratos').select('id')
      .eq('atendimento_id', atendimentoId).neq('ipva_tipo', 'COMPRA').limit(1);
    if (!contratoVenda || contratoVenda.length === 0) {
      return jsonResponse({ error: 'O contrato de venda ainda não foi gerado.' }, 409);
    }
    contratoVendaId = contratoVenda[0].id;
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
      .from('nfe_entradas').select('id').eq(nfeKey, entityId)
      .eq('ambiente', 'producao').eq('status', 'processada').limit(1).maybeSingle();
    if (producaoAutorizada) {
      return jsonResponse({ error: 'Já existe uma NF-e emitida em produção para esta moto.' }, 409);
    }
    const { data: homologAutorizada } = await admin
      .from('nfe_entradas').select('id').eq(nfeKey, entityId)
      .eq('ambiente', 'homologacao').eq('status', 'processada').limit(1).maybeSingle();
    if (!homologAutorizada) {
      return jsonResponse({ error: 'Emita em homologação antes de emitir em produção.' }, 409);
    }
  } else if (nfeExistente && nfeExistente.status === 'processada' && nfeExistente.ambiente === 'producao') {
    // Depois de produção autorizada, não reemite mais nem em homologação.
    return jsonResponse({ error: 'Já existe uma NF-e emitida em produção para esta moto — contrato bloqueado.' }, 409);
  }

  // Emitir sobre uma linha já autorizada (reemissão em homologação, ou a 1ª emissão
  // em produção depois de homologação) gera uma linha nova — nunca sobrescreve a
  // autorizada anterior, que fica registrada no histórico.
  const precisaLinhaNova = !!nfeExistente && nfeExistente.status === 'processada';
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
    .select('id, nome_razao_social, cpf_cnpj, tipo_pessoa, telefone, telefone_comercial, rg, clientes_fornecedores_enderecos(*)')
    .eq('id', atendimento.cliente_id)
    .maybeSingle();
  if (!fornecedor) return jsonResponse({ error: 'Cliente não encontrado' }, 409);
  const end = (fornecedor.clientes_fornecedores_enderecos || [])[0] || {};

  // Venda: nome do vendedor + formas de pagamento do contrato, pra compor as
  // informações complementares da NF-e (ver montarPayloadNfeCompra).
  let vendedorNome: string | null = null;
  let formasPagamentoTexto: string | null = null;
  if (ehVenda) {
    const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const [{ data: vendedorRole }, { data: formasPagamento }] = await Promise.all([
      atendimento.vendedor_id
        ? admin.from('user_roles').select('nome').eq('user_id', atendimento.vendedor_id).eq('projeto_id', BPM_PROJETO_ID).maybeSingle()
        : Promise.resolve({ data: null }),
      contratoVendaId
        ? admin.from('formas_pagamento_contrato').select('tipo, valor_total, valor_financiado').eq('contrato_id', contratoVendaId).order('created_at', { ascending: true })
        : Promise.resolve({ data: null }),
    ]);
    vendedorNome = (vendedorRole as any)?.nome ?? null;
    formasPagamentoTexto = ((formasPagamento as any[]) || [])
      .map((fp) => {
        const v = fp.valor_total ?? fp.valor_financiado;
        return v != null ? `${fp.tipo} ${fmtBRL(Number(v))}` : fp.tipo;
      })
      .join(' * ') || null;
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
  } else if (tipo === 'consignacao') {
    valor = valorBody ?? Number(av.valor_consignacao_nota ?? av.avaliacao_consignacao ?? 0);
    if (valorBody != null) {
      await admin.from('avaliacoes').update({ valor_consignacao_nota: valorBody }).eq('id', avaliacaoId);
    }
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
        'aliquota_fcp, tipo_tributacao, informacoes_complementares, informacoes_adicionais_fisco, destino_ufs, ordem, ' +
        'natureza_operacao_descricao, indicador_presenca, tipo_atendimento, ' +
        'classificacao_tributaria, cbs_aliquota, ibs_uf_aliquota, ibs_mun_aliquota, percentual_reducao, ' +
        'aliquota_icms_efetiva, reducao_base_calculo_efetiva)',
    )
    .eq('empresa_id', empresaId)
    .eq('descricao', cfg.naturezaDescricao)
    .eq('ativo', true)
    .maybeSingle();
  if (!natureza) return jsonResponse({ error: `Natureza de operação "${cfg.naturezaDescricao}" não configurada ou inativa.` }, 409);

  const regrasTodas = (natureza.naturezas_operacao_regras || []) as Array<
    RegraFiscal & { destino_ufs: string[] | null; ordem: number | null; tipo_atendimento: string | null }
  >;
  // Venda: tipo_atendimento do atendimento ('presencial'/'online') é mais um
  // critério de match do CFOP — regra com tipo_atendimento='ambos' (default) casa
  // com qualquer atendimento; 'presencial'/'online' só casa com o correspondente.
  // Compra/consignação não filtra (tipoAtendNorm fica null, sem restrição).
  const tipoAtendNorm = ehVenda ? tipoAtendPorAtendimento((atendimento as any).tipo_atendimento) : null;
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
  if (faltando.length) {
    return jsonResponse(
      { error: `Regras fiscais da natureza "${cfg.naturezaDescricao}" incompletas: ${faltando.join(', ')}.` },
      409,
    );
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
      ncm: eh0km ? (mn.ncm ?? null) : null,
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
    };
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

  if (autorizado) {
    await registrarPosAutorizacao(admin, cfg, {
      entityId,
      dataEmissao,
      numero: (focusBody.numero as string) ?? null,
      serie: (focusBody.serie as string) ?? null,
      callerId: caller.id,
      callerName,
    });
  }

  return jsonResponse({ nfe: nfeRow }, 200);
});
