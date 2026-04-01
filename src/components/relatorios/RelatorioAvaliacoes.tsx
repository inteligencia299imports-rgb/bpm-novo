import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, ShoppingCart, ArrowDownUp, ArrowRightLeft, RotateCcw, Truck, Repeat, Package } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';

// Reuse custom month logic from Showroom
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

const fmtPct = (v: number | null | undefined) => {
  const raw = (v ?? 0) * 100;
  return `${(Math.round(raw * 10) / 10).toFixed(1)}%`;
};

interface AvaliacaoRow {
  id: string;
  atendimento_id: string;
  situacao: string;
  tipo_aquisicao: string | null;
  avaliador_id: string | null;
  created_at: string;
  negociacao: string | null;
}

interface AtendimentoRow {
  id: string;
  nome_cliente: string;
  interesse: string;
  loja: string;
  vendedor_id: string;
}

interface AvaliadorInfo {
  user_id: string;
  nome: string;
}

interface RelatorioAvaliacoesProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string) => void;
}

const RelatorioAvaliacoes: React.FC<RelatorioAvaliacoesProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const [loading, setLoading] = useState(true);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoRow[]>([]);
  const [avaliadores, setAvaliadores] = useState<AvaliadorInfo[]>([]);
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
    const [avRes, atRes, urRes] = await Promise.all([
      supabase.from('avaliacoes').select('id, atendimento_id, situacao, tipo_aquisicao, avaliador_id, created_at, negociacao'),
      supabase.from('atendimentos').select('id, nome_cliente, interesse, loja, vendedor_id'),
      supabase.from('user_roles').select('user_id, nome').eq('role', 'avaliador'),
    ]);
    setAvaliacoes((avRes.data || []) as AvaliacaoRow[]);
    setAtendimentos((atRes.data || []) as AtendimentoRow[]);
    setAvaliadores((urRes.data || []) as AvaliadorInfo[]);
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
      .channel('relatorio-avaliacoes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  const normLoja = (loja: string) => loja?.toUpperCase().includes('DUCATI') ? 'Ducati' : '299';

  const atendimentoMap = useMemo(() => {
    const map: Record<string, AtendimentoRow> = {};
    atendimentos.forEach(a => { map[a.id] = a; });
    return map;
  }, [atendimentos]);

  const avaliadorMap = useMemo(() => {
    const map: Record<string, string> = {};
    avaliadores.forEach(a => { map[a.user_id] = a.nome; });
    return map;
  }, [avaliadores]);

  // Filtered avaliacoes: by loja, date, and interesse (trocar/vender)
  const filtered = useMemo(() => {
    return avaliacoes.filter(av => {
      const atend = atendimentoMap[av.atendimento_id];
      if (!atend) return false;
      if (atend.interesse !== 'trocar' && atend.interesse !== 'vender') return false;
      if (filterLoja !== 'todos' && normLoja(atend.loja) !== filterLoja) return false;
      if (dateFrom) {
        const d = new Date(av.created_at);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(av.created_at);
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (d > endOfDay) return false;
      }
      return true;
    });
  }, [avaliacoes, atendimentoMap, filterLoja, dateFrom, dateTo]);

  // Indicators
  const indicadores = useMemo(() => {
    const qtdAvaliacoes = filtered.length;
    const aquisicoes = filtered.filter(a => !!a.tipo_aquisicao);
    const qtdAquisicoes = aquisicoes.length;
    const qtdProprias = aquisicoes.filter(a => isTipoPropria(a.tipo_aquisicao) && a.tipo_aquisicao !== 'convertida').length;
    const qtdConsignadas = aquisicoes.filter(a => isTipoConsignada(a.tipo_aquisicao)).length;
    const qtdConvertidas = aquisicoes.filter(a => a.tipo_aquisicao === 'convertida').length;
    const qtdRetiradas = filtered.filter(a => a.situacao === 'dispensada').length;

    const qtdEntradaDireta = filtered.filter(a => {
      const atend = atendimentoMap[a.atendimento_id];
      return atend?.interesse === 'vender';
    }).length;

    const qtdTroca = filtered.filter(a => {
      const atend = atendimentoMap[a.atendimento_id];
      return atend?.interesse === 'trocar';
    }).length;

    return { qtdAvaliacoes, qtdAquisicoes, qtdProprias, qtdConsignadas, qtdConvertidas, qtdRetiradas, qtdEntradaDireta, qtdTroca };
  }, [filtered, atendimentoMap]);

  // Charts by avaliador
  const chartByAvaliador = useMemo(() => {
    const avaliadorIds = [...new Set(filtered.map(a => a.avaliador_id).filter(Boolean))] as string[];
    return avaliadorIds.map(aid => {
      const avAvaliacoes = filtered.filter(a => a.avaliador_id === aid);
      const avAquisicoes = avAvaliacoes.filter(a => a.situacao === 'adquirida');
      const aqTrocar = avAquisicoes.filter(a => atendimentoMap[a.atendimento_id]?.interesse === 'trocar').length;
      const aqVender = avAquisicoes.filter(a => atendimentoMap[a.atendimento_id]?.interesse === 'vender').length;
      return {
        nome: avaliadorMap[aid] || 'Desconhecido',
        avaliacoes: avAvaliacoes.length,
        aqTrocar,
        aqVender,
      };
    }).filter(v => v.avaliacoes > 0);
  }, [filtered, avaliadorMap, atendimentoMap]);

  // Charts by month
  const chartByMonth = useMemo(() => {
    // Use all avaliacoes (not date-filtered) for monthly breakdown
    const allFiltered = avaliacoes.filter(av => {
      const atend = atendimentoMap[av.atendimento_id];
      if (!atend) return false;
      if (atend.interesse !== 'trocar' && atend.interesse !== 'vender') return false;
      if (filterLoja !== 'todos' && normLoja(atend.loja) !== filterLoja) return false;
      return true;
    });

    const months = generateCustomMonths();
    return months.map(m => {
      const inMonth = allFiltered.filter(av => {
        const d = new Date(av.created_at);
        return d >= m.start && d <= m.end;
      });
      const aquisicoes = inMonth.filter(a => a.situacao === 'adquirida');
      const proprias = aquisicoes.filter(a => isTipoPropria(a.tipo_aquisicao)).length;
      const consignadas = aquisicoes.filter(a => isTipoConsignada(a.tipo_aquisicao)).length;
      const negTrocar = inMonth.filter(a => atendimentoMap[a.atendimento_id]?.interesse === 'trocar').length;
      const negVender = inMonth.filter(a => atendimentoMap[a.atendimento_id]?.interesse === 'vender').length;

      return {
        label: m.label,
        avaliacoes: inMonth.length,
        aquisicoes: aquisicoes.length,
        proprias,
        consignadas,
        negTrocar,
        negVender,
      };
    });
  }, [avaliacoes, atendimentoMap, filterLoja]);

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

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Avaliações" value={indicadores.qtdAvaliacoes} gradient="teal" icon={<ClipboardCheck className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições" value={indicadores.qtdAquisicoes} gradient="teal" icon={<ShoppingCart className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Próprias" value={indicadores.qtdProprias} gradient="teal" icon={<Package className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Consignadas" value={indicadores.qtdConsignadas} gradient="teal" icon={<ArrowDownUp className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Convertidas" value={indicadores.qtdConvertidas} gradient="purple" icon={<Repeat className="h-5 w-5" />} />
        <IndicatorCard title="Retiradas" value={indicadores.qtdRetiradas} gradient="purple" icon={<RotateCcw className="h-5 w-5" />} />
        <IndicatorCard title="Entrada Direta" value={indicadores.qtdEntradaDireta} gradient="emerald" icon={<Truck className="h-5 w-5" />} />
        <IndicatorCard title="Troca" value={indicadores.qtdTroca} gradient="emerald" icon={<ArrowRightLeft className="h-5 w-5" />} />
      </div>

      {/* Section: Por Avaliador */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Por Avaliador</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Qtd de Avaliações" data={[...chartByAvaliador].sort((a, b) => b.avaliacoes - a.avaliacoes)} dataKey="avaliacoes" />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Qtd Aquisições</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Trocar</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Vender</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[...chartByAvaliador].sort((a, b) => (b.aqTrocar + b.aqVender) - (a.aqTrocar + a.aqVender))} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar dataKey="aqTrocar" name="Trocar" fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
                <Bar dataKey="aqVender" name="Vender" fill="#E8913A" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
              </BarChart>
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
        <MonthChart title="Avaliações" data={chartByMonth} dataKey="avaliacoes" />
        <MonthChart title="Aquisições" data={chartByMonth} dataKey="aquisicoes" />
        {/* Próprias e Consignadas - Line chart */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Próprias e Consignadas</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Próprias</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7e6d9b' }} />Consignadas</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Line type="monotone" dataKey="proprias" name="Próprias" stroke="#2F6F84" strokeWidth={2.5} dot={{ r: 4, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 }} />
                <Line type="monotone" dataKey="consignadas" name="Consignadas" stroke="#7e6d9b" strokeWidth={2.5} dot={{ r: 4, fill: '#7e6d9b', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'bottom', fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {/* Negociação - Barras por interesse */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Negociação</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Trocar</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Vender</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartByMonth} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
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

// Sub-components (same style as Showroom)
const iconColorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
  purple: 'bg-[#7e6d9b]/10 text-[#7e6d9b]',
  emerald: 'bg-[#3a8f6a]/10 text-[#3a8f6a]',
};

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

const renderBarLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (value == null || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 6} fill="hsl(var(--foreground))" fontSize={10} fontWeight={600} textAnchor="middle">
      {value}
    </text>
  );
};

const ChartCard: React.FC<{ title: string; data: any[]; dataKey: string }> = ({ title, data, dataKey }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

const MonthChart: React.FC<{ title: string; data: any[]; dataKey: string }> = ({ title, data, dataKey }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

export default RelatorioAvaliacoes;
