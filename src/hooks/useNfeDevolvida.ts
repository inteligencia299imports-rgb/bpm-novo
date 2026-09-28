import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Operação original -> operação de devolução (undo pós-24h) + coluna de chave
 * em nfe_entradas. Mesmo mapeamento usado pelo CancelarNfeDialog (frontend) e
 * por DEVOLUCAO_DE na edge function emitir-nfe-compra (backend). NÃO inclui
 * 'consignacao': a devolução simbólica do fluxo antigo é uma etapa normal da
 * cadeia consignação -> devolução -> compra -> venda, não um "desfazer" pós-24h.
 */
export const DEVOLUCAO_MAP: Record<string, { tipo: string; keyCol: 'avaliacao_id' | 'atendimento_id' | 'estoque_moto_nova_id' }> = {
  compra: { tipo: 'devolucao_compra', keyCol: 'avaliacao_id' },
  venda_seminova: { tipo: 'devolucao_venda_seminova', keyCol: 'atendimento_id' },
  venda_0km: { tipo: 'devolucao_venda_0km', keyCol: 'atendimento_id' },
  transferencia_entrada: { tipo: 'devolucao_transferencia', keyCol: 'avaliacao_id' },
  transferencia_entrada_0km: { tipo: 'devolucao_transferencia_0km', keyCol: 'estoque_moto_nova_id' },
};

/**
 * A NF original (operacao/entityId) já foi devolvida (pós-24h)? Uma vez
 * devolvida, o negócio foi desfeito — não deve mais contar como "emitida em
 * produção" pra travar edição do contrato nem impedir uma nova emissão (ver
 * ContratoDialog, ContratoCompraDialog — o backend aplica a mesma regra).
 *
 * `nfReferenciaCreatedAt` é o `created_at` da NF de produção que está sendo
 * avaliada — só conta como devolvida se a devolução for POSTERIOR a ela.
 * Sem isso, uma devolução antiga (de um ciclo anterior: venda1 -> devolvida
 * -> venda2) ficaria "destravando" pra sempre, mesmo com uma venda2 nova e
 * válida (nunca devolvida) já em produção.
 */
export function useNfeDevolvida(
  operacao: string | undefined,
  entityId: string | null | undefined,
  nfReferenciaCreatedAt: string | null | undefined,
  ativa: boolean,
): boolean {
  const [devolvida, setDevolvida] = useState(false);
  const cfg = operacao ? DEVOLUCAO_MAP[operacao] : undefined;

  useEffect(() => {
    if (!ativa || !cfg || !entityId || !nfReferenciaCreatedAt) { setDevolvida(false); return; }
    let cancel = false;
    supabase.from('nfe_entradas' as any).select('created_at')
      .eq(cfg.keyCol, entityId).eq('operacao', cfg.tipo)
      .eq('status', 'processada').eq('ambiente', 'producao')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
      .then(({ data }: any) => {
        if (cancel) return;
        setDevolvida(!!data && new Date(data.created_at).getTime() > new Date(nfReferenciaCreatedAt).getTime());
      });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativa, cfg?.tipo, cfg?.keyCol, entityId, nfReferenciaCreatedAt]);

  return devolvida;
}
