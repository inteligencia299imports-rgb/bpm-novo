// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { consultarNfe, emitirNfe, focusBaseUrl, mensagemErroFocus, type FocusAmbiente } from './focus.ts';
import { montarPayloadNfeCompra, type RegraFiscal } from './payload.ts';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';

// Contas a pagar da compra de moto seminova (chaves fixas).
const PLANO_CONTA_ID = 'd16507df-9655-4677-8ed9-01398ce28239';
const CENTRO_CUSTO_ID = '7fe3888a-fd17-4c31-b78b-82a0af680ff3';
// Repasse ao cliente sai por Pix; a quitação (financiamento) sai por Boleto, em parcela à parte.
const FORMA_PAGAMENTO_ID = '63e1fff5-14d7-476c-b2da-e1ea173279a1'; // Pix
const FORMA_PAGAMENTO_BOLETO_ID = '7d0f2125-fedf-4a27-8ab0-be21fecaf642'; // Boleto
const DIAS_VENCIMENTO = 7;

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
    criaCompromisso: false,
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
    criaCompromisso: false,
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

  if (!cfg.criaCompromisso) return;

  // Compromisso financeiro (contas a pagar) da NF-e.
  const { data: nfeRow } = await admin
    .from('nfe_entradas')
    .select('*')
    .eq('avaliacao_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (nfeRow?.id && nfeRow.empresa_id) {
    const { data: jaComp } = await admin
      .from('compromissos')
      .select('id')
      .eq('nfe_entrada_id', nfeRow.id)
      .limit(1);

    if (!jaComp || jaComp.length === 0) {
      const venc = new Date(nfeRow.data_emissao || dataEmissao || Date.now());
      venc.setDate(venc.getDate() + DIAS_VENCIMENTO);

      // O compromisso registra o REPASSE AO CLIENTE, não o valor da NF-e (que pode ser
      // informado à parte na tela de emissão). Repasse é sempre calculado sobre o
      // valor de FECHAMENTO do contrato:
      // repasse = fechamento - quitação - custo do cliente (previsão da avaliação + custos de oficina do cliente).
      const { data: avFin } = await admin
        .from('avaliacoes')
        .select('previsao_custos_cliente, valor_quitacao, valor_fechamento, atendimento_id, marca, modelo, placa')
        .eq('id', entityId)
        .maybeSingle();
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
      const fechamento = Number(
        contratoFin?.valor_fechamento ?? avFin?.valor_fechamento ?? nfeRow.valor_total ?? 0,
      );
      const quitacao = Number(contratoFin?.valor_quitacao ?? avFin?.valor_quitacao ?? 0);
      const custosClientePrev = Number(avFin?.previsao_custos_cliente ?? 0);

      const valorRepasse = Math.max(
        fechamento - quitacao - custosClientePrev - custosClienteOficina,
        0,
      );

      // Observação do compromisso: MARCA MODELO - PLACA da moto.
      const motoDesc = [avFin?.marca, avFin?.modelo].filter(Boolean).join(' ').trim();
      const placaFmt = String(avFin?.placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const obsCompromisso = [motoDesc, placaFmt].filter(Boolean).join(' - ').toUpperCase() || null;

      const { data: comp, error: compErr } = await admin
        .from('compromissos')
        .insert({
          empresa_id: nfeRow.empresa_id,
          fornecedor_id: nfeRow.fornecedor_id,
          natureza: 'despesa',
          despesa_fixa: false,
          plano_conta_id: PLANO_CONTA_ID,
          centro_custo_id: CENTRO_CUSTO_ID,
          observacoes: obsCompromisso,
          status_compromisso: 'em_aberto',
          nfe_entrada_id: nfeRow.id,
          numero_documento: nfeRow.numero ? `NF-${nfeRow.numero}` : null,
          created_by: callerId,
        })
        .select('id')
        .maybeSingle();

      if (compErr) {
        console.error('erro ao criar compromisso', compErr);
      } else if (comp?.id) {
        const vencStr = venc.toISOString().slice(0, 10);
        // Quando há quitação (financiamento a quitar), ela vira uma parcela à parte,
        // paga por BOLETO; o valor restante (repasse ao cliente) fica na parcela de Pix,
        // como já funcionava. Sem quitação, mantém uma única parcela.
        const parcelas = quitacao > 0
          ? [
              {
                compromisso_id: comp.id,
                numero_parcela: 1,
                valor: quitacao,
                data_vencimento: vencStr,
                tipo: 'parcelado',
                forma_pagamento_id: FORMA_PAGAMENTO_BOLETO_ID,
                status_pagamento: 'em_aberto',
              },
              {
                compromisso_id: comp.id,
                numero_parcela: 2,
                valor: valorRepasse,
                data_vencimento: vencStr,
                tipo: 'parcelado',
                forma_pagamento_id: FORMA_PAGAMENTO_ID,
                status_pagamento: 'em_aberto',
              },
            ]
          : [
              {
                compromisso_id: comp.id,
                numero_parcela: 1,
                valor: valorRepasse,
                data_vencimento: vencStr,
                tipo: 'unico',
                forma_pagamento_id: FORMA_PAGAMENTO_ID,
                status_pagamento: 'em_aberto',
              },
            ];
        await admin.from('compromissos_parcelas').insert(parcelas);
      }
    }
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

  if (ehVenda) {
    atendimentoId = atendimentoIdBody;
    const { data: mi } = await admin
      .from('motos_interesse')
      .select('estoque_moto_id')
      .eq('atendimento_id', atendimentoId)
      .not('estoque_moto_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (!mi?.estoque_moto_id) return jsonResponse({ error: 'Moto do estoque não vinculada ao atendimento.' }, 409);
    const { data: em } = await admin
      .from('estoque_motos')
      .select(
        '*, avaliacao:avaliacao_id(marca, modelo, ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam), ' +
          'moto_nova:moto_nova_id(marca, modelo, ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam, ncm, valor)',
      )
      .eq('id', mi.estoque_moto_id)
      .maybeSingle();
    if (!em) return jsonResponse({ error: 'Moto do estoque não encontrada.' }, 404);
    estoqueMoto = em;
  } else {
    const { data: avRow } = await admin
      .from('avaliacoes')
      .select(
        'id, atendimento_id, aprovacao_status, consulta_realizada, valor_fechamento, ' +
          'avaliacao_consignacao, valor_consignacao_nota, consignacao_status, ' +
          'marca, modelo, ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam',
      )
      .eq('id', avaliacaoId)
      .maybeSingle();
    if (!avRow) return jsonResponse({ error: 'Avaliação não encontrada' }, 404);
    av = avRow;
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

  const ambiente = (Deno.env.get('FOCUS_NFE_AMBIENTE') as FocusAmbiente) || 'homologacao';
  const base = focusBaseUrl(ambiente);
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
    if (!token) return jsonResponse({ nfe: nfeRow }, 200);

    const r = await consultarNfe(base, token, ref);
    const fStatus = r.body.status as string | undefined;
    const novoStatus = mapStatus(fStatus);
    const patch: Record<string, unknown> = { focus_status: fStatus ?? null, status: novoStatus };

    if (fStatus === 'autorizado') {
      patch.numero = (r.body.numero as string) ?? nfeRow.numero;
      patch.serie = (r.body.serie as string) ?? nfeRow.serie;
      patch.chave_nfe = (r.body.chave_nfe as string) ?? nfeRow.chave_nfe;
      patch.caminho_danfe = r.body.caminho_danfe ? `${base}${r.body.caminho_danfe}` : nfeRow.caminho_danfe;
      patch.xml_raw = r.body.caminho_xml_nota_fiscal ? `${base}${r.body.caminho_xml_nota_fiscal}` : nfeRow.xml_raw;
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
  }
  if (!empresa?.cnpj) {
    return jsonResponse({ error: 'A empresa da loja está sem CNPJ cadastrado.' }, 409);
  }
  if (!focusCfg?.habilitado || !token) {
    return jsonResponse({ error: 'Emissão de NF-e não habilitada para esta empresa.' }, 409);
  }

  const { data: nfeExistente } = await buscarNfe();
  if (nfeExistente && (nfeExistente.status === 'processada' || PENDENTES.has(nfeExistente.status))) {
    return jsonResponse({ error: 'Já existe uma NF-e emitida ou em processamento para esta moto.' }, 409);
  }

  // Destinatario da NF: entrada = PF vendedora/consignante; venda = cliente comprador.
  // Nos dois casos e o cliente_id do atendimento.
  const { data: fornecedor } = await admin
    .from('clientes_fornecedores')
    .select('id, nome_razao_social, cpf_cnpj, tipo_pessoa, telefone, telefone_comercial, clientes_fornecedores_enderecos(*)')
    .eq('id', atendimento.cliente_id)
    .maybeSingle();
  if (!fornecedor) return jsonResponse({ error: 'Cliente não encontrado' }, 409);
  const end = (fornecedor.clientes_fornecedores_enderecos || [])[0] || {};

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
        'aliquota_fcp, tipo_tributacao, informacoes_complementares, informacoes_adicionais_fisco, destino_ufs, ordem)',
    )
    .eq('empresa_id', empresaId)
    .eq('descricao', cfg.naturezaDescricao)
    .maybeSingle();
  if (!natureza) return jsonResponse({ error: `Natureza de operação "${cfg.naturezaDescricao}" não configurada.` }, 409);

  const regras = (natureza.naturezas_operacao_regras || []) as Array<
    RegraFiscal & { destino_ufs: string[] | null; ordem: number | null }
  >;
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
  const faltando: string[] = [];
  if (!regraIcms?.cfop || !regraIcms?.situacao_tributaria) faltando.push('ICMS (CFOP/CST)');
  if (!regraPis?.situacao_tributaria) faltando.push('PIS');
  if (!regraCofins?.situacao_tributaria) faltando.push('COFINS');
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
    },
    moto: motoData,
    valor,
    regraIcms: regraIcms!,
    regraPis: regraPis!,
    regraCofins: regraCofins!,
    regraIpi: regraIpi,
    observacoes: typeof body.observacoes === 'string' ? body.observacoes : null,
  });

  // FKs da nfe_entradas conforme a operacao.
  const nfeFks: Record<string, unknown> = ehVenda
    ? { avaliacao_id: null, atendimento_id: atendimentoId, estoque_moto_id: estoqueMoto?.id ?? null }
    : { avaliacao_id: avaliacaoId };

  const dataEmissao = new Date().toISOString();
  const observacoesNf = typeof body.observacoes === 'string' && body.observacoes.trim()
    ? body.observacoes.trim().toUpperCase()
    : null;
  const r = await emitirNfe(base, token, ref, payload);
  const fStatus = r.body.status as string | undefined;
  const aceito = r.httpStatus === 200 || r.httpStatus === 201 || r.httpStatus === 202;

  if (!aceito && fStatus !== 'processando_autorizacao' && fStatus !== 'autorizado') {
    // Persiste o erro para a tela mostrar "Tentar novamente".
    const errMsg = mensagemErroFocus(r.body);
    const linhaErro = {
      empresa_id: empresaId,
      ...nfeFks,
      fornecedor_id: atendimento.cliente_id,
      natureza_operacao_id: natureza.id,
      ref_externa: ref,
      operacao: tipo,
      valor_total: valor,
      departamento,
      observacoes: observacoesNf,
      status: 'erro',
      focus_status: fStatus ?? `http_${r.httpStatus}`,
      erro_mensagem: errMsg,
    };
    if (nfeExistente) {
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
    ref_externa: ref,
    operacao: tipo,
    valor_total: valor,
    departamento,
    observacoes: observacoesNf,
    data_emissao: dataEmissao,
    data_entrada: dataEmissao,
    focus_status: fStatus ?? 'processando_autorizacao',
    status: autorizado ? 'processada' : 'processando_itens',
    erro_mensagem: null,
    numero: (r.body.numero as string) ?? null,
    serie: (r.body.serie as string) ?? null,
    chave_nfe: (r.body.chave_nfe as string) ?? null,
    caminho_danfe: r.body.caminho_danfe ? `${base}${r.body.caminho_danfe}` : null,
    xml_raw: r.body.caminho_xml_nota_fiscal ? `${base}${r.body.caminho_xml_nota_fiscal}` : null,
  };

  let nfeRow;
  if (nfeExistente) {
    const { data } = await admin.from('nfe_entradas').update(linha).eq('id', nfeExistente.id).select('*').maybeSingle();
    nfeRow = data;
  } else {
    const { data } = await admin.from('nfe_entradas').insert(linha).select('*').maybeSingle();
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
      numero: (r.body.numero as string) ?? null,
      serie: (r.body.serie as string) ?? null,
      callerId: caller.id,
      callerName,
    });
  }

  return jsonResponse({ nfe: nfeRow }, 200);
});
