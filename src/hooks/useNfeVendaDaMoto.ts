import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * A moto desta avaliação já tem NF-e de VENDA autorizada em PRODUÇÃO?
 *
 * A venda de uma moto consignada acontece no atendimento de quem COMPRA
 * (estoque_motos.atendimento_venda_id), não no atendimento do consignante
 * (avaliacoes.atendimento_id) — por isso a busca passa pelo estoque.
 * Homologação não conta (é teste).
 *
 * Usado para travar o Valor de Fechamento de moto consignada: só a NF de
 * venda trava (achado UJL2F09, 2026-10-07: travava por uma NF de compra em
 * homologação e ainda olhava o atendimento errado).
 */
export function useNfeVendaDaMoto(avaliacaoId: string | null | undefined, enabled = true) {
  const [emitida, setEmitida] = useState(false);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!avaliacaoId || !enabled) { setEmitida(false); return; }
    setLoading(true);
    const { data: est } = await supabase
      .from('estoque_motos')
      .select('atendimento_venda_id')
      .eq('avaliacao_id', avaliacaoId)
      .not('atendimento_venda_id' as any, 'is', null);
    const atendimentos = ((est as any[]) || []).map((e) => e.atendimento_venda_id).filter(Boolean);
    if (atendimentos.length === 0) { setEmitida(false); setLoading(false); return; }
    const { data: nfs } = await (supabase as any)
      .from('nfe_entradas')
      .select('id')
      .in('atendimento_id', atendimentos)
      .in('operacao', ['venda_seminova', 'venda_0km'])
      .eq('ambiente', 'producao')
      .eq('status', 'processada')
      .limit(1);
    setEmitida(((nfs as any[]) || []).length > 0);
    setLoading(false);
  }, [avaliacaoId, enabled]);

  useEffect(() => { carregar(); }, [carregar]);

  return { emitida, loading, recarregar: carregar };
}
