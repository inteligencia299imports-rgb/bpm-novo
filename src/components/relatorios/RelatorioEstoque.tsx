import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, CheckCircle, ShieldAlert, Ban, Wrench, Clock, DollarSign, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';

function getCustomMonthLabel(startDate: Date): string {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(endDate.getDate() - 1);
  return `${format(startDate, 'dd/MM', { locale: ptBR })} - ${format(endDate, 'dd/MM', { locale: ptBR })}`;
}

function generateCustomMonths(): { start: Date; end: Date; label: string }[] {
  const months: { start: Date; end: Date; label: string }[] = [];
  const now = new Date();
  let current = new Date(2025, 11, 21);
  while (current <= now) {
    const end = new Date(current);
    end.setMonth(end.getMonth() + 1);
    end.setDate(20);
    end.setHours(23, 59, 59, 999);
    months.push({ start: new Date(current), end, label: getCustomMonthLabel(current) });
    current = new Date(current);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v: number) => `${Math.round(v)}%`;

interface EstoqueRow {
  id: string;
  status: string;
  preco: number | null;
  data_entrada: string;
  data_venda: string | null;
}

interface AvaliacaoPrep {
  id: string;
  situacao: string;
  quanto_pede: number | null;
  created_at: string;
}

interface RelatorioEstoqueProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string) => void;
}

const RelatorioEstoque: React.FC<RelatorioEstoqueProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;
  const [loading, setLoading] = useState(true);
  const [estoque, setEstoque] = useState<EstoqueRow[]>([]);
  const [preparacao, setPreparacao] = useState<AvaliacaoPrep[]>([]);
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
    const [estoqueRes, avalRes] = await Promise.all([
      supabase.from('estoque').select('id, status, preco, data_entrada, data_venda'),
      supabase.from('avaliacoes').select('id, situacao, quanto_pede, created_at'),
    ]);
    setEstoque((estoqueRes.data || []) as EstoqueRow[]);
    setPreparacao(((avalRes.data || []) as AvaliacaoPrep[]).filter(a => a.situacao === 'adquirida'));
    setLoading(false);
  }, []);

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

  // Current stock = not sold (no data_venda) and not vendido status
  const currentStock = useMemo(() => estoque.filter(e => e.status !== 'vendido'), [estoque]);

  const indicadores = useMemo(() => {
    const activeStatuses = ['disponivel', 'indisponivel', 'servico', 'bloqueio_juridico'];
    const motosEstoque = currentStock.filter(e => activeStatuses.includes(e.status));
    const total = motosEstoque.length;

    const disponivel = motosEstoque.filter(e => e.status === 'disponivel');
    const bloqueio = motosEstoque.filter(e => e.status === 'bloqueio_juridico');
    const indisponivel = motosEstoque.filter(e => e.status === 'indisponivel');
    const servico = motosEstoque.filter(e => e.status === 'servico');

    const sumPreco = (items: EstoqueRow[]) => items.reduce((s, e) => s + (e.preco ?? 0), 0);

    const qtdPreparacao = preparacao.length;
    const somaQuantoPede = preparacao.reduce((s, a) => s + (a.quanto_pede ?? 0), 0);

    const patrimonioDisponivel = sumPreco(disponivel);
    const patrimonioParado = sumPreco(bloqueio) + sumPreco(indisponivel) + sumPreco(servico);

    const now = new Date();
    const avgDays = (items: EstoqueRow[]) =>
      items.length > 0
        ? Math.round(items.reduce((s, e) => s + Math.max(0, Math.floor((now.getTime() - new Date(e.data_entrada).getTime()) / 86400000)), 0) / items.length)
        : 0;

    const avgDaysPrep = preparacao.length > 0
      ? Math.round(preparacao.reduce((s, a) => s + Math.max(0, Math.floor((now.getTime() - new Date(a.created_at).getTime()) / 86400000)), 0) / preparacao.length)
      : 0;

    return {
      total,
      mediaDias: avgDays(motosEstoque),
      disponivel: { qtd: disponivel.length, pct: total > 0 ? (disponivel.length / total) * 100 : 0, soma: sumPreco(disponivel), mediaDias: avgDays(disponivel) },
      bloqueio: { qtd: bloqueio.length, pct: total > 0 ? (bloqueio.length / total) * 100 : 0, soma: sumPreco(bloqueio), mediaDias: avgDays(bloqueio) },
      indisponivel: { qtd: indisponivel.length, pct: total > 0 ? (indisponivel.length / total) * 100 : 0, soma: sumPreco(indisponivel), mediaDias: avgDays(indisponivel) },
      servico: { qtd: servico.length, pct: total > 0 ? (servico.length / total) * 100 : 0, soma: sumPreco(servico), mediaDias: avgDays(servico) },
      qtdPreparacao,
      somaQuantoPede,
      mediaDiasPrep: avgDaysPrep,
      patrimonioDisponivel,
      patrimonioParado,
    };
  }, [currentStock, preparacao]);

  // Monthly charts
  const chartByMonth = useMemo(() => {
    const months = generateCustomMonths();
    return months.map((m, idx) => {
      // Entradas: estoque entries with data_entrada in this month
      const entradas = estoque.filter(e => {
        const d = new Date(e.data_entrada);
        return d >= m.start && d <= m.end;
      }).length;

      // Saídas: estoque entries with data_venda in this month
      const saidas = estoque.filter(e => {
        if (!e.data_venda) return false;
        const d = new Date(e.data_venda);
        return d >= m.start && d <= m.end;
      }).length;

      // Disponíveis at end of month: entered before end AND (not sold OR sold after end)
      const disponiveis = estoque.filter(e => {
        const entrada = new Date(e.data_entrada);
        if (entrada > m.end) return false;
        if (!e.data_venda) return true;
        const venda = new Date(e.data_venda);
        return venda > m.end;
      }).length;

      // Giro: saidas / estoque at start of month
      const estoqueInicio = estoque.filter(e => {
        const entrada = new Date(e.data_entrada);
        if (entrada >= m.start) return false;
        if (!e.data_venda) return true;
        const venda = new Date(e.data_venda);
        return venda >= m.start;
      }).length;

      const giro = estoqueInicio > 0 ? (saidas / estoqueInicio) * 100 : 0;

      // Patrimônio disponível at end of month
      const patrimonioDisp = estoque.filter(e => {
        const entrada = new Date(e.data_entrada);
        if (entrada > m.end) return false;
        if (e.status !== 'disponivel' && e.data_venda) {
          const venda = new Date(e.data_venda);
          if (venda <= m.end) return false;
        }
        if (!e.data_venda) return true;
        const venda = new Date(e.data_venda);
        return venda > m.end;
      }).reduce((s, e) => s + (e.preco ?? 0), 0);

      return {
        label: m.label,
        disponiveis,
        entradas,
        saidas,
        giro: Math.round(giro * 10) / 10,
        patrimonioDisp,
      };
    });
  }, [estoque]);

  // Patrimônio growth
  const patrimonioGrowth = useMemo(() => {
    return chartByMonth.map((m, idx) => {
      const prev = idx > 0 ? chartByMonth[idx - 1].patrimonioDisp : 0;
      const crescimento = prev > 0 ? ((m.patrimonioDisp - prev) / prev) * 100 : 0;
      return {
        ...m,
        crescimento: Math.round(crescimento * 10) / 10,
      };
    });
  }, [chartByMonth]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Motos no Estoque" value={indicadores.total} subline={`Média: ${indicadores.mediaDias} dias`} gradient="teal" icon={<Package className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Disponível" value={indicadores.disponivel.qtd} subtitle={`(${fmtPct(indicadores.disponivel.pct)})`} subline={`Média: ${indicadores.disponivel.mediaDias} dias (${fmtBRL(indicadores.disponivel.soma)})`} gradient="teal" icon={<CheckCircle className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Bloqueio Jurídico" value={indicadores.bloqueio.qtd} subtitle={`(${fmtPct(indicadores.bloqueio.pct)})`} subline={`Média: ${indicadores.bloqueio.mediaDias} dias (${fmtBRL(indicadores.bloqueio.soma)})`} gradient="gray" icon={<ShieldAlert className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Indisponível" value={indicadores.indisponivel.qtd} subtitle={`(${fmtPct(indicadores.indisponivel.pct)})`} subline={`Média: ${indicadores.indisponivel.mediaDias} dias (${fmtBRL(indicadores.indisponivel.soma)})`} gradient="red" icon={<Ban className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCardWithSub title="Serviço" value={indicadores.servico.qtd} subtitle={`(${fmtPct(indicadores.servico.pct)})`} subline={`Média: ${indicadores.servico.mediaDias} dias (${fmtBRL(indicadores.servico.soma)})`} gradient="orange" icon={<Wrench className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Em Preparação" value={indicadores.qtdPreparacao} subline={`Média: ${indicadores.mediaDiasPrep} dias (${fmtBRL(indicadores.somaQuantoPede)})`} gradient="purple" icon={<Clock className="h-5 w-5" />} />
        <IndicatorCard title="Patrimônio Disponível" value={fmtBRL(indicadores.patrimonioDisponivel)} gradient="teal" icon={<DollarSign className="h-5 w-5" />} />
        <IndicatorCard title="Patrimônio Parado" value={fmtBRL(indicadores.patrimonioParado)} gradient="red" icon={<TrendingDown className="h-5 w-5" />} />
      </div>

      {/* Section: Resultado do Ano */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Resultado do Ano</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quantidade */}
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
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartByMonth} margin={{ top: 16, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
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

        {/* Patrimônio */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Patrimônio Disponível</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Patrimônio</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3a8f6a' }} />Crescimento %</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={patrimonioGrowth} margin={{ top: 16, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
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
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}{subtitle && <span className="ml-1">{subtitle}</span>}</p>
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
