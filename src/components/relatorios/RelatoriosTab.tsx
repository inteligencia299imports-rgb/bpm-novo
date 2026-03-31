import React, { useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bike, ClipboardCheck, Package, CalendarIcon, BarChart3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import RelatorioShowroom from './RelatorioShowroom';

const RelatoriosTab: React.FC = () => {
  const [dept, setDept] = useState('showroom');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const clearFnRef = useRef<(() => void) | null>(null);

  const hasActiveFilters = dateFrom || dateTo;

  const handleClearAll = () => {
    clearFnRef.current?.();
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><BarChart3 className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Relatórios</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Análise de desempenho e indicadores</p>
      </div>
      <Tabs value={dept} onValueChange={setDept}>
        <div className="flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('rounded-full h-9 px-4 text-sm font-normal', !dateFrom && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data Início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-sm text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('rounded-full h-9 px-4 text-sm font-normal', !dateTo && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Data Fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <TabsContent value="showroom">
          <RelatorioShowroom dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
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
