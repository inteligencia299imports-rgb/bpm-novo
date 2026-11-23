import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { carregarEtapasCompra, type ContextoCompra, type EtapaCompra, type EtapaCompraKey } from '@/lib/etapasCompra';
import { podeAcessarAba } from '@/lib/abasPermissao';
import AvaliacaoForm from '@/components/avaliacoes/AvaliacaoForm';
import EtapasVendaBar from '@/components/vendas/EtapasVendaBar';

type ContextoTela = 'avaliacao' | 'pos_compra' | 'consignacao';
/** Tela própria da aba que abriu a compra (nenhuma seta destacada). */
const BASE = '__base';
type Aberta = EtapaCompraKey | typeof BASE;

interface Props {
  avaliacaoId: string;
  /** Aba que abriu: Avaliações, Pós-Compra ou Consignação. */
  contextoBase: ContextoTela;
  onClose: () => void;
  /** Etapa a abrir ao entrar (ex.: Aprovação). Bloqueada → fica na tela da aba. */
  etapaInicial?: EtapaCompraKey;
  onNavigateToPreparacao?: (avaliacaoId: string) => void;
  onNavigateToNps?: () => void;
}

// Etapas feitas no checklist do Processo (Pós-Compra ou Consignação).
const ETAPAS_PROCESSO = new Set<EtapaCompraKey>([
  'consulta', 'documentacao', 'vistoria', 'nf_compra', 'renave', 'transferencia',
]);

/**
 * Avaliação adquirida: barra de etapas da compra no topo e, abaixo, a tela da
 * etapa escolhida — as mesmas telas de sempre (avaliação, pós-compra /
 * consignação com a Proposta ou o Processo aberto, preparação, NPS).
 */
const CompraProcessoView: React.FC<Props> = ({
  avaliacaoId, contextoBase, onClose, etapaInicial, onNavigateToPreparacao, onNavigateToNps,
}) => {
  const { role } = useAuth();
  const [etapas, setEtapas] = useState<EtapaCompra[]>([]);
  const [contexto, setContexto] = useState<ContextoCompra | null>(null);
  const [loadingEtapas, setLoadingEtapas] = useState(true);
  const [aberta, setAberta] = useState<Aberta>(contextoBase === 'avaliacao' ? 'avaliacao' : BASE);
  const [inicialResolvida, setInicialResolvida] = useState(!etapaInicial);

  const recarregarEtapas = useCallback(async () => {
    setLoadingEtapas(true);
    try {
      const r = await carregarEtapasCompra(avaliacaoId);
      setEtapas(r.etapas);
      setContexto(r.contexto);
    } finally {
      setLoadingEtapas(false);
    }
  }, [avaliacaoId]);

  useEffect(() => { recarregarEtapas(); }, [recarregarEtapas]);

  const contextoProcesso: ContextoTela = contexto?.consignada ? 'consignacao' : 'pos_compra';
  // Aba onde cada etapa é feita — sem acesso a ela, a seta não abre.
  const abaDaEtapa = (k: EtapaCompraKey): string => {
    if (k === 'avaliacao' || k === 'contrato') return 'avaliacoes';
    if (k === 'aprovacao') return 'pos_compra';
    if (k === 'preparacao') return 'preparacao';
    if (k === 'nps') return 'nps';
    return contextoProcesso;
  };

  const bloqueadas = useMemo(() => {
    const m = new Map<EtapaCompraKey, string>();
    for (const e of etapas) {
      if (e.key === 'avaliacao' && podeAcessarAba('avaliacoes', role)) continue;
      // Aprovação também para o gerente, que pode desaprovar (2026-11-22).
      const acessa = podeAcessarAba(abaDaEtapa(e.key), role) || (e.key === 'aprovacao' && role === 'gerente');
      if (e.aguardando) m.set(e.key, `Aguardando ${e.aguardando}`);
      else if (!acessa) m.set(e.key, 'Sem acesso');
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, etapas, contextoProcesso]);

  const abrirEtapa = (key: EtapaCompraKey) => {
    if (bloqueadas.has(key)) return;
    if (key === 'preparacao') { onNavigateToPreparacao?.(avaliacaoId); return; }
    if (key === 'nps') { onNavigateToNps?.(); return; }
    setAberta(key);
    recarregarEtapas();
  };

  useEffect(() => {
    if (inicialResolvida || loadingEtapas) return;
    if (etapaInicial && etapas.some((e) => e.key === etapaInicial) && !bloqueadas.has(etapaInicial)) setAberta(etapaInicial);
    setInicialResolvida(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicialResolvida, loadingEtapas]);

  // Tela de cada etapa: AvaliacaoForm no contexto certo, só com o botão da etapa
  // e o pop-up dela aberto apenas se estiver pendente (pedido do usuário, 2026-11-22).
  const pendente = aberta !== BASE && !etapas.find((e) => e.key === aberta)?.concluida;
  let tela: { context: ContextoTela; acao?: 'contrato' | 'processo'; botoes: ('proposta' | 'processo')[] };
  if (aberta === BASE) tela = { context: contextoBase, botoes: [] };
  else if (aberta === 'avaliacao') tela = { context: 'avaliacao', botoes: [] };
  else if (aberta === 'aprovacao') tela = { context: 'pos_compra', botoes: [] };
  else if (aberta === 'contrato') tela = { context: 'avaliacao', acao: pendente ? 'contrato' : undefined, botoes: ['proposta'] };
  else if (ETAPAS_PROCESSO.has(aberta)) tela = { context: contextoProcesso, acao: pendente ? 'processo' : undefined, botoes: ['processo'] };
  else tela = { context: contextoBase, botoes: [] };

  return (
    <div className="space-y-3">
      <EtapasVendaBar
        etapas={etapas}
        selecionada={aberta as EtapaCompraKey}
        onSelect={abrirEtapa}
        bloqueadas={bloqueadas}
        loading={loadingEtapas}
      />
      {inicialResolvida && (
        <AvaliacaoForm
          key={`${aberta}-${tela.context}`}
          avaliacaoId={avaliacaoId}
          context={tela.context}
          acaoInicial={tela.acao}
          botoesEtapa={tela.botoes}
          rolagemNaPagina
          onClose={onClose}
        />
      )}
    </div>
  );
};

export default CompraProcessoView;
