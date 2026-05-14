import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wrench, CheckCircle, Clock, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass, isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';
import { Badge } from '@/components/ui/badge';
import { PREPARACAO_COLUMNS } from '@/types/crm';
import { LojaFilter } from './LojaFilter';

interface Props {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string, tipo: string) => void;
}

const SUB_LOJAS_299 = ['299i', '299s', '299f', '299p', 'Aventura'];
const SUB_LOJAS_DUCATI = ['Ducati BSB', 'Ducati FLN', 'Ducati POA'];
const matchesLoja = (loja: string, filter: string) => {
  if (filter === 'todos') return true;
  const l = (loja || '').trim();
  if (filter === '299') return SUB_LOJAS_299.includes(l) || /^299/i.test(l);
  if (filter === 'Ducati') return SUB_LOJAS_DUCATI.includes(l) || /ducati/i.test(l);
  return l.toLowerCase() === filter.toLowerCase();
};

type TipoFilter = 'todos' | 'propria' | 'consignada';

const fmtDate = (iso: string | null | undefined) => iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : '-';
const fmtDuration = (ms: number | null) => {
  if (ms == null || !isFinite(ms) || ms < 0) return '-';
  const hours = ms / 3600000;
  const days = hours / 24;
  return `${Math.round(hours)}h (${Math.round(days)} Dias)`;
};

const STATUS_LABELS: Record<string, { label: string; hex: string }> = {
  em_aberto: { label: 'Em Aberto', hex: '#2EC5FF' },
  pendente: { label: 'Pendente', hex: '#da6220' },
  oficina: { label: 'Oficina', hex: '#b376c4' },
  servico_externo: { label: 'Serviço Externo', hex: '#E91E63' },
  aguardando_aceite: { label: 'Aguardando Aceite', hex: '#FF8C00' },
  aguardando_liberacao_estoque: { label: 'Aguardando Liberação', hex: '#607D8B' },
  estoque: { label: 'Em Estoque', hex: '#169d53' },
};

function getCycleBuckets(): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  let cur = new Date(2026, 2, 21); // 21/03/2026
  const now = new Date();
  while (cur <= now) {
    const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 20, 23, 59, 59, 999);
    const label = `${format(cur, 'dd/MM')} - ${format(end, 'dd/MM')}`;
    buckets.push({ label, start: new Date(cur), end });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 21);
  }
  return buckets;
}

const RelatorioPreparacao: React.FC<Props> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 280;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipoState] = useState<TipoFilter>('todos');
  const [filterLoja, setFilterLojaState] = useState<string>('todos');
  const [rows, setRows] = useState<any[]>([]);

  const setFilterTipo = (v: TipoFilter) => { setFilterTipoState(v); onFilterChange?.(filterLoja, v); };
  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v, filterTipo); };

  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterTipoState('todos');
      setFilterLojaState('todos');
      onFilterChange?.('todos', 'todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    // Fetch avaliacoes that reached preparation flow (situacao adquirida or estoque)
    const avalRes = await fetchAllRange<any>(() => supabase
      .from('avaliacoes')
      .select('id, moto_avaliacao_id, atendimento_id, tipo_aquisicao, situacao, preparacao_status, atendimentos!inner(id, nome_cliente, loja), motos_avaliacao!inner(id, marca, modelo, placa)')
      .in('situacao', ['adquirida', 'estoque'])
    );
    const avals = (avalRes.data || []).filter((a: any) => {
      const tipo = (a.tipo_aquisicao || '').toLowerCase();
      return ['propria', 'convertida', 'repasse', 'test-ride', 'test ride', 'consignada', 'consignacao'].includes(tipo);
    });

    const avalIds = avals.map((a: any) => a.id);
    const motoIds = avals.map((a: any) => a.moto_avaliacao_id).filter(Boolean);
    const allEntityIds = Array.from(new Set([...avalIds, ...motoIds]));

    if (allEntityIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // status_history in chunks (in() can be heavy)
    const chunks: string[][] = [];
    for (let i = 0; i < allEntityIds.length; i += 200) chunks.push(allEntityIds.slice(i, i + 200));
    const histResults = await Promise.all(chunks.map(chunk =>
      fetchAllRange<any>(() => supabase.from('status_history')
        .select('entity_id, entity_type, status, created_at')
        .in('entity_type', ['avaliacao', 'preparacao'])
        .in('entity_id', chunk))
    ));
    const allHist = histResults.flatMap(r => r.data || []);

    // Group history by entity_id
    const histByEntity: Record<string, any[]> = {};
    allHist.forEach((h: any) => {
      (histByEntity[h.entity_id] ||= []).push(h);
    });

    const result = avals.map((a: any) => {
      const histAval = histByEntity[a.id] || [];
      const histMoto = a.moto_avaliacao_id ? (histByEntity[a.moto_avaliacao_id] || []) : [];

      // Data de aquisição: latest 'adquirida' across avaliacao/moto entries with entity_type='avaliacao'
      const adquiridas = [...histAval, ...histMoto]
        .filter(h => h.entity_type === 'avaliacao' && h.status === 'adquirida')
        .map(h => h.created_at).sort();
      const dataAquisicao = adquiridas.length ? adquiridas[adquiridas.length - 1] : null;

      // Preparação history (entity_type='preparacao' only on avaliacao_id)
      const prepHist = histAval.filter(h => h.entity_type === 'preparacao').sort((x, y) =>
        new Date(x.created_at).getTime() - new Date(y.created_at).getTime());

      // Última despausa = último 'reenviada_preparacao'
      const reenvios = prepHist.filter(h => h.status === 'reenviada_preparacao').map(h => h.created_at);
      const ultimaDespausa = reenvios.length ? reenvios[reenvios.length - 1] : null;

      // Data Entrada Preparação = última despausa OU data de aquisição
      const dataEntradaPrep = ultimaDespausa || dataAquisicao;

      // Data de preparação = primeira aguardando_liberacao_estoque após dataEntradaPrep
      const aceites = prepHist.filter(h => h.status === 'aguardando_liberacao_estoque' &&
        (!dataEntradaPrep || new Date(h.created_at) >= new Date(dataEntradaPrep))).map(h => h.created_at);
      const dataPreparacao = aceites.length ? aceites[0] : null;

      // Data de liberação = primeira 'estoque' após dataEntradaPrep
      const liberacoes = prepHist.filter(h => h.status === 'estoque' &&
        (!dataEntradaPrep || new Date(h.created_at) >= new Date(dataEntradaPrep))).map(h => h.created_at);
      const dataLiberacao = liberacoes.length ? liberacoes[0] : null;

      const tempoPrepMs = dataPreparacao && dataEntradaPrep ? new Date(dataPreparacao).getTime() - new Date(dataEntradaPrep).getTime() : null;
      const tempoLibMs = dataLiberacao && dataPreparacao ? new Date(dataLiberacao).getTime() - new Date(dataPreparacao).getTime() : null;

      const tipoNorm = (a.tipo_aquisicao || '').toLowerCase();
      const tipoCat: 'propria' | 'consignada' = ['consignada', 'consignacao'].includes(tipoNorm) ? 'consignada' : 'propria';

      return {
        id: a.id,
        nomeCliente: a.atendimentos?.nome_cliente || '-',
        loja: a.atendimentos?.loja || '-',
        modelo: [a.motos_avaliacao?.marca, a.motos_avaliacao?.modelo].filter(Boolean).join(' '),
        placa: a.motos_avaliacao?.placa || '-',
        tipo: a.tipo_aquisicao,
        tipoCat,
        statusPrep: a.preparacao_status || 'em_aberto',
        situacao: a.situacao,
        dataAquisicao,
        dataEntradaPrep,
        dataPreparacao,
        dataLiberacao,
        tempoPrepMs,
        tempoLibMs,
      };
    });

    setRows(result);
    setLoading(false);
  }, []);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('relatorio-preparacao-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_history' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  // Apply filters: loja + tipo + period (data de preparação dentro do range)
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (!matchesLoja(r.loja, filterLoja)) return false;
      if (filterTipo !== 'todos' && r.tipoCat !== filterTipo) return false;
      if (dateFrom && r.dataPreparacao && new Date(r.dataPreparacao) < dateFrom) return false;
      if (dateTo && r.dataPreparacao && new Date(r.dataPreparacao) > dateTo) return false;
      // If no dataPreparacao, only include when no period is set
      if (!r.dataPreparacao && (dateFrom || dateTo)) return false;
      return true;
    });
  }, [rows, filterLoja, filterTipo, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const preparadas = filteredRows.filter(r => r.dataPreparacao);
    const liberadas = filteredRows.filter(r => r.dataLiberacao);
    const tempoPrepValid = preparadas.map(r => r.tempoPrepMs).filter((v): v is number => v != null && v >= 0);
    const tempoLibValid = liberadas.map(r => r.tempoLibMs).filter((v): v is number => v != null && v >= 0);
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    return {
      qtdPreparadas: preparadas.length,
      tempoMedioPrep: avg(tempoPrepValid),
      qtdLiberadas: liberadas.length,
      tempoMedioLib: avg(tempoLibValid),
    };
  }, [filteredRows]);

  // Charts: ciclos a partir de 21/03
  const chartData = useMemo(() => {
    // Use rows filtered by loja + tipo (not by period) for monthly chart
    const baseFiltered = rows.filter(r => matchesLoja(r.loja, filterLoja) && (filterTipo === 'todos' || r.tipoCat === filterTipo));
    const buckets = getCycleBuckets();
    return buckets.map(b => {
      const prep = baseFiltered.filter(r => r.dataPreparacao && new Date(r.dataPreparacao) >= b.start && new Date(r.dataPreparacao) <= b.end);
      const lib = baseFiltered.filter(r => r.dataLiberacao && new Date(r.dataLiberacao) >= b.start && new Date(r.dataLiberacao) <= b.end);
      const tempoPrep = prep.map(r => r.tempoPrepMs).filter((v): v is number => v != null && v >= 0);
      const tempoLib = lib.map(r => r.tempoLibMs).filter((v): v is number => v != null && v >= 0);
      const avgMs = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      const msPrep = avgMs(tempoPrep);
      const msLib = avgMs(tempoLib);
      return {
        label: b.label,
        qtdPrep: prep.length,
        diasPrep: Math.round(msPrep / 86400000),
        horasPrep: Math.round(msPrep / 3600000),
        qtdLib: lib.length,
        diasLib: Math.round(msLib / 86400000),
        horasLib: Math.round(msLib / 3600000),
      };
    });
  }, [rows, filterLoja, filterTipo]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;

  const tipoBtns: { value: TipoFilter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'propria', label: 'Próprias' },
    { value: 'consignada', label: 'Consignadas' },
  ];

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />

      {/* Filters: Loja (left) + Tipo (right) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LojaFilter value={filterLoja} onChange={setFilterLoja} />
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          {tipoBtns.map(b => (
            <Button key={b.value} size="sm" variant={filterTipo === b.value ? 'default' : 'outline'}
              className={cn('rounded-full px-4 h-8 text-xs font-medium', filterTipo === b.value && 'shadow-sm')}
              onClick={() => setFilterTipo(b.value)}>
              {b.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Motos Preparadas" value={kpis.qtdPreparadas} icon={<Wrench className="h-5 w-5" />} color="purple" />
        <KpiCard title="Tempo Preparação" value={fmtDuration(kpis.tempoMedioPrep)} icon={<Clock className="h-5 w-5" />} color="orange" />
        <KpiCard title="Motos Liberadas" value={kpis.qtdLiberadas} icon={<CheckCircle className="h-5 w-5" />} color="emerald" />
        <KpiCard title="Tempo Liberação" value={fmtDuration(kpis.tempoMedioLib)} icon={<Package className="h-5 w-5" />} color="teal" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 !mt-6">
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Preparação por Ciclo</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px] mt-1">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7e6d9b' }} />Qtd preparadas</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Dias médios</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart data={chartData} margin={{ top: 16, right: 10, left: -10, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="qtdPrep" name="Qtd preparadas" fill="#7e6d9b" radius={[8, 8, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="diasPrep" name="Dias médios" stroke="#E8913A" strokeWidth={2.5} dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Liberação por Ciclo</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px] mt-1">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3a8f6a' }} />Qtd liberadas</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Dias médios</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart data={chartData} margin={{ top: 16, right: 10, left: -10, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="qtdLib" name="Qtd liberadas" fill="#3a8f6a" radius={[8, 8, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="diasLib" name="Dias médios" stroke="#2F6F84" strokeWidth={2.5} dot={{ r: 4, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Motos Preparadas</h2>
        <Separator />
      </div>
      <Card className="border shadow-sm rounded-xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Preparação</TableHead>
                <TableHead>Tempo Prep.</TableHead>
                <TableHead>Liberação</TableHead>
                <TableHead>Tempo Lib.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
              ) : filteredRows.map(r => {
                const status = r.dataLiberacao
                  ? { label: 'Estoque', hex: '#169d53' }
                  : { label: 'Ag. Liberar', hex: '#607D8B' };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{r.nomeCliente}</TableCell>
                    <TableCell className="text-xs">{r.modelo}</TableCell>
                    <TableCell className="text-xs font-mono">{(r.placa || '').replace(/-/g, '')}</TableCell>
                    <TableCell>
                      {r.tipo && <Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(r.tipo)}`}>{getTipoAquisicaoLabel(r.tipo)}</Badge>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.dataEntradaPrep)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]" style={{ borderColor: status.hex, color: status.hex }}>{status.label}</Badge></TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.dataPreparacao)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDuration(r.tempoPrepMs)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.dataLiberacao)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDuration(r.tempoLibMs)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const colorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
  purple: 'bg-[#7e6d9b]/10 text-[#7e6d9b]',
  emerald: 'bg-[#3a8f6a]/10 text-[#3a8f6a]',
  orange: 'bg-orange-500/10 text-orange-500',
};

const KpiCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
        </div>
        <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', colorMap[color] || colorMap.teal)}>{icon}</div>
      </div>
    </CardContent>
  </Card>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color, margin: 0 }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
};

export default RelatorioPreparacao;
