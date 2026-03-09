import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/layout/Header';
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
    <div className="min-h-screen bg-background">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="p-4 md:p-6 max-w-7xl mx-auto animate-fade-in">
        {activeTab === 'showroom' && <ShowroomTab />}
        {activeTab === 'avaliacoes' && <AvaliacoesTab />}
      </main>
    </div>
  );
};

export default Dashboard;
