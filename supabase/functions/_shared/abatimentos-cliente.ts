// Abatimentos do cliente sobre o valor de compra de uma moto (avaliação):
//  - previsão de custos do cliente registrada na avaliação;
//  - custos de oficina com responsável = cliente;
//  - custos operacionais com responsável = Cliente lançados no contrato de
//    intermediação (contratos_consignante) da venda dessa moto — ex.: transporte;
//  - comissão de consignação: contratos_consignacao.percentual_comissao × valor
//    real da venda (estoque_motos.valor_venda; enquanto não vendida, o "quanto
//    vende"). Com percentual, custos operacionais com "comiss" na descrição
//    (comissão digitada à mão) deixam de contar, para não cobrar duas vezes.
// Mesma conta do front (src/lib/abatimentosCliente.ts). O valor de compra (NF-e
// de entrada e repasse) é o fechamento menos esses abatimentos; a quitação é
// tratada à parte.

const nz = (v: unknown): number => Number(v) || 0;

/** Comissão de consignação da moto (0 quando o contrato não tem percentual). */
export async function comissaoConsignacao(admin: any, avaliacaoId: string): Promise<{ percentual: number; base: number; valor: number }> {
  const [{ data: cc }, { data: av }, { data: est }] = await Promise.all([
    admin.from('contratos_consignacao').select('percentual_comissao').eq('avaliacao_id', avaliacaoId).maybeSingle(),
    admin.from('avaliacoes').select('quanto_vende').eq('id', avaliacaoId).maybeSingle(),
    admin.from('estoque_motos').select('valor_venda').eq('avaliacao_id', avaliacaoId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const percentual = nz(cc?.percentual_comissao);
  if (percentual <= 0) return { percentual: 0, base: 0, valor: 0 };
  const base = nz(est?.valor_venda) > 0 ? nz(est?.valor_venda) : nz(av?.quanto_vende);
  return { percentual, base, valor: Math.round(base * percentual) / 100 };
}

export async function abatimentosCliente(admin: any, avaliacaoId: string): Promise<number> {
  const [{ data: av }, { data: oficina }, { data: estoque }, comissao] = await Promise.all([
    admin.from('avaliacoes').select('previsao_custos_cliente').eq('id', avaliacaoId).maybeSingle(),
    admin.from('custos_oficina').select('responsavel, valor_previsto, valor_executado').eq('avaliacao_id', avaliacaoId),
    admin.from('estoque_motos').select('atendimento_venda_id').eq('avaliacao_id', avaliacaoId).not('atendimento_venda_id', 'is', null),
    comissaoConsignacao(admin, avaliacaoId),
  ]);

  const custosOficina = ((oficina as any[]) || [])
    .filter((c) => String(c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((s, c) => s + nz(c.valor_executado ?? c.valor_previsto), 0);

  let custosOperacionais = 0;
  const atendimentosVenda = ((estoque as any[]) || []).map((e) => e.atendimento_venda_id).filter(Boolean);
  if (atendimentosVenda.length > 0) {
    const { data: contratos } = await admin
      .from('contratos_consignante')
      .select('id')
      .in('atendimento_id', atendimentosVenda);
    const contratoIds = ((contratos as any[]) || []).map((c) => c.id);
    if (contratoIds.length > 0) {
      const { data: ops } = await admin
        .from('custos_operacionais')
        .select('responsavel, valor, descricao')
        .in('contrato_consignante_id', contratoIds);
      // Quitação de financiamento lançada como custo operacional NÃO é abatimento:
      // faz parte do preço (paga ao banco) e já é tratada como quitação — contá-la
      // aqui reduziria a NF-e e descontaria a quitação duas vezes do repasse
      // (achados PAL7I16 / UJA1I95 / PBO6F33, 2026-10-05).
      custosOperacionais = ((ops as any[]) || [])
        .filter((c) => String(c.responsavel || '').toLowerCase() === 'cliente')
        .filter((c) => !/quita/i.test(String(c.descricao || '')))
        .filter((c) => !(comissao.percentual > 0 && /comiss/i.test(String(c.descricao || ''))))
        .reduce((s, c) => s + nz(c.valor), 0);
    }
  }

  return nz(av?.previsao_custos_cliente) + custosOficina + custosOperacionais + comissao.valor;
}
