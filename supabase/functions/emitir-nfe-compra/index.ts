// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { consultarNfe, emitirNfe, focusBaseUrl, mensagemErroFocus, type FocusAmbiente } from './focus.ts';
import { montarPayloadNfeCompra, type RegraFiscal } from './payload.ts';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';

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
  params: {
    avaliacaoId: string;
    dataEmissao: string;
    numero: string | null;
    serie: string | null;
    callerId: string;
    callerName: string | null;
  },
) {
  const { avaliacaoId, dataEmissao, numero, serie, callerId, callerName } = params;

  // Historico de movimentacoes (visivel na timeline da avaliacao).
  const { data: jaRegistrado } = await admin
    .from('status_history')
    .select('id')
    .eq('entity_type', 'pos_compra')
    .eq('entity_id', avaliacaoId)
    .eq('status', 'nfe_compra_emitida')
    .limit(1);

  if (!jaRegistrado || jaRegistrado.length === 0) {
    await admin.from('status_history').insert({
      entity_type: 'pos_compra',
      entity_id: avaliacaoId,
      status: 'nfe_compra_emitida',
      changed_by: callerId,
      changed_by_name: callerName,
      observacoes: `NF-e nº ${numero ?? '-'} série ${serie ?? '-'}`,
    });
  }

  // Marca a etapa "NF-E" do checklist de pos-compra como concluida.
  await admin.from('pos_compra_processos').upsert(
    {
      avaliacao_id: avaliacaoId,
      etapa: 'NF-E',
      concluida: true,
      data_conclusao: dataEmissao,
    },
    { onConflict: 'avaliacao_id,etapa' },
  );
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

  const avaliacaoId = typeof body.avaliacao_id === 'string' ? body.avaliacao_id : '';
  const acao = body.acao === 'consultar' ? 'consultar' : 'emitir';
  if (!avaliacaoId) return jsonResponse({ error: 'avaliacao_id é obrigatório' }, 400);

  // ---- Carrega avaliacao + atendimento + acesso ----
  const { data: av } = await admin
    .from('avaliacoes')
    .select(
      'id, atendimento_id, aprovacao_status, consulta_realizada, valor_fechamento, ' +
        'marca, modelo, ano_fabricacao, ano_modelo, cilindrada, cor, placa, chassi, renavam',
    )
    .eq('id', avaliacaoId)
    .maybeSingle();
  if (!av) return jsonResponse({ error: 'Avaliação não encontrada' }, 404);

  const { data: atendimento } = await admin
    .from('atendimentos_motos')
    .select('id, cliente_id, loja_id, vendedor_id')
    .eq('id', av.atendimento_id)
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
  if (!temAcesso) return jsonResponse({ error: 'Forbidden: sem acesso a esta avaliação' }, 403);

  const callerName =
    (caller.user_metadata?.full_name as string | undefined) ||
    (caller.user_metadata?.name as string | undefined) ||
    caller.email ||
    null;

  const ambiente = (Deno.env.get('FOCUS_NFE_AMBIENTE') as FocusAmbiente) || 'homologacao';
  const base = focusBaseUrl(ambiente);
  const ref = `compra-${avaliacaoId}`;

  // ---- Empresa + token Focus ----
  const { data: lojaEmpresa } = await admin
    .from('loja_empresas')
    .select('empresa_id')
    .eq('id', atendimento.loja_id)
    .maybeSingle();
  const empresaId = lojaEmpresa?.empresa_id;
  if (!empresaId) return jsonResponse({ error: 'Loja sem empresa vinculada' }, 400);

  const { data: empresa } = await admin
    .from('empresas')
    .select('id, cnpj, regime_tributario')
    .eq('id', empresaId)
    .maybeSingle();

  const { data: focusCfg } = await admin
    .from('empresas_focus_config')
    .select('token_homologacao, token_producao, habilitado')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  const token = ambiente === 'producao' ? focusCfg?.token_producao : focusCfg?.token_homologacao;

  // =====================================================================
  // acao: consultar
  // =====================================================================
  if (acao === 'consultar') {
    const { data: nfeRow } = await admin
      .from('nfe_entradas')
      .select('*')
      .eq('avaliacao_id', avaliacaoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
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
      await registrarPosAutorizacao(admin, {
        avaliacaoId,
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
  if (av.aprovacao_status !== 'aprovada') {
    return jsonResponse({ error: 'A compra ainda não foi aprovada.' }, 409);
  }
  if (av.consulta_realizada !== true) {
    return jsonResponse({ error: 'A consulta veicular ainda não foi realizada.' }, 409);
  }
  const { data: contratoHist } = await admin
    .from('status_history')
    .select('id')
    .eq('entity_type', 'pos_compra')
    .eq('entity_id', avaliacaoId)
    .eq('status', 'contrato_compra_gerado')
    .limit(1);
  if (!contratoHist || contratoHist.length === 0) {
    return jsonResponse({ error: 'O contrato de compra ainda não foi gerado.' }, 409);
  }
  if (!empresa?.cnpj) {
    return jsonResponse({ error: 'A empresa da loja está sem CNPJ cadastrado.' }, 409);
  }
  if (!focusCfg?.habilitado || !token) {
    return jsonResponse({ error: 'Emissão de NF-e não habilitada para esta empresa.' }, 409);
  }

  const { data: nfeExistente } = await admin
    .from('nfe_entradas')
    .select('id, status')
    .eq('avaliacao_id', avaliacaoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (nfeExistente && (nfeExistente.status === 'processada' || PENDENTES.has(nfeExistente.status))) {
    return jsonResponse({ error: 'Já existe uma NF-e emitida ou em processamento para esta compra.' }, 409);
  }

  // Fornecedor (PF vendedora)
  const { data: fornecedor } = await admin
    .from('clientes_fornecedores')
    .select('id, nome_razao_social, cpf_cnpj, tipo_pessoa, telefone, telefone_comercial, clientes_fornecedores_enderecos(*)')
    .eq('id', atendimento.cliente_id)
    .maybeSingle();
  if (!fornecedor) return jsonResponse({ error: 'Cliente/fornecedor não encontrado' }, 409);
  const end = (fornecedor.clientes_fornecedores_enderecos || [])[0] || {};

  // Contrato (valor de fechamento tem prioridade)
  const { data: contrato } = await admin
    .from('contratos')
    .select('valor_fechamento')
    .eq('atendimento_id', av.atendimento_id)
    .eq('ipva_tipo', 'COMPRA')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const valor = Number(contrato?.valor_fechamento ?? av.valor_fechamento ?? 0);
  if (!valor || valor <= 0) {
    return jsonResponse({ error: 'Valor de fechamento da compra não informado.' }, 409);
  }

  // Natureza + regras fiscais
  const { data: natureza } = await admin
    .from('naturezas_operacao')
    .select('id, descricao, naturezas_operacao_regras(imposto, cfop, situacao_tributaria, aliquota)')
    .eq('empresa_id', empresaId)
    .eq('descricao', 'Compra de moto seminova')
    .maybeSingle();
  if (!natureza) return jsonResponse({ error: 'Natureza de operação "Compra de moto seminova" não configurada.' }, 409);

  const regras = (natureza.naturezas_operacao_regras || []) as Array<RegraFiscal & { imposto: string }>;
  const regraDe = (imp: string): RegraFiscal | null => regras.find((r) => r.imposto === imp) ?? null;

  const payload = montarPayloadNfeCompra({
    naturezaDescricao: natureza.descricao,
    empresa: { cnpj: empresa.cnpj, regime_tributario: empresa.regime_tributario },
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
    moto: {
      marca: av.marca,
      modelo: av.modelo,
      ano_fabricacao: av.ano_fabricacao,
      ano_modelo: av.ano_modelo,
      cilindrada: av.cilindrada,
      cor: av.cor,
      placa: av.placa,
      chassi: av.chassi,
      renavam: av.renavam,
    },
    valor,
    regraIcms: regraDe('icms'),
    regraPis: regraDe('pis'),
    regraCofins: regraDe('cofins'),
  });

  const dataEmissao = new Date().toISOString();
  const r = await emitirNfe(base, token, ref, payload);
  const fStatus = r.body.status as string | undefined;
  const aceito = r.httpStatus === 200 || r.httpStatus === 201 || r.httpStatus === 202;

  if (!aceito && fStatus !== 'processando_autorizacao' && fStatus !== 'autorizado') {
    // Persiste o erro para a tela mostrar "Tentar novamente".
    const errMsg = mensagemErroFocus(r.body);
    const linhaErro = {
      empresa_id: empresaId,
      avaliacao_id: avaliacaoId,
      fornecedor_id: atendimento.cliente_id,
      natureza_operacao_id: natureza.id,
      ref_externa: ref,
      valor_total: valor,
      departamento: 'motos',
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
    avaliacao_id: avaliacaoId,
    fornecedor_id: atendimento.cliente_id,
    natureza_operacao_id: natureza.id,
    ref_externa: ref,
    valor_total: valor,
    departamento: 'motos',
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
      departamento: 'motos',
    });
  }

  if (autorizado) {
    await registrarPosAutorizacao(admin, {
      avaliacaoId,
      dataEmissao,
      numero: (r.body.numero as string) ?? null,
      serie: (r.body.serie as string) ?? null,
      callerId: caller.id,
      callerName,
    });
  }

  return jsonResponse({ nfe: nfeRow }, 200);
});
