import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { abbreviateName, fmtInt } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Check, CreditCard, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { toSaoPauloEndOfDayIso, toSaoPauloStartOfDayIso } from '@/lib/reportDateRange';
import { getPreviousPeriodIso } from '@/lib/reportComparison';
import { useIsMobile } from '@/hooks/use-mobile';
import { LojaFilter } from './LojaFilter';
import DeltaBadge from './DeltaBadge';

const fmtPctInt = (v: number | null | undefined) => `${Math.round((v ?? 0) * 100)}%`;

interface Props {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string) => void;
}

const RelatorioVendedores: React.FC<Props> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const { user, role } = useAuth();
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const xTickPropsName = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 10, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [myIndicadores, setMyIndicadores] = useState<any>(null);
  const [chartByVendedor, setChartByVendedor] = useState<any[]>([]);
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
    if (!user) return;
    const dfParam = toSaoPauloStartOfDayIso(dateFrom);
    const dtParam = toSaoPauloEndOfDayIso(dateTo);

    const [myKpisRes, equipeRes, mensalRes] = await Promise.all([
      supabase.rpc('relatorio_vendedor_kpis', { _user_id: user.id, _date_from: dfParam, _date_to: dtParam, _loja: filterLoja }),
      supabase.rpc('relatorio_vendedor_equipe', { _date_from: dfParam, _date_to: dtParam, _loja: filterLoja }),
      supabase.rpc('relatorio_vendedor_mensal', { _user_id: user.id, _loja: filterLoja }),
    ]);

    setMyIndicadores(myKpisRes.data || {});
    const equipeData = (equipeRes.data || []) as any[];
    setChartByVendedor(equipeData.map((v: any) => ({ ...v, nome: abbreviateName(v.nome || 'Desconhecido') })));
    setChartByMonth((mensalRes.data || []) as any[]);
    setLoading(false);
  }, [user, dateFrom, dateTo, filterLoja]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    setLoading(true);
    loadData();
    const channel = supabase
      .channel('relatorio-vendedores-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      <LojaFilter value={filterLoja} onChange={setFilterLoja} />

      {myIndicadores && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <IndicatorCard title="Atendimentos" value={fmtInt(myIndicadores.qtdAtendimentos ?? 0)} icon={<Users className="h-5 w-5" />} />
          <IndicatorCard title="Sinais" value={fmtInt(myIndicadores.qtdSinais ?? 0)} icon={<CreditCard className="h-5 w-5" />} iconClass="bg-purple-100 text-purple-600" />
          <IndicatorCard
            title="Vendas"
            value={`${fmtInt(myIndicadores.qtdVendas ?? 0)} (${fmtPctInt(myIndicadores.taxaConversao ?? 0)})`}
            icon={<Check className="h-5 w-5 text-green-600" />}
            iconClass="bg-green-100 text-green-600"
          />
        </div>
      )}

      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Resultado da Equipe</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Atendimentos" data={[...chartByVendedor].filter(d => d.atendimentos > 0).sort((a, b) => b.atendimentos - a.atendimentos)} dataKey="atendimentos" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <ChartCard title="Vendas" data={[...chartByVendedor].filter(d => d.vendas > 0).sort((a, b) => b.vendas - a.vendas)} dataKey="vendas" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <ChartCard title="Sinais" data={[...chartByVendedor].filter(d => d.sinais > 0).sort((a, b) => b.sinais - a.sinais)} dataKey="sinais" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} fillColor="#7e6d9b" />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Taxa de Conversão</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <AreaChart data={[...chartByVendedor].filter(d => d.conversao > 0).sort((a, b) => b.conversao - a.conversao)} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <defs>
                  <linearGradient id="gradConversaoEquipe" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8913A" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#E8913A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" tick={xTickPropsName} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtPctInt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Area type="monotone" dataKey="conversao" name="Conversão (%)" stroke="#E8913A" strokeWidth={2.5} fill="url(#gradConversaoEquipe)" dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Seus Resultados no Ano</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MonthChart title="Atendimentos" data={chartByMonth} dataKey="atendimentos" chartH={chartH} xTickProps={xTickProps} chartMarginBottom={chartMarginBottom} />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Vendas / Taxa de Conversão</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <defs>
                  <linearGradient id="gradConversaoAno" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8913A" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#E8913A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtPctInt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="vendas" name="Vendas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={28} />
                <Area yAxisId="right" type="monotone" dataKey="conversao" name="Conversão (%)" stroke="#E8913A" strokeWidth={2.5} fill="url(#gradConversaoAno)" dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
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
};

const IndicatorCard: React.FC<{ title: string; value: string | number; icon?: React.ReactNode; iconClass?: string }> = ({ title, value, icon, iconClass }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconClass || iconColorMap.teal)}>{icon}</div>}
      </div>
    </CardContent>
  </Card>
);

const pctKeys = ['conversao'];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => {
        const isPct = pctKeys.includes(entry.dataKey);
        const formatted = isPct ? fmtPctInt(entry.value) : entry.value;
        return (
          <p key={i} style={{ color: entry.color, margin: 0 }}>
            {capitalize(entry.name)}: {formatted}
          </p>
        );
      })}
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

const ChartCard: React.FC<{ title: string; data: any[]; dataKey: string; chartH?: number; xTickProps?: any; chartMarginBottom?: number; fillColor?: string }> = ({ title, data, dataKey, chartH = 300, xTickProps = { fontSize: 10, fill: 'hsl(var(--foreground))' }, chartMarginBottom = 0, fillColor = '#2F6F84' }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="nome" tick={xTickProps} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill={fillColor} radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
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

export default RelatorioVendedores;
