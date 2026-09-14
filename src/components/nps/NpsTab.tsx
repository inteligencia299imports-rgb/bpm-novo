import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Award } from 'lucide-react';
import NpsVendasTab from './NpsVendasTab';
import NpsAquisicoesTab from './NpsAquisicoesTab';
import type { EstoqueNavTarget } from '@/components/estoque/EstoqueTab';

interface NpsTabProps {
  onNavigateToTab: (target: EstoqueNavTarget) => void;
}

const NpsTab = ({ onNavigateToTab }: NpsTabProps) => {
  const { role } = useAuth();
  const canSeeAquisicoes = role === 'master' || role === 'gerente';
  const [subTab, setSubTab] = useState<'vendas' | 'aquisicoes'>('vendas');

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Award className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">NPS</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Pesquisa de satisfação dos clientes</p>
      </div>

      {canSeeAquisicoes && (
        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
          <button
            onClick={() => setSubTab('vendas')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              subTab === 'vendas'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Vendas
          </button>
          <button
            onClick={() => setSubTab('aquisicoes')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              subTab === 'aquisicoes'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Aquisições
          </button>
        </div>
      )}

      {subTab === 'vendas' && <NpsVendasTab onNavigateToTab={onNavigateToTab} />}
      {subTab === 'aquisicoes' && canSeeAquisicoes && <NpsAquisicoesTab onNavigateToTab={onNavigateToTab} />}
    </div>
  );
};

export default NpsTab;
