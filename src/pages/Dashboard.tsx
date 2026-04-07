import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import ShowroomTab from '@/components/showroom/ShowroomTab';
import EstoqueTab from '@/components/estoque/EstoqueTab';
import type { EstoqueNavTarget } from '@/components/estoque/EstoqueTab';
import AvaliacoesTab from '@/components/avaliacoes/AvaliacoesTab';
import NpsTab from '@/components/nps/NpsTab';
import ConsultaTab from '@/components/consulta/ConsultaTab';
import PosVendaTab from '@/components/pos-venda/PosVendaTab';
import IntermediacacaoTab from '@/components/intermediacao/IntermediacacaoTab';
import PosCompraTab from '@/components/pos-compra/PosCompraTab';
import ConsignacaoTab from '@/components/consignacao/ConsignacaoTab';
import PreparacaoTab from '@/components/preparacao/PreparacaoTab';
import RelatoriosTab from '@/components/relatorios/RelatoriosTab';

const Dashboard = () => {
  const { role } = useAuth();
  const getDefaultTab = (r: string | null) => r === 'gestor' ? 'relatorios' : r === 'avaliador' ? 'avaliacoes' : r === 'vendedor' ? 'relatorios' : 'showroom';
  const [activeTab, setActiveTab] = useState(getDefaultTab(role));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasSetInitialTab, setHasSetInitialTab] = useState(false);

  // Navigation state for cross-tab deep linking
  const [initialAtendimentoId, setInitialAtendimentoId] = useState<string | null>(null);
  const [initialAvaliacaoId, setInitialAvaliacaoId] = useState<string | null>(null);
  const [initialParte, setInitialParte] = useState<'parte1' | 'parte2' | null>(null);

  useEffect(() => {
    if (role && !hasSetInitialTab) {
      setActiveTab(getDefaultTab(role));
      setHasSetInitialTab(true);
    }
  }, [role, hasSetInitialTab]);

  const clearInitials = () => {
    setInitialAtendimentoId(null);
    setInitialAvaliacaoId(null);
    setInitialParte(null);
  };

  const handleNavigateToShowroom = (atendimentoId: string) => {
    clearInitials();
    setInitialAtendimentoId(atendimentoId);
    setActiveTab('showroom');
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
    setActiveTab(target.tab);
  };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => { clearInitials(); setActiveTab(tab); }}
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
          />
        )}
        {activeTab === 'intermediacao' && (
          <IntermediacacaoTab
            initialAtendimentoId={initialAtendimentoId}
            onInitialHandled={() => setInitialAtendimentoId(null)}
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
        {activeTab === 'nps' && <NpsTab onNavigateToShowroom={handleNavigateToShowroom} />}
        {activeTab === 'relatorios' && <RelatoriosTab />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={(tab) => { clearInitials(); setActiveTab(tab); }} />
    </div>
  );
};

export default Dashboard;
