import { supabase } from '@/lib/supabase';

/**
 * Abatimentos do cliente sobre o valor de compra de uma moto (avaliação) —
 * mesma conta de supabase/functions/_shared/abatimentos-cliente.ts, usada pelo
 * compromisso a pagar:
 *  - previsão de custos do cliente registrada na avaliação;
 *  - custos de oficina com responsável = cliente;
 *  - custos operacionais com responsável = Cliente do contrato de
 *    intermediação (contratos_consignante) da venda dessa moto — exceto
 *    quitação de financiamento lançada ali (é quitação, não abatimento).
 *
 * Valor de compra (NF-e de entrada e repasse) = fechamento − abatimentos.
 */
export async function buscarAbatimentosCliente(avaliacaoId: string): Promise<number> {
  const nz = (v: unknown) => Number(v) || 0;
  const [{ data: av }, { data: oficina }, { data: estoque }] = await Promise.all([
    supabase.from('avaliacoes').select('previsao_custos_cliente').eq('id', avaliacaoId).maybeSingle(),
    supabase.from('custos_oficina').select('responsavel, valor_previsto, valor_executado').eq('avaliacao_id', avaliacaoId),
    (supabase as any).from('estoque_motos').select('atendimento_venda_id').eq('avaliacao_id', avaliacaoId).not('atendimento_venda_id', 'is', null),
  ]);

  const custosOficina = ((oficina as any[]) || [])
    .filter((c) => String(c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((s, c) => s + nz(c.valor_executado ?? c.valor_previsto), 0);

  let custosOperacionais = 0;
  const atendimentosVenda = ((estoque as any[]) || []).map((e) => e.atendimento_venda_id).filter(Boolean);
  if (atendimentosVenda.length > 0) {
    const { data: contratos } = await supabase.from('contratos_consignante').select('id').in('atendimento_id', atendimentosVenda);
    const contratoIds = ((contratos as any[]) || []).map((c) => c.id);
    if (contratoIds.length > 0) {
      const { data: ops } = await supabase
        .from('custos_operacionais')
        .select('responsavel, valor, descricao')
        .in('contrato_consignante_id', contratoIds);
      custosOperacionais = ((ops as any[]) || [])
        .filter((c) => String(c.responsavel || '').toLowerCase() === 'cliente')
        .filter((c) => !/quita/i.test(String(c.descricao || '')))
        .reduce((s, c) => s + nz(c.valor), 0);
    }
  }

  return nz((av as any)?.previsao_custos_cliente) + custosOficina + custosOperacionais;
}
