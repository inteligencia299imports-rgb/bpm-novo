import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { abbreviateName } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Users, ShoppingCart, CreditCard, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
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

const fmtPctInt = (v: number | null | undefined) => `${Math.round((v ?? 0) * 100)}%`;

interface AtendimentoRow {
  id: string;
  situacao: string;
  loja: string;
  interesse: string;
  vendedor_id: string;
  created_at: string;
}

interface EstoqueRow {
  id: string;
  atendimento_venda_id: string | null;
  data_venda: string | null;
  tipo: string;
}

interface VendedorInfo {
  user_id: string;
  nome: string;
}

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
  const [atendimentos, setAtendimentos] = useState<AtendimentoRow[]>([]);
  const [estoqueItems, setEstoqueItems] = useState<EstoqueRow[]>([]);
  const [vendedores, setVendedores] = useState<VendedorInfo[]>([]);
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
    const [atRes, esRes, vdRes] = await Promise.all([
      supabase.from('atendimentos').select('id, situacao, loja, interesse, vendedor_id, created_at'),
      supabase.from('estoque').select('id, atendimento_venda_id, data_venda, tipo'),
      supabase.from('user_roles').select('user_id, nome').eq('role', 'vendedor'),
    ]);
    setAtendimentos((atRes.data || []) as AtendimentoRow[]);
    setEstoqueItems((esRes.data || []) as EstoqueRow[]);
    setVendedores((vdRes.data || []) as VendedorInfo[]);
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
      .channel('relatorio-vendedores-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  const normLoja = (loja: string) => loja?.toUpperCase().includes('DUCATI') ? 'Ducati' : '299';

  const vendedorMap = useMemo(() => {
    const map: Record<string, string> = {};
    vendedores.forEach(v => { map[v.user_id] = v.nome; });
    return map;
  }, [vendedores]);

  const estoqueByAtendimentoVenda = useMemo(() => {
    const map: Record<string, EstoqueRow[]> = {};
    estoqueItems.forEach(e => {
      if (e.atendimento_venda_id) {
        if (!map[e.atendimento_venda_id]) map[e.atendimento_venda_id] = [];
        map[e.atendimento_venda_id].push(e);
      }
    });
    return map;
  }, [estoqueItems]);

  // Filter by loja
  const filteredAtendimentos = useMemo(() => {
    return atendimentos.filter(a => {
      if (filterLoja !== 'todos' && normLoja(a.loja) !== filterLoja) return false;
      return true;
    });
  }, [atendimentos, filterLoja]);

  // Only comprar/trocar, filtered by date
  const atendimentosFiltradosPorData = useMemo(() => {
    return filteredAtendimentos.filter(a => {
      if (a.interesse !== 'comprar' && a.interesse !== 'trocar') return false;
      if (dateFrom) {
        const d = new Date(a.created_at);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(a.created_at);
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (d > endOfDay) return false;
      }
      return true;
    });
  }, [filteredAtendimentos, dateFrom, dateTo]);

  // Vendidos filtered by data_venda in estoque
  const vendidos = useMemo(() => {
    return filteredAtendimentos.filter(a => {
      if (a.situacao !== 'vendido') return false;
      const estoques = estoqueByAtendimentoVenda[a.id] || [];
      return estoques.some(e => {
        if (dateFrom && e.data_venda) {
          const dv = new Date(e.data_venda);
          if (dv < dateFrom) return false;
        }
        if (dateTo && e.data_venda) {
          const dv = new Date(e.data_venda);
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (dv > endOfDay) return false;
        }
        return true;
      });
    });
  }, [filteredAtendimentos, estoqueByAtendimentoVenda, dateFrom, dateTo]);

  const sinais = useMemo(() => {
    return filteredAtendimentos.filter(a => a.situacao === 'sinal');
  }, [filteredAtendimentos]);

  // ===== MY indicators (for vendedor role) =====
  const myIndicadores = useMemo(() => {
    if (!user) return null;
    const myAtend = atendimentosFiltradosPorData.filter(a => a.vendedor_id === user.id);
    const myVendas = vendidos.filter(a => a.vendedor_id === user.id);
    const mySinais = sinais.filter(a => a.vendedor_id === user.id);
    const qtdAtendimentos = myAtend.length;
    const qtdVendas = myVendas.length;
    const qtdSinais = mySinais.length;
    const taxaConversao = qtdAtendimentos > 0 ? qtdVendas / qtdAtendimentos : 0;
    return { qtdAtendimentos, qtdVendas, qtdSinais, taxaConversao };
  }, [user, atendimentosFiltradosPorData, vendidos, sinais]);

  // ===== Charts by vendedor =====
  const chartByVendedor = useMemo(() => {
    const vendedorIds = [...new Set(filteredAtendimentos.map(a => a.vendedor_id))].filter(vid => vendedorMap[vid]);
    return vendedorIds.map(vid => {
      const vendAtend = atendimentosFiltradosPorData.filter(a => a.vendedor_id === vid);
      const vendVendas = vendidos.filter(a => a.vendedor_id === vid);
      const vendSinais = sinais.filter(a => a.vendedor_id === vid);
      const qtdAtend = vendAtend.length;
      const qtdVendas = vendVendas.length;
      const qtdSinais = vendSinais.length;
      return {
        nome: abbreviateName(vendedorMap[vid] || 'Desconhecido'),
        atendimentos: qtdAtend,
        vendas: qtdVendas,
        sinais: qtdSinais,
        conversao: qtdAtend > 0 ? qtdVendas / qtdAtend : 0,
      };
    }).filter(v => v.atendimentos > 0 || v.vendas > 0 || v.sinais > 0);
  }, [filteredAtendimentos, atendimentosFiltradosPorData, vendidos, sinais, vendedorMap]);

  // ===== Charts by month =====
  const chartByMonth = useMemo(() => {
    const months = generateCustomMonths();
    return months.map(m => {
      const atendMonth = filteredAtendimentos.filter(a => {
        if (a.interesse !== 'comprar' && a.interesse !== 'trocar') return false;
        const d = new Date(a.created_at);
        return d >= m.start && d <= m.end;
      });
      const vendidosMonth = filteredAtendimentos.filter(a => {
        if (a.situacao !== 'vendido') return false;
        const estoques = estoqueByAtendimentoVenda[a.id] || [];
        return estoques.some(e => {
          if (!e.data_venda) return false;
          const dv = new Date(e.data_venda);
          return dv >= m.start && dv <= m.end;
        });
      });
      const sinaisMonth = filteredAtendimentos.filter(a => {
        if (a.situacao !== 'sinal') return false;
        const d = new Date(a.created_at);
        return d >= m.start && d <= m.end;
      });
      const conversao = atendMonth.length > 0 ? vendidosMonth.length / atendMonth.length : 0;
      return {
        label: m.label,
        atendimentos: atendMonth.length,
        vendas: vendidosMonth.length,
        sinais: sinaisMonth.length,
        conversao,
      };
    });
  }, [filteredAtendimentos, estoqueByAtendimentoVenda]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      {/* Loja filter */}
      <div className="flex flex-wrap items-center gap-1">
        {['todos', '299', 'Ducati'].map(loja => (
          <Button
            key={loja}
            size="sm"
            variant={filterLoja === loja ? 'default' : 'outline'}
            className={cn('rounded-full px-4 h-8 text-xs font-medium', filterLoja === loja && 'shadow-sm')}
            onClick={() => setFilterLoja(loja)}
          >
            {loja === 'todos' ? 'Todas Lojas' : loja}
          </Button>
        ))}
      </div>

      {/* Indicators - only own data for vendedor, all for gestor */}
      {myIndicadores && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <IndicatorCard title="Atendimentos" value={myIndicadores.qtdAtendimentos} icon={<Users className="h-5 w-5" />} />
          <IndicatorCard
            title="Vendas"
            value={`${myIndicadores.qtdVendas} (${fmtPctInt(myIndicadores.taxaConversao)})`}
            icon={<ShoppingCart className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Section: Por Vendedor */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Por Vendedor</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Atendimentos" data={[...chartByVendedor].sort((a, b) => b.atendimentos - a.atendimentos)} dataKey="atendimentos" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <ChartCard title="Vendas" data={[...chartByVendedor].sort((a, b) => b.vendas - a.vendas)} dataKey="vendas" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Taxa de Conversão (%)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <AreaChart data={[...chartByVendedor].sort((a, b) => b.conversao - a.conversao)} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <defs>
                  <linearGradient id="gradConversaoVend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2F6F84" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2F6F84" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" tick={xTickPropsName} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="conversao" stroke="#2F6F84" strokeWidth={2.5} fill="url(#gradConversaoVend)" dot={{ r: 5, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600, formatter: (v: number) => fmtPctInt(v) }} />
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
        
      </div>
    </div>
  );
};

// Sub-components
const iconColorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
};

const IndicatorCard: React.FC<{ title: string; value: string | number; icon?: React.ReactNode }> = ({ title, value, icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconColorMap.teal)}>{icon}</div>}
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

export default RelatorioVendedores;
