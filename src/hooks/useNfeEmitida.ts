import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Sinaliza se a entidade tem NF-e AUTORIZADA no momento — regra de trava de
 * edição pós-emissão (atendimento/avaliação e seus documentos).
 *
 * A trava segue a linha MAIS RECENTE de `nfe_entradas`: só está travado enquanto
 * ela estiver `processada`. Se a última NF-e foi cancelada / deu erro, destrava.
 *
 * `emitidaProducao` = a NF-e autorizada mais recente está em PRODUÇÃO. Usado para
 * a trava de REMOÇÃO de documentos: anexar documento ausente é sempre permitido;
 * remover/substituir só é bloqueado quando há NF-e de produção.
 *
 * `by='avaliacao'` chaveia por avaliacao_id (compra e consignação);
 * `by='atendimento'` por atendimento_id + operacao 'venda%'.
 * Mesma consulta de `useNfeCompra.carregar`.
 */
export function useNfeEmitida(
  entityId: string | null | undefined,
  by: 'avaliacao' | 'atendimento',
): { emitida: boolean; emitidaProducao: boolean; loading: boolean; recarregar: () => Promise<void> } {
  const [emitida, setEmitida] = useState(false);
  const [emitidaProducao, setEmitidaProducao] = useState(false);
  const [loading, setLoading] = useState(false);
  const keyCol = by === 'atendimento' ? 'atendimento_id' : 'avaliacao_id';

  const recarregar = useCallback(async () => {
    if (!entityId) {
      setEmitida(false);
      setEmitidaProducao(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from('nfe_entradas' as any)
      .select('status, ambiente')
      .eq(keyCol, entityId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (by === 'atendimento') query = query.like('operacao', 'venda%');
    const { data } = await query;
    const row = (data as any[])?.[0];
    const autorizada = row?.status === 'processada';
    setEmitida(autorizada);
    setEmitidaProducao(autorizada && row?.ambiente === 'producao');
    setLoading(false);
  }, [entityId, keyCol, by]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { emitida, emitidaProducao, loading, recarregar };
}
