// Compromisso SEPARADO da quitação da moto (pedido do usuário, 2026-11-12):
//  - a PAGAR ao banco / administradora de consórcio (avaliacoes.quitacao_instituicao_id),
//    não ao cliente;
//  - origem 'quitacao', vinculado à avaliação (avaliacao_id) — o SisFin abre a
//    avaliação pelo botão de origem;
//  - descrição: QUITAÇÃO - MARCA MODELO - PLACA - NOME DO CLIENTE;
//  - plano de contas / centro de custo = os do compromisso da moto (compra direta,
//    parte de pagamento, repasse ou intermediação). Quando o da moto muda, o
//    trigger trg_compromisso_quitacao_plano copia para este;
//  - valor = avaliacoes.valor_quitacao (descontando quitação já paga numa parcela
//    QUITAÇÃO antiga, de antes desta mudança, que ficava dentro do compromisso da moto).
// Idempotente: chamado pela proposta, pela NF-e de compra, pelo contrato de
// intermediação e pelo painel de Abatimentos.

const nz = (v: unknown): number => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

const OBS_QUITACAO = 'QUITAÇÃO';
const FORMA_BOLETO = '7d0f2125-fedf-4a27-8ab0-be21fecaf642';
const CC_MOTOS_USADAS = '7fe3888a-fd17-4c31-b78b-82a0af680ff3';
const PLANO_PARTE_PAGAMENTO = 'd16507df-9655-4677-8ed9-01398ce28239'; // 2.1.02
const PLANO_REPASSE = '9f15eccf-8da7-48da-916f-2d57e88271d1';         // 2.4.09
const PLANO_COMPRA_DIRETA = 'f85919fb-d575-46d8-a2fe-25618325f631';    // 2.4.10
const PLANO_INTERMEDIACAO = 'e1716c2d-9520-4b2c-912d-a9cf74e20e39';    // 3.6.06

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const nomeCat = (v: any) => (Array.isArray(v) ? v[0]?.nome : v?.nome) ?? null;

const ehParcelaQuitacao = (p: any) =>
  String(p.observacoes || '').toUpperCase() === OBS_QUITACAO
  || (!p.observacoes && p.forma_pagamento_id === FORMA_BOLETO);

function addDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function historico(admin: any, id: string, status: string, obs: string, callerId: string | null) {
  const { error } = await admin.from('status_history_compromissos').insert({
    entity_id: id, entity_type: 'compromissos', status, changed_by: callerId, observacoes: obs,
  });
  if (error) console.error('historico quitacao', error);
}

async function atualizarStatusHeader(admin: any, compId: string, callerId: string | null) {
  const { data } = await admin.from('compromissos_parcelas').select('status_pagamento').eq('compromisso_id', compId);
  const ativas = ((data as any[]) || []).filter((p) => p.status_pagamento !== 'cancelado');
  if (ativas.length === 0) return;
  await admin.from('compromissos')
    .update({ status_compromisso: ativas.every((p) => p.status_pagamento === 'pago') ? 'pago' : 'em_aberto', updated_by: callerId })
    .eq('id', compId)
    .not('status_compromisso', 'in', '("cancelada","cancelado")');
}

export async function sincronizarCompromissoQuitacao(
  admin: any,
  avaliacaoId: string,
  callerId: string | null,
): Promise<Record<string, unknown>> {
  const { data: av } = await admin
    .from('avaliacoes')
    .select('id, atendimento_id, tipo_aquisicao, valor_quitacao, quitacao_instituicao_id, placa, marca:marca_id(nome), modelo:modelo_id(nome)')
    .eq('id', avaliacaoId)
    .maybeSingle();
  if (!av) return { status: 'avaliacao_nao_encontrada' };

  // Compromisso "da moto": compra/troca (pela avaliação) ou, na consignada vendida,
  // o do consignante (pelo atendimento da venda).
  let principal: any = null;
  let atendimentoVendaConsig: string | null = null;
  if (av.tipo_aquisicao === 'consignada') {
    const { data: est } = await admin.from('estoque_motos').select('atendimento_venda_id').eq('avaliacao_id', avaliacaoId)
      .not('atendimento_venda_id', 'is', null).limit(1).maybeSingle();
    atendimentoVendaConsig = est?.atendimento_venda_id ?? null;
    if (atendimentoVendaConsig) {
      const { data } = await admin.from('compromissos')
        .select('id, empresa_id, plano_conta_id, centro_custo_id')
        .eq('atendimento_id', atendimentoVendaConsig).eq('origem', 'consignante')
        .is('deleted_at', null).not('status_compromisso', 'in', '("cancelada","cancelado")')
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      principal = data;
    }
  } else {
    const { data } = await admin.from('compromissos')
      .select('id, empresa_id, plano_conta_id, centro_custo_id')
      .eq('avaliacao_id', avaliacaoId).in('origem', ['compra', 'troca'])
      .is('deleted_at', null).not('status_compromisso', 'in', '("cancelada","cancelado")')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    principal = data;
  }

  // Quitação sem banco/consórcio informado: nada muda (a parcela QUITAÇÃO antiga,
  // dentro do compromisso da moto, continua valendo até o banco ser informado).
  if (nz(av.valor_quitacao) > 0.005 && !av.quitacao_instituicao_id) return { status: 'sem_instituicao' };

  // Parcela QUITAÇÃO antiga dentro do compromisso da moto: a paga conta como já
  // quitada; a não paga sai de lá (a quitação passa a ser só o compromisso separado).
  let quitacaoPagaAntiga = 0;
  if (principal?.id) {
    const { data: parcPrinc } = await admin.from('compromissos_parcelas')
      .select('id, valor, status_pagamento, observacoes, forma_pagamento_id').eq('compromisso_id', principal.id);
    const antigas = ((parcPrinc as any[]) || []).filter((p) => p.status_pagamento !== 'cancelado' && ehParcelaQuitacao(p));
    quitacaoPagaAntiga = r2(antigas.filter((p) => p.status_pagamento === 'pago').reduce((s, p) => s + nz(p.valor), 0));
    const abertasAntigas = antigas.filter((p) => p.status_pagamento !== 'pago');
    if (abertasAntigas.length) {
      await admin.from('compromissos_parcelas').delete().in('id', abertasAntigas.map((p) => p.id));
      await atualizarStatusHeader(admin, principal.id, callerId);
    }
  }

  const quitacao = r2(nz(av.valor_quitacao));
  const alvo = r2(Math.max(quitacao - quitacaoPagaAntiga, 0));

  const { data: existente } = await admin.from('compromissos')
    .select('id, fornecedor_id, status_compromisso')
    .eq('avaliacao_id', avaliacaoId).eq('origem', 'quitacao').is('deleted_at', null)
    .not('status_compromisso', 'in', '("cancelada","cancelado")')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  const parcelasDe = async (id: string) => {
    const { data } = await admin.from('compromissos_parcelas')
      .select('id, numero_parcela, valor, status_pagamento').eq('compromisso_id', id);
    return ((data as any[]) || []).filter((p) => p.status_pagamento !== 'cancelado');
  };

  // Sem quitação: cancela o compromisso separado (se nada foi pago) ou tira o que está em aberto.
  if (alvo <= 0.005) {
    if (!existente?.id) return { status: 'sem_quitacao' };
    const parcs = await parcelasDe(existente.id);
    const pagoAntes = r2(parcs.filter((p) => p.status_pagamento === 'pago').reduce((s, p) => s + nz(p.valor), 0));
    const totalAntes = r2(parcs.reduce((s, p) => s + nz(p.valor), 0));
    if (pagoAntes <= 0.005) {
      await admin.from('compromissos').update({ status_compromisso: 'cancelado', updated_by: callerId }).eq('id', existente.id);
      await historico(admin, existente.id, 'cancelado', `COMPROMISSO CANCELADO — QUITAÇÃO REMOVIDA (ERA ${fmtBRL(totalAntes)}) (BPM)`, callerId);
      return { status: 'cancelado', compromisso_id: existente.id };
    }
    const abertas = parcs.filter((p) => p.status_pagamento !== 'pago');
    if (abertas.length) await admin.from('compromissos_parcelas').delete().in('id', abertas.map((p) => p.id));
    await atualizarStatusHeader(admin, existente.id, callerId);
    await historico(admin, existente.id, 'editado', `COMPROMISSO EDITADO — QUITAÇÃO REMOVIDA (ERA ${fmtBRL(totalAntes)}) (BPM)`, callerId);
    return { status: 'atualizado', compromisso_id: existente.id };
  }

  if (!av.quitacao_instituicao_id) return { status: 'sem_instituicao' };

  // Plano / centro de custo / empresa: os do compromisso da moto; sem ele, pela regra.
  let atTroca = false;
  if (av.atendimento_id) {
    const { data: at } = await admin.from('atendimentos_motos').select('interesse').eq('id', av.atendimento_id).maybeSingle();
    atTroca = at?.interesse === 'trocar';
  }
  if (!atTroca) {
    const { data: terc } = await admin.from('atendimentos_motos').select('id').eq('troca_terceiro_avaliacao_id', avaliacaoId).limit(1).maybeSingle();
    atTroca = !!terc;
  }
  const planoRegra = av.tipo_aquisicao === 'consignada' ? PLANO_INTERMEDIACAO
    : av.tipo_aquisicao === 'repasse' ? PLANO_REPASSE
    : atTroca ? PLANO_PARTE_PAGAMENTO
    : PLANO_COMPRA_DIRETA;
  const planoContaId = principal?.plano_conta_id ?? planoRegra;
  const centroCustoId = principal?.centro_custo_id ?? CC_MOTOS_USADAS;

  let empresaId: string | null = principal?.empresa_id ?? null;
  if (!empresaId && av.atendimento_id) {
    const { data: ct } = await admin.from('contratos').select('empresa_id').eq('atendimento_id', av.atendimento_id)
      .eq('ipva_tipo', 'COMPRA').order('created_at', { ascending: false }).limit(1).maybeSingle();
    empresaId = ct?.empresa_id ?? null;
  }
  if (!empresaId) {
    const atEmp = atendimentoVendaConsig ?? av.atendimento_id;
    if (atEmp) {
      const { data: at } = await admin.from('atendimentos_motos').select('empresa_id').eq('id', atEmp).maybeSingle();
      empresaId = at?.empresa_id ?? null;
    }
  }
  if (!empresaId) return { status: 'sem_empresa' };

  // Descrição: QUITAÇÃO - MOTO - PLACA - CLIENTE (dono da moto na avaliação).
  let clienteNome: string | null = null;
  if (av.atendimento_id) {
    const { data: at } = await admin.from('atendimentos_motos')
      .select('cliente:cliente_id(nome_razao_social)').eq('id', av.atendimento_id).maybeSingle();
    clienteNome = (at as any)?.cliente?.nome_razao_social ?? null;
  }
  const moto = [nomeCat(av.marca), nomeCat(av.modelo)].filter(Boolean).join(' ');
  const placa = String(av.placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const observacoes = ['QUITAÇÃO', moto, placa, clienteNome].filter((s) => s && String(s).trim()).join(' - ').toUpperCase();

  // Vencimento: o primeiro em aberto do compromisso da moto; senão hoje + 7.
  let venc = addDias(7);
  if (principal?.id) {
    const { data: abertas } = await admin.from('compromissos_parcelas').select('data_vencimento, status_pagamento')
      .eq('compromisso_id', principal.id);
    const datas = ((abertas as any[]) || []).filter((p) => !['pago', 'cancelado'].includes(p.status_pagamento))
      .map((p) => String(p.data_vencimento || '')).filter(Boolean).sort();
    if (datas[0]) venc = datas[0];
  }

  if (!existente?.id) {
    const { data: numero } = await admin.rpc('gerar_numero_compromisso', { _prefix: 'CPR-D' });
    const { data: comp, error } = await admin.from('compromissos').insert({
      empresa_id: empresaId,
      fornecedor_id: av.quitacao_instituicao_id,
      natureza: 'despesa',
      despesa_fixa: false,
      plano_conta_id: planoContaId,
      centro_custo_id: centroCustoId,
      observacoes,
      status_compromisso: 'em_aberto',
      origem: 'quitacao',
      avaliacao_id: avaliacaoId,
      numero_compromisso: numero ?? null,
      created_by: callerId,
    }).select('id').maybeSingle();
    if (error || !comp?.id) {
      console.error('insert compromisso quitacao', error);
      return { status: 'erro', erro: error?.message };
    }
    await admin.from('compromissos_parcelas').insert({
      compromisso_id: comp.id, numero_parcela: 1, valor: alvo, data_vencimento: venc, tipo: 'unico',
      forma_pagamento_id: FORMA_BOLETO, status_pagamento: 'em_aberto', observacoes: OBS_QUITACAO,
    });
    await historico(admin, comp.id, 'criado', `COMPROMISSO CRIADO — QUITAÇÃO ${fmtBRL(alvo)} (BPM)`, callerId);
    return { status: 'criado', compromisso_id: comp.id };
  }

  // Atualiza o existente: cabeçalho + parcela em aberto (as pagas ficam).
  await admin.from('compromissos').update({
    empresa_id: empresaId,
    fornecedor_id: av.quitacao_instituicao_id,
    plano_conta_id: planoContaId,
    centro_custo_id: centroCustoId,
    observacoes,
    updated_by: callerId,
  }).eq('id', existente.id);

  const parcs = await parcelasDe(existente.id);
  const totalAntes = r2(parcs.reduce((s, p) => s + nz(p.valor), 0));
  const pago = r2(parcs.filter((p) => p.status_pagamento === 'pago').reduce((s, p) => s + nz(p.valor), 0));
  const abertas = parcs.filter((p) => p.status_pagamento !== 'pago').sort((a, b) => a.numero_parcela - b.numero_parcela);
  const alvoAberto = r2(alvo - pago);
  if (abertas.length) {
    const [primeira, ...resto] = abertas;
    if (resto.length) await admin.from('compromissos_parcelas').delete().in('id', resto.map((p) => p.id));
    if (alvoAberto > 0.005) await admin.from('compromissos_parcelas').update({ valor: alvoAberto }).eq('id', primeira.id);
    else await admin.from('compromissos_parcelas').delete().eq('id', primeira.id);
  } else if (alvoAberto > 0.005) {
    await admin.from('compromissos_parcelas').insert({
      compromisso_id: existente.id,
      numero_parcela: Math.max(0, ...parcs.map((p) => Number(p.numero_parcela))) + 1,
      valor: alvoAberto, data_vencimento: venc, tipo: 'parcelado',
      forma_pagamento_id: FORMA_BOLETO, status_pagamento: 'em_aberto', observacoes: OBS_QUITACAO,
    });
  }
  await atualizarStatusHeader(admin, existente.id, callerId);

  const mudouValor = Math.abs(totalAntes - Math.max(alvo, pago)) > 0.005;
  const mudouBanco = existente.fornecedor_id !== av.quitacao_instituicao_id;
  if (mudouValor || mudouBanco) {
    const partes: string[] = [];
    if (mudouValor) partes.push(`QUITAÇÃO ALTERADA DE ${fmtBRL(totalAntes)} PARA ${fmtBRL(Math.max(alvo, pago))}`);
    if (mudouBanco) partes.push('BANCO / CONSÓRCIO ALTERADO');
    await historico(admin, existente.id, 'editado', `COMPROMISSO EDITADO — ${partes.join(', ')} (BPM)`, callerId);
  }
  return { status: 'atualizado', compromisso_id: existente.id };
}
