import React, { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bike, ClipboardCheck, Package, BarChart3, X, UserCheck, Wrench, Filter, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentDefaultStart } from '@/lib/reportCycle';
import RelatorioShowroom from './RelatorioShowroom';
import RelatorioAvaliacoes from './RelatorioAvaliacoes';
import RelatorioEstoque from './RelatorioEstoque';
import RelatorioVendedores from './RelatorioVendedores';
import RelatorioPreparacao from './RelatorioPreparacao';

const DEPT_OPTIONS = [
  { value: 'showroom', label: 'Showroom', icon: Bike },
  { value: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck },
  { value: 'preparacao', label: 'Preparação', icon: Wrench },
  { value: 'estoque', label: 'Estoque', icon: Package },
];

const RelatoriosTab: React.FC = () => {
  const { role, loading } = useAuth();
  const isGestorOrAvaliador = role === 'master' || role === 'gerente';
  
  const [dept, setDept] = useState('showroom');

  // Update default tab once role is known
  React.useEffect(() => {
    if (role) {
      setDept((role === 'master' || role === 'gerente') ? 'showroom' : 'vendedores');
    }
  }, [role]);

  const initFrom = getCurrentDefaultStart();
  initFrom.setHours(0, 0, 0, 0);
  const initTo = new Date();
  initTo.setHours(23, 59, 59, 999);
  const [dateFrom, setDateFromRaw] = useState<Date | undefined>(initFrom);
  const [dateTo, setDateToRaw] = useState<Date | undefined>(initTo);

  const setDateFrom = (d: Date | undefined) => {
    if (d) { d.setHours(0, 0, 0, 0); }
    setDateFromRaw(d);
  };
  const setDateTo = (d: Date | undefined) => {
    if (d) { d.setHours(23, 59, 59, 999); }
    setDateToRaw(d);
  };
  const clearFnRef = useRef<(() => void) | null>(null);

  // Estoque: default Data Fim = hoje (usuário ainda pode alterar)
  useEffect(() => {
    if (dept === 'estoque') {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      setDateToRaw(today);
    }
  }, [dept]);
  const [hasInternalFilters, setHasInternalFilters] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Cada aba monta o relatório com os filtros em "todos" — o estado da aba anterior não vale.
  useEffect(() => { setHasInternalFilters(false); }, [dept]);

  // "Limpar filtros" só aparece fora do padrão: período do dia 01 do mês até hoje e
  // filtros internos em "todos".
  const mesmoDia = (a: Date | undefined, b: Date) => !!a && a.toDateString() === b.toDateString();
  const periodoPadrao = mesmoDia(dateFrom, getCurrentDefaultStart()) && mesmoDia(dateTo, new Date());
  const hasActiveFilters = !periodoPadrao || hasInternalFilters;

  // Volta ao padrão (não apaga o período): os relatórios zeram as datas no clear, e o
  // período padrão é reaplicado em seguida.
  const handleClearAll = () => {
    clearFnRef.current?.();
    setDateFrom(getCurrentDefaultStart());
    setDateTo(new Date());
  };

  return (
    <div className="relatorios-listagem space-y-5 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><BarChart3 className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Relatórios</h1></div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full h-9 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={handleClearAll}
            >
              <X className="h-4 w-4 mr-1" />
              Limpar filtros
            </Button>
          )}
          {dept === 'showroom' && (
            <a href="https://datastudio.google.com/reporting/deed15ee-7c89-4011-8f21-84667ce16e6c" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap gap-2">
                <BarChart3 className="h-4 w-4" /> Histórico
              </Button>
            </a>
          )}
          <a href="https://buddy.299imports.com.br" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap gap-2">
              <ExternalLink className="h-4 w-4" /> BPM V1
            </Button>
          </a>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mt-0.5">Análise de desempenho e indicadores</p>
      <Tabs value={dept} onValueChange={setDept}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-full">
          {isGestorOrAvaliador && (
            <div className="w-full sm:w-auto flex items-center gap-2">
              {/* Desktop: tabs list */}
              <div className="hidden md:flex items-center gap-2 overflow-x-auto">
                <TabsList className="w-max">
                  {DEPT_OPTIONS.map(o => (
                    <TabsTrigger key={o.value} value={o.value} className="gap-1.5 data-[state=active]:bg-white">
                      <o.icon className="h-4 w-4" /> {o.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {/* Mobile: select with icons */}
              <div className="md:hidden flex-1 min-w-0">
                <Select value={dept} onValueChange={setDept}>
                  <SelectTrigger className="h-9 w-full bg-white">
                    <SelectValue>
                      {(() => {
                        const o = DEPT_OPTIONS.find(o => o.value === dept);
                        if (!o) return null;
                        const Icon = o.icon;
                        return (
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" /> {o.label}
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DEPT_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center gap-2">
                          <o.icon className="h-4 w-4" /> {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" className="md:hidden shrink-0" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          )}
          {!isGestorOrAvaliador && (
            <Button variant="outline" size="icon" className="md:hidden shrink-0 self-end" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4" />
            </Button>
          )}

        </div>
        {isGestorOrAvaliador && (
          <>
            <TabsContent value="showroom" className="w-full max-w-full overflow-x-hidden">
              <RelatorioShowroom showFilters={showFilters} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { clearFnRef.current = fn; }} onFilterChange={(loja, tipo) => setHasInternalFilters(loja !== 'todos' || tipo !== 'todos')} />
            </TabsContent>
            <TabsContent value="avaliacoes">
              <RelatorioAvaliacoes showFilters={showFilters} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'avaliacoes') clearFnRef.current = fn; }} onFilterChange={(loja) => setHasInternalFilters(loja !== 'todos')} />
            </TabsContent>
            <TabsContent value="preparacao" className="w-full max-w-full overflow-x-hidden">
              <RelatorioPreparacao showFilters={showFilters} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'preparacao') clearFnRef.current = fn; }} onFilterChange={(loja, tipo) => setHasInternalFilters(loja !== 'todos' || tipo !== 'todos')} />
            </TabsContent>
            <TabsContent value="estoque">
              <RelatorioEstoque showFilters={showFilters} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'estoque') clearFnRef.current = fn; }} onFilterChange={(loja, tipo, outros) => setHasInternalFilters(loja !== 'todos' || tipo !== 'todos' || !!outros)} />
            </TabsContent>
          </>
        )}
        <TabsContent value="vendedores">
          <RelatorioVendedores showFilters={showFilters} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'vendedores') clearFnRef.current = fn; }} onFilterChange={(loja) => setHasInternalFilters(loja !== 'todos')} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RelatoriosTab;
