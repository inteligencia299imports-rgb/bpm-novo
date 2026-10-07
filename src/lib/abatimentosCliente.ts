import { supabase } from '@/lib/supabase';

/**
 * Abatimentos do cliente sobre o valor de compra de uma moto (avaliação) —
 * mesma conta de supabase/functions/_shared/abatimentos-cliente.ts, usada pelo
 * compromisso a pagar. Regra (usuário, 2026-10-07): TODO custo com
 * responsável = cliente abate do repasse ao cliente:
 *  - previsão de custos do cliente registrada na avaliação;
 *  - custos de oficina com responsável = cliente;
 *  - custos operacionais com responsável = Cliente do contrato de
 *    intermediação (contratos_consignante) da venda dessa moto — exceto
 *    quitação de financiamento lançada ali (é quitação, não abatimento);
 *  - comissão de consignação: contratos_consignacao.percentual_comissao × valor
 *    real da venda (estoque_motos.valor_venda; enquanto não vendida, o "quanto
 *    vende"). Fixa: só muda pelo percentual. Com percentual, custos da
 *    intermediação com "comiss" na descrição (digitados à mão) não contam.
 *
 * Valor de compra / repasse = fechamento − quitação − abatimentos.
 */

const nz = (v: unknown) => Number(v) || 0;

export interface AbatimentoForaDaOficina {
  origem: 'intermediacao' | 'previsao' | 'comissao';
  descricao: string;
  valor: number;
}

export interface ComissaoConsignacao {
  percentual: number;
  /** Valor real da venda; enquanto não vendida, o "quanto vende". */
  base: number;
  valor: number;
}

/**
 * Comissão de consignação da moto. `percentualOverride` permite calcular com o
 * percentual digitado na tela antes de salvar (contrato de consignação).
 */
export async function buscarComissaoConsignacao(avaliacaoId: string, percentualOverride?: number): Promise<ComissaoConsignacao> {
  const [{ data: cc }, { data: av }, { data: est }] = await Promise.all([
    (supabase as any).from('contratos_consignacao').select('percentual_comissao').eq('avaliacao_id', avaliacaoId).maybeSingle(),
    supabase.from('avaliacoes').select('quanto_vende').eq('id', avaliacaoId).maybeSingle(),
    (supabase as any).from('estoque_motos').select('valor_venda').eq('avaliacao_id', avaliacaoId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const percentual = percentualOverride ?? nz((cc as any)?.percentual_comissao);
  const base = nz((est as any)?.valor_venda) > 0 ? nz((est as any)?.valor_venda) : nz((av as any)?.quanto_vende);
  if (percentual <= 0) return { percentual: 0, base, valor: 0 };
  return { percentual, base, valor: Math.round(base * percentual) / 100 };
}

export const fmtPercentual = (p: number) => p.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Itens dos abatimentos que NÃO são custo de oficina: previsão de custos do
 * cliente (avaliação) + custos operacionais do cliente na intermediação (sem a
 * quitação). As telas de pós-compra/consignação listam estes itens só para
 * leitura — são editados na avaliação e no contrato de intermediação.
 */
export async function listarAbatimentosForaDaOficina(
  avaliacaoId: string,
  opts?: { incluirComissao?: boolean },
): Promise<AbatimentoForaDaOficina[]> {
  const [{ data: av }, { data: estoque }, comissao] = await Promise.all([
    supabase.from('avaliacoes').select('previsao_custos_cliente').eq('id', avaliacaoId).maybeSingle(),
    (supabase as any).from('estoque_motos').select('atendimento_venda_id').eq('avaliacao_id', avaliacaoId).not('atendimento_venda_id', 'is', null),
    buscarComissaoConsignacao(avaliacaoId),
  ]);
  const itens: AbatimentoForaDaOficina[] = [];
  if (comissao.valor > 0 && opts?.incluirComissao !== false) {
    itens.push({ origem: 'comissao', descricao: `Comissão de consignação (${fmtPercentual(comissao.percentual)}%)`, valor: comissao.valor });
  }
  const previsao = nz((av as any)?.previsao_custos_cliente);
  if (previsao > 0) itens.push({ origem: 'previsao', descricao: 'Previsão de custos do cliente (avaliação)', valor: previsao });

  const atendimentosVenda = ((estoque as any[]) || []).map((e) => e.atendimento_venda_id).filter(Boolean);
  if (atendimentosVenda.length > 0) {
    const { data: contratos } = await supabase.from('contratos_consignante').select('id').in('atendimento_id', atendimentosVenda);
    const contratoIds = ((contratos as any[]) || []).map((c) => c.id);
    if (contratoIds.length > 0) {
      const { data: ops } = await supabase
        .from('custos_operacionais')
        .select('responsavel, valor, descricao, tipo')
        .in('contrato_consignante_id', contratoIds)
        .order('created_at');
      for (const c of ((ops as any[]) || [])) {
        if (String(c.responsavel || '').toLowerCase() !== 'cliente') continue;
        if (/quita/i.test(String(c.descricao || ''))) continue;
        // Com percentual de comissão, a comissão digitada à mão não conta (já vem automática).
        if (comissao.percentual > 0 && /comiss/i.test(String(c.descricao || ''))) continue;
        if (nz(c.valor) <= 0) continue;
        itens.push({ origem: 'intermediacao', descricao: String(c.descricao || c.tipo || '-').trim(), valor: nz(c.valor) });
      }
    }
  }
  return itens;
}

/** Total de listarAbatimentosForaDaOficina. */
export async function buscarAbatimentosForaDaOficina(avaliacaoId: string): Promise<number> {
  const itens = await listarAbatimentosForaDaOficina(avaliacaoId);
  return itens.reduce((s, i) => s + i.valor, 0);
}

export async function buscarAbatimentosCliente(avaliacaoId: string): Promise<number> {
  const [{ data: oficina }, foraDaOficina] = await Promise.all([
    supabase.from('custos_oficina').select('responsavel, valor_previsto, valor_executado').eq('avaliacao_id', avaliacaoId),
    buscarAbatimentosForaDaOficina(avaliacaoId),
  ]);
  const custosOficina = ((oficina as any[]) || [])
    .filter((c) => String(c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((s, c) => s + nz(c.valor_executado ?? c.valor_previsto), 0);
  return custosOficina + foraDaOficina;
}

/**
 * Recalcula a parcela de repasse em aberto do compromisso de COMPRA dessa moto
 * (inclusive depois da NF-e de compra) para fechar com fechamento − quitação −
 * abatimentos. Chamar depois de lançar/remover custo do cliente. Best-effort:
 * falha só registra no console.
 */
export async function recalcularRepasseCompra(avaliacaoId: string | null | undefined) {
  if (!avaliacaoId) return;
  const { error } = await supabase.functions.invoke('gerar-compromissos-proposta', {
    body: { acao: 'recalcular_repasse', avaliacao_id: avaliacaoId },
  });
  if (error) console.error('recalcular_repasse', error);
}
