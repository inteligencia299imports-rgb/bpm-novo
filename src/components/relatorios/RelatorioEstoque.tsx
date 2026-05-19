import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, CheckCircle, ShieldAlert, Ban, Wrench, Clock, DollarSign, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { LojaFilter } from './LojaFilter';


const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${Math.round(v)}%`;

interface RelatorioEstoqueProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string, tipo: string) => void;
}

type TipoFilter = 'todos' | 'propria' | 'consignada';

const RelatorioEstoque: React.FC<RelatorioEstoqueProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [indicadores, setIndicadores] = useState<any>({});
  const [chartByMonth, setChartByMonth] = useState<any[]>([]);
  const [filterLoja, setFilterLojaState] = useState('todos');
  const [filterTipo, setFilterTipoState] = useState<TipoFilter>('todos');

  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v, filterTipo); };
  const setFilterTipo = (v: TipoFilter) => { setFilterTipoState(v); onFilterChange?.(filterLoja, v); };

  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterLojaState('todos');
      setFilterTipoState('todos');
      onFilterChange?.('todos', 'todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo]);

  const loadData = useCallback(async () => {
    const cutoff = (dateTo ?? new Date()).toISOString();
    const [kpisRes, mensalRes] = await Promise.all([
      supabase.rpc('relatorio_estoque_kpis', { p_cutoff: cutoff, p_loja: filterLoja, p_tipo: filterTipo }),
      supabase.rpc('relatorio_estoque_mensal', { p_cutoff: cutoff, p_loja: filterLoja, p_tipo: filterTipo }),
    ]);

    setIndicadores(kpisRes.data || {});
    setChartByMonth((mensalRes.data || []) as any[]);
    setLoading(false);
  }, [dateTo, filterLoja, filterTipo]);


  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    setLoading(true);
    loadData();
    const channel = supabase
      .channel('relatorio-estoque-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  const patrimonioGrowth = useMemo(() => {
    return chartByMonth.map((m: any, idx: number) => {
      const prev = idx > 0 ? chartByMonth[idx - 1].patrimonioDisp : 0;
      const crescimento = prev > 0 ? Math.round(((m.patrimonioDisp - prev) / prev) * 1000) / 10 : 0;
      return { ...m, crescimento };
    });
  }, [chartByMonth]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  const d = indicadores.disponivel || {};
  const b = indicadores.bloqueio || {};
  const ind = indicadores.indisponivel || {};
  const s = indicadores.servico || {};

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Motos no Estoque" value={indicadores.total ?? 0} subline={`Média: ${indicadores.mediaDias ?? 0} dias (${fmtBRL(indicadores.somaTotal)})`} gradient="teal" icon={<Package className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Disponível" value={d.qtd ?? 0} subtitle={`(${fmtPct(d.pct ?? 0)})`} subline={`Média: ${d.mediaDias ?? 0} dias (${fmtBRL(d.soma)})`} gradient="teal" icon={<CheckCircle className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Bloqueio Jurídico" value={b.qtd ?? 0} subtitle={`(${fmtPct(b.pct ?? 0)})`} subline={`Média: ${b.mediaDias ?? 0} dias (${fmtBRL(b.soma)})`} gradient="gray" icon={<ShieldAlert className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Indisponível" value={ind.qtd ?? 0} subtitle={`(${fmtPct(ind.pct ?? 0)})`} subline={`Média: ${ind.mediaDias ?? 0} dias (${fmtBRL(ind.soma)})`} gradient="red" icon={<Ban className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCardWithSub title="Serviço" value={s.qtd ?? 0} subtitle={`(${fmtPct(s.pct ?? 0)})`} subline={`Média: ${s.mediaDias ?? 0} dias (${fmtBRL(s.soma)})`} gradient="orange" icon={<Wrench className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Em Preparação" value={indicadores.qtdPreparacao ?? 0} subline={`Média: ${indicadores.mediaDiasPrep ?? 0} dias (${fmtBRL(indicadores.somaQuantoPede)})`} gradient="purple" icon={<Clock className="h-5 w-5" />} />
        <IndicatorCard title="Patrimônio Disponível" value={fmtBRL(indicadores.patrimonioDisponivel)} gradient="teal" icon={<DollarSign className="h-5 w-5" />} />
        <IndicatorCard title="Patrimônio Parado" value={fmtBRL(indicadores.patrimonioParado)} gradient="red" icon={<TrendingDown className="h-5 w-5" />} />
      </div>

      {/* Section: Resultado do Ano */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Resultado do Ano</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Quantidade</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Disponíveis</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3a8f6a' }} />Entradas</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Saídas</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7e6d9b' }} />Giro %</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart data={chartByMonth} margin={{ top: 16, right: 10, left: -10, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="disponiveis" name="Disponíveis" fill="#2F6F84" radius={[8, 8, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="entradas" name="Entradas" stroke="#3a8f6a" strokeWidth={2.5} dot={{ r: 4, fill: '#3a8f6a', stroke: '#fff', strokeWidth: 2 }} />
                <Line yAxisId="left" type="monotone" dataKey="saidas" name="Saídas" stroke="#E8913A" strokeWidth={2.5} dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
                <Line yAxisId="right" type="monotone" dataKey="giro" name="Giro %" stroke="#7e6d9b" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 4, fill: '#7e6d9b', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Patrimônio Disponível</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Patrimônio</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3a8f6a' }} />Crescimento %</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart data={patrimonioGrowth} margin={{ top: 16, right: 10, left: -10, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<PatrimonioTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="patrimonioDisp" name="Patrimônio" fill="#2F6F84" radius={[8, 8, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="crescimento" name="Crescimento %" stroke="#3a8f6a" strokeWidth={2.5} dot={{ r: 4, fill: '#3a8f6a', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
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
  orange: 'bg-orange-500/10 text-orange-500',
  gray: 'bg-gray-500/10 text-gray-500',
};

const IndicatorCard: React.FC<{ title: string; value: string | number; subline?: string; gradient?: string; icon?: React.ReactNode }> = ({ title, value, subline, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
          {subline && <p className="text-xs text-muted-foreground truncate">{subline}</p>}
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconColorMap[gradient] || iconColorMap.teal)}>{icon}</div>}
      </div>
    </CardContent>
  </Card>
);

const IndicatorCardWithSub: React.FC<{ title: string; value: number; subtitle?: string; subline?: string; gradient?: string; icon?: React.ReactNode }> = ({ title, value, subtitle, subline, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}{subtitle && <span className="ml-1 text-base text-muted-foreground">{subtitle}</span>}</p>
          {subline && <p className="text-xs text-muted-foreground truncate">{subline}</p>}
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
          {capitalize(entry.name)}: {entry.dataKey === 'giro' ? `${entry.value}%` : entry.value}
        </p>
      ))}
    </div>
  );
};

const PatrimonioTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color, margin: 0 }}>
          {capitalize(entry.name)}: {entry.dataKey === 'crescimento' ? `${entry.value}%` : fmtBRL(entry.value)}
        </p>
      ))}
    </div>
  );
};

export default RelatorioEstoque;
