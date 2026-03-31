import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bike, ClipboardCheck, Package } from 'lucide-react';
import RelatorioShowroom from './RelatorioShowroom';

const RelatoriosTab: React.FC = () => {
  const [dept, setDept] = useState('showroom');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Relatórios</h1>
      <Tabs value={dept} onValueChange={setDept}>
        <TabsList>
          <TabsTrigger value="showroom" className="gap-1.5">
            <Bike className="h-4 w-4" /> Showroom
          </TabsTrigger>
          <TabsTrigger value="avaliacoes" className="gap-1.5" disabled>
            <ClipboardCheck className="h-4 w-4" /> Avaliações
          </TabsTrigger>
          <TabsTrigger value="estoque" className="gap-1.5" disabled>
            <Package className="h-4 w-4" /> Estoque
          </TabsTrigger>
        </TabsList>
        <TabsContent value="showroom">
          <RelatorioShowroom />
        </TabsContent>
        <TabsContent value="avaliacoes">
          <p className="text-muted-foreground text-sm p-4">Em breve...</p>
        </TabsContent>
        <TabsContent value="estoque">
          <p className="text-muted-foreground text-sm p-4">Em breve...</p>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RelatoriosTab;
