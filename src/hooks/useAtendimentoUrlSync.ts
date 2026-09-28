import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reflete na URL (?tab=<tab>&atendimento=<atendimento_id>) o atendimento
 * atualmente aberto na aba, para facilitar compartilhar o link direto de um
 * atendimento (ex.: entre vendedores). Sempre usa o atendimento_id, mesmo em
 * abas cuja tela é organizada por avaliação — o chamador resolve o id certo.
 *
 * Como só a aba ativa fica montada (Dashboard renderiza uma por vez), não há
 * disputa entre hooks de abas diferentes; a limpeza ao trocar de aba é feita
 * centralmente pelo Dashboard.
 */
export function useAtendimentoUrlSync(
  tab: string,
  atendimentoId: string | null | undefined,
  extraParams?: Record<string, string | null | undefined>,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const extraKey = extraParams ? JSON.stringify(extraParams) : '';

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (atendimentoId) {
      next.set('tab', tab);
      next.set('atendimento', atendimentoId);
    } else if (next.get('tab') === tab) {
      next.delete('atendimento');
    } else {
      return;
    }
    Object.entries(extraParams || {}).forEach(([key, val]) => {
      if (val) next.set(key, val);
      else next.delete(key);
    });
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, atendimentoId, extraKey]);
}
