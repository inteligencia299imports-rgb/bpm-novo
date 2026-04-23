import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { abbreviateName } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, CheckCircle, ArrowDownUp, ArrowRightLeft, XCircle, ArrowDownToLine, Repeat, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';

interface RelatorioAvaliacoesProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string) => void;
}

const RelatorioAvaliacoes: React.FC<RelatorioAvaliacoesProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const xTickPropsName = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 10, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [indicadores, setIndicadores] = useState<any>({});
  const [chartByAvaliador, setChartByAvaliador] = useState<any[]>([]);
  const [chartByMonth, setChartByMonth] = useState<any[]>([]);
  const [filterLoja, setFilterLojaState] = useState('todos');

  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v); };

  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterLojaState('todos');
      onFilterChange?.('todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo]);

  const loadData = useCallback(async () => {
    const dfParam = dateFrom ? dateFrom.toISOString() : null;
    const dtParam = dateTo
      ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999).toISOString()
      : null;
    const lojaParam = filterLoja === 'todos' ? 'todos' : filterLoja;

    const [kpisRes, avaliadoresRes, mensalRes] = await Promise.all([
      supabase.rpc('relatorio_avaliacoes_kpis', { _date_from: dfParam, _date_to: dtParam, _loja: lojaParam }),
      supabase.rpc('relatorio_avaliacoes_avaliadores', { _date_from: dfParam, _date_to: dtParam, _loja: lojaParam }),
      supabase.rpc('relatorio_avaliacoes_mensal', { _loja: lojaParam }),
    ]);

    setIndicadores(kpisRes.data || {});
    const avalData = (avaliadoresRes.data || []) as any[];
    setChartByAvaliador(avalData.map((v: any) => ({ ...v, nome: abbreviateName(v.nome || 'Desconhecido') })));
    setChartByMonth((mensalRes.data || []) as any[]);
    setLoading(false);
  }, [dateFrom, dateTo, filterLoja]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    setLoading(true);
    loadData();
    const channel = supabase
      .channel('relatorio-avaliacoes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  const indicadoresNormalizados = {
    totalAvaliacoes: indicadores.total_avaliacoes ?? indicadores.qtdAvaliacoes ?? 0,
    totalAquisicoes: indicadores.total_aquisicoes ?? indicadores.qtdAquisicoes ?? 0,
    aquisicoesPropria: indicadores.aquisicoes_propria ?? indicadores.qtdProprias ?? 0,
    aquisicoesConsignada: indicadores.aquisicoes_consignada ?? indicadores.qtdConsignadas ?? 0,
    aquisicoesConvertida: indicadores.aquisicoes_convertida ?? indicadores.qtdConvertidas ?? 0,
    entradaDireta: indicadores.entrada_direta ?? indicadores.qtdEntradaDireta ?? 0,
    troca: indicadores.troca ?? indicadores.qtdTroca ?? 0,
    retiradas: indicadores.retiradas ?? indicadores.qtdRetiradas ?? 0,
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      <div className="flex flex-wrap items-center gap-1">
        {['todos', '299', 'Ducati'].map(loja => (
          <Button key={loja} size="sm" variant={filterLoja === loja ? 'default' : 'outline'} className={cn('rounded-full px-4 h-8 text-xs font-medium', filterLoja === loja && 'shadow-sm')} onClick={() => setFilterLoja(loja)}>
            {loja === 'todos' ? 'Todas Lojas' : loja}
          </Button>
        ))}
      </div>

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Avaliações" value={indicadoresNormalizados.totalAvaliacoes} gradient="teal" icon={<ClipboardCheck className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições" value={indicadoresNormalizados.totalAquisicoes} subtitle={`(${indicadoresNormalizados.totalAvaliacoes > 0 ? Math.floor((indicadoresNormalizados.totalAquisicoes / indicadoresNormalizados.totalAvaliacoes) * 100) : 0}%)`} gradient="teal" icon={<CheckCircle className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Próprias" value={indicadoresNormalizados.aquisicoesPropria} gradient="teal" icon={<Package className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Consignadas" value={indicadoresNormalizados.aquisicoesConsignada} gradient="teal" icon={<ArrowDownUp className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Convertidas" value={indicadoresNormalizados.aquisicoesConvertida} gradient="purple" icon={<Repeat className="h-5 w-5" />} />
        <IndicatorCard title="Retiradas" value={indicadoresNormalizados.retiradas} gradient="red" icon={<XCircle className="h-5 w-5" />} />
        <IndicatorCard title="Entrada Direta" value={indicadoresNormalizados.entradaDireta} gradient="emerald" icon={<ArrowDownToLine className="h-5 w-5" />} />
        <IndicatorCard title="Troca" value={indicadoresNormalizados.troca} gradient="emerald" icon={<ArrowRightLeft className="h-5 w-5" />} />
      </div>

      {/* Section: Por Avaliador */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Por Avaliador</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Qtd de Avaliações" data={[...chartByAvaliador].filter(v => (v.avaliacoes || 0) > 0).sort((a, b) => b.avaliacoes - a.avaliacoes)} dataKey="avaliacoes" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Qtd Aquisições</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Aquisições</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Conversão (%)</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart
                data={[...chartByAvaliador]
                  .map((v: any) => {
                    const total = (v.aqTrocar || 0) + (v.aqVender || 0);
                    const taxa = v.avaliacoes > 0 ? Math.round((total / v.avaliacoes) * 100) : 0;
                    return { ...v, totalAquisicoes: total, taxaConversao: taxa };
                  })
                  .filter(v => v.totalAquisicoes > 0)
                  .sort((a, b) => b.totalAquisicoes - a.totalAquisicoes)}
                barCategoryGap="25%"
                margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" tick={xTickPropsName} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<AquisicoesAvaliadorTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="totalAquisicoes" name="Aquisições" fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
                <Line yAxisId="right" type="monotone" dataKey="taxaConversao" name="Conversão" stroke="#E8913A" strokeWidth={2.5} dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
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
        <MonthChart title="Avaliações" data={chartByMonth} dataKey="avaliacoes" chartH={chartH} xTickProps={xTickProps} chartMarginBottom={chartMarginBottom} />
        <MonthChart title="Aquisições" data={chartByMonth} dataKey="aquisicoes" chartH={chartH} xTickProps={xTickProps} chartMarginBottom={chartMarginBottom} />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Próprias e Consignadas</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Próprias</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7e6d9b' }} />Consignadas</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <LineChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Line type="monotone" dataKey="proprias" name="Próprias" stroke="#2F6F84" strokeWidth={2.5} dot={{ r: 4, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 }} />
                <Line type="monotone" dataKey="consignadas" name="Consignadas" stroke="#7e6d9b" strokeWidth={2.5} dot={{ r: 4, fill: '#7e6d9b', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'bottom', fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Negociação</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Trocar</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Vender</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={chartByMonth} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar dataKey="negTrocar" name="Trocar" fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
                <Bar dataKey="negVender" name="Vender" fill="#E8913A" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Sub-components
const iconColorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
  purple: 'bg-[#7e6d9b]/10 text-[#7e6d9b]',
  emerald: 'bg-[#3a8f6a]/10 text-[#3a8f6a]',
  red: 'bg-red-500/10 text-red-500',
};

const IndicatorCard: React.FC<{ title: string; value: string | number; subtitle?: string; gradient?: string; icon?: React.ReactNode }> = ({ title, value, subtitle, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}{subtitle && <span className="ml-1">{subtitle}</span>}</p>
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconColorMap[gradient] || iconColorMap.teal)}>{icon}</div>}
      </div>
    </CardContent>
  </Card>
);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color, margin: 0 }}>
          {capitalize(entry.name)}: {entry.value}
        </p>
      ))}
    </div>
  );
};

const AquisicoesAvaliadorTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload || {};
  const propria = d.aqPropria ?? 0;
  const consignada = d.aqConsignada ?? 0;
  const total = d.totalAquisicoes ?? (propria + consignada);
  const taxa = d.taxaConversao ?? 0;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      <p style={{ margin: 0, color: '#2F6F84' }}>Próprias: {propria}</p>
      <p style={{ margin: 0, color: '#7e6d9b' }}>Consignadas: {consignada}</p>
      <p style={{ margin: '4px 0 0', fontWeight: 600 }}>Total: {total}</p>
      <p style={{ margin: 0, color: '#E8913A', fontWeight: 600 }}>Conversão: {taxa}%</p>
    </div>
  );
};

const renderBarLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (value == null || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 6} fill="hsl(var(--foreground))" fontSize={10} fontWeight={600} textAnchor="middle">
      {value}
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

const MonthChart: React.FC<{ title: string; data: any[]; dataKey: string; chartH?: number; xTickProps?: any; chartMarginBottom?: number }> = ({ title, data, dataKey, chartH = 300, xTickProps = { fontSize: 9, fill: 'hsl(var(--foreground))' }, chartMarginBottom = 0 }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

export default RelatorioAvaliacoes;
