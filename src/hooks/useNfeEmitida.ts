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
 * `by='atendimento'` por atendimento_id + operacao de venda (`venda_0km`/
 * `venda_seminova`) OU sua devolução (`devolucao_venda_0km`/
 * `devolucao_venda_seminova`) — só trava quando a linha mais recente é uma
 * VENDA processada; se for uma devolução, a venda foi desfeita e destrava.
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
      .select('status, ambiente, operacao')
      .eq(keyCol, entityId)
      .order('created_at', { ascending: false })
      .limit(1);
    // Achado real 2026-09-29: o filtro incluía só `venda%`, então uma
    // devolução (`devolucao_venda_0km`/`devolucao_venda_seminova`) nunca
    // aparecia como "a linha mais recente" — o hook continuava enxergando a
    // NF de venda original (sempre `processada`) e a trava nunca saía, mesmo
    // com a venda desfeita. Inclui as devoluções na consulta, mas só trava
    // quando a linha mais recente é de fato uma VENDA processada — se for
    // uma devolução (mesmo processada), a venda foi desfeita, destrava.
    if (by === 'atendimento') query = query.in('operacao', ['venda_seminova', 'venda_0km', 'devolucao_venda_seminova', 'devolucao_venda_0km']);
    const { data } = await query;
    const row = (data as any[])?.[0];
    const autorizada = row?.status === 'processada' && String(row?.operacao ?? '').startsWith('venda');
    setEmitida(autorizada);
    setEmitidaProducao(autorizada && row?.ambiente === 'producao');
    setLoading(false);
  }, [entityId, keyCol, by]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { emitida, emitidaProducao, loading, recarregar };
}
