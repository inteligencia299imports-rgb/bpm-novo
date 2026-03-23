import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import ShowroomTab from '@/components/showroom/ShowroomTab';
import EstoqueTab from '@/components/estoque/EstoqueTab';
import AvaliacoesTab from '@/components/avaliacoes/AvaliacoesTab';
import NpsTab from '@/components/nps/NpsTab';
import ConsultaTab from '@/components/consulta/ConsultaTab';
import PosVendaTab from '@/components/pos-venda/PosVendaTab';
import IntermediacacaoTab from '@/components/intermediacao/IntermediacacaoTab';
import PosCompraTab from '@/components/pos-compra/PosCompraTab';
import ConsignacaoTab from '@/components/consignacao/ConsignacaoTab';
import PreparacaoTab from '@/components/preparacao/PreparacaoTab';

const Dashboard = () => {
  const { role } = useAuth();
  const defaultTab = role === 'avaliador' ? 'avaliacoes' : 'showroom';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    if (role === 'avaliador' && activeTab === 'showroom') setActiveTab('showroom');
  }, [role]);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
      />
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto animate-fade-in pb-20 md:pb-6">
        {activeTab === 'showroom' && <ShowroomTab />}
        {activeTab === 'estoque' && <EstoqueTab onNavigate={setActiveTab} />}
        {activeTab === 'avaliacoes' && <AvaliacoesTab />}
        {activeTab === 'consulta' && <ConsultaTab />}
        {activeTab === 'pos_venda' && <PosVendaTab />}
        {activeTab === 'intermediacao' && <IntermediacacaoTab />}
        {activeTab === 'pos_compra' && <PosCompraTab />}
        {activeTab === 'consignacao' && <ConsignacaoTab />}
        {activeTab === 'preparacao' && <PreparacaoTab />}
        {activeTab === 'nps' && <NpsTab />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Dashboard;
