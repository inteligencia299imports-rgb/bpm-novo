import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export const NFE_PENDENTE = ['recebida', 'validando', 'processando_itens', 'gerando_contas'];

/** Estado + acoes da NF-e de compra de uma avaliacao (emitir / consultar / polling). */
export function useNfeCompra(avaliacaoId: string, ativo: boolean) {
  const [nfe, setNfe] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const status: string | undefined = nfe?.status;
  const emitida = status === 'processada';
  const pendente = NFE_PENDENTE.includes(status || '');
  const erro = status === 'erro';

  const invoke = useCallback(
    async (acao: 'emitir' | 'consultar', extra?: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('emitir-nfe-compra', {
        body: { avaliacao_id: avaliacaoId, acao, ...(extra || {}) },
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
    [avaliacaoId],
  );

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('nfe_entradas' as any)
      .select('*')
      .eq('avaliacao_id', avaliacaoId)
      .order('created_at', { ascending: false })
      .limit(1);
    setNfe((data as any[])?.[0] || null);
  }, [avaliacaoId]);

  const emitir = useCallback(async (opts?: { observacoes?: string }) => {
    setLoading(true);
    try {
      const res = await invoke('emitir', opts?.observacoes ? { observacoes: opts.observacoes } : undefined);
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
