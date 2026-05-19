import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { abbreviateName } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ShoppingCart, CreditCard, TrendingUp, DollarSign, Target, BarChart3, PieChart } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, AreaChart, Area, ComposedChart } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { toSaoPauloEndOfDayIso, toSaoPauloStartOfDayIso } from '@/lib/reportDateRange';
import { useIsMobile } from '@/hooks/use-mobile';
import { LojaFilter } from './LojaFilter';

const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number | null | undefined) => {
  const raw = (v ?? 0) * 100;
  return `${(Math.round(raw * 10) / 10).toFixed(1)}%`;
};
const fmtPctInt = (v: number | null | undefined) => `${Math.round((v ?? 0) * 100)}%`;

interface RelatorioShowroomProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string, tipo: string) => void;
}

const RelatorioShowroom: React.FC<RelatorioShowroomProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const { userName } = useAuth();
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const xTickPropsName = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 10, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [indicadores, setIndicadores] = useState<any>({});
  const [chartByVendedor, setChartByVendedor] = useState<any[]>([]);
  const [motosVendidas, setMotosVendidas] = useState<any[]>([]);
  const [motosSinal, setMotosSinal] = useState<any[]>([]);
  const [chartByMonth, setChartByMonth] = useState<any[]>([]);

  const [filterLoja, setFilterLojaState] = useState('todos');
  const [filterTipo, setFilterTipoState] = useState('todos');
  const [listTab, setListTab] = useState('vendidas');

  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v, filterTipo); };
  const setFilterTipo = (v: string) => { setFilterTipoState(v); onFilterChange?.(filterLoja, v); };

  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterLojaState('todos');
      setFilterTipoState('todos');
      onFilterChange?.('todos', 'todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo]);

  const [refreshing, setRefreshing] = useState(false);
  const loadData = useCallback(async () => {
    setRefreshing(true);
    const dfParam = toSaoPauloStartOfDayIso(dateFrom);
    const dtParam = toSaoPauloEndOfDayIso(dateTo);

    const [kpisRes, vendedoresRes, vendidasRes, sinaisRes, mensalRes] = await Promise.all([
      supabase.rpc('relatorio_showroom_kpis', { _date_from: dfParam, _date_to: dtParam, _loja: filterLoja, _tipo: filterTipo }),
      supabase.rpc('relatorio_showroom_vendedores', { _date_from: dfParam, _date_to: dtParam, _loja: filterLoja, _tipo: filterTipo }),
      supabase.rpc('relatorio_showroom_vendidas', { _date_from: dfParam, _date_to: dtParam, _loja: filterLoja, _tipo: filterTipo }),
      supabase.rpc('relatorio_showroom_sinais', { _loja: filterLoja, _tipo: filterTipo }),
      supabase.rpc('relatorio_showroom_mensal', { _loja: filterLoja, _tipo: filterTipo }),
    ]);

    setIndicadores(kpisRes.data || {});
    const vendedoresData = (vendedoresRes.data || []) as any[];
    setChartByVendedor(vendedoresData.map((v: any) => ({ ...v, nome: abbreviateName(v.nome || 'Desconhecido') })));
    setMotosVendidas((vendidasRes.data || []) as any[]);
    setMotosSinal((sinaisRes.data || []) as any[]);
    setChartByMonth((mensalRes.data || []) as any[]);
    setLoading(false);
    setRefreshing(false);
  }, [dateFrom, dateTo, filterLoja, filterTipo]);


  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    loadData();


    const channel = supabase
      .channel('relatorio-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custos_oficina' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contratos' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custos_operacionais' }, debouncedLoad)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  const tipoLabel = (t: string) => {
    const map: Record<string, string> = { propria: 'Própria', consignada: 'Consignada', 'test-ride': 'Test-Ride', repasse: 'Repasse', convertida: 'Convertida', ducati: 'Ducati' };
    return map[t] || t;
  };

  const lojaLabel = (loja: string | null) => {
    if (!loja) return '-';
    return loja.charAt(0).toUpperCase() + loja.slice(1).toLowerCase();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LojaFilter value={filterLoja} onChange={setFilterLoja} />
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Tipo:</span>
          <div className="flex flex-wrap items-center gap-2">
            {[{ value: 'todos', label: 'Todos' }, { value: 'propria', label: 'Própria' }, { value: 'consignada', label: 'Consignada' }, { value: 'test-ride', label: 'Test-Ride' }, { value: 'repasse', label: 'Repasse' }].map(t => (
              <Button key={t.value} size="sm" variant={filterTipo === t.value ? 'default' : 'outline'} className={cn('rounded-full px-3 h-7 text-xs', filterTipo === t.value && 'shadow-sm')} onClick={() => setFilterTipo(t.value)}>
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Atendimentos" value={indicadores.qtdAtendimentos ?? 0} gradient="teal" icon={<Users className="h-5 w-5" />} />
        <IndicatorCard title="Vendas" value={indicadores.qtdVendas ?? 0} gradient="teal" icon={<ShoppingCart className="h-5 w-5" />} />
        <IndicatorCard title="Sinais" value={indicadores.qtdSinais ?? 0} gradient="teal" icon={<CreditCard className="h-5 w-5" />} />
        <IndicatorCard title="Taxa de Conversão" value={fmtPctInt(indicadores.taxaConversao ?? 0)} gradient="teal" icon={<TrendingUp className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Faturamento Previsto" value={fmtBRL(indicadores.faturamentoPrevisto)} gradient="purple" icon={<DollarSign className="h-5 w-5" />} />
        <IndicatorCard title="Margem Prevista" value={`${fmtBRL(indicadores.margemPrevista)} (${fmtPct(indicadores.pctMargemPrevista)})`} gradient="purple" icon={<Target className="h-5 w-5" />} />
        <IndicatorCard title="Faturamento Realizado" value={fmtBRL(indicadores.faturamentoRealizado)} gradient="emerald" icon={<BarChart3 className="h-5 w-5" />} />
        <IndicatorCard title="Margem Realizada" value={`${fmtBRL(indicadores.margemRealizada)} (${fmtPct(indicadores.pctMargemRealizada)})`} gradient="emerald" icon={<PieChart className="h-5 w-5" />} />
      </div>

      {/* Section: Por Vendedor */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Por Vendedor</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Atendimentos" data={[...chartByVendedor].filter(d => d.atendimentos > 0).sort((a, b) => b.atendimentos - a.atendimentos)} dataKey="atendimentos" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <ChartCard title="Vendas" data={[...chartByVendedor].filter(d => d.vendas > 0).sort((a, b) => b.vendas - a.vendas)} dataKey="vendas" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <ChartCard title="Sinais" data={[...chartByVendedor].filter(d => d.sinais > 0).sort((a, b) => b.sinais - a.sinais)} dataKey="sinais" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Taxa de Conversão (%)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <AreaChart data={[...chartByVendedor].filter(d => d.conversao > 0).sort((a, b) => b.conversao - a.conversao)} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <defs>
                  <linearGradient id="gradConversao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2F6F84" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2F6F84" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" tick={xTickPropsName} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="conversao" stroke="#2F6F84" strokeWidth={2.5} fill="url(#gradConversao)" dot={{ r: 5, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600, formatter: (v: number) => fmtPctInt(v) }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Section: Resultado do Ano */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Resultado do Ano</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MonthChart title="Atendimentos" data={chartByMonth} dataKey="atendimentos" chartH={chartH} xTickProps={xTickProps} chartMarginBottom={chartMarginBottom} />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Vendas e Taxa de Conversão</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Vendas</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Conversão (%)</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#E8913A' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtPctInt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="vendas" name="Vendas" fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
                <Line yAxisId="right" type="monotone" dataKey="conversao" name="Conversão (%)" stroke="#E8913A" strokeWidth={2.5} dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Faturamento</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <AreaChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <defs>
                  <linearGradient id="gradFatMonth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2F6F84" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2F6F84" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip isCurrency />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="faturamento" stroke="#2F6F84" strokeWidth={2.5} fill="url(#gradFatMonth)" dot={{ r: 5, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 9, fill: 'hsl(var(--foreground))', fontWeight: 600, formatter: (v: number) => fmtBRL(v) }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Margem Prevista vs Realizada (%)</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7e6d9b' }} />Prevista</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3a8f6a' }} />Realizada</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtPct(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Line type="monotone" dataKey="pctMargemPrevista" name="Prevista" stroke="#7e6d9b" strokeWidth={2.5} dot={{ r: 4, fill: '#7e6d9b' }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--muted-foreground))', formatter: (v: number) => fmtPct(v) }} />
                <Line type="monotone" dataKey="pctMargemRealizada" name="Realizada" stroke="#3a8f6a" strokeWidth={2.5} dot={{ r: 4, fill: '#3a8f6a' }} label={{ position: 'bottom', fontSize: 10, fill: 'hsl(var(--muted-foreground))', formatter: (v: number) => fmtPct(v) }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Listagem</h2>
        <Separator />
      </div>
      <Card className="overflow-hidden">
        <CardContent className="pt-4">
          <Tabs value={listTab} onValueChange={setListTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="vendidas">Vendidas ({motosVendidas.length})</TabsTrigger>
              <TabsTrigger value="sinais">Com Sinal ({motosSinal.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="vendidas">
              <div className="overflow-x-auto pb-2">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Loja</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Data Venda</TableHead>
                      <TableHead className="text-right">Quanto Vende</TableHead>
                      <TableHead className="text-right">V. Fechamento</TableHead>
                      <TableHead className="text-right">Margem Prev.</TableHead>
                      <TableHead className="text-right">Valor Venda</TableHead>
                      <TableHead className="text-right">M. Oficina</TableHead>
                      <TableHead className="text-right">Abatimentos</TableHead>
                      <TableHead className="text-right">Margem Real.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motosVendidas.length === 0 ? (
                      <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">Nenhuma moto vendida encontrada</TableCell></TableRow>
                    ) : motosVendidas.map((m: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{m.nomeCliente}</TableCell>
                        <TableCell className="text-xs">{m.vendedor}</TableCell>
                        <TableCell className="text-xs font-medium">{lojaLabel(m.loja)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(m.tipo)}`}>{tipoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell className="text-xs">{m.modelo}</TableCell>
                        <TableCell className="text-xs font-mono">{m.placa}</TableCell>
                        <TableCell className="text-xs">{m.dataVenda ? format(new Date(m.dataVenda), 'dd/MM/yy') : '-'}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.quantoVende)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorFechamento)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemPrevista >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemPrevista)} ({fmtPct(m.pctMargemPrevista)})</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorVenda)}</TableCell>
                        <TableCell className={`text-xs text-right ${m.margemOficina >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemOficina)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.abatimentos)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemRealizada)} ({fmtPct(m.pctMargemRealizada)})</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="sinais">
              <div className="overflow-x-auto pb-2">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Loja</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Data Sinal</TableHead>
                      <TableHead className="text-right">Quanto Vende</TableHead>
                      <TableHead className="text-right">V. Fechamento</TableHead>
                      <TableHead className="text-right">Margem Prev.</TableHead>
                      <TableHead className="text-right">Valor Venda</TableHead>
                      <TableHead className="text-right">M. Oficina</TableHead>
                      <TableHead className="text-right">Abatimentos</TableHead>
                      <TableHead className="text-right">Margem Real.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motosSinal.length === 0 ? (
                      <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">Nenhuma moto com sinal encontrada</TableCell></TableRow>
                    ) : motosSinal.map((m: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{m.nomeCliente}</TableCell>
                        <TableCell className="text-xs">{m.vendedor}</TableCell>
                        <TableCell className="text-xs font-medium">{lojaLabel(m.loja)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(m.tipo)}`}>{tipoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell className="text-xs">{m.modelo}</TableCell>
                        <TableCell className="text-xs font-mono">{m.placa}</TableCell>
                        <TableCell className="text-xs">{m.dataSinal ? format(new Date(m.dataSinal), 'dd/MM/yy') : '-'}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.quantoVende)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorFechamento)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemPrevista >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemPrevista)} ({fmtPct(m.pctMargemPrevista)})</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorVenda)}</TableCell>
                        <TableCell className={`text-xs text-right ${m.margemOficina >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemOficina)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.abatimentos)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemRealizada)} ({fmtPct(m.pctMargemRealizada)})</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

// Sub-components
const iconColorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
  purple: 'bg-[#7e6d9b]/10 text-[#7e6d9b]',
  emerald: 'bg-[#3a8f6a]/10 text-[#3a8f6a]',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const IndicatorCard: React.FC<{ title: string; value: string | number; gradient?: string; icon?: React.ReactNode }> = ({ title, value, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconColorMap[gradient] || iconColorMap.teal)}>{icon}</div>}
      </div>
    </CardContent>
  </Card>
);

const pctKeys = ['conversao', 'pctMargemPrevista', 'pctMargemRealizada'];

const CustomTooltip = ({ active, payload, label, isCurrency }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => {
        const isPct = pctKeys.includes(entry.dataKey);
        const formatted = isCurrency ? fmtBRL(entry.value) : isPct ? fmtPct(entry.value) : entry.value;
        return (
          <p key={i} style={{ color: entry.color, margin: 0 }}>
            {capitalize(entry.name)}: {formatted}
          </p>
        );
      })}
    </div>
  );
};

const renderBarLabel = (props: any, isCurrency?: boolean) => {
  const { x, y, width, value } = props;
  if (value == null || value === 0) return null;
  const formatted = isCurrency ? fmtBRL(value) : String(value);
  return (
    <text x={x + width / 2} y={y - 6} fill="hsl(var(--foreground))" fontSize={10} fontWeight={600} textAnchor="middle">
      {formatted}
    </text>
  );
};

const ChartCard: React.FC<{ title: string; data: any[]; dataKey: string; chartH?: number; xTickProps?: any; chartMarginBottom?: number }> = ({ title, data, dataKey, chartH = 300, xTickProps = { fontSize: 10, fill: 'hsl(var(--foreground))' }, chartMarginBottom = 0 }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="nome" tick={xTickProps} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

const MonthChart: React.FC<{ title: string; data: any[]; dataKey: string; isCurrency?: boolean; chartH?: number; xTickProps?: any; chartMarginBottom?: number }> = ({ title, data, dataKey, isCurrency, chartH = 300, xTickProps = { fontSize: 9, fill: 'hsl(var(--foreground))' }, chartMarginBottom = 0 }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={isCurrency ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined} />
          <Tooltip content={<CustomTooltip isCurrency={isCurrency} />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props, isCurrency)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

export default RelatorioShowroom;
