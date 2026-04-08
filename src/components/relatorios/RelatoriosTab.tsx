import React, { useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bike, ClipboardCheck, Package, CalendarIcon, BarChart3, X, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import RelatorioShowroom from './RelatorioShowroom';
import RelatorioAvaliacoes from './RelatorioAvaliacoes';
import RelatorioEstoque from './RelatorioEstoque';
import RelatorioVendedores from './RelatorioVendedores';

function getCurrentCycleRange(): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  if (now.getDate() >= 21) {
    start = new Date(now.getFullYear(), now.getMonth(), 21);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 21);
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 20, 23, 59, 59, 999);
  return { start, end };
}

const RelatoriosTab: React.FC = () => {
  const { role } = useAuth();
  const isGestor = role === 'gestor';
  const cycle = getCurrentCycleRange();
  const [dept, setDept] = useState(isGestor ? 'showroom' : 'vendedores');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(cycle.start);
  const [dateTo, setDateTo] = useState<Date | undefined>(cycle.end);
  const clearFnRef = useRef<(() => void) | null>(null);
  const [hasInternalFilters, setHasInternalFilters] = useState(false);

  const hasActiveFilters = !!(dateFrom || dateTo || hasInternalFilters);

  const handleClearAll = () => {
    clearFnRef.current?.();
  };

  return (
    <div className="space-y-5 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><BarChart3 className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Relatórios</h1></div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full h-9 px-3 text-sm text-primary hover:text-primary/80 hover:bg-primary/10"
            onClick={handleClearAll}
          >
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-0.5">Análise de desempenho e indicadores</p>
      <Tabs value={dept} onValueChange={setDept}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-full">
          {isGestor && (
            <div className="w-full sm:w-auto overflow-x-auto">
              <TabsList className="w-max">
                <TabsTrigger value="showroom" className="gap-1.5">
                  <Bike className="h-4 w-4" /> Showroom
                </TabsTrigger>
                <TabsTrigger value="avaliacoes" className="gap-1.5">
                  <ClipboardCheck className="h-4 w-4" /> Avaliações
                </TabsTrigger>
                <TabsTrigger value="estoque" className="gap-1.5">
                  <Package className="h-4 w-4" /> Estoque
                </TabsTrigger>
              </TabsList>
            </div>
          )}
          <div className="w-full sm:w-auto flex items-center gap-2 overflow-x-auto pb-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap shrink-0', !dateFrom && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data Início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className="p-3 pointer-events-auto" disabled={(date) => date < new Date(2026, 3, 6)} />
              </PopoverContent>
            </Popover>
            <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap shrink-0', !dateTo && 'text-muted-foreground')}>
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
        {isGestor && (
          <>
            <TabsContent value="showroom" className="w-full max-w-full overflow-x-hidden">
              <RelatorioShowroom dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { clearFnRef.current = fn; }} onFilterChange={(loja, tipo) => setHasInternalFilters(loja !== 'todos' || tipo !== 'todos')} />
            </TabsContent>
            <TabsContent value="avaliacoes">
              <RelatorioAvaliacoes dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'avaliacoes') clearFnRef.current = fn; }} onFilterChange={(loja) => setHasInternalFilters(loja !== 'todos')} />
            </TabsContent>
            <TabsContent value="estoque">
              <RelatorioEstoque dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'estoque') clearFnRef.current = fn; }} onFilterChange={(loja) => setHasInternalFilters(loja !== 'todos')} />
            </TabsContent>
          </>
        )}
        <TabsContent value="vendedores">
          <RelatorioVendedores dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'vendedores') clearFnRef.current = fn; }} onFilterChange={(loja) => setHasInternalFilters(loja !== 'todos')} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RelatoriosTab;
