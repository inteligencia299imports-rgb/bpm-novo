import React, { useState } from 'react';
import NpsVendasTab from './NpsVendasTab';
import NpsAquisicoesTab from './NpsAquisicoesTab';

const NpsTab = () => {
  const [subTab, setSubTab] = useState<'vendas' | 'aquisicoes'>('vendas');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NPS</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Pesquisa de satisfação dos clientes</p>
      </div>

      {/* Sub-tabs */}
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

      {subTab === 'vendas' && <NpsVendasTab />}
      {subTab === 'aquisicoes' && <NpsAquisicoesTab />}
    </div>
  );
};

export default NpsTab;
