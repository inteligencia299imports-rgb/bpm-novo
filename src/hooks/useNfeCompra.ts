import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export const NFE_PENDENTE = ['recebida', 'validando', 'processando_itens', 'gerando_contas'];

type NfeTipo = 'compra' | 'consignacao' | 'venda_seminova' | 'venda_0km';

/**
 * Estado + acoes da NF-e (emitir / consultar / polling).
 * `by='avaliacao'` (entrada) chaveia por avaliacao_id; `by='atendimento'` (venda) por atendimento_id.
 */
export function useNfeCompra(
  entityId: string,
  ativo: boolean,
  tipo: NfeTipo = 'compra',
  by: 'avaliacao' | 'atendimento' = 'avaliacao',
) {
  const avaliacaoId = entityId;
  const keyCol = by === 'atendimento' ? 'atendimento_id' : 'avaliacao_id';
  const [nfe, setNfe] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const status: string | undefined = nfe?.status;
  const emitida = status === 'processada';
  const pendente = NFE_PENDENTE.includes(status || '');
  const erro = status === 'erro';

  const invoke = useCallback(
    async (acao: 'emitir' | 'consultar', extra?: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('emitir-nfe-compra', {
        body: { [keyCol]: avaliacaoId, acao, tipo, ...(extra || {}) },
      });
      if (error) {
        // A Edge Function devolve { error } no corpo em 4xx.
        let msg = error.message || 'Falha ao emitir a NF-e';
        try {
          const ctx = (error as any).context;
          const j = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      return data as { nfe: any | null };
    },
    [avaliacaoId, tipo, keyCol],
  );

  const carregar = useCallback(async () => {
    if (!avaliacaoId) { setNfe(null); return; }
    let query = supabase
      .from('nfe_entradas' as any)
      .select('*')
      .eq(keyCol, avaliacaoId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (by === 'atendimento') query = query.like('operacao', 'venda%');
    const { data } = await query;
    setNfe((data as any[])?.[0] || null);
  }, [avaliacaoId, keyCol, by]);

  const emitir = useCallback(async (opts?: { observacoes?: string; valor?: number }) => {
    setLoading(true);
    try {
      const extra: Record<string, unknown> = {};
      if (opts?.observacoes) extra.observacoes = opts.observacoes;
      if (typeof opts?.valor === 'number' && opts.valor > 0) extra.valor = opts.valor;
      const res = await invoke('emitir', Object.keys(extra).length ? extra : undefined);
      setNfe(res.nfe);
      toast.success(res.nfe?.status === 'processada' ? 'NF-e autorizada!' : 'NF-e enviada para autorização.');
    } catch (e: any) {
      toast.error(e.message);
      await carregar();
    } finally {
      setLoading(false);
    }
  }, [invoke, carregar]);

  const consultar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke('consultar');
      if (res.nfe) setNfe(res.nfe);
      if (res.nfe?.status === 'processada') toast.success('NF-e autorizada!');
      else if (res.nfe?.status === 'erro') toast.error(res.nfe.erro_mensagem || 'Erro na emissão da NF-e');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  // Polling enquanto pendente e a tela ativa.
  const consultarRef = useRef(consultar);
  consultarRef.current = consultar;
  useEffect(() => {
    if (!ativo || !pendente) return;
    const t = setInterval(() => {
      consultarRef.current();
    }, 6000);
    return () => clearInterval(t);
  }, [ativo, pendente]);

  return { nfe, setNfe, loading, emitida, pendente, erro, carregar, emitir, consultar };
}
