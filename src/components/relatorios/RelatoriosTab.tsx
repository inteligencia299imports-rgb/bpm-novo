import React, { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bike, ClipboardCheck, Package, CalendarIcon, BarChart3, X, UserCheck, Wrench, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getPreviousPeriod, getPreviousMonthDate } from '@/lib/reportComparison';
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
  const isGestorOrAvaliador = role === 'gestor' || role === 'avaliador';
  
  const [dept, setDept] = useState('showroom');

  // Update default tab once role is known
  React.useEffect(() => {
    if (role) {
      setDept((role === 'gestor' || role === 'avaliador') ? 'showroom' : 'vendedores');
    }
  }, [role]);

  // Preparação: bloquear seleção de datas antes de 21/03/2026
  // Showroom/Avaliações: bloquear seleção antes de 01/04/2025
  const PREP_MIN_DATE = new Date(2026, 2, 21, 0, 0, 0, 0);
  const SHOWROOM_AVAL_MIN_DATE = new Date(2025, 0, 1, 0, 0, 0, 0);
  const ESTOQUE_MIN_DATE = new Date(2026, 3, 6, 0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const disabledFromDates = dept === 'preparacao'
    ? (date: Date) => date < PREP_MIN_DATE || date > todayEnd
    : dept === 'estoque'
      ? (date: Date) => date < ESTOQUE_MIN_DATE || date > todayEnd
      : (dept === 'showroom' || dept === 'avaliacoes')
        ? (date: Date) => date < SHOWROOM_AVAL_MIN_DATE || date > todayEnd
        : (date: Date) => date > todayEnd;
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

  const hasActiveFilters = !!(dateFrom || dateTo || hasInternalFilters);

  const handleClearAll = () => {
    clearFnRef.current?.();
  };

  return (
    <div className="space-y-5 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><BarChart3 className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Relatórios</h1></div>
        <div className="flex items-center gap-2">
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
      </div>
      <p className="text-sm text-muted-foreground mt-0.5">Análise de desempenho e indicadores</p>
      <Tabs value={dept} onValueChange={setDept}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-full">
          {isGestorOrAvaliador && (
            <div className="w-full sm:w-auto flex items-center gap-2">
              {/* Desktop: tabs list */}
              <div className="hidden md:block overflow-x-auto">
                <TabsList className="w-max">
                  {DEPT_OPTIONS.map(o => (
                    <TabsTrigger key={o.value} value={o.value} className="gap-1.5">
                      <o.icon className="h-4 w-4" /> {o.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {/* Mobile: select with icons */}
              <div className="md:hidden flex-1 min-w-0">
                <Select value={dept} onValueChange={setDept}>
                  <SelectTrigger className="h-9 w-full">
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
          {dept !== 'vendedores' && (
          <div className={`w-full sm:w-auto flex flex-col items-start sm:items-end gap-1 ${showFilters ? 'flex' : 'hidden md:flex'}`}>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {dept !== 'estoque' && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap shrink-0', !dateFrom && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data Início'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} disabled={disabledFromDates} locale={ptBR} className="p-3 pointer-events-auto" defaultMonth={dateFrom ?? new Date('2026-03-21T00:00:00')} />
                    </PopoverContent>
                  </Popover>
                  <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">até</span>
                </>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap shrink-0', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Data Fim'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} disabled={(date: Date) => disabledFromDates(date) || (dateFrom ? date < dateFrom : false)} locale={ptBR} className="p-3 pointer-events-auto" defaultMonth={dateTo ?? new Date('2026-03-21T00:00:00')} />
                </PopoverContent>
              </Popover>
            </div>
            {(() => {
              if (!dateTo) return null;
              if (dept === 'estoque') {
                const prev = getPreviousMonthDate(dateTo);
                if (!prev) return null;
                return (
                  <p className="text-xs text-muted-foreground pr-1">
                    Comparado com {format(prev, 'dd/MM/yyyy')}
                  </p>
                );
              }
              if (!dateFrom) return null;
              const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);
              if (!prevFrom || !prevTo) return null;
              return (
                <p className="text-xs text-muted-foreground pr-1">
                  Comparado com {format(prevFrom, 'dd/MM/yyyy')} a {format(prevTo, 'dd/MM/yyyy')}
                </p>
              );
            })()}
          </div>
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
              <RelatorioEstoque showFilters={showFilters} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} onRegisterClear={(fn) => { if (dept === 'estoque') clearFnRef.current = fn; }} onFilterChange={(loja, tipo) => setHasInternalFilters(loja !== 'todos' || tipo !== 'todos')} />
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
