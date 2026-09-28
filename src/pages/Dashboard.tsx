import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import ShowroomTab from '@/components/showroom/ShowroomTab';
import EstoqueTab from '@/components/estoque/EstoqueTab';
import type { EstoqueNavTarget } from '@/components/estoque/EstoqueTab';
import AvaliacoesTab from '@/components/avaliacoes/AvaliacoesTab';
import ConsultaTab from '@/components/consulta/ConsultaTab';
import PosVendaTab from '@/components/pos-venda/PosVendaTab';
import IntermediacacaoTab from '@/components/intermediacao/IntermediacacaoTab';
import PosCompraTab from '@/components/pos-compra/PosCompraTab';
import ConsignacaoTab from '@/components/consignacao/ConsignacaoTab';
import PreparacaoTab from '@/components/preparacao/PreparacaoTab';
import RelatoriosTab from '@/components/relatorios/RelatoriosTab';
import NovidadesTab from '@/components/novidades/NovidadesTab';
import NpsTab from '@/components/nps/NpsTab';

// Abas cujo dialog de detalhe é aberto por atendimento_id direto.
const ATENDIMENTO_KEYED_TABS = new Set(['showroom', 'pos_venda', 'intermediacao']);
// Abas cujo dialog de detalhe é aberto por avaliacao_id (o atendimento_id da
// URL precisa ser resolvido pra avaliacao_id correspondente).
const AVALIACAO_KEYED_TABS = new Set(['pos_compra', 'consignacao', 'preparacao', 'avaliacoes']);
const VALID_TABS = new Set([
  ...ATENDIMENTO_KEYED_TABS, ...AVALIACAO_KEYED_TABS,
  'estoque', 'consulta', 'relatorios', 'novidades', 'nps',
]);

const Dashboard = () => {
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const getDefaultTab = (r: string | null) => 'showroom';

  const urlTab = searchParams.get('tab');
  const urlTabValida = !!urlTab && VALID_TABS.has(urlTab);
  const urlAtendimento = searchParams.get('atendimento');

  const [activeTab, setActiveTabState] = useState(urlTabValida ? (urlTab as string) : getDefaultTab(role));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasSetInitialTab, setHasSetInitialTab] = useState(urlTabValida);

  // Navigation state for cross-tab deep linking
  const [initialAtendimentoId, setInitialAtendimentoId] = useState<string | null>(
    urlTabValida && urlAtendimento && ATENDIMENTO_KEYED_TABS.has(urlTab as string) ? urlAtendimento : null,
  );
  const [initialAvaliacaoId, setInitialAvaliacaoId] = useState<string | null>(null);
  const [initialParte, setInitialParte] = useState<'parte1' | 'parte2' | null>(
    (searchParams.get('parte') as 'parte1' | 'parte2' | null) || null,
  );

  useEffect(() => {
    if (role && !hasSetInitialTab) {
      setActiveTabState(getDefaultTab(role));
      setHasSetInitialTab(true);
    }
  }, [role, hasSetInitialTab]);

  // Deep link de entrada por atendimento_id em aba organizada por avaliação:
  // resolve a avaliação correspondente uma única vez, ao montar.
  useEffect(() => {
    if (urlTabValida && AVALIACAO_KEYED_TABS.has(urlTab as string) && urlAtendimento) {
      supabase.from('avaliacoes').select('id')
        .eq('atendimento_id', urlAtendimento)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
        .then(({ data }) => { if (data?.id) setInitialAvaliacaoId(data.id); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearInitials = () => {
    setInitialAtendimentoId(null);
    setInitialAvaliacaoId(null);
    setInitialParte(null);
  };

  // Troca de aba "manual" (sidebar/bottom nav): fecha qualquer atendimento
  // aberto e limpa os parâmetros da URL — quem reabre o atendimento na URL
  // é o próprio hook useAtendimentoUrlSync de cada aba, quando aplicável.
  const changeTab = (tab: string) => {
    clearInitials();
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    next.delete('atendimento');
    next.delete('parte');
    setSearchParams(next, { replace: true });
  };

  const handleNavigateToShowroom = (atendimentoId: string) => {
    clearInitials();
    setInitialAtendimentoId(atendimentoId);
    setActiveTabState('showroom');
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'showroom');
    setSearchParams(next, { replace: true });
  };

  const handleEstoqueNav = (target: EstoqueNavTarget) => {
    clearInitials();
    if ('atendimentoId' in target) {
      setInitialAtendimentoId(target.atendimentoId);
    }
    if ('avaliacaoId' in target) {
      setInitialAvaliacaoId(target.avaliacaoId);
    }
    if ('parte' in target && target.parte) {
      setInitialParte(target.parte);
    }
    setActiveTabState(target.tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', target.tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        activeTab={activeTab}
        onTabChange={changeTab}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
      />
      <main className="flex-1 p-3 md:p-4 lg:p-6 animate-fade-in pb-20 md:pb-6 overflow-x-hidden">
        {activeTab === 'showroom' && (
          <ShowroomTab
            initialAtendimentoId={initialAtendimentoId}
            onInitialAtendimentoHandled={() => setInitialAtendimentoId(null)}
          />
        )}
        {activeTab === 'estoque' && (
          <EstoqueTab onNavigateToTab={handleEstoqueNav} />
        )}
        {activeTab === 'avaliacoes' && (
          <AvaliacoesTab
            initialAvaliacaoId={initialAvaliacaoId}
            onInitialHandled={() => setInitialAvaliacaoId(null)}
          />
        )}
        {activeTab === 'consulta' && <ConsultaTab />}
        {activeTab === 'pos_venda' && (
          <PosVendaTab
            initialAtendimentoId={initialAtendimentoId}
            onInitialHandled={() => setInitialAtendimentoId(null)}
            onNavigateToPosCompra={(avaliacaoId) => {
              clearInitials();
              setInitialAvaliacaoId(avaliacaoId);
              setActiveTabState('pos_compra');
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'pos_compra');
              setSearchParams(next, { replace: true });
            }}
          />
        )}
        {activeTab === 'intermediacao' && (
          <IntermediacacaoTab
            initialAtendimentoId={initialAtendimentoId}
            initialParte={initialParte}
            onInitialHandled={() => { setInitialAtendimentoId(null); setInitialParte(null); }}
          />
        )}
        {activeTab === 'pos_compra' && (
          <PosCompraTab
            initialAvaliacaoId={initialAvaliacaoId}
            onInitialHandled={() => setInitialAvaliacaoId(null)}
          />
        )}
        {activeTab === 'consignacao' && (
          <ConsignacaoTab
            initialAvaliacaoId={initialAvaliacaoId}
            onInitialHandled={() => setInitialAvaliacaoId(null)}
          />
        )}
        {activeTab === 'preparacao' && (
          <PreparacaoTab
            initialAvaliacaoId={initialAvaliacaoId}
            onInitialHandled={() => setInitialAvaliacaoId(null)}
          />
        )}
        {activeTab === 'relatorios' && <RelatoriosTab />}
        {activeTab === 'novidades' && <NovidadesTab onNavigateToShowroom={handleNavigateToShowroom} />}
        {activeTab === 'nps' && <NpsTab onNavigateToTab={handleEstoqueNav} />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={changeTab} />
    </div>
  );
};

export default Dashboard;
