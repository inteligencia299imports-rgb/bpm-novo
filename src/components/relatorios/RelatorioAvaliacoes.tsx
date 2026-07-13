import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { abbreviateName, fmtInt, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, CheckCircle, ArrowDownUp, ArrowRightLeft, XCircle, ArrowDownToLine, Repeat, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { getPreviousPeriod } from '@/lib/reportComparison';
import { getCycleForDate } from '@/lib/reportCycle';
import { useIsMobile } from '@/hooks/use-mobile';
import { LojaFilter } from './LojaFilter';
import DeltaBadge from './DeltaBadge';
import { format } from 'date-fns';

interface RelatorioAvaliacoesProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string) => void;
  showFilters?: boolean;
}

// -------- helpers puros --------
const stripAccents = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normTipo = (raw: string | null | undefined): 'propria' | 'consignada' | 'convertida' | 'test-ride' | 'repasse' => {
  const t = stripAccents((raw || '').trim().toLowerCase());
  if (!t || t === 'propria') return 'propria';
  if (['consignada', 'consignacao', 'consignado'].includes(t)) return 'consignada';
  if (['convertida', 'convertido'].includes(t)) return 'convertida';
  if (['test-ride', 'test ride', 'testride'].includes(t)) return 'test-ride';
  if (t === 'repasse') return 'repasse';
  return 'propria';
};

const isDucati = (loja: string | null | undefined) => (loja || '').toUpperCase().includes('DUCATI');
const normLojaGroup = (loja: string | null | undefined): '299' | 'Ducati' => (isDucati(loja) ? 'Ducati' : '299');

/** Aceita 'todos' | '299' | 'Ducati' | sub-loja exata */
const matchesLoja = (loja: string | null | undefined, filter: string) => {
  if (!filter || filter === 'todos') return true;
  if (filter === '299' || filter === 'Ducati') return normLojaGroup(loja) === filter;
  return (loja || '') === filter;
};

const inRange = (iso: string | null | undefined, from: Date | undefined, to: Date | undefined) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
};

interface AvalRow {
  id: string;
  avaliadorId: string | null;
  tipoNorm: ReturnType<typeof normTipo>;
  situacao: string | null;
  interesse: string | null;
  loja: string | null;
  createdAt: string;
  dataAquisicao: string | null;
}

interface KpiSet {
  total_avaliacoes: number;
  total_aquisicoes: number;
  aquisicoes_propria: number;
  aquisicoes_consignada: number;
  aquisicoes_convertida: number;
  entrada_direta: number;
  troca: number;
  retiradas: number;
}

const emptyKpis = (): KpiSet => ({
  total_avaliacoes: 0, total_aquisicoes: 0,
  aquisicoes_propria: 0, aquisicoes_consignada: 0, aquisicoes_convertida: 0,
  entrada_direta: 0, troca: 0, retiradas: 0,
});

const computeKpis = (rows: AvalRow[], loja: string, from: Date | undefined, to: Date | undefined): KpiSet => {
  const kpi = emptyKpis();
  for (const r of rows) {
    if (!matchesLoja(r.loja, loja)) continue;

    // avaliações contadas pela created_at
    const inAval = (!from || new Date(r.createdAt) >= from) && (!to || new Date(r.createdAt) <= to);
    if (inAval) {
      kpi.total_avaliacoes += 1;
      if (r.situacao === 'retirada') kpi.retiradas += 1;
    }
    // aquisições: INNER JOIN status_history (status='adquirida') filtrado por s.created_at
    if (r.dataAquisicao && inRange(r.dataAquisicao, from, to)) {
      kpi.total_aquisicoes += 1;
      if (['propria', 'convertida', 'repasse', 'test-ride'].includes(r.tipoNorm)) kpi.aquisicoes_propria += 1;
      if (r.tipoNorm === 'consignada') kpi.aquisicoes_consignada += 1;
      if (r.tipoNorm === 'convertida') kpi.aquisicoes_convertida += 1;
      if (r.interesse === 'vender') kpi.entrada_direta += 1;
      if (r.interesse === 'trocar') kpi.troca += 1;
    }
  }
  return kpi;
};

// Ciclos "Resultado do Ano" — começam em 21/12/2025 até hoje
function getYearBuckets(): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  let cursor = new Date(2025, 11, 21); // 21/12/2025
  const now = new Date();
  let guard = 0;
  while (cursor <= now && guard++ < 120) {
    const cycle = getCycleForDate(cursor);
    buckets.push({
      label: `${format(cycle.start, 'dd/MM')} - ${format(cycle.end, 'dd/MM')}`,
      start: new Date(cycle.start),
      end: new Date(cycle.end),
    });
    cursor = new Date(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate() + 1, 0, 0, 0, 0);
  }
  return buckets;
}

const RelatorioAvaliacoes: React.FC<RelatorioAvaliacoesProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange, showFilters = true }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const xTickPropsName = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 10, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AvalRow[]>([]);
  const [nomeById, setNomeById] = useState<Map<string, string>>(new Map());
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
    const [avalRes, histRes, rolesRes] = await Promise.all([
      fetchAllRange<any>(() => supabase
        .from('avaliacoes')
        .select('id, moto_avaliacao_id, avaliador_id, tipo_aquisicao, situacao, created_at, updated_at, atendimentos!inner(interesse, loja)')
        .neq('situacao', 'sem_avaliar')
        .in('atendimentos.interesse', ['trocar', 'vender'])
      ),
      fetchAllRange<any>(() => supabase
        .from('status_history')
        .select('entity_id, created_at')
        .eq('status', 'adquirida')
      ),
      (supabase as any).from('user_roles_motos').select('user_id, nome'),
    ]);

    const avals = ((avalRes.data || []) as any[]);
    // status_history.entity_id pode referenciar avaliacao.id OU moto_avaliacao.id
    const avalIdSet = new Set<string>(avals.map((a) => a.id));
    const motoToAval = new Map<string, string>();
    for (const a of avals) {
      if (a.moto_avaliacao_id) motoToAval.set(a.moto_avaliacao_id, a.id);
    }

    // menor created_at por avaliação (INNER JOIN status_history via IN (av.id, moto_avaliacao_id))
    const aquisicaoByAval = new Map<string, string>();
    for (const h of (histRes.data || []) as any[]) {
      const avalId = avalIdSet.has(h.entity_id) ? h.entity_id : motoToAval.get(h.entity_id);
      if (!avalId) continue;
      const cur = aquisicaoByAval.get(avalId);
      if (!cur || h.created_at < cur) aquisicaoByAval.set(avalId, h.created_at);
    }

    const parsed: AvalRow[] = avals.map((a) => ({
      id: a.id,
      avaliadorId: a.avaliador_id || null,
      tipoNorm: normTipo(a.tipo_aquisicao),
      situacao: a.situacao,
      interesse: a.atendimentos?.interesse || null,
      loja: a.atendimentos?.loja || null,
      createdAt: a.created_at,
      dataAquisicao: aquisicaoByAval.get(a.id) || a.updated_at || a.created_at,
    }));

    setRows(parsed);
    setNomeById(new Map(((rolesRes.data || []) as any[]).map((r: any) => [r.user_id, r.nome || 'Desconhecido'])));
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_history' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  // ---------- KPIs ----------
  const indicadores = useMemo(() => computeKpis(rows, filterLoja, dateFrom, dateTo), [rows, filterLoja, dateFrom, dateTo]);
  const indicadoresPrev = useMemo(() => {
    const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);
    if (!prevFrom || !prevTo) return emptyKpis();
    return computeKpis(rows, filterLoja, prevFrom, prevTo);
  }, [rows, filterLoja, dateFrom, dateTo]);

  // ---------- Por Avaliador ----------
  const chartByAvaliador = useMemo(() => {
    const map = new Map<string, { nomeCompleto: string; avaliacoes: number; aqTrocar: number; aqVender: number; aqPropria: number; aqConsignada: number }>();
    for (const r of rows) {
      if (!r.avaliadorId) continue;
      if (!matchesLoja(r.loja, filterLoja)) continue;
      const entry = map.get(r.avaliadorId) || {
        nomeCompleto: nomeById.get(r.avaliadorId) || 'Desconhecido',
        avaliacoes: 0, aqTrocar: 0, aqVender: 0, aqPropria: 0, aqConsignada: 0,
      };
      const inAval = (!dateFrom || new Date(r.createdAt) >= dateFrom) && (!dateTo || new Date(r.createdAt) <= dateTo);
      if (inAval) entry.avaliacoes += 1;

      if (r.situacao === 'adquirida' && inRange(r.dataAquisicao, dateFrom, dateTo)) {
        if (r.interesse === 'trocar') entry.aqTrocar += 1;
        if (r.interesse === 'vender') entry.aqVender += 1;
        if (['propria', 'convertida', 'repasse', 'test-ride'].includes(r.tipoNorm)) entry.aqPropria += 1;
        if (r.tipoNorm === 'consignada') entry.aqConsignada += 1;
      }
      map.set(r.avaliadorId, entry);
    }
    return Array.from(map.values()).map((v) => ({
      ...v,
      nome: abbreviateName(v.nomeCompleto),
      total: v.aqTrocar + v.aqVender,
    }));
  }, [rows, nomeById, filterLoja, dateFrom, dateTo]);

  // ---------- Resultado do Ano ----------
  const chartByMonth = useMemo(() => {
    const buckets = getYearBuckets();
    return buckets.map((b) => {
      let avaliacoes = 0, aquisicoes = 0, proprias = 0, consignadas = 0, negTrocar = 0, negVender = 0;
      for (const r of rows) {
        if (!matchesLoja(r.loja, filterLoja)) continue;
        if (inRange(r.createdAt, b.start, b.end)) avaliacoes += 1;
        if (r.situacao === 'adquirida' && inRange(r.dataAquisicao, b.start, b.end)) {
          aquisicoes += 1;
          if (['propria', 'convertida', 'repasse', 'test-ride'].includes(r.tipoNorm)) proprias += 1;
          if (r.tipoNorm === 'consignada') consignadas += 1;
          if (r.interesse === 'trocar') negTrocar += 1;
          if (r.interesse === 'vender') negVender += 1;
        }
      }
      return { mes: b.label, label: b.label, avaliacoes, aquisicoes, proprias, consignadas, negTrocar, negVender };
    });
  }, [rows, filterLoja]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      <div className={showFilters ? '' : 'hidden md:block'}><LojaFilter value={filterLoja} onChange={setFilterLoja} /></div>

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Avaliações" value={fmtInt(indicadores.total_avaliacoes)} current={indicadores.total_avaliacoes} previous={indicadoresPrev.total_avaliacoes} gradient="teal" icon={<ClipboardCheck className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições" value={fmtInt(indicadores.total_aquisicoes)} subtitle={`(${indicadores.total_avaliacoes > 0 ? Math.floor((indicadores.total_aquisicoes / indicadores.total_avaliacoes) * 100) : 0}%)`} current={indicadores.total_aquisicoes} previous={indicadoresPrev.total_aquisicoes} gradient="teal" icon={<CheckCircle className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Próprias" value={fmtInt(indicadores.aquisicoes_propria)} current={indicadores.aquisicoes_propria} previous={indicadoresPrev.aquisicoes_propria} gradient="teal" icon={<Package className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Consignadas" value={fmtInt(indicadores.aquisicoes_consignada)} current={indicadores.aquisicoes_consignada} previous={indicadoresPrev.aquisicoes_consignada} gradient="teal" icon={<ArrowDownUp className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Convertidas" value={fmtInt(indicadores.aquisicoes_convertida)} current={indicadores.aquisicoes_convertida} previous={indicadoresPrev.aquisicoes_convertida} gradient="purple" icon={<Repeat className="h-5 w-5" />} />
        <IndicatorCard title="Retiradas" value={fmtInt(indicadores.retiradas)} current={indicadores.retiradas} previous={indicadoresPrev.retiradas} gradient="red" icon={<XCircle className="h-5 w-5" />} />
        <IndicatorCard title="Entrada Direta" value={fmtInt(indicadores.entrada_direta)} current={indicadores.entrada_direta} previous={indicadoresPrev.entrada_direta} gradient="emerald" icon={<ArrowDownToLine className="h-5 w-5" />} />
        <IndicatorCard title="Troca" value={fmtInt(indicadores.troca)} current={indicadores.troca} previous={indicadoresPrev.troca} gradient="emerald" icon={<ArrowRightLeft className="h-5 w-5" />} />
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

const IndicatorCard: React.FC<{ title: string; value: string | number; subtitle?: string; current?: number | null; previous?: number | null; gradient?: string; icon?: React.ReactNode }> = ({ title, value, subtitle, current, previous, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[100px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}{subtitle && <span className="ml-1">{subtitle}</span>}</p>
          <DeltaBadge current={current} previous={previous} className="mt-1" />
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
