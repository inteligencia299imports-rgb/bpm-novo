// deno-lint-ignore-file no-explicit-any
// Cria os compromissos financeiros no momento da GERAÇÃO DA PROPOSTA (não mais só
// na autorização da NF-e). `emitir-nfe-compra` depois RECONCILIA (vincula
// nfe_entrada_id + ajusta parcelas não pagas). Idempotente por (origem, vínculo):
//   origem 'venda'       -> compromissos.contrato_id  (a receber, VND-R)
//   origem 'compra'|'troca' -> compromissos.avaliacao_id (a pagar, CPR-D)
//   origem 'consignante'    -> compromissos.atendimento_id (a pagar, CPR-D)
//   origem 'troco'          -> compromissos.contrato_id  (a pagar, TRC-D) —
//     agregado marcado como troco no contrato de venda; não cobrado do
//     cliente, gera conta a pagar do mesmo valor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';

// Chaves fixas — MESMAS de emitir-nfe-compra/index.ts (validar com a contabilidade).
const PLANO_COMPRA_USADA = 'd16507df-9655-4677-8ed9-01398ce28239';
const PLANO_VENDA_USADA = 'c4f76d4e-bfd9-4ade-987e-4a0798603416';
const PLANO_VENDA_NOVA = 'c155d12c-4f49-4592-be1c-63f515ff97d3';
const CC_MOTOS_USADAS = '7fe3888a-fd17-4c31-b78b-82a0af680ff3';
const CC_MOTOS_NOVAS = '30f457e2-d6b9-48c3-aca7-e45bbf0200df';
// Troco ao cliente (agregado marcado como troco no contrato de venda) — plano
// de contas próprio, diferente do de venda normal (não é receita de venda,
// é devolução de dinheiro). Centro de custo é o mesmo de venda usada/nova.
const PLANO_TROCO_USADA = '31b50885-ffba-469a-8454-95eab010ca0f';
const PLANO_TROCO_NOVA = '1299f5d9-d3b4-4fae-a601-4fa9c3e6bb58';
const FORMA_PAGAMENTO_ID = '63e1fff5-14d7-476c-b2da-e1ea173279a1'; // Pix
const FORMA_PAGAMENTO_BOLETO_ID = '7d0f2125-fedf-4a27-8ab0-be21fecaf642'; // Boleto
const DIAS_VENCIMENTO = 7;

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

const nomeCat = (v: any): string | null =>
  (v && typeof v === 'object' ? (v.nome ?? null) : (v ?? null));
const nz = (v: any): number => Number(v) || 0;

/** yyyy-MM-dd de `base` + `dias`. `base` inválido/nulo -> a partir de hoje. */
function addDias(base: string | null | undefined, dias: number): string {
  const d = base ? new Date(base) : new Date();
  if (isNaN(d.getTime())) d.setTime(Date.now());
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const obsMoto = (marca?: string | null, modelo?: string | null, placa?: string | null): string | null => {
  const desc = [marca, modelo].filter(Boolean).join(' ').trim();
  const placaFmt = String(placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return [desc, placaFmt].filter(Boolean).join(' - ').toUpperCase() || null;
};

type Parcela = {
  numero_parcela: number;
  valor: number;
  tipo: string;
  forma_pagamento_id: string;
  data_vencimento: string;
  pago?: boolean;
};

type Origem = 'venda' | 'compra' | 'troca' | 'consignante' | 'troco';

async function gerarNumero(admin: any, prefix: string): Promise<string | null> {
  const { data, error } = await admin.rpc('gerar_numero_compromisso', { _prefix: prefix });
  if (error) console.error('gerar_numero_compromisso', error);
  return (data as string | null) ?? null;
}

interface UpsertArgs {
  origem: Origem;
  linkField: 'contrato_id' | 'avaliacao_id' | 'atendimento_id';
  linkId: string;
  empresaId: string;
  fornecedorId: string | null;
  natureza: 'receita' | 'despesa';
  planoContaId: string;
  centroCustoId: string;
  observacoes: string | null;
  numeroPrefix: string;
  parcelas: Parcela[];
  callerId: string;
}

/**
 * Cria/atualiza o compromisso do "slot" (origem + vínculo). Idempotente.
 * - Se já foi vinculado a uma NF-e (nfe_entrada_id) ou está cancelado -> NÃO mexe
 *   (a partir daí quem manda é emitir-nfe-compra).
 * - Parcelas: mantém as PAGAS; apaga e recria as demais conforme `parcelas`.
 */
async function upsertCompromisso(admin: any, a: UpsertArgs): Promise<Record<string, unknown>> {
  const parcelasValidas = a.parcelas.filter((p) => p.valor > 0.005);
  if (parcelasValidas.length === 0) return { origem: a.origem, status: 'sem_valor' };
  const statusHeader = parcelasValidas.every((p) => p.pago) ? 'pago' : 'em_aberto';
  const dataPagamento = new Date().toISOString().slice(0, 10);

  const { data: exist } = await admin
    .from('compromissos')
    .select('id, nfe_entrada_id, status_compromisso')
    .eq(a.linkField, a.linkId)
    .eq('origem', a.origem)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (exist?.nfe_entrada_id) return { origem: a.origem, status: 'travado_nfe', compromisso_id: exist.id };
  if (exist?.status_compromisso === 'cancelada') return { origem: a.origem, status: 'cancelado', compromisso_id: exist.id };

  let compId: string | undefined = exist?.id;
  if (!compId) {
    const numero = await gerarNumero(admin, a.numeroPrefix);
    const { data: comp, error } = await admin
      .from('compromissos')
      .insert({
        empresa_id: a.empresaId,
        fornecedor_id: a.fornecedorId,
        natureza: a.natureza,
        despesa_fixa: false,
        plano_conta_id: a.planoContaId,
        centro_custo_id: a.centroCustoId,
        observacoes: a.observacoes,
        status_compromisso: statusHeader,
        origem: a.origem,
        [a.linkField]: a.linkId,
        numero_compromisso: numero,
        created_by: a.callerId,
      })
      .select('id')
      .maybeSingle();
    if (error || !comp?.id) {
      console.error('insert compromisso', error);
      return { origem: a.origem, status: 'erro', erro: error?.message };
    }
    compId = comp.id;
  } else {
    await admin
      .from('compromissos')
      .update({
        observacoes: a.observacoes,
        fornecedor_id: a.fornecedorId,
        empresa_id: a.empresaId,
        status_compromisso: statusHeader,
        updated_by: a.callerId,
      })
      .eq('id', compId)
      .neq('status_compromisso', 'cancelada');
  }

  const { data: parcExist } = await admin
    .from('compromissos_parcelas')
    .select('numero_parcela, status_pagamento')
    .eq('compromisso_id', compId);
  const pagas = new Set(
    ((parcExist as any[]) || []).filter((p) => p.status_pagamento === 'pago').map((p) => p.numero_parcela),
  );
  await admin
    .from('compromissos_parcelas')
    .delete()
    .eq('compromisso_id', compId)
    .neq('status_pagamento', 'pago');

  const aInserir = parcelasValidas
    .filter((p) => !pagas.has(p.numero_parcela))
    .map((p) => ({
      compromisso_id: compId,
      numero_parcela: p.numero_parcela,
      valor: p.valor,
      data_vencimento: p.data_vencimento,
      tipo: p.tipo,
      forma_pagamento_id: p.forma_pagamento_id,
      status_pagamento: p.pago ? 'pago' : 'em_aberto',
      ...(p.pago ? { data_pagamento: dataPagamento } : {}),
    }));
  if (aInserir.length > 0) {
    const { error } = await admin.from('compromissos_parcelas').insert(aInserir);
    if (error) console.error('insert parcelas', error);
  }

  return { origem: a.origem, status: exist ? 'atualizado' : 'criado', compromisso_id: compId };
}

/** Observação (moto vendida) para o compromisso a receber. */
async function obsMotoVendida(admin: any, atendimentoId: string): Promise<string | null> {
  const [{ data: em }, { data: en }] = await Promise.all([
    admin
      .from('estoque_motos')
      .select('avaliacao:avaliacao_id(placa, marca:marca_id(nome), modelo:modelo_id(nome))')
      .eq('atendimento_venda_id', atendimentoId)
      .maybeSingle(),
    admin
      .from('estoque_motos_novas')
      .select('placa, marca:marca_id(nome), modelo:modelo_id(nome)')
      .eq('atendimento_venda_id', atendimentoId)
      .maybeSingle(),
  ]);
  const av = (em as any)?.avaliacao;
  if (av) return obsMoto(nomeCat(av.marca), nomeCat(av.modelo), av.placa);
  if (en) return obsMoto(nomeCat((en as any).marca), nomeCat((en as any).modelo), (en as any).placa);
  return null;
}

/**
 * Repasse ao cliente (compra de seminova): a PAGAR.
 * repasse = fechamento - quitação - custos do cliente (previsão + oficina).
 * Com quitação -> 2 parcelas (boleto da quitação + pix do repasse).
 *
 * Troca (moto que entra como parte de pagamento): a quitação do financiamento
 * (se houver) sempre vira parcela em aberto. O repasse de equity nasce PAGO
 * (foi absorvido no próprio negócio) até o limite do valor de venda da moto
 * comprada; só a parte que exceder o valor de venda vira parcela em aberto.
 */
async function construirRepasse(
  admin: any,
  avaliacaoId: string,
  origem: 'compra' | 'troca',
  vencimentoOverride: string | null,
  callerId: string,
  valorVendaTroca?: number,
): Promise<Record<string, unknown>> {
  const { data: av } = await admin
    .from('avaliacoes')
    .select('id, atendimento_id, previsao_custos_cliente, valor_quitacao, valor_fechamento, placa, marca:marca_id(nome), modelo:modelo_id(nome)')
    .eq('id', avaliacaoId)
    .maybeSingle();
  if (!av) return { origem, status: 'avaliacao_nao_encontrada' };

  const { data: contratoCompra } = await admin
    .from('contratos')
    .select('id, valor_quitacao, valor_fechamento, empresa_id, data_sinal')
    .eq('atendimento_id', av.atendimento_id)
    .eq('ipva_tipo', 'COMPRA')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: at } = await admin
    .from('atendimentos_motos')
    .select('cliente_id, empresa_id')
    .eq('id', av.atendimento_id)
    .maybeSingle();

  const { data: custosCli } = await admin
    .from('custos_oficina')
    .select('responsavel, valor_previsto, valor_executado')
    .eq('avaliacao_id', avaliacaoId);
  const custosClienteOficina = ((custosCli as any[]) || [])
    .filter((c) => (c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((s, c) => s + nz(c.valor_executado ?? c.valor_previsto), 0);

  // Fechamento e quitação têm origem única na avaliação — nunca usam o valor
  // já salvo no contrato (ficaria divergente se a avaliação for atualizada
  // depois de o contrato já ter sido gerado uma vez).
  const fechamento = nz(av.valor_fechamento ?? contratoCompra?.valor_fechamento);
  const quitacao = nz(av.valor_quitacao ?? contratoCompra?.valor_quitacao);
  const custosPrev = nz(av.previsao_custos_cliente);
  const repasse = Math.max(fechamento - quitacao - custosPrev - custosClienteOficina, 0);

  const venc = vencimentoOverride || addDias(contratoCompra?.data_sinal, DIAS_VENCIMENTO);

  let parcelas: Parcela[];
  if (origem === 'troca') {
    // Quitação: sempre em aberto. Repasse: pago até o limite do valor de venda
    // da moto comprada; a parte que exceder esse valor fica em aberto.
    const valorVenda = nz(valorVendaTroca);
    const diferenca = Math.min(Math.max(fechamento - valorVenda, 0), repasse);
    const restante = repasse - diferenca;
    const itens: { valor: number; forma_pagamento_id: string; pago: boolean }[] = [];
    if (quitacao > 0) itens.push({ valor: quitacao, forma_pagamento_id: FORMA_PAGAMENTO_BOLETO_ID, pago: false });
    if (diferenca > 0) itens.push({ valor: diferenca, forma_pagamento_id: FORMA_PAGAMENTO_ID, pago: false });
    if (restante > 0) itens.push({ valor: restante, forma_pagamento_id: FORMA_PAGAMENTO_ID, pago: true });
    if (itens.length === 0) return { origem, status: 'sem_valor' };
    const tipo = itens.length > 1 ? 'parcelado' : 'unico';
    parcelas = itens.map((it, i) => ({
      numero_parcela: i + 1,
      valor: it.valor,
      tipo,
      forma_pagamento_id: it.forma_pagamento_id,
      data_vencimento: venc,
      pago: it.pago,
    }));
  } else {
    parcelas = quitacao > 0
      ? [
          { numero_parcela: 1, valor: quitacao, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_BOLETO_ID, data_vencimento: venc },
          { numero_parcela: 2, valor: repasse, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_ID, data_vencimento: venc },
        ]
      : [{ numero_parcela: 1, valor: repasse, tipo: 'unico', forma_pagamento_id: FORMA_PAGAMENTO_ID, data_vencimento: venc }];
  }

  const empresaId = contratoCompra?.empresa_id || at?.empresa_id;
  if (!empresaId) return { origem, status: 'sem_empresa' };

  return upsertCompromisso(admin, {
    origem,
    linkField: 'avaliacao_id',
    linkId: avaliacaoId,
    empresaId,
    fornecedorId: at?.cliente_id ?? null,
    natureza: 'despesa',
    planoContaId: PLANO_COMPRA_USADA,
    centroCustoId: CC_MOTOS_USADAS,
    observacoes: obsMoto(nomeCat(av.marca), nomeCat(av.modelo), av.placa),
    numeroPrefix: 'CPR-D',
    parcelas,
    callerId,
  });
}

/** Venda de moto própria/0km/consignada: a RECEBER (+ troca a pagar, se houver). */
async function acaoVenda(admin: any, atendimentoId: string, callerId: string): Promise<Record<string, unknown>> {
  const { data: contratos } = await admin
    .from('contratos')
    .select('id, ipva_tipo, data_sinal, empresa_id')
    .eq('atendimento_id', atendimentoId)
    .order('created_at', { ascending: false });
  const contratoVenda = ((contratos as any[]) || []).find((c) => c.ipva_tipo !== 'COMPRA') ?? null;
  if (!contratoVenda?.id) return { erro: 'Contrato de venda não encontrado' };

  const { data: at } = await admin
    .from('atendimentos_motos')
    .select('id, cliente_id, empresa_id, interesse')
    .eq('id', atendimentoId)
    .maybeSingle();

  const empresaId = contratoVenda.empresa_id || at?.empresa_id;
  if (!empresaId) return { erro: 'Empresa não definida no contrato/atendimento' };

  const { data: mi } = await admin
    .from('motos_interesse')
    .select('estoque_tipo')
    .eq('atendimento_id', atendimentoId)
    .not('estoque_moto_id', 'is', null)
    .limit(1)
    .maybeSingle();
  const eh0km = mi?.estoque_tipo === '0km';

  const { data: formas } = await admin
    .from('formas_pagamento_contrato')
    .select('tipo, forma_pagamento_id, valor_total, valor_entrada, valor_financiado, data_pagamento')
    .eq('contrato_id', contratoVenda.id)
    .order('created_at', { ascending: true });

  const vencPadrao = addDias(contratoVenda.data_sinal, DIAS_VENCIMENTO);
  const ehFinanciamento = (t?: string | null) => String(t ?? '').toLowerCase().includes('financiamento');
  const parcelas: Parcela[] = [];
  let n = 0;
  for (const f of ((formas as any[]) || [])) {
    const venc = typeof f.data_pagamento === 'string' && f.data_pagamento ? f.data_pagamento : vencPadrao;
    if (ehFinanciamento(f.tipo)) {
      const entrada = nz(f.valor_entrada);
      const financiado = nz(f.valor_financiado);
      if (entrada > 0) parcelas.push({ numero_parcela: ++n, valor: entrada, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_ID, data_vencimento: venc });
      if (financiado > 0) parcelas.push({ numero_parcela: ++n, valor: financiado, tipo: 'parcelado', forma_pagamento_id: FORMA_PAGAMENTO_BOLETO_ID, data_vencimento: venc });
    } else {
      const total = nz(f.valor_total);
      if (total > 0) parcelas.push({ numero_parcela: ++n, valor: total, tipo: 'unico', forma_pagamento_id: f.forma_pagamento_id ?? FORMA_PAGAMENTO_ID, data_vencimento: venc });
    }
  }

  const receber = await upsertCompromisso(admin, {
    origem: 'venda',
    linkField: 'contrato_id',
    linkId: contratoVenda.id,
    empresaId,
    fornecedorId: at?.cliente_id ?? null,
    natureza: 'receita',
    planoContaId: eh0km ? PLANO_VENDA_NOVA : PLANO_VENDA_USADA,
    centroCustoId: eh0km ? CC_MOTOS_NOVAS : CC_MOTOS_USADAS,
    observacoes: await obsMotoVendida(admin, atendimentoId),
    numeroPrefix: 'VND-R',
    parcelas,
    callerId,
  });

  const out: Record<string, unknown> = { receber };

  // Troca: a PAGAR pela(s) moto(s) que entra(m) como parte de pagamento.
  if (at?.interesse === 'trocar') {
    const { data: avs } = await admin.from('avaliacoes').select('id').eq('atendimento_id', atendimentoId);
    const vencTroca = addDias(contratoVenda.data_sinal, DIAS_VENCIMENTO);
    const valorVenda = parcelas.reduce((s, p) => s + p.valor, 0);
    out.troca = [];
    for (const avRow of ((avs as any[]) || [])) {
      (out.troca as unknown[]).push(await construirRepasse(admin, avRow.id, 'troca', vencTroca, callerId, valorVenda));
    }
  }

  // Agregado marcado como troco: não é cobrado do cliente nem entra no total
  // (ver AgregadosContrato) — em vez disso, gera um compromisso de conta a
  // PAGAR ao cliente com o mesmo valor. Soma todos os agregados de troco do
  // contrato num único compromisso (não é um serviço, é dinheiro devido).
  const { data: agsTroco } = await admin
    .from('contratos_agregados')
    .select('valor, descricao, observacoes')
    .eq('contrato_id', contratoVenda.id)
    .eq('troco', true);
  const valorTroco = ((agsTroco as any[]) || []).reduce((s, a) => s + nz(a.valor), 0);
  if (valorTroco > 0.005) {
    const obsTroco = ((agsTroco as any[]) || [])
      .map((a) => (a.observacoes || '').trim())
      .filter(Boolean)
      .join(' | ') || null;
    out.troco = await upsertCompromisso(admin, {
      origem: 'troco',
      linkField: 'contrato_id',
      linkId: contratoVenda.id,
      empresaId,
      fornecedorId: at?.cliente_id ?? null,
      natureza: 'despesa',
      planoContaId: eh0km ? PLANO_TROCO_NOVA : PLANO_TROCO_USADA,
      centroCustoId: eh0km ? CC_MOTOS_NOVAS : CC_MOTOS_USADAS,
      observacoes: obsTroco,
      numeroPrefix: 'TRC-D',
      parcelas: [{ numero_parcela: 1, valor: valorTroco, tipo: 'unico', forma_pagamento_id: FORMA_PAGAMENTO_ID, data_vencimento: vencPadrao }],
      callerId,
    });
  }

  return out;
}

/** Repasse ao consignante (venda de moto consignada): a PAGAR, no vencimento da
 *  etapa PREVISÃO DE PAGAMENTO da Intermediação Parte 1. */
async function acaoConsignante(admin: any, atendimentoId: string, callerId: string): Promise<Record<string, unknown>> {
  const { data: prev } = await admin
    .from('pos_venda_processos')
    .select('data_conclusao')
    .eq('atendimento_id', atendimentoId)
    .eq('etapa', 'PREVISÃO DE PAGAMENTO')
    .maybeSingle();
  if (!prev?.data_conclusao) return { status: 'sem_previsao_pagamento' };
  const vencimento = String(prev.data_conclusao).slice(0, 10);

  const { data: cc } = await admin
    .from('contratos_consignante')
    .select('valor_repasse')
    .eq('atendimento_id', atendimentoId)
    .maybeSingle();
  const repasse = nz(cc?.valor_repasse);
  if (repasse <= 0) return { status: 'sem_valor_repasse' };

  const { data: est } = await admin
    .from('estoque_motos')
    .select('avaliacao_id')
    .eq('atendimento_venda_id', atendimentoId)
    .maybeSingle();

  let fornecedorId: string | null = null;
  let observacoes: string | null = null;
  if (est?.avaliacao_id) {
    const { data: avv } = await admin
      .from('avaliacoes')
      .select('atendimento_id, placa, marca:marca_id(nome), modelo:modelo_id(nome)')
      .eq('id', est.avaliacao_id)
      .maybeSingle();
    observacoes = obsMoto(nomeCat(avv?.marca), nomeCat(avv?.modelo), avv?.placa);
    if (avv?.atendimento_id) {
      const { data: ownerAt } = await admin
        .from('atendimentos_motos')
        .select('cliente_id')
        .eq('id', avv.atendimento_id)
        .maybeSingle();
      fornecedorId = ownerAt?.cliente_id ?? null;
    }
  }

  const { data: saleAt } = await admin
    .from('atendimentos_motos')
    .select('empresa_id')
    .eq('id', atendimentoId)
    .maybeSingle();
  const empresaId = saleAt?.empresa_id;
  if (!empresaId) return { status: 'sem_empresa' };

  return upsertCompromisso(admin, {
    origem: 'consignante',
    linkField: 'atendimento_id',
    linkId: atendimentoId,
    empresaId,
    fornecedorId,
    natureza: 'despesa',
    planoContaId: PLANO_COMPRA_USADA,
    centroCustoId: CC_MOTOS_USADAS,
    observacoes,
    numeroPrefix: 'CPR-D',
    parcelas: [{ numero_parcela: 1, valor: repasse, tipo: 'unico', forma_pagamento_id: FORMA_PAGAMENTO_ID, data_vencimento: vencimento }],
    callerId,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
    .select('app_role')
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

  const acao = body.acao;
  const atendimentoId = typeof body.atendimento_id === 'string' ? body.atendimento_id : '';
  const avaliacaoId = typeof body.avaliacao_id === 'string' ? body.avaliacao_id : '';

  try {
    if (acao === 'venda') {
      if (!atendimentoId) return jsonResponse({ error: 'atendimento_id é obrigatório' }, 400);
      return jsonResponse({ ok: true, ...(await acaoVenda(admin, atendimentoId, caller.id)) }, 200);
    }
    if (acao === 'compra') {
      if (!avaliacaoId) return jsonResponse({ error: 'avaliacao_id é obrigatório' }, 400);
      return jsonResponse({ ok: true, compra: await construirRepasse(admin, avaliacaoId, 'compra', null, caller.id) }, 200);
    }
    if (acao === 'consignante') {
      if (!atendimentoId) return jsonResponse({ error: 'atendimento_id é obrigatório' }, 400);
      return jsonResponse({ ok: true, consignante: await acaoConsignante(admin, atendimentoId, caller.id) }, 200);
    }
    return jsonResponse({ error: "acao inválida (use 'venda' | 'compra' | 'consignante')" }, 400);
  } catch (e) {
    console.error('gerar-compromissos-proposta erro', e);
    return jsonResponse({ error: String((e as any)?.message || e) }, 500);
  }
});
