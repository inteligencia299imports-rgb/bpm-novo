import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Sinaliza se a entidade tem NF-e AUTORIZADA no momento — regra de trava de
 * edição pós-emissão (atendimento/avaliação e seus documentos).
 *
 * A trava segue a linha MAIS RECENTE de `nfe_entradas`: só está travado enquanto
 * ela estiver `processada`. Se a última NF-e foi cancelada / deu erro, destrava.
 *
 * `by='avaliacao'` chaveia por avaliacao_id (compra e consignação);
 * `by='atendimento'` por atendimento_id + operacao 'venda%'.
 * Mesma consulta de `useNfeCompra.carregar`.
 */
export function useNfeEmitida(
  entityId: string | null | undefined,
  by: 'avaliacao' | 'atendimento',
): { emitida: boolean; loading: boolean; recarregar: () => Promise<void> } {
  const [emitida, setEmitida] = useState(false);
  const [loading, setLoading] = useState(false);
  const keyCol = by === 'atendimento' ? 'atendimento_id' : 'avaliacao_id';

  const recarregar = useCallback(async () => {
    if (!entityId) {
      setEmitida(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from('nfe_entradas' as any)
      .select('status')
      .eq(keyCol, entityId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (by === 'atendimento') query = query.like('operacao', 'venda%');
    const { data } = await query;
    setEmitida((data as any[])?.[0]?.status === 'processada');
    setLoading(false);
  }, [entityId, keyCol, by]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { emitida, loading, recarregar };
}
