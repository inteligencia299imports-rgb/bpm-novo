import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import ShowroomTab from '@/components/showroom/ShowroomTab';
import AvaliacoesTab from '@/components/avaliacoes/AvaliacoesTab';

const Dashboard = () => {
  const { role } = useAuth();
  const defaultTab = role === 'avaliador' ? 'avaliacoes' : 'showroom';
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (role === 'avaliador' && activeTab === 'showroom') setActiveTab('avaliacoes');
    if (role === 'vendedor' && activeTab === 'avaliacoes') setActiveTab('showroom');
  }, [role]);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto animate-fade-in pb-20 md:pb-6">
        {activeTab === 'showroom' && <ShowroomTab />}
        {activeTab === 'avaliacoes' && <AvaliacoesTab />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Dashboard;
